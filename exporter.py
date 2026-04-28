"""
Module d'export : génère le fichier XLSM depuis les données SQLite.

Flux :
1. Copier template.xlsm (ou le créer à partir du XLSM courant si absent)
2. Mettre à jour Achats Cons via write_to_achats_cons()
3. Injecter DOMINO, Autres achats, Inputs directement
4. Sauvegarder atomiquement
"""

import os
import shutil
import tempfile
from datetime import date as dateclass

import openpyxl
import db
import repositories as repo
import domino
from main import write_to_achats_cons
from xlsm_safe import atomic_save_workbook

TEMPLATE_PATH = "output/template.xlsm"
CURRENT_XLSM_PATH = "output/Suivi trésorerie MLC.xlsm"


def ensure_template_exists() -> str:
    """
    Vérifie que le template existe. S'il n'existe pas, le crée à partir du XLSM courant.
    Retourne le chemin du template (toujours valide après cet appel).
    """
    if os.path.exists(TEMPLATE_PATH):
        return TEMPLATE_PATH
    
    if not os.path.exists(CURRENT_XLSM_PATH):
        raise FileNotFoundError(f"Impossible de créer le template : '{CURRENT_XLSM_PATH}' introuvable.")
    
    os.makedirs(os.path.dirname(TEMPLATE_PATH), exist_ok=True)
    shutil.copy(CURRENT_XLSM_PATH, TEMPLATE_PATH)
    print(f"[INFO] Template créé depuis '{CURRENT_XLSM_PATH}' → '{TEMPLATE_PATH}'")
    return TEMPLATE_PATH


def export_to_xlsm(output_path: str = CURRENT_XLSM_PATH) -> dict:
    """
    Génère le fichier XLSM export en injectant les données SQLite dans tous les onglets.
    """
    template_path = ensure_template_exists()
    
    fd, tmp_path = tempfile.mkstemp(suffix=".xlsm", prefix="export_", dir=os.path.dirname(output_path) or ".")
    os.close(fd)
    
    try:
        # Copier le template
        shutil.copy(template_path, tmp_path)
        
        # Mettre à jour Achats Cons
        try:
            factures = repo.list_factures()
            bons = repo.list_bons()
            achats_lignes = write_to_achats_cons(
                factures=factures,
                bons=bons,
                template_path=tmp_path,
                output_path=tmp_path,
                fournisseur_display=repo.fournisseur_display_map(),
            )
        except Exception as e:
            achats_lignes = 0
            print(f"[WARN] Achats Cons: {e}")
        
        # Injecter les autres onglets
        wb = openpyxl.load_workbook(tmp_path, keep_vba=True)
        try:
            stats = _inject_other_sheets(wb)
            stats["achats_cons_lignes"] = achats_lignes
        finally:
            wb.close()
        
        return {
            "status": "success",
            "output_file": output_path,
            "template_used": template_path,
            **stats,
        }
    except Exception as e:
        raise
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


def _inject_other_sheets(wb: openpyxl.Workbook) -> dict:
    """Injecte DOMINO, Autres achats, Inputs dans le workbook."""
    stats = {
        "domino_jours": 0,
        "autres_achats_lignes": 0,
        "inputs_fournisseurs": 0,
        "errors": [],
    }
    
    # DOMINO
    if "DOMINO" in wb.sheetnames:
        try:
            domino_jours = repo.list_domino_jours()
            ws = wb["DOMINO"]
            for jour_row in domino_jours:
                try:
                    domino_data = _row_to_domino_jour(jour_row)
                    result = domino._write_data_on_open_sheet(ws, domino_data, overwrite=False)
                    if not result.get("skipped"):
                        stats["domino_jours"] += 1
                except Exception as e:
                    stats["errors"].append(f"DOMINO {jour_row.get('date')}: {e}")
        except Exception as e:
            stats["errors"].append(f"Onglet DOMINO: {e}")
    
    # Autres achats
    if "Autres achats" in wb.sheetnames:
        try:
            stats["autres_achats_lignes"] = _inject_autres_achats(wb["Autres achats"])
        except Exception as e:
            stats["errors"].append(f"Autres achats: {e}")
    
    # Inputs (fournisseurs)
    if "Inputs" in wb.sheetnames:
        try:
            stats["inputs_fournisseurs"] = _inject_inputs(wb["Inputs"])
        except Exception as e:
            stats["errors"].append(f"Inputs: {e}")
    
    return stats


def _row_to_domino_jour(row: dict) -> domino.DominoJourData:
    """Convertit une ligne DB domino_jours en objet DominoJourData."""
    d = row.get("date")
    if isinstance(d, str):
        parsed_date = dateclass.fromisoformat(d)
    else:
        parsed_date = d
    
    return domino.DominoJourData(
        date=parsed_date,
        filename=row.get("filename", "export"),
        ca_ttc_matin=float(row.get("ca_ttc_matin") or 0),
        ca_ttc_midi=float(row.get("ca_ttc_midi") or 0),
        ca_ttc_apm=float(row.get("ca_ttc_apm") or 0),
        ca_ttc_soir=float(row.get("ca_ttc_soir") or 0),
        ca_ttc_uber=float(row.get("ca_ttc_uber") or 0),
        ca_ttc_deliveroo=float(row.get("ca_ttc_deliveroo") or 0),
        ca_ttc_total=float(row.get("ca_ttc_total") or 0),
        tva_total=float(row.get("tva_total") or 0),
        tva_55=float(row.get("tva_55") or 0),
        tva_10=float(row.get("tva_10") or 0),
        especes=float(row.get("especes") or 0),
        carte_bancaire=float(row.get("carte_bancaire") or 0),
        cb_link=float(row.get("cb_link") or 0),
        belorder=float(row.get("belorder") or 0),
        uber_eats=float(row.get("uber_eats") or 0),
        deliveroo_paiement=float(row.get("deliveroo_paiement") or 0),
        total_encaissements=float(row.get("total_encaissements") or 0),
        nb_clients_matin=int(row.get("nb_clients_matin") or 0),
        nb_clients_midi=int(row.get("nb_clients_midi") or 0),
        nb_clients_soir=int(row.get("nb_clients_soir") or 0),
        total_clients=int(row.get("total_clients") or 0),
    )


def _inject_autres_achats(ws) -> int:
    """Injecte les données Autres achats dans la feuille."""
    autres_achats = repo.list_autres_achats()
    if not autres_achats:
        return 0
    
    # Chercher la ligne d'en-tête
    header_row = None
    for row_idx in range(1, min(10, ws.max_row + 1)):
        cell_val = ws.cell(row_idx, 1).value
        if cell_val and "Fournisseur" in str(cell_val):
            header_row = row_idx
            break
    
    if header_row is None:
        header_row = 1
    
    # Écrire à partir de la ligne suivante
    data_start_row = header_row + 1
    col_mapping = {
        "fournisseur": 1,
        "categorie": 2,
        "num_facture": 3,
        "num_bl": 4,
        "date": 5,
        "ht_0": 8,
        "ht_2_1": 9,
        "ht_5_5": 10,
        "ht_10": 11,
        "ht_20": 12,
        "conditions": 21,
        "date_paiement": 22,
        "amortissable": 26,
        "ref_denotage": 27,
    }
    
    for idx, achat in enumerate(autres_achats):
        row_idx = data_start_row + idx
        for field, col_idx in col_mapping.items():
            value = achat.get(field)
            if value is not None:
                ws.cell(row_idx, col_idx).value = value
    
    return len(autres_achats)


def _inject_inputs(ws) -> int:
    """Injecte les fournisseurs dans l'onglet Inputs (col B onwards)."""
    fournisseurs = repo.list_fournisseurs()
    if not fournisseurs:
        return 0
    
    # Chercher la ligne d'en-tête
    header_row = None
    for row_idx in range(1, min(20, ws.max_row + 1)):
        cell_val = ws.cell(row_idx, 2).value
        if cell_val and "Liste des fournisseurs marchandises" in str(cell_val):
            header_row = row_idx
            break
    
    if header_row is None:
        header_row = 2
    
    # Écrire à partir de la ligne suivante, col B onwards
    data_start_row = header_row + 1
    
    for idx, fourn in enumerate(fournisseurs):
        row_idx = data_start_row + idx
        ws.cell(row_idx, 2).value = fourn.get("nom_affiche")
        ws.cell(row_idx, 3).value = fourn.get("conditions_paiement")
        ws.cell(row_idx, 4).value = fourn.get("categorie")
        ws.cell(row_idx, 5).value = fourn.get("mode_paiement")
        ws.cell(row_idx, 6).value = fourn.get("frequence")
        ws.cell(row_idx, 7).value = fourn.get("mois")
    
    return len(fournisseurs)


if __name__ == "__main__":
    result = export_to_xlsm()
    print("Export result:", result)
