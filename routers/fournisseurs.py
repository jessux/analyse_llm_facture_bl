from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import repositories as repo

router = APIRouter(prefix="/api/fournisseurs", tags=["Fournisseurs"])


class FournisseurCreate(BaseModel):
    id:          str         # identifiant interne unique, ex: "METRO"
    nom_affiche: str         # nom affiché dans le xlsm, ex: "Metro"
    patterns:    list[str] = []  # mots-clés pour la détection auto dans les PDFs


class FournisseurUpdate(BaseModel):
    nom_affiche: str | None = None
    patterns:    list[str] | None = None


@router.get("", summary="Lister les fournisseurs")
def get_fournisseurs():
    return repo.list_fournisseurs()


@router.post("", summary="Ajouter un fournisseur", status_code=201)
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


@router.patch("/{fournisseur_id}", summary="Modifier un fournisseur")
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


@router.delete("/{fournisseur_id}", summary="Supprimer un fournisseur")
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
