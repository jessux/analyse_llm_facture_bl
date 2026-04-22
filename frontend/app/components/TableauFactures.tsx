"use client";

import { useState, useEffect, useCallback } from "react";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import {
  fetchFactures, fetchFournisseurs,
  exportTresorerie, getTresorerieDownloadUrl,
  getPdfUrl, patchFacture,
  type Facture, type Fournisseur,
} from "@/lib/api";
import ModalRattachement from "./ModalRattachement";
import ModalPDF from "./ModalPDF";
import EditableCell from "./EditableCell";

function formatDate(d: string | null) {
  if (!d) return <span className="text-neutral-400">—</span>;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMontant(v: number | null | undefined) {
  if (v === null || v === undefined) return <span className="text-neutral-400">—</span>;
  return (
    <span className="font-mono">
      {v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
    </span>
  );
}

/** Somme des montants HT non-null d'une facture, null si tous absents */
function totalHT(f: Facture): number | null {
  const vals = [f.prix_HT_5_5pct, f.prix_HT_10pct, f.prix_HT_20pct].filter(
    (v): v is number => v !== null && v !== undefined
  );
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

export default function TableauFactures() {
  const [data, setData]                   = useState<Facture[]>([]);
  const [fournisseurs, setFournisseurs]   = useState<Fournisseur[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [modalFacture, setModalFacture]   = useState<Facture | null>(null);
  const [pdfViewer, setPdfViewer]         = useState<{ url: string; titre: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportResult, setExportResult]   = useState<{ lignes: number } | null>(null);
  const [exportError, setExportError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [factures, frs] = await Promise.all([fetchFactures(), fetchFournisseurs()]);
      setData(factures);
      setFournisseurs(frs);
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
          {/* Bouton : injection puis téléchargement du Suivi Trésorerie MLC.xlsm */}
          {!exportResult ? (
            <button
              onClick={async () => {
                setExportLoading(true);
                setExportError(null);
                try {
                  const res = await exportTresorerie();
                  setExportResult({ lignes: res.lignes_inserees });
                } catch (err) {
                  setExportError(err instanceof Error ? err.message : "Erreur lors de l'export.");
                } finally {
                  setExportLoading(false);
                }
              }}
              disabled={exportLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Enregistrer les factures dans l'onglet Achats Cons du Suivi Trésorerie MLC.xlsm"
            >
              {exportLoading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
              {exportLoading ? "Enregistrement…" : "Enregistrer dans Suivi Trésorerie"}
            </button>
          ) : (
            <a
              href={getTresorerieDownloadUrl()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors"
              title="Télécharger le Suivi Trésorerie MLC.xlsm mis à jour"
              onClick={() => setExportResult(null)}
            >
              <DownloadIcon className="w-4 h-4" />
              Télécharger Suivi Trésorerie.xlsm
            </a>
          )}
        </div>
      </div>

      {/* Feedback export trésorerie */}
      {exportResult && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <span>
            {exportResult.lignes} ligne{exportResult.lignes > 1 ? "s" : ""} enregistrée{exportResult.lignes > 1 ? "s" : ""} dans l&apos;onglet <strong>Achats Cons</strong> du Suivi Trésorerie MLC.
          </span>
          <button
            onClick={() => setExportResult(null)}
            className="ml-4 text-emerald-500 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            title="Fermer"
          >
            ✕
          </button>
        </div>
      )}
      {exportError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>❌ {exportError}</span>
          <button
            onClick={() => setExportError(null)}
            className="ml-4 text-red-500 hover:text-red-700 dark:hover:text-red-300 transition-colors"
            title="Fermer"
          >
            ✕
          </button>
        </div>
      )}

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
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Total HT</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 5,5%</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 10%</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">HT 20%</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">BL liés</th>
              <th className="px-4 py-3 w-20"></th>
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
              filtered.map((f, i) => {
                const save = (field: string) => async (val: string) => {
                  const payload: Record<string, string | number | null> = {};
                  payload[field] = field.includes("montant") || field.includes("prix")
                    ? (val === "" ? null : parseFloat(val))
                    : (val === "" ? null : val);
                  await patchFacture(f.numero_facture!, payload as never);
                  await load();
                };
                return (
                <tr
                  key={i}
                  className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                >
                  {/* N° Facture */}
                  <td className="px-4 py-3 font-medium text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                    <EditableCell
                      value={f.numero_facture}
                      type="text"
                      onSave={save("numero_facture")}
                      renderValue={(v) => v ?? <span className="text-neutral-400">—</span>}
                    />
                  </td>
                  {/* Fournisseur */}
                  <td className="px-4 py-3">
                    <EditableCell
                      value={f.nom_fournisseur}
                      type="select"
                      options={fournisseurs.map((fr) => fr.id)}
                      onSave={save("nom_fournisseur")}
                      renderValue={(v) => supplierBadge(v as string | null)}
                    />
                  </td>
                  {/* Date émission */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <EditableCell
                      value={f.date_emission}
                      type="date"
                      onSave={save("date_emission")}
                      renderValue={(v) => formatDate(v as string | null)}
                      className="text-neutral-600 dark:text-neutral-400"
                    />
                  </td>
                  {/* Échéance */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <EditableCell
                      value={f.date_paiement_prevue}
                      type="date"
                      onSave={save("date_paiement_prevue")}
                      renderValue={(v) => formatDate(v as string | null)}
                      highlight={isOverdue(f.date_paiement_prevue)
                        ? "text-red-600 dark:text-red-400 font-medium"
                        : "text-neutral-600 dark:text-neutral-400"}
                    />
                  </td>
                  {/* Total HT calculé (somme des HT de la facture) */}
                  <td className="px-4 py-3 text-right font-medium text-neutral-800 dark:text-neutral-200">
                    {formatMontant(totalHT(f))}
                  </td>
                  {/* HT 5,5% */}
                  <td className="px-4 py-3 text-right">
                    <EditableCell
                      value={f.prix_HT_5_5pct}
                      type="number"
                      onSave={save("prix_HT_5_5pct")}
                      renderValue={(v) => formatMontant(v as number | null)}
                      className="text-neutral-600 dark:text-neutral-400"
                    />
                  </td>
                  {/* HT 10% */}
                  <td className="px-4 py-3 text-right">
                    <EditableCell
                      value={f.prix_HT_10pct}
                      type="number"
                      onSave={save("prix_HT_10pct")}
                      renderValue={(v) => formatMontant(v as number | null)}
                      className="text-neutral-600 dark:text-neutral-400"
                    />
                  </td>
                  {/* HT 20% */}
                  <td className="px-4 py-3 text-right">
                    <EditableCell
                      value={f.prix_HT_20pct}
                      type="number"
                      onSave={save("prix_HT_20pct")}
                      renderValue={(v) => formatMontant(v as number | null)}
                      className="text-neutral-600 dark:text-neutral-400"
                    />
                  </td>
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
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      {/* Voir le PDF */}
                      {f.fichier_stocke && (
                        <button
                          onClick={() => setPdfViewer({ url: getPdfUrl(f.fichier_stocke!), titre: f.fichier_stocke! })}
                          title="Voir le PDF"
                          className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      {/* Rattachement */}
                      {f.numero_facture && (
                        <button
                          onClick={() => setModalFacture(f)}
                          title="Gérer les rattachements"
                          className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })
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

      {/* Modal rattachement */}
      {modalFacture && modalFacture.numero_facture && (
        <ModalRattachement
          mode="facture_vers_bl"
          numeroSource={modalFacture.numero_facture}
          blRattaches={modalFacture.bons_livraisons ?? []}
          onClose={() => setModalFacture(null)}
          onSuccess={load}
        />
      )}

      {/* Viewer PDF */}
      {pdfViewer && (
        <ModalPDF
          url={pdfViewer.url}
          titre={pdfViewer.titre}
          onClose={() => setPdfViewer(null)}
        />
      )}
    </div>
  );
}
