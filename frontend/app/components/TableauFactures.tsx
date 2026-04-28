"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import {
  fetchFactures,
  fetchFournisseurs,
  exportFull, getTresorerieDownloadUrl,
  getPdfUrl, patchFacture,
  type Fournisseur,
  type Facture,
} from "@/lib/api";
import ModalRattachement from "./ModalRattachement";
import ModalPDF from "./ModalPDF";
import EditableCell from "./EditableCell";
import Pagination from "./Pagination";
import { formatDate, formatMontant, verifBadge, hasVerifError } from "./tableHelpers";

// ---------------------------------------------------------------------------
// Helpers locaux
// ---------------------------------------------------------------------------

function isInvalidDate(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime());
}

const hasError = hasVerifError;

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

export default function TableauFactures() {
  const searchParams = useSearchParams();
  const [data, setData]                   = useState<Facture[]>([]);
  const [fournisseurs, setFournisseurs]   = useState<Fournisseur[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [search, setSearch]               = useState(() => searchParams.get("facture") ?? searchParams.get("fournisseur") ?? "");
  const [searchInput, setSearchInput]     = useState(() => searchParams.get("facture") ?? searchParams.get("fournisseur") ?? "");
  const [page, setPage]                   = useState(1);
  const [limit, setLimit]                 = useState(50);
  const [total, setTotal]                 = useState(0);
  const [pages, setPages]                 = useState(1);
  const [modalFacture, setModalFacture]   = useState<Facture | null>(null);
  const [pdfViewer, setPdfViewer]         = useState<{ url: string; titre: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError]     = useState<string | null>(null);
  const searchDebounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p = page, l = limit, s = search) => {
    setLoading(true);
    setError(null);
    try {
      const [result, fournisseursApi] = await Promise.all([
        fetchFactures(p, l, s),
        fetchFournisseurs(),
      ]);
      setData(result.items);
      setTotal(result.total);
      setPages(result.pages);
      setPage(result.page);
      setFournisseurs(fournisseursApi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => { load(); }, [load]);

  // Debounce de la recherche : on attend 350ms après la dernière frappe
  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
      load(1, limit, value);
    }, 350);
  };

  const handlePageChange = (p: number) => {
    setPage(p);
    load(p, limit, search);
  };

  const handleLimitChange = (l: number) => {
    setLimit(l);
    setPage(1);
    load(1, l, search);
  };

  const filtered = data;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <input
          type="text"
          placeholder="Rechercher une facture…"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => load(page, limit, search)}
            className="px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            title="Rafraîchir"
          >↻</button>
          <button
            onClick={async () => {
              setExportLoading(true); setExportError(null);
              try {
                await exportFull();
                window.location.href = getTresorerieDownloadUrl();
              } catch (err) {
                setExportError(err instanceof Error ? err.message : "Erreur export.");
              } finally { setExportLoading(false); }
            }}
            disabled={exportLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 dark:border-emerald-700 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 disabled:opacity-50 transition-colors"
          >
            {exportLoading ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <DownloadIcon className="w-4 h-4" />}
            {exportLoading ? "Export en cours…" : "Exporter le Suivi Trésorerie"}
          </button>
        </div>
      </div>

      {/* Feedback export */}
      {exportError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>❌ {exportError}</span>
          <button onClick={() => setExportError(null)} className="ml-4 text-red-500 hover:text-red-700 transition-colors">✕</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
          <SpinnerIcon className="w-4 h-4 animate-spin" />Chargement…
        </div>
      )}
      {error && !loading && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">{error}</div>
      )}

      {/* Légende */}
      {!loading && !error && (
        <div className="flex items-center gap-4 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1"><span className="text-emerald-600">✓</span> TVA correcte</span>
          <span className="flex items-center gap-1"><span className="text-red-600 font-bold">⚠</span> Écart TVA</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800"></span> Ligne avec erreur</span>
          <span className="text-neutral-400">Double-cliquez sur une cellule pour modifier</span>
        </div>
      )}

      {/* Table */}
      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-xs min-w-[1600px]">
            <thead>
              {/* Ligne 1 : groupes */}
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/80">
                <th colSpan={2} className="px-3 py-2 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Document</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Dates &amp; paiement</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Bases HT (éditables)</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Tot HT</th>
                <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">TVA calculée (✓/⚠)</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Tot TVA</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">TTC</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">BL liés</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
              {/* Ligne 2 : colonnes détail */}
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider sticky left-0 bg-neutral-50 dark:bg-neutral-900 z-10">N° Facture</th>
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Fourn.</th>
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Émission</th>
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Échéance</th>
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Conditions</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">HT 5,5%</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">HT 10%</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">HT 20%</th>
                <th className="px-3 py-2 text-right font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Tot HT</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">TVA 5,5%</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">TVA 10%</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">TVA 20%</th>
                <th className="px-3 py-2 text-right font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">Tot TVA</th>
                <th className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">TTC</th>
                <th className="px-3 py-2 text-left font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider border-r border-neutral-200 dark:border-neutral-700">BL</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                <td colSpan={17} className="px-4 py-16 text-center text-sm text-neutral-400">
                    {data.length === 0
                      ? "Aucune facture. Chargez le fichier Suivi Trésorerie ou importez des PDFs."
                      : "Aucun résultat pour cette recherche."}
                  </td>
                </tr>
              ) : (
                filtered.map((f, i) => {
                  const erreur = hasError(f);
                  const rowBg = erreur
                    ? "bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900";

                  const save = (field: string) => async (val: string) => {
                    const isNum = field.startsWith("prix_");
                    const payload: Record<string, string | number | null> = {
                      [field]: isNum ? (val === "" ? null : parseFloat(val)) : (val === "" ? null : val),
                    };
                    await patchFacture(f.numero_facture!, payload as never);
                    await load();
                  };

                  return (
                    <tr key={i} className={`${rowBg} transition-colors`}>
                      {/* N° Facture */}
                      <td className="px-3 py-2 font-medium font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap sticky left-0 bg-inherit z-10">
                        <EditableCell
                          value={f.numero_facture}
                          type="text"
                          onSave={save("numero_facture")}
                          renderValue={(v) => v ?? <span className="text-neutral-400">—</span>}
                        />
                      </td>
                      {/* Fournisseur */}
                      <td className="px-3 py-2 border-r border-neutral-100 dark:border-neutral-800">
                        <EditableCell
                          value={f.nom_fournisseur}
                          type="select"
                          options={fournisseurs.map((fr) => fr.id)}
                          onSave={save("nom_fournisseur")}
                          renderValue={(v) => supplierBadge(v as string | null)}
                        />
                      </td>
                      {/* Date émission */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <EditableCell
                          value={f.date_emission}
                          type="date"
                          onSave={save("date_emission")}
                          renderValue={(v) => formatDate(v as string | null)}
                          className="text-neutral-600 dark:text-neutral-400"
                        />
                      </td>
                      {/* Échéance */}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <EditableCell
                          value={f.date_paiement_prevue}
                          type="date"
                          onSave={save("date_paiement_prevue")}
                          renderValue={(v) => formatDate(v as string | null)}
                          highlight={isInvalidDate(f.date_paiement_prevue)
                            ? "text-red-600 dark:text-red-400 font-semibold"
                            : "text-neutral-600 dark:text-neutral-400"}
                        />
                      </td>
                      {/* Conditions de paiement */}
                      <td className="px-3 py-2 border-r border-neutral-100 dark:border-neutral-800 whitespace-nowrap">
                        <EditableCell
                          value={f.conditions_paiement ?? null}
                          type="text"
                          onSave={save("conditions_paiement")}
                          renderValue={(v) => v
                            ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-medium whitespace-nowrap">{v as string}</span>
                            : <span className="text-neutral-400">—</span>
                          }
                        />
                      </td>
                      {/* HT 5,5% */}
                      <td className="px-3 py-2 text-right">
                        <EditableCell
                          value={f.prix_HT_5_5pct}
                          type="number"
                          onSave={save("prix_HT_5_5pct")}
                          renderValue={(v) => formatMontant(v as number | null, "text-blue-700 dark:text-blue-300")}
                        />
                      </td>
                      {/* HT 10% */}
                      <td className="px-3 py-2 text-right">
                        <EditableCell
                          value={f.prix_HT_10pct}
                          type="number"
                          onSave={save("prix_HT_10pct")}
                          renderValue={(v) => formatMontant(v as number | null, "text-blue-700 dark:text-blue-300")}
                        />
                      </td>
                      {/* HT 20% */}
                      <td className="px-3 py-2 text-right border-r border-neutral-100 dark:border-neutral-800">
                        <EditableCell
                          value={f.prix_HT_20pct}
                          type="number"
                          onSave={save("prix_HT_20pct")}
                          renderValue={(v) => formatMontant(v as number | null, "text-blue-700 dark:text-blue-300")}
                        />
                      </td>
                      {/* Tot HT */}
                      <td className="px-3 py-2 text-right font-semibold border-r border-neutral-100 dark:border-neutral-800">
                        {formatMontant(f.montant_total, "text-blue-800 dark:text-blue-200")}
                      </td>
                      {/* TVA 5,5% */}
                      <td className="px-3 py-2 text-right">
                        {verifBadge(f.verif_tva_5_5, f.tva_5_5pct)}
                      </td>
                      {/* TVA 10% */}
                      <td className="px-3 py-2 text-right">
                        {verifBadge(f.verif_tva_10, f.tva_10pct)}
                      </td>
                      {/* TVA 20% */}
                      <td className="px-3 py-2 text-right border-r border-neutral-100 dark:border-neutral-800">
                        {verifBadge(f.verif_tva_20, f.tva_20pct)}
                      </td>
                      {/* Total TVA */}
                      <td className="px-3 py-2 text-right border-r border-neutral-100 dark:border-neutral-800">
                        {formatMontant(f.total_tva, "text-amber-700 dark:text-amber-300")}
                      </td>
                      {/* TTC */}
                      <td className="px-3 py-2 text-right font-bold border-r border-neutral-100 dark:border-neutral-800">
                        {formatMontant(f.montant_ttc, "text-emerald-700 dark:text-emerald-300")}
                      </td>
                      {/* BL liés */}
                      <td className="px-3 py-2 border-r border-neutral-100 dark:border-neutral-800">
                        {f.bons_livraisons?.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {f.bons_livraisons.map((bl) => (
                              <a
                                key={bl}
                                href={`/bons-livraison?bl=${encodeURIComponent(bl)}`}
                                title={`Voir le BL ${bl}`}
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-blue-100 dark:hover:bg-blue-900 hover:text-blue-700 dark:hover:text-blue-300 transition-colors whitespace-nowrap cursor-pointer"
                              >
                                {bl}
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
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
                          {f.numero_facture && (
                            <button
                              onClick={() => setModalFacture(f)}
                              title="Gérer les rattachements BL"
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
        <div className="flex flex-col gap-2">
          {/* Infos erreurs TVA */}
          {filtered.some(hasError) && (
            <p className="text-xs text-red-500">
              ⚠ {filtered.filter(hasError).length} facture(s) avec erreur TVA sur cette page
            </p>
          )}
          {/* Pagination */}
          <Pagination
            page={page}
            pages={pages}
            total={total}
            limit={limit}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      )}

      {modalFacture && modalFacture.numero_facture && (
        <ModalRattachement
          mode="facture_vers_bl"
          numeroSource={modalFacture.numero_facture}
          blRattaches={modalFacture.bons_livraisons ?? []}
          onClose={() => setModalFacture(null)}
          onSuccess={() => load(page, limit, search)}
        />
      )}

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
