from datetime import date

from main import finalize_document_data


FOURNISSEUR_PATTERNS = {
    "SYSCO": ["sysco"],
    "AMBELYS": ["ambelys"],
    "TERREAZUR": ["terreazur", "terre azur"],
}


def test_bl_date_is_recovered_from_text_when_model_year_is_wrong() -> None:
    data = {
        "nom_fournisseur": None,
        "numero_bon_livraison": "C215075",
        "date_livraison": date(2002, 4, 20),
        "bons_livraisons": [],
    }
    text = """
    AMBELYS
    AR CDE N° 215075
    Date de livraison : 20/04/2026
    Quantité commandée : 10
    """

    result = finalize_document_data(
        data,
        text=text,
        filename="01_AMBELYS-C215075 (1).pdf",
        predicted_type="bon_livraison",
        fournisseur_patterns=FOURNISSEUR_PATTERNS,
    )

    assert result["nom_fournisseur"] == "AMBELYS"
    assert result["date_livraison"] == date(2026, 4, 20)


def test_facture_fields_are_completed_from_text() -> None:
    data = {
        "numero_facture": None,
        "nom_fournisseur": None,
        "date_emission": date(2002, 4, 15),
        "date_paiement_prevue": None,
        "conditions_paiement": None,
        "bons_livraisons": [],
    }
    text = """
    AMBELYS
    Facture N° FAC-2026-001
    Date de facture : 15/04/2026
    Conditions de règlement : 30 jours fin de mois
    BL N° BL-001
    Bon de livraison N° BL-002
    Échéance : 31/05/2026
    """

    result = finalize_document_data(
        data,
        text=text,
        filename="AMBELYS - 20260415 - 01_F826802 - 1697.32.pdf",
        predicted_type="facture",
        fournisseur_patterns=FOURNISSEUR_PATTERNS,
    )

    assert result["nom_fournisseur"] == "AMBELYS"
    assert result["numero_facture"] == "FAC-2026-001"
    assert result["date_emission"] == date(2026, 4, 15)
    assert result["date_paiement_prevue"] == date(2026, 5, 30)
    assert result["conditions_paiement"] == "30 jours fin de mois"
    assert result["bons_livraisons"] == ["BL-001", "BL-002"]


def test_facture_due_date_is_reconciled_with_payment_terms() -> None:
    data = {
        "numero_facture": "FAC-2026-009",
        "nom_fournisseur": "AMBELYS",
        "date_emission": None,
        "date_paiement_prevue": None,
        "conditions_paiement": None,
        "bons_livraisons": [],
    }
    text = """
    AMBELYS
    Facture N° FAC-2026-009
    Date de facture : 15/04/2026
    Conditions de règlement : 30 jours fin de mois
    Échéance : 30/04/2026
    """

    result = finalize_document_data(
        data,
        text=text,
        filename="AMBELYS - 20260415 - FAC-2026-009.pdf",
        predicted_type="facture",
        fournisseur_patterns=FOURNISSEUR_PATTERNS,
    )

    assert result["date_emission"] == date(2026, 4, 15)
    assert result["conditions_paiement"] == "30 jours fin de mois"
    assert result["date_paiement_prevue"] == date(2026, 5, 30)