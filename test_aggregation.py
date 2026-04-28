"""
Test : vérifie que l'agrégation BL-facture fonctionne correctement,
et que l'API retourne une facture avec bons_livraisons corrects.
"""
import sys, os, shutil, tempfile, glob
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo)
os.chdir(marjo)

from datetime import date
from main import write_to_achats_cons
import db
import repositories as repo

if __name__ == '__main__':
    # Réinitialiser la BDD pour le test
    db.reset_connection()
    with db.transaction() as conn:
        conn.execute("DELETE FROM factures")
        conn.execute("DELETE FROM bons_livraison")

    candidates = [c for c in glob.glob(r'output\*.xlsm') if 'Copie' not in c]
    src = candidates[0]
    tmp = os.path.join(tempfile.gettempdir(), 'test_aggregation.xlsm')
    shutil.copy(src, tmp)

    # Écrire une facture avec 3 BL dans le xlsm
    factures = [{
        'nom_fournisseur': 'AMBELYS',
        'numero_facture': '766591',
        'date_emission': date(2024, 1, 3),
        'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': None,
        'date_paiement_prevue': date(2024, 3, 7),
        'fichier_source': 'AMBELYS-766591.pdf',
    }]
    bons = [
        {'numero_bon_livraison': '128404', 'numero_facture_rattachee': '766591',
         'nom_fournisseur': 'AMBELYS', 'date_livraison': date(2024, 1, 3),
         'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 235.06},
        {'numero_bon_livraison': '128536', 'numero_facture_rattachee': '766591',
         'nom_fournisseur': 'AMBELYS', 'date_livraison': date(2024, 1, 4),
         'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 81.20},
        {'numero_bon_livraison': '128509', 'numero_facture_rattachee': '766591',
         'nom_fournisseur': 'AMBELYS', 'date_livraison': date(2024, 1, 4),
         'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 25.19},
    ]
    write_to_achats_cons(factures, bons, tmp, tmp)

    # Injecter via repositories
    for facture in factures:
        repo.upsert_facture(facture)
    for bon in bons:
        repo.upsert_bon(bon)

    nb_f = len(repo.list_factures())
    nb_b = len(repo.list_bons())
    print(f"Factures dans repos : {nb_f}  (attendu: 1)")
    print(f"Bons dans repos     : {nb_b}  (attendu: 3)")

    f = repo.get_facture('766591')
    assert f is not None, "Facture 766591 absente des repos"
    print(f"Facture 766591 : bons_livraisons = {f['bons_livraisons']}")
    assert set(f['bons_livraisons'] or []) == {'128404', '128536', '128509'}, \
        f"BL manquants : {f['bons_livraisons']}"

    # Vérifier que chaque BL a ses montants
    for bl_num, ht20_attendu in [('128404', 235.06), ('128536', 81.20), ('128509', 25.19)]:
        b = repo.get_bon(bl_num)
        assert b is not None, f"BL {bl_num} absent"
        assert b['prix_HT_20pct'] == ht20_attendu, \
            f"BL {bl_num} : ht20 attendu {ht20_attendu}, obtenu {b['prix_HT_20pct']}"
        assert b['numero_facture_rattachee'] == '766591', f"BL {bl_num} mal rattaché"
        print(f"  BL {bl_num} : ht20={b['prix_HT_20pct']} rattaché_à={b['numero_facture_rattachee']}")

    print()
    print("TOUS LES TESTS PASSES OK")
