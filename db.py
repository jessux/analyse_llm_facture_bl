"""
Couche d'accès SQLite pour l'application Marjo.

Centralise:
- la connexion (file-based, multi-thread safe)
- la création/migration du schéma
- des helpers transactionnels

La BDD est stockée par défaut dans output/data.db (à côté du XLSM).
Le chemin peut être surchargé via la variable d'environnement MARJO_DB_PATH.

La connexion est créée en mode `check_same_thread=False` pour FastAPI,
avec un verrou applicatif pour les écritures (SQLite gère déjà les locks
internes mais on évite les `OperationalError: database is locked`).
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime
from typing import Iterator

DB_PATH = os.getenv("MARJO_DB_PATH", "output/data.db")

# Verrou applicatif pour sérialiser les écritures depuis plusieurs threads
# (FastAPI thread pool, scheduler automation, etc.)
_write_lock = threading.RLock()
_conn: sqlite3.Connection | None = None
_conn_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Connexion
# ---------------------------------------------------------------------------

def _connect(path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
    conn.row_factory = sqlite3.Row
    # WAL pour permettre lectures concurrentes pendant une écriture
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_conn() -> sqlite3.Connection:
    """Retourne la connexion SQLite globale (créée à la demande)."""
    global _conn
    if _conn is not None:
        return _conn
    with _conn_lock:
        if _conn is None:
            _conn = _connect(DB_PATH)
            _ensure_schema(_conn)
    return _conn


def reset_connection() -> None:
    """Ferme la connexion globale (utile pour les tests)."""
    global _conn
    with _conn_lock:
        if _conn is not None:
            try:
                _conn.close()
            except sqlite3.Error:
                pass
            _conn = None


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """
    Context manager pour exécuter un bloc en transaction.

    Utilisation::

        with transaction() as conn:
            conn.execute("INSERT ...")
            conn.execute("UPDATE ...")
    """
    conn = get_conn()
    with _write_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Schéma
# ---------------------------------------------------------------------------

SCHEMA_VERSION = 1

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS schema_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fournisseurs (
    id                  TEXT PRIMARY KEY,
    nom_affiche         TEXT NOT NULL,
    conditions_paiement TEXT,
    categorie           TEXT,
    mode_paiement       TEXT,
    frequence           TEXT,
    mois                TEXT,
    patterns_json       TEXT NOT NULL DEFAULT '[]',
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS factures (
    numero               TEXT PRIMARY KEY,
    fournisseur_id       TEXT NOT NULL,
    date_emission        TEXT,
    date_paiement_prevue TEXT,
    prix_HT_5_5          REAL,
    prix_HT_10           REAL,
    prix_HT_20           REAL,
    conditions_paiement  TEXT,
    fichier_source       TEXT,
    fichier_stocke       TEXT,
    created_at           TEXT NOT NULL,
    updated_at           TEXT NOT NULL,
    FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_factures_fournisseur
    ON factures(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_factures_date_emission
    ON factures(date_emission);

CREATE TABLE IF NOT EXISTS bons_livraison (
    numero                   TEXT PRIMARY KEY,
    fournisseur_id           TEXT NOT NULL,
    date_livraison           TEXT,
    prix_HT_5_5              REAL,
    prix_HT_10               REAL,
    prix_HT_20               REAL,
    numero_facture_rattachee TEXT,
    fichier_source           TEXT,
    fichier_stocke           TEXT,
    created_at               TEXT NOT NULL,
    updated_at               TEXT NOT NULL,
    FOREIGN KEY (fournisseur_id) REFERENCES fournisseurs(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (numero_facture_rattachee) REFERENCES factures(numero)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bl_fournisseur
    ON bons_livraison(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_bl_facture
    ON bons_livraison(numero_facture_rattachee);
CREATE INDEX IF NOT EXISTS idx_bl_date
    ON bons_livraison(date_livraison);

CREATE TABLE IF NOT EXISTS domino_jours (
    date                  TEXT PRIMARY KEY,
    filename              TEXT,
    ca_ttc_matin          REAL NOT NULL DEFAULT 0,
    ca_ttc_midi           REAL NOT NULL DEFAULT 0,
    ca_ttc_apm            REAL NOT NULL DEFAULT 0,
    ca_ttc_soir           REAL NOT NULL DEFAULT 0,
    ca_ttc_uber           REAL NOT NULL DEFAULT 0,
    ca_ttc_deliveroo      REAL NOT NULL DEFAULT 0,
    ca_ttc_total          REAL NOT NULL DEFAULT 0,
    tva_total             REAL NOT NULL DEFAULT 0,
    tva_55                REAL NOT NULL DEFAULT 0,
    tva_10                REAL NOT NULL DEFAULT 0,
    especes               REAL NOT NULL DEFAULT 0,
    carte_bancaire        REAL NOT NULL DEFAULT 0,
    cb_link               REAL NOT NULL DEFAULT 0,
    belorder              REAL NOT NULL DEFAULT 0,
    uber_eats             REAL NOT NULL DEFAULT 0,
    deliveroo_paiement    REAL NOT NULL DEFAULT 0,
    total_encaissements   REAL NOT NULL DEFAULT 0,
    nb_clients_matin      INTEGER NOT NULL DEFAULT 0,
    nb_clients_midi       INTEGER NOT NULL DEFAULT 0,
    nb_clients_soir       INTEGER NOT NULL DEFAULT 0,
    total_clients         INTEGER NOT NULL DEFAULT 0,
    imported_at           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS autres_achats (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fournisseur   TEXT NOT NULL,
    categorie     TEXT,
    num_facture   TEXT,
    num_bl        TEXT,
    date          TEXT,
    ht_0          REAL,
    ht_2_1        REAL,
    ht_5_5        REAL,
    ht_10         REAL,
    ht_20         REAL,
    conditions    TEXT,
    date_paiement TEXT,
    amortissable  TEXT,
    ref_denotage  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_autres_fournisseur
    ON autres_achats(fournisseur);
CREATE INDEX IF NOT EXISTS idx_autres_date
    ON autres_achats(date);
"""


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Crée les tables si elles n'existent pas, enregistre la version."""
    with _write_lock:
        conn.executescript(_SCHEMA_SQL)
        conn.execute(
            "INSERT INTO schema_meta(key, value) VALUES ('schema_version', ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (str(SCHEMA_VERSION),),
        )


def is_database_empty() -> bool:
    """
    True si aucune des tables principales ne contient de données.
    Utilisé par le seeder pour décider de remplir depuis le XLSM.
    """
    conn = get_conn()
    cur = conn.execute(
        "SELECT "
        "  (SELECT COUNT(1) FROM factures)        AS nb_factures, "
        "  (SELECT COUNT(1) FROM bons_livraison)  AS nb_bons, "
        "  (SELECT COUNT(1) FROM domino_jours)    AS nb_domino, "
        "  (SELECT COUNT(1) FROM autres_achats)   AS nb_autres"
    )
    row = cur.fetchone()
    return all(row[k] == 0 for k in ("nb_factures", "nb_bons", "nb_domino", "nb_autres"))


def get_schema_version() -> int:
    conn = get_conn()
    cur = conn.execute("SELECT value FROM schema_meta WHERE key='schema_version'")
    row = cur.fetchone()
    return int(row[0]) if row else 0
