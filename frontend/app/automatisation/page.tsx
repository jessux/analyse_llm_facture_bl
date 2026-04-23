"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchAutomationTasks,
  fetchAutomationLogs,
  startAutomationTask,
  stopAutomationTask,
  runAutomationTaskNow,
  type AutomationTask,
  type AutomationLog,
} from "@/lib/api";

function fmtDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AutomatisationPage() {
  const [tasks, setTasks] = useState<AutomationTask[]>([]);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyTask, setBusyTask] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<string>("all");
  const [flash, setFlash] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = async () => {
    try {
      const [t, l] = await Promise.all([
        fetchAutomationTasks(),
        fetchAutomationLogs(logFilter === "all" ? undefined : logFilter, 400),
      ]);
      setTasks(t);
      setLogs(l);
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur chargement automatisation : ${e}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [logFilter]);

  useEffect(() => {
    const id = setInterval(() => {
      load();
    }, 4000);
    return () => clearInterval(id);
  }, [logFilter]);

  const doAction = async (taskId: string, action: "start" | "stop" | "run") => {
    setBusyTask(taskId + ":" + action);
    try {
      if (action === "start") {
        const res = await startAutomationTask(taskId);
        setFlash({ type: "ok", msg: res.message });
      } else if (action === "stop") {
        const res = await stopAutomationTask(taskId);
        setFlash({ type: "ok", msg: res.message });
      } else {
        const res = await runAutomationTaskNow(taskId);
        setFlash({ type: "ok", msg: res.message });
      }
      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Action impossible (${taskId}) : ${e}` });
    } finally {
      setBusyTask(null);
    }
  };

  const taskOptions = useMemo(() => tasks.map((t) => t.id), [tasks]);

  return (
    <main className="w-full max-w-[1920px] mx-auto px-4 py-8 flex flex-col gap-6">
      <nav className="flex items-center gap-2 text-xs text-neutral-400">
        <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">Dashboard</Link>
        <span>/</span>
        <span className="text-neutral-600 dark:text-neutral-300">Automatisation</span>
      </nav>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">Automatisation</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Suivi des tâches planifiées (mails, import DOMINO, santé XLSM), logs et exécutions manuelles.
          </p>
        </div>
      </div>

      {flash && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium border ${flash.type === "ok" ? "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800" : "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800"}`}>
          {flash.msg}
        </div>
      )}

      <section className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Tâches planifiées</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-sm text-neutral-400 text-center">Chargement…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Tâche</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Statut</th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Intervalle</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Dernier run</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Prochain run</th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Exec</th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Erreurs</th>
                  <th className="px-4 py-3 text-xs uppercase tracking-wider text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                {tasks.map((t) => {
                  const startBusy = busyTask === `${t.id}:start`;
                  const stopBusy = busyTask === `${t.id}:stop`;
                  const runBusy = busyTask === `${t.id}:run`;
                  return (
                    <tr key={t.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900 dark:text-white">{t.label}</div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400">{t.description}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">{t.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${t.enabled ? "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300" : "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"}`}>
                          {t.enabled ? "Actif" : "Inactif"}
                        </span>
                        {t.is_running && <span className="ml-2 text-xs text-blue-500">en cours…</span>}
                        {t.last_status === "error" && t.last_error && (
                          <div className="text-xs text-red-500 mt-1 max-w-[340px] truncate" title={t.last_error}>{t.last_error}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">{t.interval_seconds}s</td>
                      <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{fmtDateTime(t.last_end || t.last_start)}</td>
                      <td className="px-4 py-3 text-neutral-700 dark:text-neutral-300">{fmtDateTime(t.next_run)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">{t.run_count}</td>
                      <td className="px-4 py-3 text-right text-neutral-700 dark:text-neutral-300">{t.error_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => doAction(t.id, "start")}
                            disabled={startBusy || t.is_running}
                            className="px-2.5 py-1 text-xs rounded-md border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/30 disabled:opacity-50"
                          >
                            {startBusy ? "..." : "Démarrer"}
                          </button>
                          <button
                            onClick={() => doAction(t.id, "stop")}
                            disabled={stopBusy || t.is_running}
                            className="px-2.5 py-1 text-xs rounded-md border border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/30 disabled:opacity-50"
                          >
                            {stopBusy ? "..." : "Arrêter"}
                          </button>
                          <button
                            onClick={() => doAction(t.id, "run")}
                            disabled={runBusy || t.is_running}
                            className="px-2.5 py-1 text-xs rounded-md border border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900 disabled:opacity-50"
                          >
                            {runBusy ? "..." : "Lancer"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Logs d'exécution</h2>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-500">Filtrer</label>
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="px-2 py-1.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="all">Toutes les tâches</option>
              {taskOptions.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white dark:bg-neutral-950">
              <tr className="border-b border-neutral-100 dark:border-neutral-800">
                <th className="text-left px-4 py-2 uppercase tracking-wider text-neutral-500">Timestamp</th>
                <th className="text-left px-4 py-2 uppercase tracking-wider text-neutral-500">Task</th>
                <th className="text-left px-4 py-2 uppercase tracking-wider text-neutral-500">Niveau</th>
                <th className="text-left px-4 py-2 uppercase tracking-wider text-neutral-500">Message</th>
                <th className="text-left px-4 py-2 uppercase tracking-wider text-neutral-500">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
              {logs.map((l, idx) => (
                <tr key={`${l.timestamp}-${idx}`}>
                  <td className="px-4 py-2 text-neutral-600 dark:text-neutral-300">{fmtDateTime(l.timestamp)}</td>
                  <td className="px-4 py-2 font-mono text-neutral-600 dark:text-neutral-300">{l.task_id}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded ${l.level === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-300" : l.level === "warn" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"}`}>{l.level}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-700 dark:text-neutral-200">{l.message}</td>
                  <td className="px-4 py-2 text-neutral-500 dark:text-neutral-400 font-mono">{JSON.stringify(l.details || {})}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">Aucun log pour le filtre sélectionné.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
