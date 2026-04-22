"""
Test : vérifie que le startup charge correctement le store depuis le xlsm,
et que write_to_achats_cons est idempotente (pas d'accumulation).
"""
import sys, os, shutil
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo)
os.chdir(marjo)

import tempfile
from datetime import date
from main import write_to_achats_cons

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
bons_test = [{'numero_bon_livraison': 'C215075', 'numero_facture_rattachee': 'F826802'}]

# --- Test idempotence ---
nb1 = write_to_achats_cons(factures_test, bons_test, tmp, tmp)
nb2 = write_to_achats_cons(factures_test, bons_test, tmp, tmp)
print(f"Insertion 1 : {nb1} lignes  |  Insertion 2 (idempotente) : {nb2} lignes")
assert nb1 == nb2 == 2, f"Idempotence KO : {nb1} puis {nb2}"

import openpyxl
from main import FOURNISSEUR_DISPLAY
MLC = {v.lower() for v in FOURNISSEUR_DISPLAY.values()}
wb = openpyxl.load_workbook(tmp, read_only=True, keep_vba=True)
ws = wb['Achats Cons']
mlc_rows = [r for r in ws.iter_rows(min_row=2, values_only=True)
            if r[2] and str(r[2]).strip().lower() in MLC]
assert len(mlc_rows) == 2, f"Attendu 2 lignes MLC, obtenu {len(mlc_rows)}"
print(f"Lignes MLC dans le fichier : {len(mlc_rows)} OK")

# --- Test startup ---
import api as api_module
api_module.TRESORERIE_XLSM = tmp
api_module._store['factures'].clear()
api_module._store['bons'].clear()
api_module._startup_load_excel()

nb_f = len(api_module._store['factures'])
nb_b = len(api_module._store['bons'])
print(f"Store après startup : {nb_f} facture(s), {nb_b} bon(s)")

for k, v in api_module._store['factures'].items():
    print(f"  Facture {k}: fournisseur={v['nom_fournisseur']} date={v['date_emission']} "
          f"ht20={v['prix_HT_20pct']} bls={v['bons_livraisons']}")
for k, v in api_module._store['bons'].items():
    print(f"  BL {k}: fournisseur={v['nom_fournisseur']} rattache_a={v['numero_facture_rattachee']}")

assert nb_f == 2, f"Attendu 2 factures, obtenu {nb_f}"
assert nb_b == 1, f"Attendu 1 bon, obtenu {nb_b}"
assert 'TEST-001' in api_module._store['factures']
assert 'F826802' in api_module._store['factures']
assert 'C215075' in api_module._store['bons']
assert api_module._store['bons']['C215075']['numero_facture_rattachee'] == 'F826802'
assert 'C215075' in api_module._store['factures']['F826802']['bons_livraisons']

print()
print("TOUS LES TESTS PASSES OK")
