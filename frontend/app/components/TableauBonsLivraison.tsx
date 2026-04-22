"use client";

import { useState, useEffect, useCallback } from "react";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import { fetchBonsLivraison, getExcelDownloadUrl, type BonLivraison } from "@/lib/api";

function formatDate(d: string | null) {
  if (!d) return <span className="text-neutral-400">—</span>;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMontant(v: number | null) {
  if (v === null || v === undefined) return <span className="text-neutral-400">—</span>;
  return (
    <span className="font-mono">
      {v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
    </span>
  );
}

export default function TableauBonsLivraison() {
  const [data, setData] = useState<BonLivraison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchBonsLivraison());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter((b) => {
    const q = search.toLowerCase();
    return (
      b.numero_bon_livraison?.toLowerCase().includes(q) ||
      b.nom_fournisseur?.toLowerCase().includes(q) ||
      b.numero_facture_rattachee?.toLowerCase().includes(q) ||
      b.fichier_source?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Rechercher un bon de livraison…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Rafraîchir"
          >
            ↻
          </button>
          <a
            href={getExcelDownloadUrl()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <DownloadIcon className="w-4 h-4" />
            Exporter Excel
          </a>
        </div>
      </div>

      {/* États loading / error */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
          <SpinnerIcon className="w-4 h-4 animate-spin" />
          Chargement…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">N° BL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Fournisseur</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Date livraison</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Montant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Facture rattachée</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Fichier source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center text-sm text-neutral-400">
                    {data.length === 0
                      ? "Aucun bon de livraison. Importez des PDFs depuis le dashboard."
                      : "Aucun résultat pour cette recherche."}
                  </td>
                </tr>
              ) : (
                filtered.map((b, i) => (
                  <tr
                    key={i}
                    className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                      {b.numero_bon_livraison ?? <span className="text-neutral-400 font-sans">—</span>}
                    </td>
                    <td className="px-4 py-3">{supplierBadge(b.nom_fournisseur)}</td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{formatDate(b.date_livraison)}</td>
                    <td className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200">{formatMontant(b.montant_total)}</td>
                    <td className="px-4 py-3">
                      {b.numero_facture_rattachee ? (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 ring-1 ring-inset ring-blue-200 dark:ring-blue-800">
                          {b.numero_facture_rattachee}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-200 dark:ring-amber-800">
                          Non rattaché
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400 dark:text-neutral-500 font-mono truncate max-w-[180px]">
                      {b.fichier_source}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && (
        <p className="text-xs text-neutral-400 dark:text-neutral-600">
          {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
          {search && ` pour « ${search} »`}
        </p>
      )}
    </div>
  );
}
