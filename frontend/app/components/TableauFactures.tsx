"use client";

import { useState, useEffect, useCallback } from "react";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import { fetchFactures, getExcelDownloadUrl, type Facture } from "@/lib/api";



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

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function TableauFactures() {
  const [data, setData] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchFactures());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = data.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.numero_facture?.toLowerCase().includes(q) ||
      f.nom_fournisseur?.toLowerCase().includes(q) ||
      f.fichier_source?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Rechercher une facture…"
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
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">N° Facture</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Fournisseur</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Émission</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Échéance</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Montant TTC</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 5,5%</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 10%</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 20%</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">BL liés</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-16 text-center text-sm text-neutral-400">
                  {data.length === 0
                    ? "Aucune facture. Importez des PDFs depuis le dashboard."
                    : "Aucun résultat pour cette recherche."}
                </td>
              </tr>
            ) : (
              filtered.map((f, i) => (
                <tr
                  key={i}
                  className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    {f.numero_facture ?? <span className="text-neutral-400">—</span>}
                  </td>
                  <td className="px-4 py-3">{supplierBadge(f.nom_fournisseur)}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400 whitespace-nowrap">{formatDate(f.date_emission)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={isOverdue(f.date_paiement_prevue)
                      ? "text-red-600 dark:text-red-400 font-medium"
                      : "text-neutral-600 dark:text-neutral-400"
                    }>
                      {formatDate(f.date_paiement_prevue)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200">{formatMontant(f.montant_total)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_5_5pct)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_10pct)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_20pct)}</td>
                  <td className="px-4 py-3">
                    {f.bons_livraisons?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {f.bons_livraisons.map((bl) => (
                          <span key={bl} className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                            {bl}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
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
