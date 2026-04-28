"use client";

import { useEffect, useState, useCallback, type ChangeEvent } from "react";
import Link from "next/link";
import {
  fetchDominoFiles,
  fetchDominoData,
  importDominoFile,
  importAllDomino,
  startDominoResyncXlsm,
  getDominoResyncStatus,
  restoreTresorerieLastGood,
  importDominoJson,
  type DominoFile,
  type DominoImport,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || n === 0) return "—";
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Composant badge statut
// ---------------------------------------------------------------------------

function StatusBadge({ imported }: { imported: boolean }) {
  return imported ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Importé
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      En attente
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function DominoPage() {
  const [files, setFiles] = useState<DominoFile[]>([]);
  const [imports, setImports] = useState<DominoImport[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [importAll, setImportAll] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [jsonMode, setJsonMode] = useState<"merge" | "replace">("merge");
  const [jsonImporting, setJsonImporting] = useState(false);
  const [flash, setFlash] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([fetchDominoFiles(), fetchDominoData()]);
      setFiles(f);
      setImports(d);
      // Utilise le setter fonctionnel pour éviter selectedDate dans les dépendances
      // (évite les rechargements en boucle à chaque changement de date sélectionnée)
      setSelectedDate((prev) => prev ?? (d.length > 0 ? d[0].data.date : null));
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur chargement : ${e}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleImport = async (filename: string) => {
    setImporting((p) => ({ ...p, [filename]: true }));
    try {
      const res = await importDominoFile(filename);
      setFlash({
        type: res.skipped ? "err" : "ok",
        msg: res.message,
      });
      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur : ${e}` });
    } finally {
      setImporting((p) => ({ ...p, [filename]: false }));
    }
  };

  const handleImportAll = async () => {
    setImportAll(true);
    try {
      const res = await importAllDomino(false);
      setFlash({ type: "ok", msg: res.message });
      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur : ${e}` });
    } finally {
      setImportAll(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const start = await startDominoResyncXlsm(true);
      let attempts = 0;
      let done = false;

      while (!done && attempts < 180) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts += 1;
        const status = await getDominoResyncStatus(start.job_id);

        if (status.status === "completed") {
          const res = status.result;
          const errCount = res?.errors?.length ?? 0;
          const errSuffix = errCount > 0 ? ` (${errCount} erreur(s))` : "";
          setFlash({
            type: errCount > 0 ? "err" : "ok",
            msg: `${status.message}${errSuffix}`,
          });
          done = true;
        } else if (status.status === "failed") {
          setFlash({ type: "err", msg: status.message || "Echec de la resynchronisation." });
          done = true;
        }
      }

      if (!done) {
        setFlash({
          type: "err",
          msg: "La resynchronisation est toujours en cours. Rechargez la page pour vérifier le statut.",
        });
      }

      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur resynchronisation : ${e}` });
    } finally {
      setResyncing(false);
    }
  };

  const handleRestoreXlsm = async () => {
    setRestoring(true);
    try {
      const res = await restoreTresorerieLastGood();
      setFlash({ type: "ok", msg: `${res.message}` });
      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur restauration XLSM : ${e}` });
    } finally {
      setRestoring(false);
    }
  };

  const handleImportJson = async (evt: ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    setJsonImporting(true);
    try {
      const res = await importDominoJson(file, jsonMode);
      setFlash({ type: "ok", msg: `${res.message} (${res.imported} importés, total ${res.total})` });
      await load();
    } catch (e) {
      setFlash({ type: "err", msg: `Erreur import JSON : ${e}` });
    } finally {
      setJsonImporting(false);
      evt.target.value = "";
    }
  };

  const pendingCount = files.filter((f) => !f.imported).length;
  const selectedImport = imports.find((x) => x.data.date === selectedDate) ?? imports[0];
  const selectedData = selectedImport?.data;
  const fullRows = selectedData ? Object.entries(selectedData) : [];

  return (
    <main className="w-full max-w-[1920px] mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-neutral-400">
        <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-neutral-600 dark:text-neutral-300">DOMINO</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800">
            <svg className="w-5 h-5 text-neutral-600 dark:text-neutral-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
              DOMINO — Rapport journalier
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Import automatique du rapport quotidien Bassin à Flot vers l'onglet DOMINO
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {pendingCount > 0 && (
            <button
              onClick={handleImportAll}
              disabled={importAll || resyncing || restoring}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {importAll ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Import en cours…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Importer tout ({pendingCount})
                </>
              )}
            </button>
          )}

          <button
            onClick={handleResync}
            disabled={resyncing || importAll || restoring}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors disabled:opacity-50"
          >
            {resyncing ? "Resynchronisation…" : "Forcer resynchro XLSM depuis JSON"}
          </button>

          <button
            onClick={handleRestoreXlsm}
            disabled={restoring || importAll || resyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors disabled:opacity-50"
          >
            {restoring ? "Restauration…" : "Restaurer XLSM (last-good)"}
          </button>

          <div className="flex items-center gap-2 pl-2">
            <select
              value={jsonMode}
              onChange={(e) => setJsonMode(e.target.value as "merge" | "replace")}
              className="px-2 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              disabled={jsonImporting}
            >
              <option value="merge">JSON merge</option>
              <option value="replace">JSON replace</option>
            </select>
            <label className="px-3 py-2 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-900">
              {jsonImporting ? "Import JSON..." : "Importer JSON"}
              <input type="file" accept="application/json,.json" className="hidden" onChange={handleImportJson} disabled={jsonImporting} />
            </label>
          </div>
        </div>
      </div>

      {/* Flash */}
      {flash && (
        <div
          className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center justify-between gap-4 ${
            flash.type === "ok"
              ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800"
          }`}
        >
          <span>{flash.msg}</span>
          <button onClick={() => setFlash(null)} className="opacity-50 hover:opacity-100 text-lg leading-none">&times;</button>
        </div>
      )}

      {/* Section : fichiers disponibles */}
      <section className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
            Fichiers disponibles
            <span className="ml-2 text-xs font-normal text-neutral-400">
              (dossier test_domino/)
            </span>
          </h2>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-sm text-neutral-400 text-center">Chargement…</div>
        ) : files.length === 0 ? (
          <div className="px-5 py-8 text-sm text-neutral-400 text-center">
            Aucun fichier .xlsx trouvé dans test_domino/
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 dark:border-neutral-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Fichier</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Statut</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Importé le</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
              {files.map((f) => (
                <tr key={f.filename} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-neutral-700 dark:text-neutral-300">
                    {f.filename}
                  </td>
                  <td className="px-5 py-3 text-neutral-600 dark:text-neutral-400">
                    {fmtDate(f.date)}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge imported={f.imported} />
                  </td>
                  <td className="px-5 py-3 text-xs text-neutral-400">
                    {fmtDateTime(f.imported_at)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {!f.imported && (
                      <button
                        onClick={() => handleImport(f.filename)}
                        disabled={!!importing[f.filename]}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
                      >
                        {importing[f.filename] ? (
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        )}
                        Importer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Section : données importées */}
      {imports.length > 0 && (
        <section className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Données importées
              <span className="ml-2 text-xs font-normal text-neutral-400">
                ({imports.length} jour{imports.length > 1 ? "s" : ""})
              </span>
            </h2>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {imports.map((item) => (
                <button
                  key={item.data.date}
                  onClick={() => setSelectedDate(item.data.date)}
                  className={`px-2.5 py-1 text-xs rounded-md border ${selectedDate === item.data.date ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent" : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"}`}
                >
                  {fmtDate(item.data.date)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                  <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">CA TTC total</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Midi</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Après-midi</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Soir</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">UBER</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">DELIVEROO</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Espèces</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">CB Link</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Belorder</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Couverts</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">TVA 5,5%</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">TVA 10%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                {imports.map((item) => {
                  const d = item.data;
                  return (
                    <tr key={d.date} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200">
                        {fmtDate(d.date)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-900 dark:text-white">
                        {fmt(d.ca_ttc_total)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.ca_ttc_midi)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.ca_ttc_apm)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.ca_ttc_soir)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.ca_ttc_uber)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.ca_ttc_deliveroo)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.especes)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.cb_link)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.belorder)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {d.total_clients > 0 ? d.total_clients : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.tva_55)} €
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                        {fmt(d.tva_10)} €
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section : affichage complet du DOMINO */}
      {selectedData && (
        <section className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800">
            <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">
              Affichage complet DOMINO — {fmtDate(selectedData.date)}
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Toutes les clés disponibles dans le JSON importé sont affichées ici.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 dark:border-neutral-800">
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-neutral-500">Champ</th>
                  <th className="text-left px-5 py-3 text-xs uppercase tracking-wider text-neutral-500">Valeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50 dark:divide-neutral-800/50">
                {fullRows.map(([k, v]) => (
                  <tr key={k}>
                    <td className="px-5 py-2.5 font-mono text-xs text-neutral-600 dark:text-neutral-300">{k}</td>
                    <td className="px-5 py-2.5 text-neutral-800 dark:text-neutral-200">{typeof v === "number" ? fmt(v) : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Info auto-import */}
      <p className="text-xs text-neutral-400 dark:text-neutral-500">
        Les nouveaux fichiers déposés dans <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 rounded">test_domino/</code> sont automatiquement détectés et importés au démarrage du serveur.
      </p>
    </main>
  );
}
