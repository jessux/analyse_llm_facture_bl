from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Literal
from datetime import date
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

# ---------------------------------------------------------------------------
# Store en mémoire (remplaçable par une BDD)
# ---------------------------------------------------------------------------
_store: dict[str, list[dict]] = {"factures": [], "bons": []}


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


@app.post("/api/upload", summary="Uploader et analyser des PDFs")
async def upload_documents(files: list[UploadFile] = File(...)):
    """
    Reçoit un ou plusieurs fichiers PDF, les analyse via l'IA
    et retourne les données extraites.
    """
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    results = {"factures": [], "bons": [], "errors": []}
    tmp_dir = tempfile.mkdtemp()

    try:
        for upload in files:
            if not upload.filename or not upload.filename.lower().endswith(".pdf"):
                results["errors"].append({
                    "fichier": upload.filename,
                    "erreur": "Seuls les fichiers PDF sont acceptés.",
                })
                continue

            # Sauvegarde temporaire
            tmp_path = os.path.join(tmp_dir, upload.filename)
            with open(tmp_path, "wb") as f:
                shutil.copyfileobj(upload.file, f)

            try:
                text = load_pdf_text(tmp_path)
                doc_type = classify_document(text, upload.filename)
                prompt = build_prompt(doc_type, text)

                result = llm.invoke(prompt)
                data = result.model_dump() if hasattr(result, "model_dump") else dict(result)
                data = finalize_document_data(data, text=text, filename=upload.filename, predicted_type=doc_type)
                data = _serialize_record(data)

                if doc_type == "bon_livraison":
                    results["bons"].append(data)
                else:
                    results["factures"].append(data)

            except Exception as e:
                results["errors"].append({
                    "fichier": upload.filename,
                    "erreur": str(e),
                })

        # Liaison BL ↔ Factures et mise à jour du store
        factures_raw = [_deserialize_record(f) for f in results["factures"]]
        bons_raw = [_deserialize_record(b) for b in results["bons"]]
        factures_linked, bons_linked = link_documents(
            _store["factures"] + factures_raw,
            _store["bons"] + bons_raw,
        )
        _store["factures"] = factures_linked
        _store["bons"] = bons_linked

        # Mise à jour du Excel
        _regenerate_excel()

        return {
            "traites": len(results["factures"]) + len(results["bons"]),
            "factures": len(results["factures"]),
            "bons": len(results["bons"]),
            "erreurs": results["errors"],
        }

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/factures", summary="Lister les factures extraites")
def get_factures():
    return [_serialize_record(f) for f in _store["factures"]]


@app.get("/api/bons-livraison", summary="Lister les bons de livraison extraits")
def get_bons_livraison():
    return [_serialize_record(b) for b in _store["bons"]]


@app.get("/api/stats", summary="Statistiques globales")
def get_stats():
    factures = _store["factures"]
    bons = _store["bons"]

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
    _store["factures"] = []
    _store["bons"] = []
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


def _regenerate_excel():
    os.makedirs("output", exist_ok=True)
    df_factures = clean_date_columns(pd.DataFrame(_store["factures"]))
    df_bons = clean_date_columns(pd.DataFrame(_store["bons"]))

    with pd.ExcelWriter(OUTPUT_XLSX, engine="openpyxl") as writer:
        if not df_factures.empty:
            df_factures.sort_values(
                by=["nom_fournisseur", "date_emission"], na_position="last"
            ).to_excel(writer, sheet_name="Factures", index=False)
        if not df_bons.empty:
            df_bons.sort_values(
                by=["nom_fournisseur", "date_livraison"], na_position="last"
            ).to_excel(writer, sheet_name="BonsLivraison", index=False)
