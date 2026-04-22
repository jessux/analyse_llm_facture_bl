"""
Test : vérifie que le startup agrège bien les BL sur la facture,
et que l'API /api/factures retourne une facture avec bons_livraisons agrégés.
"""
import sys, os, shutil, tempfile, glob
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo)
os.chdir(marjo)

from datetime import date
from main import write_to_achats_cons

candidates = [c for c in glob.glob(r'output\*.xlsm') if 'Copie' not in c]
src = candidates[0]
tmp = os.path.join(tempfile.gettempdir(), 'test_aggregation.xlsm')
shutil.copy(src, tmp)

# Ecrire une facture avec 3 BL dans le xlsm
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

# Simuler le startup
import api as api_module
api_module.TRESORERIE_XLSM = tmp
api_module._store['factures'].clear()
api_module._store['bons'].clear()
api_module._startup_load_excel()

nb_f = len(api_module._store['factures'])
nb_b = len(api_module._store['bons'])
print(f"Factures dans le store : {nb_f}  (attendu: 1)")
print(f"Bons dans le store     : {nb_b}  (attendu: 3)")

f = api_module._store['factures'].get('766591')
assert f is not None, "Facture 766591 absente du store"
print(f"Facture 766591 : bons_livraisons = {f['bons_livraisons']}")
assert set(f['bons_livraisons']) == {'128404', '128536', '128509'}, \
    f"BL manquants : {f['bons_livraisons']}"

# Verifier que chaque BL a ses montants
for bl_num, ht20_attendu in [('128404', 235.06), ('128536', 81.20), ('128509', 25.19)]:
    b = api_module._store['bons'].get(bl_num)
    assert b is not None, f"BL {bl_num} absent"
    assert b['prix_HT_20pct'] == ht20_attendu, \
        f"BL {bl_num} : ht20 attendu {ht20_attendu}, obtenu {b['prix_HT_20pct']}"
    assert b['numero_facture_rattachee'] == '766591', f"BL {bl_num} mal rattache"
    print(f"  BL {bl_num} : ht20={b['prix_HT_20pct']} rattache_a={b['numero_facture_rattachee']}")

print()
print("TOUS LES TESTS PASSES OK")
