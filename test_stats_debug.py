import sys, os, shutil, tempfile, glob
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo); os.chdir(marjo)

from datetime import date
from main import write_to_achats_cons

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

import api as api_module
api_module.TRESORERIE_XLSM = tmp
api_module._store['factures'].clear()
api_module._store['bons'].clear()
api_module._startup_load_excel()

print('=== FACTURES ===')
for k, v in api_module._store['factures'].items():
    ht55 = v.get('prix_HT_5_5pct')
    ht10 = v.get('prix_HT_10pct')
    ht20 = v.get('prix_HT_20pct')
    bls  = v.get('bons_livraisons')
    print(f'  {k}: ht55={ht55} ht10={ht10} ht20={ht20} bls={bls}')

print('=== BONS ===')
for k, v in api_module._store['bons'].items():
    ht55 = v.get('prix_HT_5_5pct')
    ht10 = v.get('prix_HT_10pct')
    ht20 = v.get('prix_HT_20pct')
    rat  = v.get('numero_facture_rattachee')
    print(f'  {k}: ht55={ht55} ht10={ht10} ht20={ht20} rattache={rat}')
