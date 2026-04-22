from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Literal
from datetime import date
from concurrent.futures import ThreadPoolExecutor
import asyncio
import tempfile
import shutil
import os

from main import (
    load_pdf_text,
    classify_document,
    build_prompt,
    finalize_document_data,
    link_documents,
    write_to_achats_cons,
    FOURNISSEUR_DISPLAY,
    llm,
)
import openpyxl
from openpyxl import load_workbook

# Dossier de stockage persistant des PDFs importés
STORAGE_DIR = "storage"
os.makedirs(STORAGE_DIR, exist_ok=True)

app = FastAPI(
    title="Marjo — API Gestion Factures",
    description="API d'extraction automatique de factures et bons de livraison par IA",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Sert les PDFs stockés via /api/documents/<filename>
app.mount("/api/documents", StaticFiles(directory=STORAGE_DIR), name="documents")

# Pool de threads dédié au traitement LLM (bloquant)
_executor = ThreadPoolExecutor(max_workers=4)

# ---------------------------------------------------------------------------
# Fichier source de vérité unique
# ---------------------------------------------------------------------------
TRESORERIE_XLSM = os.getenv(
    "TRESORERIE_XLSM_PATH",
    "output/Suivi trésorerie MLC.xlsm",
)

# ---------------------------------------------------------------------------
# Store en mémoire (remplaçable par une BDD)
# Clé d'unicité : numero_facture pour les factures, numero_bon_livraison pour les BL
# ---------------------------------------------------------------------------
_store: dict[str, dict[str, dict]] = {"factures": {}, "bons": {}}


@app.on_event("startup")
def _startup_load_excel() -> None:
    """
    Au démarrage, recharge le store depuis l'onglet 'Achats Cons' du fichier
    'Suivi trésorerie MLC.xlsm'. Seules les lignes dont le fournisseur est
    Sysco / Ambelys / TerreAzur (col C) et dont la colonne W (Commentaires)
    contient le nom du fichier PDF source sont chargées comme factures.
    Les BL (col E) sont reconstruits à partir des lignes de factures.
    """
    if not os.path.exists(TRESORERIE_XLSM):
        print(f"[WARN] Fichier '{TRESORERIE_XLSM}' introuvable - store vide. "
              "Deposez 'Suivi tresorerie MLC.xlsm' dans output/.")
        return

    try:
        wb = load_workbook(TRESORERIE_XLSM, read_only=True, keep_vba=True)
        ws = wb["Achats Cons"]

        # Mapping fournisseur affiché → clé interne
        DISPLAY_TO_KEY = {v.lower(): k for k, v in FOURNISSEUR_DISPLAY.items()}
        # ex: "sysco" → "SYSCO", "ambelys" → "AMBELYS", "terreazur" → "TERREAZUR"

        for row in ws.iter_rows(min_row=2, values_only=True):
            fournisseur_raw = row[2]   # col C
            if not fournisseur_raw:
                continue
            fournisseur_key = DISPLAY_TO_KEY.get(str(fournisseur_raw).strip().lower())
            if not fournisseur_key:
                continue  # ligne d'un autre fournisseur, on ignore

            num_facture  = str(row[3]).strip() if row[3] is not None else None
            num_bl       = str(row[4]).strip() if row[4] is not None else None
            date_emission = row[5]   # col F — datetime ou None
            ht_55        = row[8]    # col I
            ht_10        = row[9]    # col J
            ht_20        = row[10]   # col K
            date_paiement = row[18]  # col S
            commentaire  = str(row[22]).strip() if row[22] is not None else None  # col W

            # Convertir les datetime Excel en date Python
            def _to_date(v):
                if v is None:
                    return None
                if hasattr(v, "date"):
                    return v.date()
                if isinstance(v, date):
                    return v
                return None

            def _to_float(v):
                if v is None:
                    return None
                try:
                    return float(v)
                except (ValueError, TypeError):
                    return None

            if not num_facture:
                continue

            # Construire ou enrichir l'entrée facture
            if num_facture not in _store["factures"]:
                record: dict = {
                    "type_document":       "facture",
                    "numero_facture":      num_facture,
                    "nom_fournisseur":     fournisseur_key,
                    "date_emission":       _to_date(date_emission),
                    "date_paiement_prevue": _to_date(date_paiement),
                    "prix_HT_5_5pct":      _to_float(ht_55),
                    "prix_HT_10pct":       _to_float(ht_10),
                    "prix_HT_20pct":       _to_float(ht_20),
                    "montant_total":       None,
                    "bons_livraisons":     [],
                    "fichier_source":      commentaire or "",
                    "fichier_stocke":      None,
                }
                # Vérifier si le PDF est en storage
                if commentaire:
                    candidate = os.path.join(STORAGE_DIR, commentaire)
                    if os.path.exists(candidate):
                        record["fichier_stocke"] = commentaire
                _store["factures"][num_facture] = record
            else:
                # Ligne supplémentaire pour la même facture (plusieurs BL)
                record = _store["factures"][num_facture]

            # Rattacher le BL à la facture
            if num_bl and num_bl not in _store["factures"][num_facture]["bons_livraisons"]:
                _store["factures"][num_facture]["bons_livraisons"].append(num_bl)

            # Créer l'entrée BL si présent
            if num_bl and num_bl not in _store["bons"]:
                _store["bons"][num_bl] = {
                    "type_document":           "bon_livraison",
                    "numero_bon_livraison":    num_bl,
                    "nom_fournisseur":         fournisseur_key,
                    "date_livraison":          _to_date(date_emission),
                    "montant_total":           None,
                    "numero_facture_rattachee": num_facture,
                    "fichier_source":          commentaire or "",
                    "fichier_stocke":          None,
                }

        # Sérialiser les dates en strings ISO pour le store
        for f in _store["factures"].values():
            for field in ("date_emission", "date_paiement_prevue"):
                v = f.get(field)
                if isinstance(v, date) and not isinstance(v, str):
                    f[field] = v.isoformat()
        for b in _store["bons"].values():
            v = b.get("date_livraison")
            if isinstance(v, date) and not isinstance(v, str):
                b["date_livraison"] = v.isoformat()

        nb_f = len(_store["factures"])
        nb_b = len(_store["bons"])
        print(f"[OK] Store rechargé depuis '{TRESORERIE_XLSM}' : {nb_f} facture(s), {nb_b} bon(s) de livraison.")

    except Exception as e:
        print(f"[WARN] Impossible de charger le fichier xlsm au démarrage : {e}")


def _serialize(obj):
    """Convertit les objets date en string ISO pour la sérialisation JSON."""
    if isinstance(obj, date):
        return obj.isoformat()
    return obj


def _serialize_record(record: dict) -> dict:
    return {k: _serialize(v) for k, v in record.items()}


def _upsert_facture(data: dict) -> tuple[dict, str]:
    """
    Insère ou remplace une facture dans le store.
    Retourne (data, action) où action = 'created' | 'updated' | 'rejected'.
    Bloque si numero_facture est null.
    """
    numero = data.get("numero_facture")
    if not numero:
        return data, "rejected"
    action = "updated" if numero in _store["factures"] else "created"
    _store["factures"][numero] = data
    return data, action


def _upsert_bon(data: dict) -> tuple[dict, str]:
    """
    Insère ou remplace un bon de livraison dans le store.
    Retourne (data, action) où action = 'created' | 'updated' | 'rejected'.
    Bloque si numero_bon_livraison est null.
    """
    numero = data.get("numero_bon_livraison")
    if not numero:
        return data, "rejected"
    action = "updated" if numero in _store["bons"] else "created"
    _store["bons"][numero] = data
    return data, action


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


def _process_one_pdf(tmp_path: str, filename: str) -> dict:
    """
    Traitement complet d'un PDF (bloquant — exécuté dans le thread pool).
    Retourne un dict avec les clés : data, doc_type, error.
    """
    try:
        text     = load_pdf_text(tmp_path)
        doc_type = classify_document(text, filename)
        prompt   = build_prompt(doc_type, text)

        result = llm.invoke(prompt)
        data   = result.model_dump() if hasattr(result, "model_dump") else dict(result)
        data   = finalize_document_data(data, text=text, filename=filename, predicted_type=doc_type)
        data   = _serialize_record(data)
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
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    results = {
        "created":  {"factures": 0, "bons": 0},
        "updated":  {"factures": 0, "bons": 0},
        "rejected": [],
        "errors":   [],
    }
    tmp_dir = tempfile.mkdtemp()
    loop    = asyncio.get_event_loop()

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
        futures = [
            loop.run_in_executor(_executor, _process_one_pdf, tmp_path, fname)
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
                _, action = _upsert_bon(_deserialize_record(data))
            else:
                _, action = _upsert_facture(_deserialize_record(data))

            if action == "rejected":
                results["rejected"].append({
                    "fichier": fname,
                    "type":    doc_type,
                    "raison":  "Numéro non extrait par l'IA (null).",
                })
            elif doc_type == "bon_livraison":
                results[action]["bons"] += 1
            else:
                results[action]["factures"] += 1

        # 4. Reliaison automatique BL ↔ Factures
        _relink_store()

        # 5. Régénération Excel
        _regenerate_excel()

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
            "factures": results["created"]["factures"] + results["updated"]["factures"],
            "bons":     results["created"]["bons"]     + results["updated"]["bons"],
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/factures", summary="Lister les factures extraites")
def get_factures():
    return [_serialize_record(f) for f in _store["factures"].values()]


@app.get("/api/bons-livraison", summary="Lister les bons de livraison extraits")
def get_bons_livraison():
    return [_serialize_record(b) for b in _store["bons"].values()]


class RattachementBL(BaseModel):
    numero_bon_livraison: str

class RattachementFacture(BaseModel):
    numero_facture: str

# Champs éditables par type de document
FACTURE_EDITABLE_FIELDS = {
    "date_emission", "date_paiement_prevue",
    "montant_total", "prix_HT_5_5pct", "prix_HT_10pct", "prix_HT_20pct",
    "numero_facture", "nom_fournisseur",
}
BON_EDITABLE_FIELDS = {
    "date_livraison", "montant_total",
    "numero_bon_livraison", "nom_fournisseur",
}

class PatchFacture(BaseModel):
    date_emission:        str | None = None
    date_paiement_prevue: str | None = None
    montant_total:        float | None = None
    prix_HT_5_5pct:       float | None = None
    prix_HT_10pct:        float | None = None
    prix_HT_20pct:        float | None = None
    numero_facture:       str | None = None
    nom_fournisseur:      str | None = None

class PatchBon(BaseModel):
    date_livraison:  str | None = None
    montant_total:   float | None = None
    numero_bon_livraison: str | None = None
    nom_fournisseur: str | None = None


@app.patch("/api/factures/{numero_facture}", summary="Modifier les champs d'une facture")
def patch_facture(numero_facture: str, body: PatchFacture):
    """
    Met à jour les champs éditables d'une facture.
    Seuls les champs non-None dans le body sont modifiés.
    Si numero_facture change, la clé du store est mise à jour.
    """
    facture = _store["factures"].get(numero_facture)
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
    if "nom_fournisseur" in updates and updates["nom_fournisseur"] not in ("SYSCO", "AMBELYS", "TERREAZUR"):
        raise HTTPException(status_code=422, detail="nom_fournisseur doit être SYSCO, AMBELYS ou TERREAZUR.")

    nouveau_numero = updates.pop("numero_facture", None)
    facture.update(updates)

    # Changement de numéro : réindexation
    if nouveau_numero and nouveau_numero != numero_facture:
        if nouveau_numero in _store["factures"]:
            raise HTTPException(status_code=409, detail=f"La facture '{nouveau_numero}' existe déjà.")
        facture["numero_facture"] = nouveau_numero
        del _store["factures"][numero_facture]
        _store["factures"][nouveau_numero] = facture
    else:
        _store["factures"][numero_facture] = facture

    _regenerate_excel()
    return _serialize_record(facture)


@app.patch("/api/bons-livraison/{numero_bl}", summary="Modifier les champs d'un bon de livraison")
def patch_bon(numero_bl: str, body: PatchBon):
    """
    Met à jour les champs éditables d'un bon de livraison.
    Seuls les champs non-None dans le body sont modifiés.
    """
    bon = _store["bons"].get(numero_bl)
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
    if "nom_fournisseur" in updates and updates["nom_fournisseur"] not in ("SYSCO", "AMBELYS", "TERREAZUR"):
        raise HTTPException(status_code=422, detail="nom_fournisseur doit être SYSCO, AMBELYS ou TERREAZUR.")

    nouveau_numero = updates.pop("numero_bon_livraison", None)
    bon.update(updates)

    # Changement de numéro : réindexation
    if nouveau_numero and nouveau_numero != numero_bl:
        if nouveau_numero in _store["bons"]:
            raise HTTPException(status_code=409, detail=f"Le bon '{nouveau_numero}' existe déjà.")
        bon["numero_bon_livraison"] = nouveau_numero
        del _store["bons"][numero_bl]
        _store["bons"][nouveau_numero] = bon
    else:
        _store["bons"][numero_bl] = bon

    _regenerate_excel()
    return _serialize_record(bon)


@app.patch("/api/factures/{numero_facture}/rattacher", summary="Rattacher un BL à une facture")
def rattacher_bl_a_facture(numero_facture: str, body: RattachementBL):
    """
    Rattache manuellement un BL à une facture :
    - Ajoute le BL dans bons_livraisons de la facture (si absent)
    - Met à jour numero_facture_rattachee sur le BL
    """
    facture = _store["factures"].get(numero_facture)
    if not facture:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")

    bon = _store["bons"].get(body.numero_bon_livraison)
    if not bon:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{body.numero_bon_livraison}' introuvable.")

    # Mise à jour de la facture
    bons_list: list = facture.get("bons_livraisons") or []
    if body.numero_bon_livraison not in bons_list:
        bons_list.append(body.numero_bon_livraison)
    facture["bons_livraisons"] = bons_list
    _store["factures"][numero_facture] = facture

    # Mise à jour du BL
    bon["numero_facture_rattachee"] = numero_facture
    _store["bons"][body.numero_bon_livraison] = bon

    _regenerate_excel()
    return {
        "facture": _serialize_record(facture),
        "bon":     _serialize_record(bon),
    }


@app.patch("/api/bons-livraison/{numero_bl}/rattacher", summary="Rattacher une facture à un BL")
def rattacher_facture_a_bl(numero_bl: str, body: RattachementFacture):
    """
    Rattache manuellement une facture à un BL (symétrique de l'endpoint précédent).
    """
    bon = _store["bons"].get(numero_bl)
    if not bon:
        raise HTTPException(status_code=404, detail=f"Bon de livraison '{numero_bl}' introuvable.")

    facture = _store["factures"].get(body.numero_facture)
    if not facture:
        raise HTTPException(status_code=404, detail=f"Facture '{body.numero_facture}' introuvable.")

    # Mise à jour du BL
    bon["numero_facture_rattachee"] = body.numero_facture
    _store["bons"][numero_bl] = bon

    # Mise à jour de la facture
    bons_list: list = facture.get("bons_livraisons") or []
    if numero_bl not in bons_list:
        bons_list.append(numero_bl)
    facture["bons_livraisons"] = bons_list
    _store["factures"][body.numero_facture] = facture

    _regenerate_excel()
    return {
        "bon":     _serialize_record(bon),
        "facture": _serialize_record(facture),
    }


@app.delete("/api/factures/{numero_facture}/rattacher/{numero_bl}", summary="Supprimer le rattachement BL ↔ Facture")
def supprimer_rattachement(numero_facture: str, numero_bl: str):
    """Supprime le lien entre une facture et un BL (dans les deux sens)."""
    facture = _store["factures"].get(numero_facture)
    if not facture:
        raise HTTPException(status_code=404, detail=f"Facture '{numero_facture}' introuvable.")

    bon = _store["bons"].get(numero_bl)

    # Retrait du BL de la liste de la facture
    bons_list = facture.get("bons_livraisons") or []
    facture["bons_livraisons"] = [b for b in bons_list if b != numero_bl]
    _store["factures"][numero_facture] = facture

    # Retrait de la référence facture sur le BL
    if bon and bon.get("numero_facture_rattachee") == numero_facture:
        bon["numero_facture_rattachee"] = None
        _store["bons"][numero_bl] = bon

    _regenerate_excel()
    return {"message": f"Rattachement {numero_bl} ↔ {numero_facture} supprimé."}


@app.get("/api/stats", summary="Statistiques globales")
def get_stats():
    factures = list(_store["factures"].values())
    bons = list(_store["bons"].values())
    
    montant_total = sum(
        f.get("TOT HT") or 0
        for f in factures
        if f.get("TOT HT") is not None
    )
    bl_non_rattaches = sum(
        1 for b in bons if not b.get("numero_facture_rattachee")
    )

    return {
        "nb_factures": len(factures),
        "nb_bons": len(bons),
        "montant_total": round(montant_total, 2),
        "bl_non_rattaches": bl_non_rattaches,
    }


@app.get("/api/export/tresorerie/download", summary="Télécharger le fichier Suivi Trésorerie MLC.xlsm")
def download_tresorerie():
    """Télécharge le fichier Suivi trésorerie MLC.xlsm (source de vérité)."""
    if not os.path.exists(TRESORERIE_XLSM):
        raise HTTPException(
            status_code=404,
            detail="Fichier 'Suivi trésorerie MLC.xlsm' introuvable dans output/.",
        )
    return FileResponse(
        path=TRESORERIE_XLSM,
        media_type="application/vnd.ms-excel.sheet.macroEnabled.12",
        filename="Suivi trésorerie MLC.xlsm",
    )


@app.delete("/api/reset", summary="Réinitialiser le store en mémoire (ne touche pas au xlsm)")
def reset_store():
    _store["factures"] = {}
    _store["bons"] = {}
    return {"message": "Store réinitialisé."}


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


def _relink_store() -> None:
    """
    Relance la liaison automatique BL ↔ Factures sur l'ensemble du store
    et réindexe. Préserve les rattachements manuels existants.
    """
    factures_list = list(_store["factures"].values())
    bons_list     = list(_store["bons"].values())
    factures_linked, bons_linked = link_documents(factures_list, bons_list)

    _store["factures"] = {
        f["numero_facture"]: f
        for f in factures_linked
        if f.get("numero_facture")
    }
    _store["bons"] = {
        b["numero_bon_livraison"]: b
        for b in bons_linked
        if b.get("numero_bon_livraison")
    }


def _regenerate_excel():
    """
    Persiste le store dans l'onglet 'Achats Cons' du fichier
    'Suivi trésorerie MLC.xlsm' en écrasant uniquement les lignes
    dont le fournisseur est Sysco / Ambelys / TerreAzur (col C).
    Les lignes des autres fournisseurs sont conservées intactes.
    """
    if not os.path.exists(TRESORERIE_XLSM):
        print(f"[WARN] _regenerate_excel : fichier '{TRESORERIE_XLSM}' introuvable, persistance ignoree.")
        return

    try:
        factures = list(_store["factures"].values())
        bons     = list(_store["bons"].values())
        write_to_achats_cons(
            factures=factures,
            bons=bons,
            template_path=TRESORERIE_XLSM,
            output_path=TRESORERIE_XLSM,
        )
    except Exception as e:
        print(f"[WARN] _regenerate_excel : erreur lors de l'ecriture dans le xlsm : {e}")
