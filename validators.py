"""
Validation et assainissement des données extraites par le LLM.
Aucune exception levée — corrections silencieuses + liste de warnings retournée.
"""
from __future__ import annotations

from datetime import date

_DATE_MIN = date(2015, 1, 1)
_DATE_MAX = date(2100, 12, 31)
_MONTANT_MAX_SUSPECT = 500_000.0

# Taux de TVA standards utilisés pour la cohérence TTC
# Clés : suffixe du champ HT (ex: "1" pour prix_HT_1), valeur : taux décimal
_TVA_RATES: dict[str, float] = {
    "1": 0.20,
    "2": 0.10,
    "3": 0.055,
}


def _parse_date(val) -> date | None:
    """Tente de parser une date depuis str ISO ou objet date."""
    if val is None:
        return None
    if isinstance(val, date):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val)
        except ValueError:
            return None
    return None


def _validate_montants(data: dict, warnings: list[str]) -> None:
    """
    Règle 1 — Montants HT.

    - Négatif  → None + warning
    - > 500 000 → warning (valeur conservée)
    - Tous None → warning global
    """
    ht_keys = [k for k in data if k.startswith("prix_HT_")]
    any_ht_present = False

    for key in ht_keys:
        val = data[key]
        if val is None:
            continue
        try:
            val_f = float(val)
        except (TypeError, ValueError):
            continue

        if val_f < 0:
            warnings.append(f"{key} négatif ({val_f}) remis à None")
            data[key] = None
        else:
            any_ht_present = True
            if val_f > _MONTANT_MAX_SUSPECT:
                warnings.append(f"{key} suspect ({val_f} > 500 000)")

    if ht_keys and not any_ht_present:
        warnings.append("Aucun montant HT extrait")


def _validate_dates(data: dict, doc_type: str, warnings: list[str]) -> None:
    """
    Règle 2 — Dates.

    - Hors plage [2015-01-01 ; 2100-12-31] → None + warning
    - Facture : date_paiement_prevue < date_emission → warning (valeur conservée)
    - Facture : date_emission absente → warning
    """
    date_keys = [k for k in data if k.startswith("date_")]

    for key in date_keys:
        raw = data[key]
        if raw is None:
            continue
        parsed = _parse_date(raw)
        if parsed is None:
            # Valeur non parseable — on laisse tel quel, pas de règle explicite
            continue
        if parsed < _DATE_MIN or parsed > _DATE_MAX:
            warnings.append(f"{key} hors plage ({raw}) remise à None")
            data[key] = None

    # Règles spécifiques aux factures
    if doc_type == "facture":
        if data.get("date_emission") is None:
            warnings.append("date_emission absente")

        d_emission = _parse_date(data.get("date_emission"))
        d_paiement = _parse_date(data.get("date_paiement_prevue"))
        if d_emission is not None and d_paiement is not None:
            if d_paiement < d_emission:
                warnings.append(
                    f"date_paiement_prevue ({data.get('date_paiement_prevue')}) "
                    f"antérieure à date_emission ({data.get('date_emission')})"
                )


def _validate_numeros(data: dict, doc_type: str, warnings: list[str]) -> None:
    """
    Règle 3 — Numéros de document.

    - Nettoyage des espaces en début/fin sur tous les champs numéro
    - Facture : numero_facture uniquement chiffres et < 3 caractères → warning
    - BL : numero_bon_livraison absent → warning
    """
    numero_keys = [k for k in data if "numero" in k]
    for key in numero_keys:
        if isinstance(data[key], str):
            data[key] = data[key].strip()

    if doc_type == "facture":
        val = data.get("numero_facture")
        if val is not None and isinstance(val, str):
            if val.isdigit() and len(val) < 3:
                warnings.append(f"numero_facture trop court ({val})")

    if doc_type in ("bon_livraison", "bl"):
        if not data.get("numero_bon_livraison"):
            warnings.append("numero_bon_livraison absent")


def _validate_fournisseur(data: dict, warnings: list[str]) -> None:
    """
    Règle 4 — Fournisseur.

    - nom_fournisseur absent → warning
    """
    if not data.get("nom_fournisseur"):
        warnings.append("nom_fournisseur non identifié")


def _validate_coherence_ttc(data: dict, warnings: list[str]) -> None:
    """
    Règle 5 — Cohérence TTC.

    Si les 3 bases HT (prix_HT_1, prix_HT_2, prix_HT_3) sont toutes présentes,
    on calcule le TTC attendu et on le compare à montant_ttc (si fourni).
    Tolérance : 1 €.
    """
    ht_vals: dict[str, float] = {}
    for suffix, rate in _TVA_RATES.items():
        key = f"prix_HT_{suffix}"
        val = data.get(key)
        if val is None:
            return  # Pas toutes les bases présentes → on ne vérifie pas
        try:
            ht_vals[suffix] = float(val)
        except (TypeError, ValueError):
            return

    ttc_extrait = data.get("montant_ttc")
    if ttc_extrait is None:
        return

    try:
        ttc_extrait_f = float(ttc_extrait)
    except (TypeError, ValueError):
        return

    ttc_calcule = sum(
        ht_vals[suffix] * (1 + rate) for suffix, rate in _TVA_RATES.items()
    )

    if abs(ttc_extrait_f - ttc_calcule) > 1.0:
        warnings.append(
            f"montant_ttc incohérent "
            f"(extrait={ttc_extrait_f:.2f}, calculé={ttc_calcule:.2f})"
        )


def validate_and_sanitize(data: dict, doc_type: str) -> tuple[dict, list[str]]:
    """
    Valide et assainit un enregistrement extrait par le LLM.

    Retourne (data_corrigé, warnings) où warnings est une liste de messages
    décrivant les corrections ou anomalies détectées.

    Ne lève jamais d'exception — préfère corriger silencieusement et logger.
    """
    data = dict(data)
    warnings: list[str] = []

    try:
        _validate_montants(data, warnings)
    except Exception:
        pass

    try:
        _validate_dates(data, doc_type, warnings)
    except Exception:
        pass

    try:
        _validate_numeros(data, doc_type, warnings)
    except Exception:
        pass

    try:
        _validate_fournisseur(data, warnings)
    except Exception:
        pass

    try:
        _validate_coherence_ttc(data, warnings)
    except Exception:
        pass

    return data, warnings
