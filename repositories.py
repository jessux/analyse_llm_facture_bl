"""
Repositories SQLite pour Marjo.

Les fonctions exposées remplacent l'ancien `_store` / `_fournisseurs` en mémoire.
Elles renvoient/acceptent des dicts plats compatibles avec l'API JSON existante
afin de minimiser l'impact sur api.py et le frontend.

Conventions de représentation:
- Colonnes BDD `prix_HT_5_5`, `prix_HT_10`, `prix_HT_20`
  → champs API `prix_HT_5_5pct`, `prix_HT_10pct`, `prix_HT_20pct`
- Les champs dérivés (TVA, TTC, vérifications, montant_total) ne sont PAS
  persistés. Ils sont calculés à la lecture par `_recompute_derived` (api.py).
- Les dates sont stockées en TEXT ISO `YYYY-MM-DD`.
"""

from __future__ import annotations

import json
import re
from datetime import date
from typing import Any, Iterable

from db import get_conn, transaction, now_iso


# ---------------------------------------------------------------------------
# Helpers communs
# ---------------------------------------------------------------------------

def _date_to_iso(v: Any) -> str | None:
    if v is None or v == "":
        return None
    if isinstance(v, str):
        return v
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return None


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _row_to_dict(row) -> dict:
    return dict(row) if row is not None else {}


# ---------------------------------------------------------------------------
# Fournisseurs
# ---------------------------------------------------------------------------

def make_supplier_key(display_name: str) -> str:
    """Construit une clé fournisseur stable depuis un libellé arbitraire."""
    base = re.sub(r"[^A-Z0-9]+", "_", display_name.upper()).strip("_")
    return base or "FOURNISSEUR_INCONNU"


def fournisseur_to_api(row) -> dict:
    d = _row_to_dict(row)
    if not d:
        return d
    try:
        d["patterns"] = json.loads(d.pop("patterns_json", "[]") or "[]")
    except (TypeError, ValueError):
        d["patterns"] = []
    return d


def list_fournisseurs() -> list[dict]:
    cur = get_conn().execute("SELECT * FROM fournisseurs ORDER BY id")
    return [fournisseur_to_api(r) for r in cur.fetchall()]


def get_fournisseur(fournisseur_id: str) -> dict | None:
    cur = get_conn().execute(
        "SELECT * FROM fournisseurs WHERE id = ?", (fournisseur_id,)
    )
    row = cur.fetchone()
    return fournisseur_to_api(row) if row else None


def upsert_fournisseur(
    *,
    id: str,
    nom_affiche: str,
    patterns: Iterable[str] | None = None,
    conditions_paiement: str | None = None,
    categorie: str | None = None,
    mode_paiement: str | None = None,
    frequence: str | None = None,
    mois: str | None = None,
) -> dict:
    """Insère ou met à jour un fournisseur. Retourne la version API."""
    patterns_clean = [p.lower().strip() for p in (patterns or []) if p and p.strip()]
    now = now_iso()
    with transaction() as conn:
        existing = conn.execute(
            "SELECT 1 FROM fournisseurs WHERE id = ?", (id,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE fournisseurs
                SET nom_affiche=?, conditions_paiement=?, categorie=?,
                    mode_paiement=?, frequence=?, mois=?,
                    patterns_json=?, updated_at=?
                WHERE id=?
                """,
                (
                    nom_affiche,
                    conditions_paiement,
                    categorie,
                    mode_paiement,
                    frequence,
                    mois,
                    json.dumps(patterns_clean, ensure_ascii=False),
                    now,
                    id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO fournisseurs
                    (id, nom_affiche, conditions_paiement, categorie,
                     mode_paiement, frequence, mois, patterns_json,
                     created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    id,
                    nom_affiche,
                    conditions_paiement,
                    categorie,
                    mode_paiement,
                    frequence,
                    mois,
                    json.dumps(patterns_clean, ensure_ascii=False),
                    now,
                    now,
                ),
            )
    return get_fournisseur(id) or {}


def update_fournisseur(
    fournisseur_id: str,
    *,
    nom_affiche: str | None = None,
    patterns: Iterable[str] | None = None,
) -> dict | None:
    sets: list[str] = []
    params: list[Any] = []
    if nom_affiche is not None:
        sets.append("nom_affiche=?")
        params.append(nom_affiche)
    if patterns is not None:
        sets.append("patterns_json=?")
        params.append(json.dumps(
            [p.lower().strip() for p in patterns if p and p.strip()],
            ensure_ascii=False,
        ))
    if not sets:
        return get_fournisseur(fournisseur_id)
    sets.append("updated_at=?")
    params.append(now_iso())
    params.append(fournisseur_id)

    with transaction() as conn:
        cur = conn.execute(
            f"UPDATE fournisseurs SET {', '.join(sets)} WHERE id=?", params
        )
        if cur.rowcount == 0:
            return None
    return get_fournisseur(fournisseur_id)


def delete_fournisseur(fournisseur_id: str) -> bool:
    with transaction() as conn:
        cur = conn.execute("DELETE FROM fournisseurs WHERE id=?", (fournisseur_id,))
        return cur.rowcount > 0


def count_factures_for_fournisseur(fournisseur_id: str) -> int:
    cur = get_conn().execute(
        "SELECT COUNT(*) FROM factures WHERE fournisseur_id=?", (fournisseur_id,)
    )
    return int(cur.fetchone()[0])


def fournisseur_display_map() -> dict[str, str]:
    """{id → nom_affiche} pour le rendu xlsm."""
    return {f["id"]: f["nom_affiche"] for f in list_fournisseurs()}


def fournisseur_patterns_map() -> dict[str, list[str]]:
    """{id → patterns} pour le matching dans les PDFs."""
    return {f["id"]: f.get("patterns") or [] for f in list_fournisseurs()}


def ensure_fournisseur_from_display(display_name: str) -> str:
    """
    Garantit l'existence d'un fournisseur correspondant au libellé Excel
    et retourne son id interne. Crée un nouveau fournisseur si inconnu.
    """
    display_clean = display_name.strip()
    if not display_clean:
        return "FOURNISSEUR_INCONNU"

    cur = get_conn().execute(
        "SELECT id FROM fournisseurs WHERE LOWER(nom_affiche) = LOWER(?)",
        (display_clean,),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    proposed = make_supplier_key(display_clean)
    candidate = proposed
    idx = 2
    while True:
        existing = get_fournisseur(candidate)
        if existing is None:
            break
        if existing["nom_affiche"].lower() == display_clean.lower():
            return candidate
        candidate = f"{proposed}_{idx}"
        idx += 1

    upsert_fournisseur(
        id=candidate,
        nom_affiche=display_clean,
        patterns=[display_clean.lower()],
    )
    return candidate


# ---------------------------------------------------------------------------
# Factures
# ---------------------------------------------------------------------------

_FACTURE_COLS = (
    "numero", "fournisseur_id",
    "date_emission", "date_paiement_prevue",
    "prix_HT_5_5", "prix_HT_10", "prix_HT_20",
    "conditions_paiement", "fichier_source", "fichier_stocke",
    "created_at", "updated_at",
)


def facture_row_to_api(row) -> dict:
    d = _row_to_dict(row)
    if not d:
        return d
    out = {
        "type_document": "facture",
        "numero_facture": d.get("numero"),
        "nom_fournisseur": d.get("fournisseur_id"),
        "date_emission": d.get("date_emission"),
        "date_paiement_prevue": d.get("date_paiement_prevue"),
        "prix_HT_5_5pct": d.get("prix_HT_5_5"),
        "prix_HT_10pct": d.get("prix_HT_10"),
        "prix_HT_20pct": d.get("prix_HT_20"),
        "conditions_paiement": d.get("conditions_paiement"),
        "fichier_source": d.get("fichier_source") or "",
        "fichier_stocke": d.get("fichier_stocke"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }
    return out


def list_factures() -> list[dict]:
    """Retourne toutes les factures avec leurs BL liés (champ bons_livraisons)."""
    conn = get_conn()
    factures = [facture_row_to_api(r) for r in conn.execute(
        "SELECT * FROM factures ORDER BY date_emission, numero"
    ).fetchall()]
    # Lookup BL rattachés
    rows = conn.execute(
        "SELECT numero_facture_rattachee AS f, numero AS b "
        "FROM bons_livraison WHERE numero_facture_rattachee IS NOT NULL"
    ).fetchall()
    bl_by_facture: dict[str, list[str]] = {}
    for r in rows:
        bl_by_facture.setdefault(r["f"], []).append(r["b"])
    for f in factures:
        f["bons_livraisons"] = bl_by_facture.get(f["numero_facture"], [])
    return factures


def count_factures(search: str = "") -> int:
    """Compte le nombre total de factures, avec filtre optionnel sur numero ou fournisseur_id."""
    conn = get_conn()
    if search:
        pattern = f"%{search}%"
        row = conn.execute(
            "SELECT COUNT(*) FROM factures WHERE numero LIKE ? OR fournisseur_id LIKE ?",
            (pattern, pattern),
        ).fetchone()
    else:
        row = conn.execute("SELECT COUNT(*) FROM factures").fetchone()
    return row[0] if row else 0


def list_factures_paginated(page: int, limit: int, search: str = "") -> list[dict]:
    """Retourne les factures paginées avec filtre optionnel, et leurs BL liés.

    Si limit=0, retourne tous les résultats (rétrocompatibilité).
    """
    conn = get_conn()
    if search:
        pattern = f"%{search}%"
        base_query = (
            "SELECT * FROM factures "
            "WHERE numero LIKE ? OR fournisseur_id LIKE ? "
            "ORDER BY date_emission, numero"
        )
        params_all: tuple = (pattern, pattern)
    else:
        base_query = "SELECT * FROM factures ORDER BY date_emission, numero"
        params_all = ()

    if limit == 0:
        rows = conn.execute(base_query, params_all).fetchall()
    else:
        offset = (page - 1) * limit
        rows = conn.execute(
            base_query + " LIMIT ? OFFSET ?",
            (*params_all, limit, offset),
        ).fetchall()

    factures = [facture_row_to_api(r) for r in rows]

    # Lookup BL rattachés
    bl_rows = conn.execute(
        "SELECT numero_facture_rattachee AS f, numero AS b "
        "FROM bons_livraison WHERE numero_facture_rattachee IS NOT NULL"
    ).fetchall()
    bl_by_facture: dict[str, list[str]] = {}
    for r in bl_rows:
        bl_by_facture.setdefault(r["f"], []).append(r["b"])
    for f in factures:
        f["bons_livraisons"] = bl_by_facture.get(f["numero_facture"], [])
    return factures


def get_facture(numero: str) -> dict | None:
    row = get_conn().execute(
        "SELECT * FROM factures WHERE numero=?", (numero,)
    ).fetchone()
    if not row:
        return None
    facture = facture_row_to_api(row)
    bls = get_conn().execute(
        "SELECT numero FROM bons_livraison WHERE numero_facture_rattachee=?",
        (numero,),
    ).fetchall()
    facture["bons_livraisons"] = [b["numero"] for b in bls]
    return facture


def upsert_facture(data: dict) -> tuple[dict, str]:
    """
    Insère/met à jour une facture depuis un dict API.
    Retourne (record_api, action) où action ∈ {'created','updated','rejected'}.
    """
    numero = data.get("numero_facture")
    if not numero:
        return data, "rejected"

    fournisseur_id = data.get("nom_fournisseur") or "FOURNISSEUR_INCONNU"
    payload = (
        numero,
        fournisseur_id,
        _date_to_iso(data.get("date_emission")),
        _date_to_iso(data.get("date_paiement_prevue")),
        _to_float(data.get("prix_HT_5_5pct")),
        _to_float(data.get("prix_HT_10pct")),
        _to_float(data.get("prix_HT_20pct")),
        data.get("conditions_paiement"),
        data.get("fichier_source") or "",
        data.get("fichier_stocke"),
    )
    now = now_iso()
    with transaction() as conn:
        existing = conn.execute(
            "SELECT 1 FROM factures WHERE numero=?", (numero,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE factures SET
                    fournisseur_id=?, date_emission=?, date_paiement_prevue=?,
                    prix_HT_5_5=?, prix_HT_10=?, prix_HT_20=?,
                    conditions_paiement=?, fichier_source=?, fichier_stocke=?,
                    updated_at=?
                WHERE numero=?
                """,
                (*payload[1:], now, numero),
            )
            action = "updated"
        else:
            conn.execute(
                f"INSERT INTO factures ({', '.join(_FACTURE_COLS)}) "
                f"VALUES ({', '.join('?' * len(_FACTURE_COLS))})",
                (*payload, now, now),
            )
            action = "created"

        # Rattachement BL listés dans data["bons_livraisons"]
        bls = data.get("bons_livraisons") or []
        for bl in bls:
            if not bl:
                continue
            conn.execute(
                "UPDATE bons_livraison SET numero_facture_rattachee=?, updated_at=? "
                "WHERE numero=?",
                (numero, now, str(bl)),
            )

    record = get_facture(numero) or {}
    return record, action


def patch_facture(
    numero: str,
    *,
    updates: dict,
    new_numero: str | None = None,
) -> dict | None:
    """
    Met à jour une facture (partiel). Si new_numero != numero, renomme la PK.
    Retourne le record final ou None si introuvable.
    """
    field_map = {
        "date_emission": "date_emission",
        "date_paiement_prevue": "date_paiement_prevue",
        "prix_HT_5_5pct": "prix_HT_5_5",
        "prix_HT_10pct": "prix_HT_10",
        "prix_HT_20pct": "prix_HT_20",
        "nom_fournisseur": "fournisseur_id",
        "conditions_paiement": "conditions_paiement",
        "fichier_source": "fichier_source",
        "fichier_stocke": "fichier_stocke",
    }
    sets: list[str] = []
    params: list[Any] = []
    for api_key, db_col in field_map.items():
        if api_key in updates:
            v = updates[api_key]
            if api_key in ("date_emission", "date_paiement_prevue"):
                v = _date_to_iso(v)
            elif api_key.startswith("prix_HT_"):
                v = _to_float(v)
            sets.append(f"{db_col}=?")
            params.append(v)

    with transaction() as conn:
        existing = conn.execute(
            "SELECT 1 FROM factures WHERE numero=?", (numero,)
        ).fetchone()
        if not existing:
            return None

        if sets:
            sets.append("updated_at=?")
            params.append(now_iso())
            params.append(numero)
            conn.execute(
                f"UPDATE factures SET {', '.join(sets)} WHERE numero=?", params
            )

        if new_numero and new_numero != numero:
            clash = conn.execute(
                "SELECT 1 FROM factures WHERE numero=?", (new_numero,)
            ).fetchone()
            if clash:
                raise ValueError(f"La facture '{new_numero}' existe déjà.")
            conn.execute(
                "UPDATE factures SET numero=?, updated_at=? WHERE numero=?",
                (new_numero, now_iso(), numero),
            )
            # FK sur bons_livraison.numero_facture_rattachee est ON UPDATE CASCADE
            return get_facture(new_numero)

    return get_facture(numero)


def delete_facture(numero: str) -> bool:
    with transaction() as conn:
        # Détacher BL avant suppression (la FK est ON DELETE SET NULL mais on
        # le fait explicitement pour le `updated_at`).
        conn.execute(
            "UPDATE bons_livraison SET numero_facture_rattachee=NULL, updated_at=? "
            "WHERE numero_facture_rattachee=?",
            (now_iso(), numero),
        )
        cur = conn.execute("DELETE FROM factures WHERE numero=?", (numero,))
        return cur.rowcount > 0


# ---------------------------------------------------------------------------
# Bons de livraison
# ---------------------------------------------------------------------------

_BL_COLS = (
    "numero", "fournisseur_id",
    "date_livraison",
    "prix_HT_5_5", "prix_HT_10", "prix_HT_20",
    "numero_facture_rattachee",
    "fichier_source", "fichier_stocke",
    "created_at", "updated_at",
)


def bon_row_to_api(row) -> dict:
    d = _row_to_dict(row)
    if not d:
        return d
    return {
        "type_document": "bon_livraison",
        "numero_bon_livraison": d.get("numero"),
        "nom_fournisseur": d.get("fournisseur_id"),
        "date_livraison": d.get("date_livraison"),
        "prix_HT_5_5pct": d.get("prix_HT_5_5"),
        "prix_HT_10pct": d.get("prix_HT_10"),
        "prix_HT_20pct": d.get("prix_HT_20"),
        "numero_facture_rattachee": d.get("numero_facture_rattachee"),
        "fichier_source": d.get("fichier_source") or "",
        "fichier_stocke": d.get("fichier_stocke"),
        "created_at": d.get("created_at"),
        "updated_at": d.get("updated_at"),
    }


def list_bons() -> list[dict]:
    cur = get_conn().execute(
        "SELECT * FROM bons_livraison ORDER BY date_livraison, numero"
    )
    return [bon_row_to_api(r) for r in cur.fetchall()]


def count_bons(search: str = "") -> int:
    """Compte le nombre total de bons de livraison, avec filtre optionnel sur numero ou fournisseur_id."""
    conn = get_conn()
    if search:
        pattern = f"%{search}%"
        row = conn.execute(
            "SELECT COUNT(*) FROM bons_livraison WHERE numero LIKE ? OR fournisseur_id LIKE ?",
            (pattern, pattern),
        ).fetchone()
    else:
        row = conn.execute("SELECT COUNT(*) FROM bons_livraison").fetchone()
    return row[0] if row else 0


def list_bons_paginated(page: int, limit: int, search: str = "") -> list[dict]:
    """Retourne les bons de livraison paginés avec filtre optionnel.

    Si limit=0, retourne tous les résultats (rétrocompatibilité).
    """
    conn = get_conn()
    if search:
        pattern = f"%{search}%"
        base_query = (
            "SELECT * FROM bons_livraison "
            "WHERE numero LIKE ? OR fournisseur_id LIKE ? "
            "ORDER BY date_livraison, numero"
        )
        params_all: tuple = (pattern, pattern)
    else:
        base_query = "SELECT * FROM bons_livraison ORDER BY date_livraison, numero"
        params_all = ()

    if limit == 0:
        rows = conn.execute(base_query, params_all).fetchall()
    else:
        offset = (page - 1) * limit
        rows = conn.execute(
            base_query + " LIMIT ? OFFSET ?",
            (*params_all, limit, offset),
        ).fetchall()

    return [bon_row_to_api(r) for r in rows]


def get_bon(numero: str) -> dict | None:
    row = get_conn().execute(
        "SELECT * FROM bons_livraison WHERE numero=?", (numero,)
    ).fetchone()
    return bon_row_to_api(row) if row else None


def upsert_bon(data: dict) -> tuple[dict, str]:
    numero = data.get("numero_bon_livraison")
    if not numero:
        return data, "rejected"

    fournisseur_id = data.get("nom_fournisseur") or "FOURNISSEUR_INCONNU"
    fac_attached = data.get("numero_facture_rattachee")
    payload = (
        numero,
        fournisseur_id,
        _date_to_iso(data.get("date_livraison")),
        _to_float(data.get("prix_HT_5_5pct")),
        _to_float(data.get("prix_HT_10pct")),
        _to_float(data.get("prix_HT_20pct")),
        fac_attached,
        data.get("fichier_source") or "",
        data.get("fichier_stocke"),
    )
    now = now_iso()
    with transaction() as conn:
        existing = conn.execute(
            "SELECT 1 FROM bons_livraison WHERE numero=?", (numero,)
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE bons_livraison SET
                    fournisseur_id=?, date_livraison=?,
                    prix_HT_5_5=?, prix_HT_10=?, prix_HT_20=?,
                    numero_facture_rattachee=?,
                    fichier_source=?, fichier_stocke=?,
                    updated_at=?
                WHERE numero=?
                """,
                (*payload[1:], now, numero),
            )
            action = "updated"
        else:
            conn.execute(
                f"INSERT INTO bons_livraison ({', '.join(_BL_COLS)}) "
                f"VALUES ({', '.join('?' * len(_BL_COLS))})",
                (*payload, now, now),
            )
            action = "created"

    return get_bon(numero) or {}, action


def patch_bon(
    numero: str,
    *,
    updates: dict,
    new_numero: str | None = None,
) -> dict | None:
    field_map = {
        "date_livraison": "date_livraison",
        "prix_HT_5_5pct": "prix_HT_5_5",
        "prix_HT_10pct": "prix_HT_10",
        "prix_HT_20pct": "prix_HT_20",
        "nom_fournisseur": "fournisseur_id",
        "fichier_source": "fichier_source",
        "fichier_stocke": "fichier_stocke",
        "numero_facture_rattachee": "numero_facture_rattachee",
    }
    sets: list[str] = []
    params: list[Any] = []
    for api_key, db_col in field_map.items():
        if api_key in updates:
            v = updates[api_key]
            if api_key == "date_livraison":
                v = _date_to_iso(v)
            elif api_key.startswith("prix_HT_"):
                v = _to_float(v)
            sets.append(f"{db_col}=?")
            params.append(v)

    with transaction() as conn:
        existing = conn.execute(
            "SELECT 1 FROM bons_livraison WHERE numero=?", (numero,)
        ).fetchone()
        if not existing:
            return None

        if sets:
            sets.append("updated_at=?")
            params.append(now_iso())
            params.append(numero)
            conn.execute(
                f"UPDATE bons_livraison SET {', '.join(sets)} WHERE numero=?",
                params,
            )

        if new_numero and new_numero != numero:
            clash = conn.execute(
                "SELECT 1 FROM bons_livraison WHERE numero=?", (new_numero,)
            ).fetchone()
            if clash:
                raise ValueError(f"Le bon '{new_numero}' existe déjà.")
            conn.execute(
                "UPDATE bons_livraison SET numero=?, updated_at=? WHERE numero=?",
                (new_numero, now_iso(), numero),
            )
            return get_bon(new_numero)

    return get_bon(numero)


def delete_bon(numero: str) -> bool:
    with transaction() as conn:
        cur = conn.execute("DELETE FROM bons_livraison WHERE numero=?", (numero,))
        return cur.rowcount > 0


def attach_bon_to_facture(numero_bl: str, numero_facture: str) -> bool:
    with transaction() as conn:
        cur = conn.execute(
            "UPDATE bons_livraison SET numero_facture_rattachee=?, updated_at=? "
            "WHERE numero=?",
            (numero_facture, now_iso(), numero_bl),
        )
        return cur.rowcount > 0


def detach_bon(numero_bl: str) -> bool:
    with transaction() as conn:
        cur = conn.execute(
            "UPDATE bons_livraison SET numero_facture_rattachee=NULL, updated_at=? "
            "WHERE numero=?",
            (now_iso(), numero_bl),
        )
        return cur.rowcount > 0


def relink_all() -> None:
    """
    Réindexe les rattachements BL ↔ Factures depuis la liste `bons_livraisons`
    déclarée sur les factures.
    """
    factures_with_bls: list[tuple[str, list[str]]] = []
    for f in list_factures():
        if f.get("bons_livraisons"):
            factures_with_bls.append(
                (f["numero_facture"], list(f["bons_livraisons"]))
            )

    with transaction() as conn:
        for numero_facture, bls in factures_with_bls:
            for bl in bls:
                conn.execute(
                    "UPDATE bons_livraison SET numero_facture_rattachee=?, "
                    "updated_at=? WHERE numero=?",
                    (numero_facture, now_iso(), str(bl)),
                )


# ---------------------------------------------------------------------------
# DOMINO
# ---------------------------------------------------------------------------

_DOMINO_COLS = (
    "date", "filename",
    "ca_ttc_matin", "ca_ttc_midi", "ca_ttc_apm", "ca_ttc_soir",
    "ca_ttc_uber", "ca_ttc_deliveroo", "ca_ttc_total",
    "tva_total", "tva_55", "tva_10",
    "especes", "carte_bancaire", "cb_link", "belorder",
    "uber_eats", "deliveroo_paiement", "total_encaissements",
    "nb_clients_matin", "nb_clients_midi", "nb_clients_soir", "total_clients",
    "imported_at",
)


def upsert_domino_jour(data: dict) -> dict:
    """data: dict compatible DominoJourData.to_dict() + filename."""
    iso = data.get("date") if isinstance(data.get("date"), str) else _date_to_iso(data.get("date"))
    if not iso:
        raise ValueError("DOMINO: date manquante")

    payload = {
        "date": iso,
        "filename": data.get("filename"),
        "ca_ttc_matin": _to_float(data.get("ca_ttc_matin")) or 0.0,
        "ca_ttc_midi": _to_float(data.get("ca_ttc_midi")) or 0.0,
        "ca_ttc_apm": _to_float(data.get("ca_ttc_apm")) or 0.0,
        "ca_ttc_soir": _to_float(data.get("ca_ttc_soir")) or 0.0,
        "ca_ttc_uber": _to_float(data.get("ca_ttc_uber")) or 0.0,
        "ca_ttc_deliveroo": _to_float(data.get("ca_ttc_deliveroo")) or 0.0,
        "ca_ttc_total": _to_float(data.get("ca_ttc_total")) or 0.0,
        "tva_total": _to_float(data.get("tva_total")) or 0.0,
        "tva_55": _to_float(data.get("tva_55")) or 0.0,
        "tva_10": _to_float(data.get("tva_10")) or 0.0,
        "especes": _to_float(data.get("especes")) or 0.0,
        "carte_bancaire": _to_float(data.get("carte_bancaire")) or 0.0,
        "cb_link": _to_float(data.get("cb_link")) or 0.0,
        "belorder": _to_float(data.get("belorder")) or 0.0,
        "uber_eats": _to_float(data.get("uber_eats")) or 0.0,
        "deliveroo_paiement": _to_float(data.get("deliveroo_paiement")) or 0.0,
        "total_encaissements": _to_float(data.get("total_encaissements")) or 0.0,
        "nb_clients_matin": int(data.get("nb_clients_matin") or 0),
        "nb_clients_midi": int(data.get("nb_clients_midi") or 0),
        "nb_clients_soir": int(data.get("nb_clients_soir") or 0),
        "total_clients": int(data.get("total_clients") or 0),
        "imported_at": data.get("imported_at") or now_iso(),
    }
    cols = list(payload.keys())
    placeholders = ", ".join("?" * len(cols))
    update_clause = ", ".join(f"{c}=excluded.{c}" for c in cols if c != "date")

    with transaction() as conn:
        conn.execute(
            f"INSERT INTO domino_jours ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT(date) DO UPDATE SET {update_clause}",
            tuple(payload[c] for c in cols),
        )
    return payload


def list_domino_jours() -> list[dict]:
    cur = get_conn().execute("SELECT * FROM domino_jours ORDER BY date DESC")
    return [dict(r) for r in cur.fetchall()]


def get_domino_jour(iso_date: str) -> dict | None:
    row = get_conn().execute(
        "SELECT * FROM domino_jours WHERE date=?", (iso_date,)
    ).fetchone()
    return dict(row) if row else None


def has_domino_jour(iso_date: str) -> bool:
    return get_domino_jour(iso_date) is not None


# ---------------------------------------------------------------------------
# Autres achats
# ---------------------------------------------------------------------------

_AUTRES_COLS = (
    "fournisseur", "categorie", "num_facture", "num_bl", "date",
    "ht_0", "ht_2_1", "ht_5_5", "ht_10", "ht_20",
    "conditions", "date_paiement", "amortissable", "ref_denotage",
    "created_at", "updated_at",
)


def insert_autre_achat(data: dict) -> int:
    """Insère une ligne d'autres achats. Retourne l'id généré."""
    now = now_iso()
    payload = (
        data.get("fournisseur") or "",
        data.get("categorie"),
        data.get("num_facture"),
        data.get("num_bl"),
        _date_to_iso(data.get("date")),
        _to_float(data.get("ht_0")),
        _to_float(data.get("ht_2_1")),
        _to_float(data.get("ht_5_5")),
        _to_float(data.get("ht_10")),
        _to_float(data.get("ht_20")),
        data.get("conditions"),
        _date_to_iso(data.get("date_paiement")),
        data.get("amortissable"),
        data.get("ref_denotage"),
        now,
        now,
    )
    with transaction() as conn:
        cur = conn.execute(
            f"INSERT INTO autres_achats ({', '.join(_AUTRES_COLS)}) "
            f"VALUES ({', '.join('?' * len(_AUTRES_COLS))})",
            payload,
        )
        return int(cur.lastrowid or 0)


def get_autre_achat(achat_id: int) -> dict | None:
    """Récupère une ligne d'autres achats par son id."""
    cur = get_conn().execute("SELECT * FROM autres_achats WHERE id = ?", (achat_id,))
    r = cur.fetchone()
    return dict(r) if r else None


def update_autre_achat(achat_id: int, updates: dict) -> dict | None:
    """Met à jour une ligne d'autres achats."""
    achat = get_autre_achat(achat_id)
    if not achat:
        return None
    
    # Construire les colonnes à mettre à jour (sauf id, created_at)
    set_clauses = []
    values = []
    for key, val in updates.items():
        if key not in ("id", "created_at"):
            set_clauses.append(f"{key} = ?")
            if key in ("date", "date_paiement"):
                values.append(_date_to_iso(val))
            elif key in ("ht_0", "ht_2_1", "ht_5_5", "ht_10", "ht_20"):
                values.append(_to_float(val))
            else:
                values.append(val)
    
    if not set_clauses:
        return achat
    
    set_clauses.append("updated_at = ?")
    values.append(now_iso())
    values.append(achat_id)
    
    with transaction() as conn:
        conn.execute(
            f"UPDATE autres_achats SET {', '.join(set_clauses)} WHERE id = ?",
            values,
        )
    
    return get_autre_achat(achat_id)


def delete_autre_achat(achat_id: int) -> bool:
    """Supprime une ligne d'autres achats."""
    with transaction() as conn:
        cur = conn.execute("DELETE FROM autres_achats WHERE id = ?", (achat_id,))
        return cur.rowcount > 0


def list_autres_achats() -> list[dict]:
    cur = get_conn().execute(
        "SELECT * FROM autres_achats ORDER BY date, fournisseur, id"
    )
    return [dict(r) for r in cur.fetchall()]


def count_autres_achats() -> int:
    cur = get_conn().execute("SELECT COUNT(*) FROM autres_achats")
    return int(cur.fetchone()[0])


def truncate_autres_achats() -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM autres_achats")


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def stats() -> dict:
    """Statistiques agrégées factures + BL (compat ancien endpoint /api/stats)."""
    conn = get_conn()
    nb_factures = int(conn.execute("SELECT COUNT(*) FROM factures").fetchone()[0])
    nb_bons = int(conn.execute("SELECT COUNT(*) FROM bons_livraison").fetchone()[0])

    total_factures = conn.execute(
        "SELECT COALESCE(SUM(COALESCE(prix_HT_5_5,0) + COALESCE(prix_HT_10,0) "
        "+ COALESCE(prix_HT_20,0)), 0) FROM factures"
    ).fetchone()[0] or 0.0

    # Pour les BL : on ajoute leurs HT seulement si la facture rattachée n'a pas
    # de HT propre, ou s'il n'y a pas de facture rattachée.
    total_bls = conn.execute(
        """
        SELECT COALESCE(SUM(COALESCE(b.prix_HT_5_5,0) + COALESCE(b.prix_HT_10,0)
                          + COALESCE(b.prix_HT_20,0)), 0)
        FROM bons_livraison b
        LEFT JOIN factures f ON f.numero = b.numero_facture_rattachee
        WHERE f.numero IS NULL
           OR (COALESCE(f.prix_HT_5_5,0) + COALESCE(f.prix_HT_10,0)
              + COALESCE(f.prix_HT_20,0)) = 0
        """
    ).fetchone()[0] or 0.0

    bl_non_rattaches = int(conn.execute(
        "SELECT COUNT(*) FROM bons_livraison b "
        "WHERE b.numero_facture_rattachee IS NULL "
        "   OR NOT EXISTS (SELECT 1 FROM factures f WHERE f.numero = b.numero_facture_rattachee)"
    ).fetchone()[0])

    return {
        "nb_factures": nb_factures,
        "nb_bons": nb_bons,
        "montant_total": round(float(total_factures) + float(total_bls), 2),
        "bl_non_rattaches": bl_non_rattaches,
    }
