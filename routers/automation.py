from fastapi import APIRouter, HTTPException
from typing import Any, Callable, Optional
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

router = APIRouter(prefix="/api/automation", tags=["Automatisation"])

# Injectés depuis api.py via init_router()
_tasks: dict[str, dict[str, Any]] = {}
_logs: list[dict[str, Any]] = []
_lock: Optional[threading.Lock] = None
_executor_ref: Optional[ThreadPoolExecutor] = None
_add_log: Optional[Callable] = None
_execute_task: Optional[Callable] = None


def init_router(
    tasks: dict[str, dict[str, Any]],
    logs: list[dict[str, Any]],
    lock: threading.Lock,
    executor: ThreadPoolExecutor,
    add_log_fn: Callable,
    execute_task_fn: Callable,
) -> None:
    global _tasks, _logs, _lock, _executor_ref, _add_log, _execute_task
    _tasks = tasks
    _logs = logs
    _lock = lock
    _executor_ref = executor
    _add_log = add_log_fn
    _execute_task = execute_task_fn


@router.get("/tasks", summary="Lister les tâches d'automatisation")
def automation_list_tasks():
    with _lock:
        tasks = [dict(v) for v in _tasks.values()]
    tasks.sort(key=lambda x: x.get("id", ""))
    return tasks


@router.get("/logs", summary="Lister les logs d'automatisation")
def automation_list_logs(task_id: Optional[str] = None, limit: int = 200):
    lim = max(1, min(limit, 1000))
    with _lock:
        logs = list(_logs)
    if task_id:
        logs = [log for log in logs if log.get("task_id") == task_id]
    return logs[-lim:]


@router.post("/tasks/{task_id}/start", summary="Activer une tâche d'automatisation")
def automation_start_task(task_id: str):
    with _lock:
        task = _tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        task["enabled"] = True
        task["next_run"] = datetime.now().isoformat(timespec="seconds")
    _add_log(task_id, "info", "Tache activee.")
    return {"message": f"Tache '{task_id}' activee."}


@router.post("/tasks/{task_id}/stop", summary="Désactiver une tâche d'automatisation")
def automation_stop_task(task_id: str):
    with _lock:
        task = _tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        task["enabled"] = False
    _add_log(task_id, "warn", "Tache desactivee.")
    return {"message": f"Tache '{task_id}' desactivee."}


@router.post("/tasks/{task_id}/run-now", summary="Exécuter une tâche immédiatement")
def automation_run_task_now(task_id: str):
    with _lock:
        task = _tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail=f"Tache '{task_id}' introuvable")
        if task.get("is_running"):
            raise HTTPException(status_code=409, detail=f"La tache '{task_id}' est deja en cours")
    _executor_ref.submit(_execute_task, task_id, "manual")
    return {"message": f"Execution immediate lancee pour '{task_id}'."}
