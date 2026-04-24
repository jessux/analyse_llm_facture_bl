from __future__ import annotations

import os
import shutil
import tempfile
import zipfile


def is_valid_xlsm(path: str) -> bool:
    """Validate that a file is a readable Office zip workbook.

    Vérifie uniquement la structure du zip (entrées requises) sans décompresser
    tout le contenu — beaucoup plus rapide que testzip().
    """
    if not os.path.exists(path):
        return False
    try:
        with zipfile.ZipFile(path, "r") as zf:
            names = set(zf.namelist())
            return "[Content_Types].xml" in names and "xl/workbook.xml" in names
    except (zipfile.BadZipFile, OSError):
        return False


def atomic_save_workbook(workbook, target_path: str, backup_suffix: str = ".lastgood.bak") -> None:
    """
    Save workbook atomically to avoid corrupting the target file.

    Workflow:
    1) Backup current target (if valid) — avant toute écriture.
    2) Save to a temp file in the same directory.
    3) Validate temp as XLSM/Office zip.
    4) Atomic replace temp -> target.
    """
    target_abs = os.path.abspath(target_path)
    target_dir = os.path.dirname(target_abs) or "."
    os.makedirs(target_dir, exist_ok=True)

    backup_path = f"{target_abs}{backup_suffix}"

    # 1. Backup avant toute modification
    if is_valid_xlsm(target_abs):
        shutil.copy2(target_abs, backup_path)

    fd, tmp_path = tempfile.mkstemp(
        prefix=f"{os.path.basename(target_abs)}.",
        suffix=".tmp",
        dir=target_dir,
    )
    os.close(fd)

    try:
        # 2. Sauvegarde dans le fichier temporaire
        workbook.save(tmp_path)

        # 3. Validation légère du temporaire
        if not is_valid_xlsm(tmp_path):
            raise RuntimeError("Le fichier temporaire généré est invalide")

        # 4. Remplacement atomique
        os.replace(tmp_path, target_abs)

    except Exception:
        # Rollback depuis la backup si disponible
        if os.path.exists(backup_path) and not is_valid_xlsm(target_abs):
            os.replace(backup_path, target_abs)
        raise
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass