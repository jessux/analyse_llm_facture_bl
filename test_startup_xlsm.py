"""
Test : vérifie que write_to_achats_cons est idempotente (pas d'accumulation).
Et que les données injectées via repositories sont correctes.
"""
import sys, os, shutil
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo)
os.chdir(marjo)

import tempfile
from datetime import date
from main import write_to_achats_cons
import db
import repositories as repo

# Réinitialiser la BDD pour le test

if __name__ == '__main__':
    # Réinitialiser la BDD pour le test
    db.reset_connection()
    with db.transaction() as conn:
        conn.execute("DELETE FROM factures")
        conn.execute("DELETE FROM bons_livraison")

    src = r'output\Suivi trésorerie MLC.xlsm'
    tmp = os.path.join(tempfile.gettempdir(), 'Suivi_tresorerie_startup_test.xlsm')
    shutil.copy(src, tmp)

    factures_test = [
    {
        'nom_fournisseur': 'SYSCO',
        'numero_facture': 'TEST-001',
        'date_emission': date(2026, 4, 15),
        'prix_HT_5_5pct': None,
        'prix_HT_10pct': None,
        'prix_HT_20pct': 927.32,
        'date_paiement_prevue': date(2026, 5, 5),
        'fichier_source': 'SYSCO - 20260415 - 927.32.PDF',
    },
    {
        'nom_fournisseur': 'AMBELYS',
        'numero_facture': 'F826802',
        'date_emission': date(2026, 3, 31),
        'prix_HT_5_5pct': None,
        'prix_HT_10pct': None,
        'prix_HT_20pct': 1697.32,
        'date_paiement_prevue': date(2026, 4, 30),
        'fichier_source': 'AMBELYS - 20260331 - 01_F826802 - 1697.32.pdf',
    },
]
