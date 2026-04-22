"""
Tests de la fonction classify_document.
Lance avec : python test_classify.py
"""
from main import classify_document

# ---------------------------------------------------------------------------
# Cas de test : (filename, texte_simulé, type_attendu, description)
# ---------------------------------------------------------------------------
CASES = [
    # --- Patterns nom de fichier AMBELYS ---
    (
        "01_AMBELYS-C215075.pdf",
        "Quantité commandée : 10\nDate de livraison : 28/03/2026",
        "bon_livraison",
        "AMBELYS C = commande/BL",
    ),
    (
        "AMBELYS - 20260331 - 01_F826802 - 1697.32.pdf",
        "TVA 10% : 154.30\nTotal TTC : 1697.32\nÉchéance : 30/04/2026",
        "facture",
        "AMBELYS F = facture",
    ),
    # --- Patterns nom de fichier SYSCO ---
    (
        "SYSCO - 20260415 - 927.32.PDF",
        "Total TTC : 927.32\nDate de facture : 15/04/2026\nÉchéance : 15/05/2026",
        "facture",
        "SYSCO sans marqueur BL → facture via contenu",
    ),
    (
        "SYSCO - BL - 20260415.pdf",
        "Bon de livraison\nQuantité livrée : 5",
        "bon_livraison",
        "SYSCO avec BL dans le nom",
    ),
    # --- TERRE AZUR ---
    (
        "TERRE AZUR - 20260413 - 249.63.pdf",
        "Total TTC : 249.63\nDate de facture : 13/04/2026\nNet à payer : 249.63",
        "facture",
        "TERRE AZUR sans marqueur BL → facture via contenu",
    ),
    # --- Marqueurs forts dans le contenu ---
    (
        "document.pdf",
        "Bon de livraison N° 12345\nÀ livrer le 20/04/2026\nQuantité livrée : 10",
        "bon_livraison",
        "Marqueurs BL forts dans le contenu",
    ),
    (
        "document.pdf",
        "Facture N° FAC-2026-001\nDate de facture : 01/04/2026\nÉchéance : 30/04/2026\nNet à payer : 500.00",
        "facture",
        "Marqueurs facture forts dans le contenu",
    ),
    # --- Cas piège : "facture" mentionné dans un BL ---
    (
        "bl_sysco_001.pdf",
        "Bon de livraison N° BL-001\nAR CDE N° 98765\nCe bon de livraison est rattaché à la facture N° FAC-001",
        "bon_livraison",
        "BL qui mentionne une facture en référence",
    ),
    # --- Cas AR CDE ---
    (
        "commande_ambelys.pdf",
        "AR CDE N° 215075\nDate de livraison prévue : 28/03/2026\nQuantité commandée : 20",
        "bon_livraison",
        "AR CDE = bon de livraison",
    ),
]

# ---------------------------------------------------------------------------
# Exécution
# ---------------------------------------------------------------------------
passed = 0
failed = 0

print(f"\n{'='*70}")
print(f"{'TEST':50} {'ATTENDU':15} {'OBTENU':15} {'OK?'}")
print(f"{'='*70}")

for filename, text, expected, description in CASES:
    result = classify_document(text, filename)
    ok = result == expected
    status = "✅" if ok else "❌"
    if ok:
        passed += 1
    else:
        failed += 1
    print(f"{description[:50]:50} {expected:15} {result:15} {status}")

print(f"{'='*70}")
print(f"\n{passed}/{passed + failed} tests passés", end="")
if failed == 0:
    print(" 🎉")
else:
    print(f" — {failed} échec(s)")
print()
