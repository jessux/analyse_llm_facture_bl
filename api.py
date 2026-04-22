from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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
    clean_date_columns,
    llm,
    OUTPUT_XLSX,
)
import pandas as pd

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

# Pool de threads dédié au traitement LLM (bloquant)
_executor = ThreadPoolExecutor(max_workers=4)

# ---------------------------------------------------------------------------
# Store en mémoire (remplaçable par une BDD)
# Clé d'unicité : numero_facture pour les factures, numero_bon_livraison pour les BL
# ---------------------------------------------------------------------------
_store: dict[str, dict[str, dict]] = {"factures": {}, "bons": {}}


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
    Retourne un dict avec les clés : data, doc_type, action, error.
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
        # 1. Sauvegarde de tous les fichiers sur disque (async)
        saved: list[tuple[str, str]] = []  # (tmp_path, filename)
        for upload in files:
            fname = upload.filename or ""
            if not fname.lower().endswith(".pdf"):
                results["errors"].append({
                    "fichier": fname,
                    "erreur": "Seuls les fichiers PDF sont acceptés.",
                })
                continue
            tmp_path = os.path.join(tmp_dir, fname)
            content  = await upload.read()
            with open(tmp_path, "wb") as f:
                f.write(content)
            saved.append((tmp_path, fname))

        # 2. Traitement LLM en parallèle dans le thread pool
        futures = [
            loop.run_in_executor(_executor, _process_one_pdf, tmp_path, fname)
            for tmp_path, fname in saved
        ]
        outcomes = await asyncio.gather(*futures)

        # 3. Intégration des résultats dans le store
        for (_, fname), outcome in zip(saved, outcomes):
            if outcome["error"]:
                results["errors"].append({"fichier": fname, "erreur": outcome["error"]})
                continue

            data     = outcome["data"]
            doc_type = outcome["doc_type"]

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
        f.get("montant_total") or 0
        for f in factures
        if f.get("montant_total") is not None
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


@app.get("/api/export/excel", summary="Télécharger le fichier Excel")
def export_excel():
    if not os.path.exists(OUTPUT_XLSX):
        raise HTTPException(status_code=404, detail="Aucun fichier Excel disponible. Lancez d'abord une analyse.")
    return FileResponse(
        path=OUTPUT_XLSX,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="factures_et_bl.xlsx",
    )


@app.delete("/api/reset", summary="Réinitialiser le store")
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
    os.makedirs("output", exist_ok=True)
    df_factures = clean_date_columns(pd.DataFrame(list(_store["factures"].values())))
    df_bons = clean_date_columns(pd.DataFrame(list(_store["bons"].values())))

    with pd.ExcelWriter(OUTPUT_XLSX, engine="openpyxl") as writer:
        if not df_factures.empty:
            df_factures.sort_values(
                by=["nom_fournisseur", "date_emission"], na_position="last"
            ).to_excel(writer, sheet_name="Factures", index=False)
        if not df_bons.empty:
            df_bons.sort_values(
                by=["nom_fournisseur", "date_livraison"], na_position="last"
            ).to_excel(writer, sheet_name="BonsLivraison", index=False)
