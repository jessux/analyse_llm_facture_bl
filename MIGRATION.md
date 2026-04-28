# Migration XLSM → SQLite

## Décisions validées

| Sujet | Choix |
|---|---|
| Tables migrées | `Achats Cons` (factures + BL), `DOMINO`, `Autres achats`, `Inputs` (fournisseurs) |
| Stratégie d'export | Template `template.xlsm` + injection des données depuis SQLite |
| Mode de validation | Pas à pas, commits intermédiaires, validation utilisateur entre étapes |
| Seeding initial | Au démarrage : si BDD vide, lecture XLSM → remplissage BDD |
| Onglets non migrés | Tous les autres (TDB, Synthèse, P&L, TCD *, Analyse *, Suivi *, etc.) — restent côté template Excel avec leurs formules |

## Schéma SQLite cible

```
fournisseurs (
    id TEXT PRIMARY KEY,            -- ex: "SYSCO"
    nom_affiche TEXT NOT NULL,      -- ex: "Sysco"
    conditions_paiement TEXT,       -- "J+20", "Fin de mois", etc.
    categorie TEXT,                 -- "Achats consommés", "Emballages", ...
    mode_paiement TEXT,             -- "Prélèv.", "LCR", ...
    frequence TEXT,                 -- "Mensuel", ...
    mois TEXT,                      -- "1-2-3-4-5-6-7-8-9-10-11-12"
    patterns_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)

factures (
    numero TEXT PRIMARY KEY,
    fournisseur_id TEXT NOT NULL REFERENCES fournisseurs(id),
    date_emission TEXT,
    date_paiement_prevue TEXT,
    prix_HT_5_5 REAL,
    prix_HT_10 REAL,
    prix_HT_20 REAL,
    conditions_paiement TEXT,
    fichier_source TEXT,
    fichier_stocke TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)

bons_livraison (
    numero TEXT PRIMARY KEY,
    fournisseur_id TEXT NOT NULL REFERENCES fournisseurs(id),
    date_livraison TEXT,
    prix_HT_5_5 REAL,
    prix_HT_10 REAL,
    prix_HT_20 REAL,
    numero_facture_rattachee TEXT REFERENCES factures(numero) ON DELETE SET NULL,
    fichier_source TEXT,
    fichier_stocke TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)

domino_jours (
    date TEXT PRIMARY KEY,           -- ISO YYYY-MM-DD
    filename TEXT,
    ca_ttc_matin REAL DEFAULT 0,
    ca_ttc_midi REAL DEFAULT 0,
    ca_ttc_apm REAL DEFAULT 0,
    ca_ttc_soir REAL DEFAULT 0,
    ca_ttc_uber REAL DEFAULT 0,
    ca_ttc_deliveroo REAL DEFAULT 0,
    ca_ttc_total REAL DEFAULT 0,
    tva_total REAL DEFAULT 0,
    tva_55 REAL DEFAULT 0,
    tva_10 REAL DEFAULT 0,
    especes REAL DEFAULT 0,
    carte_bancaire REAL DEFAULT 0,
    cb_link REAL DEFAULT 0,
    belorder REAL DEFAULT 0,
    uber_eats REAL DEFAULT 0,
    deliveroo_paiement REAL DEFAULT 0,
    total_encaissements REAL DEFAULT 0,
    nb_clients_matin INTEGER DEFAULT 0,
    nb_clients_midi INTEGER DEFAULT 0,
    nb_clients_soir INTEGER DEFAULT 0,
    total_clients INTEGER DEFAULT 0,
    imported_at TEXT NOT NULL
)

autres_achats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fournisseur TEXT NOT NULL,
    categorie TEXT,
    num_facture TEXT,
    num_bl TEXT,
    date TEXT,
    ht_0 REAL, ht_2_1 REAL, ht_5_5 REAL, ht_10 REAL, ht_20 REAL,
    conditions TEXT,
    date_paiement TEXT,
    amortissable TEXT,
    ref_denotage TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)

-- Métadonnées internes
schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

## Plan d'exécution (à valider étape par étape)

- [x] **Étape 0** — Cadrage et création de ce document
- [x] **Étape 1** — Couche `db.py` : connexion SQLite + schéma + migrations + helpers transactionnels
- [x] **Étape 2** — Repositories Python pour chaque table (CRUD basique)
- [x] **Étape 3** — Seeder : `seed_from_xlsm()` qui peuple la BDD vide depuis le XLSM courant
- [x] **Étape 4** — Refactor `api.py` :
  - Suppression de `_store` et `_fournisseurs` en mémoire
  - Endpoints branchés sur les repos
  - Conservation de la régénération XLSM via le nouvel exporter
- [x] **Étape 5** — Refactor `domino.py` : passage de `output/domino_imports.json` à SQLite (avec migration auto + fallback lecture JSON pour la 1ʳᵉ exécution)
- [x] **Étape 6** — Exporter : copie `template.xlsm` → injection des onglets `Achats Cons`, `DOMINO`, `Autres achats`, `Inputs` → sauvegarde atomique
- [ ] **Étape 6** — Exporter : copie `template.xlsm` → injection des onglets `Achats Cons`, `DOMINO`, `Autres achats`, `Inputs` → sauvegarde atomique
- [ ] **Étape 7** — (Optionnel) endpoints CRUD + UI pour `Autres achats`
- [ ] **Étape 8** — Tests d'intégration + nettoyage des chemins morts

## Risques identifiés
- L'onglet `Achats Cons` mélange lignes facture pure + lignes BL : la déduplication doit rester correcte → on garde la même logique métier `link_documents` + `write_to_achats_cons`, on change juste la source des données.
- Les formules Excel des autres onglets référencent `Achats Cons!C:Y`, `DOMINO!*`, `Autres achats!*`, `Inputs!B:G`. Tant qu'on respecte les emplacements et les formats, le template fonctionnera.
- ~180 fournisseurs dans `Inputs` mais seulement 3 dans le code (`SYSCO`, `AMBELYS`, `TERREAZUR`) : la migration enrichit donc la liste connue de l'app — c'est un gain, pas une régression.
- Le nettoyage du `lastgood.bak` XLSM doit aussi recevoir un équivalent pour SQLite (backup périodique de `data.db`).

## Convention de nommage
- BDD : `output/data.db` (à côté du XLSM)
- Template : `output/template.xlsm` (créé automatiquement à la 1ʳᵉ exécution depuis le XLSM courant si absent)
- Export : `output/Suivi trésorerie MLC.xlsm` (régénéré à partir du template + BDD)
