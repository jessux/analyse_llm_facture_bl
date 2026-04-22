"""
Test : structure multi-BL — une ligne par BL dans le xlsm,
montants portés par chaque BL, facture sans BL en une seule ligne.
"""
import sys, os, shutil, tempfile
marjo = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, marjo)
os.chdir(marjo)

from datetime import date
from main import write_to_achats_cons
import openpyxl

src = r'output\Suivi tresorerie MLC.xlsm'
# Chercher le fichier avec accent
import glob
candidates = glob.glob(r'output\*.xlsm')
src = [c for c in candidates if 'Copie' not in c][0]
tmp = os.path.join(tempfile.gettempdir(), 'test_multi_bl.xlsm')
shutil.copy(src, tmp)

# Facture Ambelys 766591 avec 3 BL (comme dans le fichier reel)
factures = [
    {
        'nom_fournisseur': 'AMBELYS',
        'numero_facture': '766591',
        'date_emission': date(2024, 1, 3),
        'prix_HT_5_5pct': None,
        'prix_HT_10pct': None,
        'prix_HT_20pct': None,  # pas de montant global sur la facture
        'date_paiement_prevue': date(2024, 3, 7),
        'fichier_source': 'AMBELYS-766591.pdf',
    },
    # Facture Sysco sans BL
    {
        'nom_fournisseur': 'SYSCO',
        'numero_facture': '1242631657',
        'date_emission': date(2026, 4, 15),
        'prix_HT_5_5pct': 295.62,
        'prix_HT_10pct': None,
        'prix_HT_20pct': None,
        'date_paiement_prevue': date(2026, 5, 5),
        'fichier_source': 'SYSCO-1242631657.pdf',
    },
]

bons = [
    # 3 BL pour la facture 766591, chacun avec son montant
    {
        'numero_bon_livraison': '128404',
        'numero_facture_rattachee': '766591',
        'nom_fournisseur': 'AMBELYS',
        'date_livraison': date(2024, 1, 3),
        'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 235.06,
    },
    {
        'numero_bon_livraison': '128536',
        'numero_facture_rattachee': '766591',
        'nom_fournisseur': 'AMBELYS',
        'date_livraison': date(2024, 1, 4),
        'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 81.20,
    },
    {
        'numero_bon_livraison': '128509',
        'numero_facture_rattachee': '766591',
        'nom_fournisseur': 'AMBELYS',
        'date_livraison': date(2024, 1, 4),
        'prix_HT_5_5pct': None, 'prix_HT_10pct': None, 'prix_HT_20pct': 25.19,
    },
]

nb = write_to_achats_cons(factures, bons, tmp, tmp)
print(f"Lignes inserees : {nb}  (attendu: 4 = 3 BL + 1 facture sans BL)")
assert nb == 4, f"Attendu 4, obtenu {nb}"

# Verifier le contenu
wb = openpyxl.load_workbook(tmp, read_only=True, keep_vba=True)
ws = wb['Achats Cons']
from main import FOURNISSEUR_DISPLAY
MLC = {v.lower() for v in FOURNISSEUR_DISPLAY.values()}
mlc_rows = [(i+2, r) for i, r in enumerate(ws.iter_rows(min_row=2, values_only=True))
            if r[2] and str(r[2]).strip().lower() in MLC]

print(f"Lignes MLC dans le fichier : {len(mlc_rows)}")
print("Contenu des lignes inserees :")
for row_idx, row in mlc_rows:
    print(f"  Ligne {row_idx}: C={row[2]} D={row[3]} E={row[4]} F={str(row[5])[:10] if row[5] else None} "
          f"I={row[8]} J={row[9]} K={row[10]} S={str(row[18])[:10] if row[18] else None}")

# Verifications
ambelys_rows = [(i, r) for i, r in mlc_rows if r[2] == 'Ambelys']
sysco_rows   = [(i, r) for i, r in mlc_rows if r[2] == 'Sysco']

assert len(ambelys_rows) == 3, f"Attendu 3 lignes Ambelys, obtenu {len(ambelys_rows)}"
assert len(sysco_rows) == 1,   f"Attendu 1 ligne Sysco, obtenu {len(sysco_rows)}"

# Chaque ligne Ambelys a son propre BL et son propre montant
bls_inseres = [r[4] for _, r in ambelys_rows]
assert '128404' in [str(b) for b in bls_inseres], "BL 128404 manquant"
assert '128536' in [str(b) for b in bls_inseres], "BL 128536 manquant"
assert '128509' in [str(b) for b in bls_inseres], "BL 128509 manquant"

# Sysco sans BL : col E vide, montant HT 5.5 en col I
sysco_row = sysco_rows[0][1]
assert sysco_row[4] is None, f"Sysco devrait avoir col E vide, obtenu {sysco_row[4]}"
assert sysco_row[8] == 295.62, f"Sysco HT 5.5 attendu 295.62, obtenu {sysco_row[8]}"

print()
print("TOUS LES TESTS PASSES OK")
