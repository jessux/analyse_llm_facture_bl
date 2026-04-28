import sys, os, shutil, tempfile, glob
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo); os.chdir(marjo)

from datetime import date
from main import write_to_achats_cons
import db
import repositories as repo

if __name__ == '__main__':
    # Réinitialiser la BDD
    db.reset_connection()
    with db.transaction() as conn:
        conn.execute("DELETE FROM factures")
        conn.execute("DELETE FROM bons_livraison")

    candidates = [c for c in glob.glob(r'output\*.xlsm') if 'Copie' not in c]
    tmp = os.path.join(tempfile.gettempdir(), 'test_stats2.xlsm')
    shutil.copy(candidates[0], tmp)

    factures = [
        {'nom_fournisseur': 'AMBELYS', 'numero_facture': '766591',
         'date_emission': date(2024,1,3), 'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': None,
         'date_paiement_prevue': date(2024,3,7), 'fichier_source': 'AMBELYS-766591.pdf'},
        {'nom_fournisseur': 'SYSCO', 'numero_facture': '1242631657',
         'date_emission': date(2026,4,15), 'prix_HT_5_5pct': 295.62, 'prix_HT_10pct': None, 'prix_HT_20pct': None,
         'date_paiement_prevue': date(2026,5,5), 'fichier_source': 'SYSCO.pdf'},
    ]
    bons = [
        {'numero_bon_livraison': '128404', 'numero_facture_rattachee': '766591',
         'nom_fournisseur': 'AMBELYS', 'date_livraison': date(2024,1,3),
         'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 235.06},
        {'numero_bon_livraison': '128536', 'numero_facture_rattachee': '766591',
         'nom_fournisseur': 'AMBELYS', 'date_livraison': date(2024,1,4),
         'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 81.20},
    ]
    write_to_achats_cons(factures, bons, tmp, tmp)

    # Injecter via repositories
    for facture in factures:
        repo.upsert_facture(facture)
    for bon in bons:
        repo.upsert_bon(bon)

    print('=== FACTURES ===')
    for f in repo.list_factures():
        ht55 = f.get('prix_HT_5_5pct')
        ht10 = f.get('prix_HT_10pct')
        ht20 = f.get('prix_HT_20pct')
        bls  = f.get('bons_livraisons')
        print(f"  {f['numero_facture']}: ht55={ht55} ht10={ht10} ht20={ht20} bls={bls}")

    print('=== BONS ===')
    for b in repo.list_bons():
        ht55 = b.get('prix_HT_5_5pct')
        ht10 = b.get('prix_HT_10pct')
        ht20 = b.get('prix_HT_20pct')
        rat  = b.get('numero_facture_rattachee')
        print(f"  {b['numero_bon_livraison']}: ht55={ht55} ht10={ht10} ht20={ht20} rattache={rat}")
