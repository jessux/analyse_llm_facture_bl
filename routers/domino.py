from fastapi import APIRouter, HTTPException, UploadFile, File
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Optional
import threading
import json
import os
import uuid
import domino as domino_module

router = APIRouter(prefix="/api/domino", tags=["DOMINO"])

# Injectés depuis api.py via init_router()
_pick_tresorerie: Optional[Callable] = None
_ensure_tresorerie: Optional[Callable] = None
_xlsm_lock: Optional[threading.Lock] = None
_executor_ref: Optional[ThreadPoolExecutor] = None

# Jobs de resynchronisation en arrière-plan (état local au router)
_domino_resync_jobs: dict[str, dict] = {}
_domino_resync_jobs_lock = threading.Lock()


def init_router(
    pick_tresorerie_fn: Callable,
    ensure_tresorerie_fn: Callable,
    xlsm_lock: threading.Lock,
    executor: ThreadPoolExecutor,
) -> None:
    global _pick_tresorerie, _ensure_tresorerie, _xlsm_lock, _executor_ref
    _pick_tresorerie = pick_tresorerie_fn
    _ensure_tresorerie = ensure_tresorerie_fn
    _xlsm_lock = xlsm_lock
    _executor_ref = executor


@router.get("/files", summary="Lister les fichiers DOMINO et leur statut d'import")
def domino_list_files():
    """Liste les fichiers .xlsx du dossier test_domino/ avec leur statut."""
    return domino_module.list_domino_files()


@router.get("/data", summary="Données DOMINO importées")
def domino_get_data():
    """Retourne toutes les données DOMINO importées, triées par date décroissante."""
    return domino_module.get_all_imported_data()


@router.post("/import-json", summary="Importer un JSON DOMINO (robuste)")
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


@router.post("/import/{filename}", summary="Importer un fichier DOMINO")
def domino_import_file(filename: str, overwrite: bool = False):
    """
    Parse et importe un fichier DOMINO depuis test_domino/.
    Si overwrite=false (défaut) et que le fichier a déjà été importé, retourne skipped=true.
    Tente d'écrire dans l'onglet DOMINO du XLSM si disponible.
    """
    active_xlsm = _pick_tresorerie()

    try:
        with _xlsm_lock:
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


@router.post("/import-all", summary="Importer tous les fichiers DOMINO non encore traités")
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

    active_xlsm = _pick_tresorerie()
    results = []
    for f in files:
        try:
            with _xlsm_lock:
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

    imported = sum(
        1 for r in results
        if not r.get("skipped") and not r.get("xlsm_error") and "Erreur" not in r.get("message", "")
    )
    return {
        "message": f"{imported}/{len(results)} fichier(s) importé(s).",
        "results": results,
    }


@router.post("/resync-xlsm", summary="Forcer la resynchronisation DOMINO XLSM depuis le JSON")
def domino_resync_xlsm_from_json(force_overwrite: bool = True):
    """
    Rejoue toutes les données DOMINO déjà présentes en JSON vers l'onglet DOMINO du XLSM.
    Par défaut, écrase les valeurs existantes de la colonne date (force_overwrite=true).
    """
    active_xlsm = _ensure_tresorerie()

    try:
        with _xlsm_lock:
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
        active_xlsm = _ensure_tresorerie()
        with _xlsm_lock:
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


@router.post("/resync-xlsm/start", summary="Démarrer une resynchronisation DOMINO en tâche de fond")
def domino_resync_xlsm_start(force_overwrite: bool = True):
    """
    Lance la resynchronisation en arrière-plan et retourne immédiatement un job_id.
    Évite les timeouts proxy sur les gros fichiers XLSM.
    """
    job_id = str(uuid.uuid4())
    _executor_ref.submit(_run_domino_resync_job, job_id, force_overwrite)
    return {
        "job_id": job_id,
        "status": "running",
        "message": "Resynchronisation DOMINO demarree.",
    }


@router.get("/resync-xlsm/status/{job_id}", summary="Statut d'un job de resynchronisation DOMINO")
def domino_resync_xlsm_status(job_id: str):
    with _domino_resync_jobs_lock:
        job = _domino_resync_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' introuvable")
    return job
