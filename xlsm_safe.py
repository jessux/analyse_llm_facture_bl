from __future__ import annotations

import os
import shutil
import tempfile
import zipfile


def is_valid_xlsm(path: str) -> bool:
    """Validate that a file is a readable Office zip workbook."""
    if not os.path.exists(path):
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = set(zf.namelist())
            if "[Content_Types].xml" not in names:
                return False
            if "xl/workbook.xml" not in names:
                return False
            return zf.testzip() is None
    except (zipfile.BadZipFile, OSError):
        return False


def atomic_save_workbook(workbook, target_path: str, backup_suffix: str = ".lastgood.bak") -> None:
    """
    Save workbook atomically to avoid corrupting the target file.

    Workflow:
    1) Save to a temp file in the same directory.
    2) Validate temp as XLSM/Office zip.
    3) Backup current target (if valid).
    4) Atomic replace temp -> target.
    5) Validate target after replace, rollback from backup on failure.
    """
    target_abs = os.path.abspath(target_path)
    target_dir = os.path.dirname(target_abs) or "."
    os.makedirs(target_dir, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(
        prefix=f"{os.path.basename(target_abs)}.",
        suffix=".tmp",
        dir=target_dir,
    )
    os.close(fd)

    backup_path = f"{target_abs}{backup_suffix}"

    try:
        workbook.save(tmp_path)
        if not is_valid_xlsm(tmp_path):
            raise RuntimeError("Le fichier temporaire généré est invalide")

        if is_valid_xlsm(target_abs):
            shutil.copy2(target_abs, backup_path)

        os.replace(tmp_path, target_abs)

        if not is_valid_xlsm(target_abs):
            if os.path.exists(backup_path):
                os.replace(backup_path, target_abs)
            raise RuntimeError("Validation post-écriture échouée, rollback appliqué")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass