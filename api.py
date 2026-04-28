from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal, Any, cast
from datetime import date, datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
import asyncio
import tempfile
import shutil
import time
import json
import os
import re
import zipfile
import threading
import uuid

from main import (
    load_pdf_text,
    classify_document,
    build_prompt,
    finalize_document_data,
    link_documents,
    write_to_achats_cons,
    llm,
)
import domino as domino_module
import db
import repositories as repo
from seeder import seed_if_empty
from exporter import export_to_xlsm
from validators import validate_and_sanitize
import automation_logger

# Dossier de stockage persistant des PDFs importés
STORAGE_DIR = os.getenv("MARJO_STORAGE_DIR", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

app = FastAPI(
    title="Marjo — API Gestion Factures",
    description="API d'extraction automatique de factures et bons de livraison par IA",
    version="1.0.0",
)

_cors_origins_raw = os.getenv("CORS_ORIGINS", "http://localhost:3000")
_cors_origins = [o.strip() for o in _cors_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sert les PDFs stockés via /api/documents/<filename>
app.mount("/api/documents", StaticFiles(directory=STORAGE_DIR), name="documents")

# Pool de threads dédié au traitement LLM (bloquant)
_executor = ThreadPoolExecutor(max_workers=4)
_regen_lock = threading.Lock()
_xlsm_write_lock = threading.Lock()
_regen_pending = False
_regen_running = False
_domino_resync_jobs: dict[str, dict] = {}
_domino_resync_jobs_lock = threading.Lock()
_automation_tasks: dict[str, dict[str, Any]] = {}
_automation_lock = threading.Lock()
_automation_scheduler_started = False

# ---------------------------------------------------------------------------
# Fichier source de vérité unique
# ---------------------------------------------------------------------------
TRESORERIE_XLSM = os.getenv(
    "TRESORERIE_XLSM_PATH",
    "output/Suivi trésorerie MLC.xlsm",
)
TRESORERIE_XLSM_FALLBACK = "output/Suivi trésorerie MLC - Copie.xlsm"


def _is_valid_xlsm(path: str) -> bool:
    if not os.path.exists(path):
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = zf.namelist()
            return "[Content_Types].xml" in names and zf.testzip() is None
    except (zipfile.BadZipFile, OSError):
        return False


def _resolve_tresorerie_path() -> str:
    if _is_valid_xlsm(TRESORERIE_XLSM):
        return TRESORERIE_XLSM
    if _is_valid_xlsm(TRESORERIE_XLSM_FALLBACK):
        print(
            f"[WARN] Fichier principal xlsm invalide: '{TRESORERIE_XLSM}'. "
            f"Utilisation du fallback '{TRESORERIE_XLSM_FALLBACK}'."
        )
        return TRESORERIE_XLSM_FALLBACK
    return TRESORERIE_XLSM


def _iter_tresorerie_candidates() -> list[str]:
    # Garder l'ordre principal -> fallback, sans doublons.
    out: list[str] = []
    for p in (TRESORERIE_XLSM, TRESORERIE_XLSM_FALLBACK):
        if p and p not in out:
            out.append(p)
    return out


def _pick_valid_tresorerie_path() -> str | None:
    for path in _iter_tresorerie_candidates():
        if _is_valid_xlsm(path):
            return path
    return None


def _build_tresorerie_invalid_detail() -> str:
    states: list[str] = []
    for path in _iter_tresorerie_candidates():
        exists = os.path.exists(path)
        valid = _is_valid_xlsm(path)
        size = os.path.getsize(path) if exists else 0
        states.append(f"{path} (exists={exists}, valid={valid}, size={size} bytes)")
    return "; ".join(states)


def _ensure_valid_tresorerie_path() -> str:
    path = _pick_valid_tresorerie_path()
    if path:
        return path

    any_exists = any(os.path.exists(p) for p in _iter_tresorerie_candidates())
    if any_exists:
        raise HTTPException(
            status_code=409,
            detail=(
                "Aucun fichier xlsm valide trouve pour l'export. "
                f"Etat: {_build_tresorerie_invalid_detail()}"
            ),
        )
    raise HTTPException(
        status_code=404,
        detail=(
            "Fichier 'Suivi trésorerie MLC.xlsm' introuvable dans output/. "
            f"Chemins testes: {_build_tresorerie_invalid_detail()}"
        ),
    )


def _backup_path_for(path: str) -> str:
    return f"{path}.lastgood.bak"


def _restore_tresorerie_from_backup() -> dict:
    """Restaure le fichier trésorerie depuis sa backup .lastgood.bak."""
    candidates = _iter_tresorerie_candidates()

    for target in candidates:
        backup = _backup_path_for(target)
        if os.path.exists(backup) and _is_valid_xlsm(backup):
            os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
            shutil.copy2(backup, target)
            if not _is_valid_xlsm(target):
                raise HTTPException(
                    status_code=500,
                    detail=(
                        "La restauration de backup a echoue: le fichier restaure est invalide. "
                        f"target={target}, backup={backup}"
                    ),
                )
            return {
                "message": "Restauration XLSM effectuee depuis la backup last-good.",
                "target": target,
                "backup": backup,
            }

    raise HTTPException(
        status_code=404,
        detail=(
            "Aucune backup XLSM valide trouvee (.lastgood.bak). "
            "Faites au moins une ecriture reussie pour generer une backup."
        ),
    )


# ---------------------------------------------------------------------------
# Automatisation — tâches planifiées + logs
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _add_automation_log(task_id: str, level: Literal["info", "warn", "error"], message: str, details: dict | None = None) -> None:
    automation_logger.add_log(task_id, level, message, details)


def _init_automation_tasks() -> None:
    with _automation_lock:
        if _automation_tasks:
            return
        now = datetime.now()
        _automation_tasks["mail_fetch"] = {
            "id": "mail_fetch",
            "label": "Recuperation des mails",
            "description": "Simulation de récupération de pièces jointes mails.",
            "interval_seconds": 300,
            "enabled": False,
            "is_running": False,
            "last_start": None,
            "last_end": None,
            "last_status": "idle",
            "last_error": None,
            "run_count": 0,
            "error_count": 0,
            "next_run": now.isoformat(timespec="seconds"),
        }
        _automation_tasks["domino_auto_import"] = {
            "id": "domino_auto_import",
            "label": "Import DOMINO automatique",
            "description": "Importe les nouveaux fichiers DOMINO non traités dans XLSM.",
            "interval_seconds": 600,
            "enabled": False,
            "is_running": False,
            "last_start": None,
            "last_end": None,
            "last_status": "idle",
            "last_error": None,
            "run_count": 0,
            "error_count": 0,
            "next_run": now.isoformat(timespec="seconds"),
        }
        _automation_tasks["xlsx_healthcheck"] = {
            "id": "xlsx_healthcheck",
            "label": "Controle sante XLSM",
            "description": "Vérifie la validité du fichier XLSM principal/fallback.",
            "interval_seconds": 900,
            "enabled": False,
            "is_running": False,
            "last_start": None,
            "last_end": None,
            "last_status": "idle",
            "last_error": None,
            "run_count": 0,
            "error_count": 0,
            "next_run": now.isoformat(timespec="seconds"),
        }


def _run_mail_fetch_task() -> dict:
    # Placeholder robuste: on log l'état des dossiers d'entrée/sortie.
    storage_files = len(os.listdir(STORAGE_DIR)) if os.path.exists(STORAGE_DIR) else 0
    domino_files = len([f for f in os.listdir(domino_module.DOMINO_FOLDER)]) if os.path.exists(domino_module.DOMINO_FOLDER) else 0
    _add_automation_log(
        "mail_fetch",
        "info",
        "Vérification de récupération mails exécutée.",
        {"storage_files": storage_files, "domino_files": domino_files},
    )
    return {"storage_files": storage_files, "domino_files": domino_files}


def _run_domino_auto_import_task() -> dict:
    files = domino_module.list_domino_files()
    pending = [f for f in files if not f.get("imported")]
    if not pending:
        _add_automation_log("domino_auto_import", "info", "Aucun nouveau fichier DOMINO a importer.")
        return {"pending": 0, "imported": 0}

    imported_count = 0
    active_xlsm = _pick_valid_tresorerie_path()
    with _xlsm_write_lock:
        for f in pending:
            try:
                res = domino_module.import_domino_file(
                    filename=f["filename"],
                    xlsm_path=active_xlsm,
                    overwrite=False,
                )
                if not res.get("skipped"):
                    imported_count += 1
            except Exception as e:
                _add_automation_log(
                    "domino_auto_import",
                    "error",
                    f"Echec import {f['filename']}",
                    {"error": str(e)},
                )

    _add_automation_log(
        "domino_auto_import",
        "info",
        "Import automatique DOMINO exécuté.",
        {"pending": len(pending), "imported": imported_count},
    )
    return {"pending": len(pending), "imported": imported_count}


def _run_xlsx_healthcheck_task() -> dict:
    states = []
    for p in _iter_tresorerie_candidates():
        exists = os.path.exists(p)
        valid = _is_valid_xlsm(p)
        size = os.path.getsize(p) if exists else 0
        states.append({"path": p, "exists": exists, "valid": valid, "size": size})
    _add_automation_log("xlsx_healthcheck", "info", "Contrôle XLSM exécuté.", {"files": states})
    return {"files": states}


def _execute_automation_task(task_id: str, trigger: Literal["manual", "scheduled"] = "manual") -> None:
    with _automation_lock:
        task = _automation_tasks.get(task_id)
        if not task:
            return
        if task.get("is_running"):
            return
        task["is_running"] = True
        task["last_start"] = _now_iso()
        task["last_status"] = "running"
        task["last_error"] = None

    _add_automation_log(task_id, "info", f"Execution de tache ({trigger}).")

    try:
        if task_id == "mail_fetch":
            result = _run_mail_fetch_task()
        elif task_id == "domino_auto_import":
            result = _run_domino_auto_import_task()
        elif task_id == "xlsx_healthcheck":
            result = _run_xlsx_healthcheck_task()
        else:
            raise ValueError(f"Tache inconnue: {task_id}")

        with _automation_lock:
            task = _automation_tasks[task_id]
            task["run_count"] += 1
            task["last_status"] = "ok"
            task["last_end"] = _now_iso()
            next_run_dt = datetime.now() + timedelta(seconds=int(task["interval_seconds"]))
            task["next_run"] = next_run_dt.isoformat(timespec="seconds")
            task["is_running"] = False
        _add_automation_log(task_id, "info", "Execution terminee.", {"result": result})
    except Exception as e:
        with _automation_lock:
            task = _automation_tasks[task_id]
            task["error_count"] += 1
            task["last_status"] = "error"
            task["last_error"] = str(e)
            task["last_end"] = _now_iso()
            next_run_dt = datetime.now() + timedelta(seconds=int(task["interval_seconds"]))
            task["next_run"] = next_run_dt.isoformat(timespec="seconds")
            task["is_running"] = False
        _add_automation_log(task_id, "error", "Execution en echec.", {"error": str(e)})


def _automation_scheduler_loop() -> None:
    global _automation_scheduler_started
    while True:
        due_ids: list[str] = []
        now = datetime.now()
        with _automation_lock:
            for task_id, task in _automation_tasks.items():
                if not task.get("enabled") or task.get("is_running"):
                    continue
                next_run = task.get("next_run")
                try:
                    next_dt = datetime.fromisoformat(next_run) if next_run else now
                except ValueError:
                    next_dt = now
                if now >= next_dt:
                    due_ids.append(task_id)

        for task_id in due_ids:
            _executor.submit(_execute_automation_task, task_id, "scheduled")

        # heartbeat léger
        time.sleep(1.0)


def _start_automation_scheduler_once() -> None:
    global _automation_scheduler_started
    with _automation_lock:
        if _automation_scheduler_started:
            return
        _automation_scheduler_started = True
    t = threading.Thread(target=_automation_scheduler_loop, daemon=True, name="automation-scheduler")
    t.start()

# ---------------------------------------------------------------------------
# Persistance : SQLite via repositories.py
# Les champs dérivés (TVA, TTC, vérifs, montant_total) ne sont pas persistés ;
# ils sont recalculés à la lecture par _recompute_derived ci-dessous.
# ---------------------------------------------------------------------------

def _enriched_facture(record: dict | None) -> dict | None:
    if record is None:
        return None
    return _recompute_derived(dict(record))


def _enriched_bon(record: dict | None) -> dict | None:
    if record is None:
        return None
    return _recompute_derived(dict(record))


def _recompute_derived(record: dict) -> dict:
    """
    Recalcule les champs dérivés (TVA, TTC, vérifications) depuis les bases HT.
    Modifie le dict en place et le retourne.
    """
    ht_55 = record.get("prix_HT_5_5pct")
    ht_10 = record.get("prix_HT_10pct")
    ht_20 = record.get("prix_HT_20pct")

    # Total HT
    ht_vals = [v for v in (ht_55, ht_10, ht_20) if v is not None]
    record["montant_total"] = round(sum(ht_vals), 2) if ht_vals else None

    # TVA calculée
    tva_55 = round(ht_55 * 0.055, 2) if ht_55 is not None else None
    tva_10 = round(ht_10 * 0.1,   2) if ht_10 is not None else None
    tva_20 = round(ht_20 * 0.2,   2) if ht_20 is not None else None
    record["tva_5_5pct"] = tva_55
    record["tva_10pct"]  = tva_10
    record["tva_20pct"]  = tva_20

    # Total TVA
    tva_vals = [v for v in (tva_55, tva_10, tva_20) if v is not None]
    total_tva = round(sum(tva_vals), 2) if tva_vals else None
    record["total_tva"] = total_tva

    # TTC
    tot_ht = record["montant_total"]
    if tot_ht is not None or total_tva is not None:
        record["montant_ttc"] = round((tot_ht or 0) + (total_tva or 0), 2)
    else:
        record["montant_ttc"] = None

    # Vérifications
    def _vf(ht, tva, rate):
        if ht is None or tva is None or ht == 0:
            return ""
        return "OK" if round(tva / ht, 3) == rate else "Erreur"

    record["verif_tva_5_5"] = _vf(ht_55, tva_55, 0.055)
    record["verif_tva_10"]  = _vf(ht_10, tva_10, 0.1)
    record["verif_tva_20"]  = _vf(ht_20, tva_20, 0.2)

    return record


@app.on_event("startup")
def _startup_seed_database() -> None:
    """
    Initialise la BDD SQLite et la peuple depuis le XLSM si elle est vide.
    """
    try:
        active_xlsm = _pick_valid_tresorerie_path()
        summary = seed_if_empty(active_xlsm)
        if summary.get("seeded"):
            print(
                f"[DB] Seed initial depuis '{summary.get('xlsm_path')}': "
                f"{summary.get('fournisseurs')} fournisseur(s), "
                f"{summary.get('factures')} facture(s), "
                f"{summary.get('bons')} BL, "
                f"{summary.get('autres_achats')} autre(s) achat(s), "
                f"{summary.get('domino_jours')} jour(s) DOMINO."
            )
        else:
            print(f"[DB] Database d\u00e9j\u00e0 peupl\u00e9e ({summary.get('reason')}).")
    except Exception as e:
        print(f"[DB] Erreur lors de l'initialisation de la BDD: {e}")


@app.on_event("startup")
def _startup_domino_auto_import() -> None:
    """
    Au démarrage, importe automatiquement les fichiers DOMINO non encore traités.
    N'écrase jamais les imports existants.
    """
    files = domino_module.list_domino_files()
    pending = [f for f in files if not f["imported"]]
    if not pending:
        return

    active_xlsm = _pick_valid_tresorerie_path()
    imported_count = 0
    for f in pending:
        try:
            result = domino_module.import_domino_file(
                filename=f["filename"],
                xlsm_path=active_xlsm,
                overwrite=False,
            )
            if not result.get("skipped"):
                imported_count += 1
                print(f"[DOMINO] Auto-import '{f['filename']}' : {result['message']}")
        except Exception as e:
            print(f"[DOMINO] Erreur auto-import '{f['filename']}' : {e}")

    if imported_count:
        print(f"[DOMINO] {imported_count} fichier(s) auto-importé(s) au démarrage.")


@app.on_event("startup")
def _startup_automation_scheduler() -> None:
    _init_automation_tasks()
    _start_automation_scheduler_once()
    print("[AUTOMATION] Scheduler initialisé.")


def _serialize(obj):
    """Convertit les objets date en string ISO pour la sérialisation JSON."""
    if isinstance(obj, date):
        return obj.isoformat()
    return obj


def _serialize_record(record: dict) -> dict:
    return {k: _serialize(v) for k, v in record.items()}


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


def _process_one_pdf(tmp_path: str, filename: str, fournisseur_ids: list[str]) -> dict:
    """
    Traitement complet d'un PDF (bloquant — exécuté dans le thread pool).
    Retourne un dict avec les clés : data, doc_type, error.
    fournisseur_ids : liste des identifiants internes connus (ex: ["SYSCO", "AMBELYS", ...])
    """
    try:
        text     = load_pdf_text(tmp_path)
        doc_type = classify_document(text, filename)
        prompt   = build_prompt(doc_type, text, fournisseur_ids=fournisseur_ids)

        result = llm.invoke(prompt)
        model_dump = getattr(result, "model_dump", None)
        if callable(model_dump):
            data = cast(dict[str, Any], model_dump())
        elif isinstance(result, dict):
            data = cast(dict[str, Any], result)
        else:
            data = cast(dict[str, Any], dict(result))
        data   = finalize_document_data(
            data, text=text, filename=filename, predicted_type=doc_type,
            fournisseur_patterns=repo.fournisseur_patterns_map(),
        )
        data   = _serialize_record(data)
        # Validation métier post-LLM
        data, validation_warnings = validate_and_sanitize(data, doc_type)
        if validation_warnings:
            print(f"[VALIDATION] {filename}: " + " | ".join(validation_warnings))
        return {"data": data, "doc_type": doc_type, "error": None}
    except Exception as e:
        return {"data": None, "doc_type": None, "error": str(e)}


@app.post("/api/upload", summary="Uploader et analyser des PDFs")
async def upload_documents(files: list[UploadFile] = File(...)):
    """
    Reçoit un ou plusieurs fichiers PDF, les analyse via l'IA et retourne
    les données extraites.

    - Traitement parallèle dans un ThreadPoolExecutor (évite le socket hang up).
    - Unicité : numero_facture / numero_bon_livraison.
    - Numéro null → rejeté. Numéro existant → mis à jour (upsert).
    """
    if llm is None:
        raise HTTPException(
            status_code=503,
            detail="Service IA non configure (variables APIM_OPENAI_* manquantes).",
        )

    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    results = {
        "created":  {"factures": 0, "bons": 0},
        "updated":  {"factures": 0, "bons": 0},
        "rejected": [],
        "errors":   [],
        "records":  [],  # liste des records extraits avec leur type et action
    }
    tmp_dir = tempfile.mkdtemp()
    loop    = asyncio.get_running_loop()

    try:
        # 1. Sauvegarde des fichiers : tmp_dir pour le traitement LLM,
        #    storage/ pour la persistance définitive
        saved: list[tuple[str, str, str]] = []  # (tmp_path, storage_path, filename)
        for upload in files:
            fname = upload.filename or ""
            if not fname.lower().endswith(".pdf"):
                results["errors"].append({
                    "fichier": fname,
                    "erreur": "Seuls les fichiers PDF sont acceptés.",
                })
                continue

            content = await upload.read()

            # Chemin temporaire pour le traitement LLM
            tmp_path = os.path.join(tmp_dir, fname)
            with open(tmp_path, "wb") as f:
                f.write(content)

            # Chemin de stockage définitif (on écrase si même nom = même document)
            storage_path = os.path.join(STORAGE_DIR, fname)
            with open(storage_path, "wb") as f:
                f.write(content)

            saved.append((tmp_path, storage_path, fname))

        # 2. Traitement LLM en parallèle dans le thread pool
        fournisseur_ids = list(repo.fournisseur_patterns_map().keys())
        futures = [
            loop.run_in_executor(_executor, _process_one_pdf, tmp_path, fname, fournisseur_ids)
            for tmp_path, _, fname in saved
        ]
        outcomes = await asyncio.gather(*futures)

        # 3. Intégration des résultats dans le store
        for (_, storage_path, fname), outcome in zip(saved, outcomes):
            if outcome["error"]:
                results["errors"].append({"fichier": fname, "erreur": outcome["error"]})
                continue

            data     = outcome["data"]
            doc_type = outcome["doc_type"]

            # Stocke le nom du fichier PDF pour pouvoir le servir
            data["fichier_stocke"] = fname

            if doc_type == "bon_livraison":
                record, action = repo.upsert_bon(_deserialize_record(data))
            else:
                record, action = repo.upsert_facture(_deserialize_record(data))

            if action == "rejected":
                results["rejected"].append({
                    "fichier": fname,
                    "type":    doc_type,
                    "raison":  "Numéro non extrait par l'IA (null).",
                })
            elif doc_type == "bon_livraison":
                results[action]["bons"] += 1
                results["records"].append({
                    "type":   "bon_livraison",
                    "action": action,
                    "data":   _serialize_record(_enriched_bon(record) or {}),
                })
            else:
                results[action]["factures"] += 1
                results["records"].append({
                    "type":   "facture",
                    "action": action,
                    "data":   _serialize_record(_enriched_facture(record) or {}),
                })

        # 4. Reliaison automatique BL ↔ Factures
        repo.relink_all()

        # 5. Régénération Excel
        _schedule_regenerate_excel()

        nb_traites = (
            results["created"]["factures"] + results["created"]["bons"]
            + results["updated"]["factures"] + results["updated"]["bons"]
        )
        return {
            "traites":  nb_traites,
            "created":  results["created"],
            "updated":  results["updated"],
            "rejetes":  results["rejected"],
            "erreurs":  results["errors"],
            "records":  results["records"],
            "factures": results["created"]["factures"] + results["updated"]["factures"],
            "bons":     results["created"]["bons"]     + results["updated"]["bons"],
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/factures", summary="Lister les factures extraites")
def get_factures(page: int = 1, limit: int = 50, search: str = ""):
    total = repo.count_factures(search)
    items = [
        _serialize_record(_enriched_facture(f) or {})
        for f in repo.list_factures_paginated(page, limit, search)
    ]
    pages = (total + limit - 1) // limit if limit > 0 else 1
    return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}


@app.get("/api/bons-livraison", summary="Lister les bons de livraison extraits")
def get_bons_livraison(page: int = 1, limit: int = 50, search: str = ""):
    total = repo.count_bons(search)
    items = [
        _serialize_record(_enriched_bon(b) or {})
        for b in repo.list_bons_paginated(page, limit, search)
    ]
    pages = (total + limit - 1) // limit if limit > 0 else 1
    return {"items": items, "total": total, "page": page, "limit": limit, "pages": pages}


class RattachementBL(BaseModel):
    numero_bon_livraison: str

class RattachementFacture(BaseModel):
    numero_facture: str

# Champs éditables par type de document
FACTURE_EDITABLE_FIELDS = {
    "date_emission", "date_paiement_prevue",
    "prix_HT_5_5pct", "prix_HT_10pct", "prix_HT_20pct",
    "numero_facture", "nom_fournisseur",
}
BON_EDITABLE_FIELDS = {
    "date_livraison",
    "prix_HT_5_5pct", "prix_HT_10pct", "prix_HT_20pct",
    "numero_bon_livraison", "nom_fournisseur",
}

class PatchFacture(BaseModel):
    date_emission:        str | None = None
    date_paiement_prevue: str | None = None
    prix_HT_5_5pct:       float | None = None
    prix_HT_10pct:        float | None = None
    prix_HT_20pct:        float | None = None
    numero_facture:       str | None = None
    nom_fournisseur:      str | None = None
    conditions_paiement:  str | None = None

class PatchBon(BaseModel):
    date_livraison:       str | None = None
    prix_HT_5_5pct:       float | None = None
    prix_HT_10pct:        float | None = None
    prix_HT_20pct:        float | None = None
    numero_bon_livraison: str | None = None
    nom_fournisseur:      str | None = None


@app.patch("/api/factures/{numero_facture}", summary="Modifier les champs d'une facture")
def patch_facture(numero_facture: str, body: PatchFacture):
    """
    Met à jour les champs éditables d'une facture.
    Seuls les champs non-None dans le body sont modifiés.
    Si numero_facture change, la clé de la BDD est mise à jour.
    """
    facture = repo.get_facture(numero_facture)
    if not facture:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Validation des dates
    for date_field in ("date_emission", "date_paiement_prevue"):
        if date_field in updates:
            try:
                date.fromisoformat(updates[date_field])
            except ValueError:
                raise HTTPException(status_code=422, detail=f"Format de date invalide pour '{date_field}' (attendu : YYYY-MM-DD).")

    # Validation fournisseur
    if "nom_fournisseur" in updates and repo.get_fournisseur(updates["nom_fournisseur"]) is None:
        raise HTTPException(status_code=422, detail="nom_fournisseur inconnu dans la liste des fournisseurs configurés.")

    nouveau_numero = updates.pop("numero_facture", None)

    try:
        updated = repo.patch_facture(
            numero_facture,
            updates=updates,
            new_numero=nouveau_numero,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if updated is None:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")

    _schedule_regenerate_excel()
    return _serialize_record(_enriched_facture(updated) or {})


@app.patch("/api/bons-livraison/{numero_bl}", summary="Modifier les champs d'un bon de livraison")
def patch_bon(numero_bl: str, body: PatchBon):
    """
    Met à jour les champs éditables d'un bon de livraison.
    Seuls les champs non-None dans le body sont modifiés.
    """
    bon = repo.get_bon(numero_bl)
    if not bon:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{numero_bl}' introuvable.")

    updates = {k: v for k, v in body.model_dump().items() if v is not None}

    # Validation date
    if "date_livraison" in updates:
        try:
            date.fromisoformat(updates["date_livraison"])
        except ValueError:
            raise HTTPException(status_code=422, detail="Format de date invalide pour 'date_livraison' (attendu : YYYY-MM-DD).")

    # Validation fournisseur
    if "nom_fournisseur" in updates and repo.get_fournisseur(updates["nom_fournisseur"]) is None:
        raise HTTPException(status_code=422, detail="nom_fournisseur inconnu dans la liste des fournisseurs configurés.")

    nouveau_numero = updates.pop("numero_bon_livraison", None)

    try:
        updated = repo.patch_bon(
            numero_bl,
            updates=updates,
            new_numero=nouveau_numero,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    if updated is None:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{numero_bl}' introuvable.")

    _schedule_regenerate_excel()
    return _serialize_record(_enriched_bon(updated) or {})


@app.patch("/api/factures/{numero_facture}/rattacher", summary="Rattacher un BL à une facture")
def rattacher_bl_a_facture(numero_facture: str, body: RattachementBL):
    """Rattache manuellement un BL à une facture."""
    if repo.get_facture(numero_facture) is None:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")
    if repo.get_bon(body.numero_bon_livraison) is None:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{body.numero_bon_livraison}' introuvable.")

    repo.attach_bon_to_facture(body.numero_bon_livraison, numero_facture)
    _schedule_regenerate_excel()
    return {
        "facture": _serialize_record(_enriched_facture(repo.get_facture(numero_facture)) or {}),
        "bon":     _serialize_record(_enriched_bon(repo.get_bon(body.numero_bon_livraison)) or {}),
    }


@app.patch("/api/bons-livraison/{numero_bl}/rattacher", summary="Rattacher une facture à un BL")
def rattacher_facture_a_bl(numero_bl: str, body: RattachementFacture):
    """Rattache manuellement une facture à un BL (symétrique)."""
    if repo.get_bon(numero_bl) is None:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{numero_bl}' introuvable.")
    if repo.get_facture(body.numero_facture) is None:
        raise HTTPException(status_code=404, detail=f"Facture '{body.numero_facture}' introuvable.")

    repo.attach_bon_to_facture(numero_bl, body.numero_facture)
    _schedule_regenerate_excel()
    return {
        "bon":     _serialize_record(_enriched_bon(repo.get_bon(numero_bl)) or {}),
        "facture": _serialize_record(_enriched_facture(repo.get_facture(body.numero_facture)) or {}),
    }


@app.delete("/api/factures/{numero_facture}/rattacher/{numero_bl}", summary="Supprimer le rattachement BL ↔ Facture")
def supprimer_rattachement(numero_facture: str, numero_bl: str):
    """Supprime le lien entre une facture et un BL (dans les deux sens)."""
    if repo.get_facture(numero_facture) is None:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")

    bon = repo.get_bon(numero_bl)
    if bon and bon.get("numero_facture_rattachee") == numero_facture:
        repo.detach_bon(numero_bl)

    _schedule_regenerate_excel()
    return {"message": f"Rattachement {numero_bl} ↔ {numero_facture} supprimé."}


# ---------------------------------------------------------------------------
# Endpoints fournisseurs
# ---------------------------------------------------------------------------

class FournisseurCreate(BaseModel):
    id:          str   # identifiant interne unique, ex: "METRO"
    nom_affiche: str   # nom affiché dans le xlsm, ex: "Metro"
    patterns:    list[str] = []  # mots-clés pour la détection auto dans les PDFs

class FournisseurUpdate(BaseModel):
    nom_affiche: str | None = None
    patterns:    list[str] | None = None


@app.get("/api/fournisseurs", summary="Lister les fournisseurs")
def get_fournisseurs():
    return repo.list_fournisseurs()


@app.post("/api/fournisseurs", summary="Ajouter un fournisseur", status_code=201)
def create_fournisseur(body: FournisseurCreate):
    key = body.id.upper().strip().replace(" ", "")
    if repo.get_fournisseur(key) is not None:
        raise HTTPException(status_code=409, detail=f"Le fournisseur '{key}' existe déjà.")
    if not body.nom_affiche.strip():
        raise HTTPException(status_code=422, detail="nom_affiche ne peut pas être vide.")
    return repo.upsert_fournisseur(
        id=key,
        nom_affiche=body.nom_affiche.strip(),
        patterns=body.patterns,
    )


@app.patch("/api/fournisseurs/{fournisseur_id}", summary="Modifier un fournisseur")
def update_fournisseur(fournisseur_id: str, body: FournisseurUpdate):
    key = fournisseur_id.upper().strip()
    existing = repo.get_fournisseur(key)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"Fournisseur '{key}' introuvable.")
    if body.nom_affiche is not None and not body.nom_affiche.strip():
        raise HTTPException(status_code=422, detail="nom_affiche ne peut pas être vide.")
    updated = repo.update_fournisseur(
        key,
        nom_affiche=body.nom_affiche.strip() if body.nom_affiche is not None else None,
        patterns=body.patterns if body.patterns is not None else None,
    )
    return updated or {}


@app.delete("/api/fournisseurs/{fournisseur_id}", summary="Supprimer un fournisseur")
def delete_fournisseur(fournisseur_id: str):
    key = fournisseur_id.upper().strip()
    if repo.get_fournisseur(key) is None:
        raise HTTPException(status_code=404, detail=f"Fournisseur '{key}' introuvable.")
    nb = repo.count_factures_for_fournisseur(key)
    if nb > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de supprimer '{key}' : {nb} facture(s) lui sont rattachées.",
        )
    repo.delete_fournisseur(key)
    return {"message": f"Fournisseur '{key}' supprimé."}


@app.get("/api/stats", summary="Statistiques globales")
def get_stats():
    return repo.stats()


@app.get("/api/export/tresorerie/download", summary="Télécharger le fichier Suivi Trésorerie MLC.xlsm")
def download_tresorerie():
    """Télécharge le fichier Suivi trésorerie MLC.xlsm (source de vérité)."""
    path = _ensure_valid_tresorerie_path()
    return FileResponse(
        path=path,
        media_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        filename="Suivi trésorerie MLC.xlsm",
    )


@app.post("/api/export/tresorerie", summary="Générer le fichier Suivi Trésorerie MLC.xlsm")
async def export_tresorerie():
    """Force la régénération du xlsm depuis la BDD SQLite (onglet Achats Cons uniquement)."""
    active_xlsm = _ensure_valid_tresorerie_path()

    def _run() -> int:
        factures = repo.list_factures()
        bons = repo.list_bons()
        with _xlsm_write_lock:
            return write_to_achats_cons(
                factures=factures,
                bons=bons,
                template_path=active_xlsm,
                output_path=active_xlsm,
                fournisseur_display=repo.fournisseur_display_map(),
            )

    try:
        loop = asyncio.get_running_loop()
        lignes_inserees = await loop.run_in_executor(_executor, _run)
    except HTTPException:
        raise
    except Exception as e:
        err = f"{type(e).__name__}: {e}".rstrip(": ")
        raise HTTPException(status_code=500, detail=f"Export trésorerie impossible: {err}")

    return {
        "lignes_inserees": lignes_inserees,
        "fichier": os.path.basename(active_xlsm),
        "message": "Export trésorerie généré.",
    }


@app.post("/api/export/full", summary="Export complet BDD → XLSM (tous les onglets)")
async def export_full():
    """
    Régénère le fichier XLSM depuis la BDD SQLite en mettant à jour
    tous les onglets gérés par l'application :
    - Achats Cons   : factures + bons de livraison
    - Autres achats : autres achats
    - DOMINO        : données journalières DOMINO
    - Inputs        : liste des fournisseurs

    Sauvegarde atomique avec backup .lastgood.bak automatique.
    L'export openpyxl étant bloquant, il est exécuté dans le thread pool
    pour ne pas bloquer la boucle asyncio (évite le socket hang up).
    """
    active_xlsm = _ensure_valid_tresorerie_path()

    def _run_export() -> dict:
        with _xlsm_write_lock:
            return export_to_xlsm(output_path=active_xlsm)

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_executor, _run_export)
    except HTTPException:
        raise
    except Exception as e:
        err = f"{type(e).__name__}: {e}".rstrip(": ")
        raise HTTPException(status_code=500, detail=f"Export complet impossible: {err}")

    return {
        "message": "Export complet effectué.",
        "fichier": os.path.basename(active_xlsm),
        "achats_cons_lignes": result.get("achats_cons_lignes", 0),
        "autres_achats_lignes": result.get("autres_achats_lignes", 0),
        "domino_jours": result.get("domino_jours", 0),
        "inputs_fournisseurs": result.get("inputs_fournisseurs", 0),
        "erreurs": result.get("errors", []),
    }


@app.post("/api/export/tresorerie/restore-lastgood", summary="Restaurer le XLSM depuis la backup last-good")
def restore_tresorerie_lastgood():
    """Restaure le fichier xlsm principal/fallback à partir de la backup .lastgood.bak."""
    with _xlsm_write_lock:
        return _restore_tresorerie_from_backup()


@app.delete("/api/factures/{numero_facture}", summary="Supprimer une facture")
def delete_facture(numero_facture: str):
    """Supprime une facture et détache ses BL liés."""
    if not repo.delete_facture(numero_facture):
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")
    _schedule_regenerate_excel()
    return {"message": f"Facture '{numero_facture}' supprimée."}


@app.delete("/api/bons-livraison/{numero_bl}", summary="Supprimer un bon de livraison")
def delete_bon(numero_bl: str):
    """Supprime un bon de livraison."""
    if not repo.delete_bon(numero_bl):
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{numero_bl}' introuvable.")
    _schedule_regenerate_excel()
    return {"message": f"Bon de livraison '{numero_bl}' supprimé."}


@app.delete("/api/reset", summary="Réinitialiser les factures et BL en BDD (ne touche pas au xlsm)")
def reset_store():
    """Supprime uniquement les factures et bons de livraison (autres_achats et DOMINO conservés)."""
    with db.transaction() as conn:
        conn.execute("DELETE FROM bons_livraison")
        conn.execute("DELETE FROM factures")
    return {"message": "Factures et bons de livraison supprimés."}


# ---------------------------------------------------------------------------
# Automatisation — pilotage tâches + logs
# ---------------------------------------------------------------------------

@app.get("/api/automation/tasks", summary="Lister les tâches d'automatisation")
def automation_list_tasks():
    with _automation_lock:
        tasks = [dict(v) for v in _automation_tasks.values()]
    tasks.sort(key=lambda x: x.get("id", ""))
    return tasks


@app.get("/api/automation/logs", summary="Lister les logs d'automatisation")
def automation_list_logs(task_id: str | None = None, limit: int = 200):
    lim = max(1, min(limit, 1000))
    return automation_logger.get_logs(task_id=task_id, limit=lim)


@app.post("/api/automation/tasks/{task_id}/start", summary="Activer une tâche d'automatisation")
def automation_start_task(task_id: str):
    with _automation_lock:
        task = _automation_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        task["enabled"] = True
        task["next_run"] = datetime.now().isoformat(timespec="seconds")
    _add_automation_log(task_id, "info", "Tache activee.")
    return {"message": f"Tache '{task_id}' activee."}


@app.post("/api/automation/tasks/{task_id}/stop", summary="Désactiver une tâche d'automatisation")
def automation_stop_task(task_id: str):
    with _automation_lock:
        task = _automation_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        task["enabled"] = False
    _add_automation_log(task_id, "warn", "Tache desactivee.")
    return {"message": f"Tache '{task_id}' desactivee."}


@app.post("/api/automation/tasks/{task_id}/run-now", summary="Exécuter une tâche immédiatement")
def automation_run_task_now(task_id: str):
    with _automation_lock:
        task = _automation_tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        if task.get("is_running"):
            raise HTTPException(status_code=409, detail=f"La tache '{task_id}' est deja en cours")
    _executor.submit(_execute_automation_task, task_id, "manual")
    return {"message": f"Execution immediate lancee pour '{task_id}'."}


# ---------------------------------------------------------------------------
# DOMINO — Automatisation import rapport journalier
# ---------------------------------------------------------------------------

@app.get("/api/domino/files", summary="Lister les fichiers DOMINO et leur statut d'import")
def domino_list_files():
    """Liste les fichiers .xlsx du dossier test_domino/ avec leur statut."""
    return domino_module.list_domino_files()


@app.get("/api/domino/data", summary="Données DOMINO importées")
def domino_get_data():
    """Retourne toutes les données DOMINO importées, triées par date décroissante."""
    return domino_module.get_all_imported_data()


@app.post("/api/domino/import-json", summary="Importer un JSON DOMINO (robuste)")
async def domino_import_json(file: UploadFile = File(...), mode: str = "merge"):
    """
    Importe un JSON DOMINO avec validation/normalisation.
    mode=merge (défaut) ou mode=replace.
    """
    try:
        content = await file.read()
        payload = json.loads(content.decode("utf-8"))
        result = domino_module.import_json_payload(payload, mode=mode)
        return result
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=422, detail=f"JSON invalide: {e}")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur import JSON DOMINO : {e}")


@app.post("/api/domino/import/{filename}", summary="Importer un fichier DOMINO")
def domino_import_file(filename: str, overwrite: bool = False):
    """
    Parse et importe un fichier DOMINO depuis test_domino/.
    Si overwrite=false (défaut) et que le fichier a déjà été importé, retourne skipped=true.
    Tente d'écrire dans l'onglet DOMINO du XLSM si disponible.
    """
    active_xlsm = _pick_valid_tresorerie_path()

    try:
        with _xlsm_write_lock:
            result = domino_module.import_domino_file(
                filename=filename,
                xlsm_path=active_xlsm,
                overwrite=overwrite,
            )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur import DOMINO : {e}")

    return result


@app.post("/api/domino/import-all", summary="Importer tous les fichiers DOMINO non encore traités")
def domino_import_all(overwrite: bool = False):
    """
    Importe en batch tous les fichiers DOMINO du dossier test_domino/.
    Ignore par défaut les fichiers déjà importés.
    """
    files = domino_module.list_domino_files()
    if not overwrite:
        files = [f for f in files if not f["imported"]]

    if not files:
        return {"message": "Aucun fichier à importer.", "results": []}

    active_xlsm = _pick_valid_tresorerie_path()
    results = []
    for f in files:
        try:
            with _xlsm_write_lock:
                result = domino_module.import_domino_file(
                    filename=f["filename"],
                    xlsm_path=active_xlsm,
                    overwrite=overwrite,
                )
            results.append(result)
        except Exception as e:
            results.append({
                "filename": f["filename"],
                "date": f.get("date"),
                "skipped": False,
                "xlsm_updated": False,
                "cells_written": 0,
                "message": f"Erreur : {e}",
            })

    imported = sum(1 for r in results if not r.get("skipped") and not r.get("xlsm_error") and "Erreur" not in r.get("message", ""))
    return {
        "message": f"{imported}/{len(results)} fichier(s) importé(s).",
        "results": results,
    }


@app.post("/api/domino/resync-xlsm", summary="Forcer la resynchronisation DOMINO XLSM depuis le JSON")
def domino_resync_xlsm_from_json(force_overwrite: bool = True):
    """
    Rejoue toutes les données DOMINO déjà présentes en JSON vers l'onglet DOMINO du XLSM.
    Par défaut, écrase les valeurs existantes de la colonne date (force_overwrite=true).
    """
    active_xlsm = _ensure_valid_tresorerie_path()

    try:
        with _xlsm_write_lock:
            result = domino_module.resync_xlsm_from_json(
                xlsm_path=active_xlsm,
                force_overwrite=force_overwrite,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur resynchronisation DOMINO : {e}")

    result["fichier"] = os.path.basename(active_xlsm)
    return result


def _run_domino_resync_job(job_id: str, force_overwrite: bool) -> None:
    """Worker de fond pour la resynchronisation DOMINO JSON -> XLSM."""
    with _domino_resync_jobs_lock:
        _domino_resync_jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "message": "Resynchronisation en cours...",
        }

    try:
        active_xlsm = _ensure_valid_tresorerie_path()
        with _xlsm_write_lock:
            result = domino_module.resync_xlsm_from_json(
                xlsm_path=active_xlsm,
                force_overwrite=force_overwrite,
            )
        result["fichier"] = os.path.basename(active_xlsm)
        with _domino_resync_jobs_lock:
            _domino_resync_jobs[job_id] = {
                "job_id": job_id,
                "status": "completed",
                "message": result.get("message", "Resynchronisation terminee."),
                "result": result,
            }
    except Exception as e:
        with _domino_resync_jobs_lock:
            _domino_resync_jobs[job_id] = {
                "job_id": job_id,
                "status": "failed",
                "message": f"Echec de la resynchronisation: {e}",
                "error": str(e),
            }


@app.post("/api/domino/resync-xlsm/start", summary="Démarrer une resynchronisation DOMINO en tâche de fond")
def domino_resync_xlsm_start(force_overwrite: bool = True):
    """
    Lance la resynchronisation en arrière-plan et retourne immédiatement un job_id.
    Évite les timeouts proxy sur les gros fichiers XLSM.
    """
    job_id = str(uuid.uuid4())
    _executor.submit(_run_domino_resync_job, job_id, force_overwrite)
    return {
        "job_id": job_id,
        "status": "running",
        "message": "Resynchronisation DOMINO demarree.",
    }


@app.get("/api/domino/resync-xlsm/status/{job_id}", summary="Statut d'un job de resynchronisation DOMINO")
def domino_resync_xlsm_status(job_id: str):
    with _domino_resync_jobs_lock:
        job = _domino_resync_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' introuvable")
    return job


# ---------------------------------------------------------------------------
# Autres achats
# ---------------------------------------------------------------------------

class AutreAchatCreate(BaseModel):
    fournisseur: str
    categorie: str | None = None
    num_facture: str | None = None
    num_bl: str | None = None
    date: str | None = None
    ht_0: float | None = None
    ht_2_1: float | None = None
    ht_5_5: float | None = None
    ht_10: float | None = None
    ht_20: float | None = None
    conditions: str | None = None
    date_paiement: str | None = None
    amortissable: str | None = None
    ref_denotage: str | None = None


class AutreAchatUpdate(BaseModel):
    fournisseur: str | None = None
    categorie: str | None = None
    num_facture: str | None = None
    num_bl: str | None = None
    date: str | None = None
    ht_0: float | None = None
    ht_2_1: float | None = None
    ht_5_5: float | None = None
    ht_10: float | None = None
    ht_20: float | None = None
    conditions: str | None = None
    date_paiement: str | None = None
    amortissable: str | None = None
    ref_denotage: str | None = None


@app.get("/api/autres-achats", summary="Lister les autres achats")
def list_autres_achats_endpoint():
    """Retourne toutes les lignes d'autres achats."""
    return repo.list_autres_achats()


@app.post("/api/autres-achats", summary="Ajouter un autre achat", status_code=201)
def create_autre_achat_endpoint(body: AutreAchatCreate):
    """Crée une nouvelle ligne d'autres achats."""
    achat_id = repo.insert_autre_achat(body.model_dump())
    achat = repo.get_autre_achat(achat_id)
    return achat or {"id": achat_id}


@app.get("/api/autres-achats/{achat_id}", summary="Récupérer un autre achat")
def get_autre_achat_endpoint(achat_id: int):
    """Retourne les détails d'une ligne d'autres achats."""
    achat = repo.get_autre_achat(achat_id)
    if not achat:
        raise HTTPException(status_code=404, detail=f"Autre achat {achat_id} introuvable.")
    return achat


@app.patch("/api/autres-achats/{achat_id}", summary="Modifier un autre achat")
def update_autre_achat_endpoint(achat_id: int, body: AutreAchatUpdate):
    """Met à jour les champs d'une ligne d'autres achats."""
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        achat = repo.get_autre_achat(achat_id)
        if not achat:
            raise HTTPException(status_code=404, detail=f"Autre achat {achat_id} introuvable.")
        return achat
    
    updated = repo.update_autre_achat(achat_id, updates)
    if not updated:
        raise HTTPException(status_code=404, detail=f"Autre achat {achat_id} introuvable.")
    return updated


@app.delete("/api/autres-achats/{achat_id}", summary="Supprimer un autre achat")
def delete_autre_achat_endpoint(achat_id: int):
    """Supprime une ligne d'autres achats."""
    deleted = repo.delete_autre_achat(achat_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Autre achat {achat_id} introuvable.")
    return {"message": f"Autre achat {achat_id} supprimé."}


# ---------------------------------------------------------------------------
# Helpers internes
# ---------------------------------------------------------------------------

def _deserialize_record(record: dict) -> dict:
    """Reconvertit les strings ISO en objets date pour les traitements internes."""
    out = dict(record)
    for key in ("date_emission", "date_paiement_prevue", "date_livraison"):
        val = out.get(key)
        if isinstance(val, str):
            try:
                out[key] = date.fromisoformat(val)
            except ValueError:
                pass
    return out


def _regenerate_excel():
    """
    Persiste l'état complet de la BDD dans le fichier xlsm cible :
    - Onglet 'Achats Cons'  : factures + BL
    - Onglet 'Autres achats': autres achats
    - Onglet 'DOMINO'       : données journalières DOMINO
    - Onglet 'Inputs'       : liste des fournisseurs
    """
    active_xlsm = _pick_valid_tresorerie_path()
    if not active_xlsm:
        print(
            "[WARN] _regenerate_excel : aucun xlsm valide, persistance ignoree. "
            f"Etat: {_build_tresorerie_invalid_detail()}"
        )
        return

    try:
        with _xlsm_write_lock:
            result = export_to_xlsm(output_path=active_xlsm)
        print(
            f"[XLSM] Export complet : {result.get('achats_cons_lignes')} ligne(s) Achats Cons, "
            f"{result.get('autres_achats_lignes')} Autres achats, "
            f"{result.get('domino_jours')} jour(s) DOMINO, "
            f"{result.get('inputs_fournisseurs')} fournisseur(s) Inputs."
        )
    except Exception as e:
        err = f"{type(e).__name__}: {e}".rstrip(": ")
        print(f"[WARN] _regenerate_excel : erreur lors de l'export complet : {err}")


def _schedule_regenerate_excel() -> None:
    """
    Déclenche une persistance XLSM en arrière-plan.
    Les demandes concurrentes sont fusionnées pour éviter les blocages en rafale.
    """
    global _regen_pending, _regen_running

    with _regen_lock:
        _regen_pending = True
        if _regen_running:
            return
        _regen_running = True

    def _worker():
        global _regen_pending, _regen_running
        while True:
            with _regen_lock:
                if not _regen_pending:
                    _regen_running = False
                    return
                _regen_pending = False
            _regenerate_excel()

    threading.Thread(target=_worker, daemon=True).start()
