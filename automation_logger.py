"""
Logs d'automatisation persistants — fichier JSONL rotatif + cache mémoire.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from collections import deque
from datetime import datetime
from logging.handlers import RotatingFileHandler

LOG_PATH = os.getenv("MARJO_AUTOMATION_LOG", "output/automation.log")
_MAX_BYTES = 2 * 1024 * 1024   # 2 Mo
_BACKUP_COUNT = 5
_MEM_MAXLEN = 2000

_lock = threading.Lock()
_cache: deque[dict] = deque(maxlen=_MEM_MAXLEN)

# --- Logger fichier ---
_file_logger = logging.getLogger("marjo.automation")
_file_logger.setLevel(logging.DEBUG)
_file_logger.propagate = False


def _ensure_handler() -> None:
    if _file_logger.handlers:
        return
    os.makedirs(os.path.dirname(LOG_PATH) or ".", exist_ok=True)
    handler = RotatingFileHandler(
        LOG_PATH,
        maxBytes=_MAX_BYTES,
        backupCount=_BACKUP_COUNT,
        encoding="utf-8",
        delay=True,
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    _file_logger.addHandler(handler)


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def add_log(task_id: str, level: str, message: str, details: dict | None = None) -> None:
    """Écrit une entrée de log en JSON dans le fichier rotatif ET en mémoire (cache borné)."""
    entry: dict = {
        "timestamp": _now_iso(),
        "task_id": task_id,
        "level": level,
        "message": message,
        "details": details or {},
    }
    _ensure_handler()
    _file_logger.info(json.dumps(entry, ensure_ascii=False))
    with _lock:
        _cache.append(entry)


def get_logs(task_id: str | None = None, limit: int = 200) -> list[dict]:
    """Retourne les derniers logs depuis le cache mémoire (rapide pour l'API)."""
    with _lock:
        logs = list(_cache)
    if task_id:
        logs = [entry for entry in logs if entry.get("task_id") == task_id]
    return logs[-limit:]


def load_logs_from_file(task_id: str | None = None, limit: int = 500) -> list[dict]:
    """Relit les logs depuis le fichier (pour récupérer l'historique après redémarrage)."""
    results: list[dict] = []
    if not os.path.exists(LOG_PATH):
        return results
    try:
        with open(LOG_PATH, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if task_id is None or entry.get("task_id") == task_id:
                    results.append(entry)
    except OSError:
        return results
    return results[-limit:]


# Repeupler le cache au démarrage
def _bootstrap() -> None:
    entries = load_logs_from_file(limit=_MEM_MAXLEN)
    with _lock:
        _cache.clear()
        _cache.extend(entries)


_bootstrap()
