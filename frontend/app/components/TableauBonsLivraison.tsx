"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import {
  fetchBonsLivraison,
  fetchFournisseurs,
  exportFull,
  getTresorerieDownloadUrl,
  getPdfUrl,
  patchBon,
  type Fournisseur,
  type BonLivraison,
} from "@/lib/api";
import ModalRattachement from "./ModalRattachement";
import ModalPDF from "./ModalPDF";
import EditableCell from "./EditableCell";

function formatDate(d: string | null) {
  if (!d) return <span className="text-neutral-400">—</span>;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMontant(v: number | null | undefined, className?: string) {
  if (v === null || v === undefined) return <span className="text-neutral-400">—</span>;
  return (
    <span className={`font-mono tabular-nums ${className ?? ""}`}>
      {v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function verifBadge(verif: string, amount: number | null) {
  if (!verif || amount === null || amount === undefined) {
    return <span className="text-neutral-400 font-mono tabular-nums">—</span>;
  }
  const color = verif === "OK" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <span className={`font-mono tabular-nums ${color}`}>
      {amount.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      <span className="ml-1 text-xs">{verif === "OK" ? "✓" : "⚠"}</span>
    </span>
  );
}

function hasError(b: BonLivraison) {
  return b.verif_tva_5_5 === "Erreur" || b.verif_tva_10 === "Erreur" || b.verif_tva_20 === "Erreur";
}

export default function TableauBonsLivraison() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<BonLivraison[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("bl") ?? searchParams.get("fournisseur") ?? "");
  const [modalBon, setModalBon] = useState<BonLivraison | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; titre: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bons, fournisseursApi] = await Promise.all([
        fetchBonsLivraison(),
        fetchFournisseurs(),
      ]);
      setData(bons);
      setFournisseurs(fournisseursApi);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Rechercher un bon de livraison…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={load}
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

      {exportError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>❌ {exportError}</span>
          <button onClick={() => setExportError(null)} className="ml-4 text-red-500 hover:text-red-700 transition-colors">✕</button>
        </div>
      )}

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

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-xs min-w-[1500px]">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                <th className="px-3 py-2 text-left">N° BL</th>
                <th className="px-3 py-2 text-left">Fournisseur</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-right">HT 5.5%</th>
                <th className="px-3 py-2 text-right">HT 10%</th>
                <th className="px-3 py-2 text-right">HT 20%</th>
                <th className="px-3 py-2 text-right">Tot HT</th>
                <th className="px-3 py-2 text-right">TVA 5.5%</th>
                <th className="px-3 py-2 text-right">TVA 10%</th>
                <th className="px-3 py-2 text-right">TVA 20%</th>
                <th className="px-3 py-2 text-right">Tot TVA</th>
                <th className="px-3 py-2 text-right">TTC</th>
                <th className="px-3 py-2 text-left">Facture</th>
                <th className="px-3 py-2 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-sm text-neutral-400">
                    {data.length === 0 ? "Aucun bon de livraison." : "Aucun résultat."}
                  </td>
                </tr>
              ) : (
                filtered.map((b, i) => {
                  const rowBg = hasError(b)
                    ? "bg-red-50/60 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/30"
                    : "bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900";

                  const save = (field: string) => async (val: string) => {
                    const isNum = field.startsWith("prix_");
                    const payload: Record<string, string | number | null> = {
                      [field]: isNum ? (val === "" ? null : parseFloat(val)) : (val === "" ? null : val),
                    };
                    await patchBon(b.numero_bon_livraison!, payload as never);
                    await load();
                  };

                  return (
                    <tr key={i} className={`${rowBg} transition-colors`}>
                      <td className="px-3 py-2 font-mono">
                        <EditableCell
                          value={b.numero_bon_livraison}
                          type="text"
                          onSave={save("numero_bon_livraison")}
                          renderValue={(v) => v ?? <span className="text-neutral-400">—</span>}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={b.nom_fournisseur}
                          type="select"
                          options={fournisseurs.map((fr) => fr.id)}
                          onSave={save("nom_fournisseur")}
                          renderValue={(v) => supplierBadge(v as string | null)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={b.date_livraison}
                          type="date"
                          onSave={save("date_livraison")}
                          renderValue={(v) => formatDate(v as string | null)}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <EditableCell value={b.prix_HT_5_5pct} type="number" onSave={save("prix_HT_5_5pct")} renderValue={(v) => formatMontant(v as number | null)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <EditableCell value={b.prix_HT_10pct} type="number" onSave={save("prix_HT_10pct")} renderValue={(v) => formatMontant(v as number | null)} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <EditableCell value={b.prix_HT_20pct} type="number" onSave={save("prix_HT_20pct")} renderValue={(v) => formatMontant(v as number | null)} />
                      </td>
                      <td className="px-3 py-2 text-right">{formatMontant(b.montant_total, "font-semibold")}</td>
                      <td className="px-3 py-2 text-right">{verifBadge(b.verif_tva_5_5, b.tva_5_5pct)}</td>
                      <td className="px-3 py-2 text-right">{verifBadge(b.verif_tva_10, b.tva_10pct)}</td>
                      <td className="px-3 py-2 text-right">{verifBadge(b.verif_tva_20, b.tva_20pct)}</td>
                      <td className="px-3 py-2 text-right">{formatMontant(b.total_tva)}</td>
                      <td className="px-3 py-2 text-right">{formatMontant(b.montant_ttc, "font-semibold")}</td>
                      <td className="px-3 py-2">
                        {b.numero_facture_rattachee ? (
                          <a
                            href={`/factures?facture=${encodeURIComponent(b.numero_facture_rattachee)}`}
                            title={`Voir la facture ${b.numero_facture_rattachee}`}
                            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors cursor-pointer"
                          >
                            {b.numero_facture_rattachee}
                          </a>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                            Non rattaché
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          {b.fichier_stocke && (
                            <button
                              onClick={() => setPdfViewer({ url: getPdfUrl(b.fichier_stocke!), titre: b.fichier_stocke! })}
                              title="Voir le PDF"
                              className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-red-500"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                          )}
                          {b.numero_bon_livraison && (
                            <button
                              onClick={() => setModalBon(b)}
                              title="Gérer le rattachement"
                              className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-400 hover:text-neutral-700"
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

      {modalBon && modalBon.numero_bon_livraison && (
        <ModalRattachement
          mode="bl_vers_facture"
          numeroSource={modalBon.numero_bon_livraison}
          factureRattachee={modalBon.numero_facture_rattachee}
          onClose={() => setModalBon(null)}
          onSuccess={load}
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
