"use client";

import { useState, useEffect, useCallback } from "react";
import { supplierBadge } from "./Badge";
import { DownloadIcon, SpinnerIcon } from "./Icons";
import { fetchBonsLivraison, getTresorerieDownloadUrl, getPdfUrl, patchBon, type BonLivraison } from "@/lib/api";
import ModalRattachement from "./ModalRattachement";
import ModalPDF from "./ModalPDF";
import EditableCell from "./EditableCell";

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
  const [modalBon, setModalBon]   = useState<BonLivraison | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; titre: string } | null>(null);

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
            href={getTresorerieDownloadUrl()}
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
                <th className="px-4 py-3 w-20"></th>
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
                filtered.map((b, i) => {
                  const save = (field: string) => async (val: string) => {
                    const payload: Record<string, string | number | null> = {};
                    payload[field] = field === "montant_total"
                      ? (val === "" ? null : parseFloat(val))
                      : (val === "" ? null : val);
                    await patchBon(b.numero_bon_livraison!, payload as never);
                    await load();
                  };
                  return (
                  <tr
                    key={i}
                    className="bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                  >
                    {/* N° BL */}
                    <td className="px-4 py-3 font-medium font-mono text-neutral-800 dark:text-neutral-200 whitespace-nowrap">
                      <EditableCell
                        value={b.numero_bon_livraison}
                        type="text"
                        onSave={save("numero_bon_livraison")}
                        renderValue={(v) => v ?? <span className="text-neutral-400 font-sans">—</span>}
                      />
                    </td>
                    {/* Fournisseur */}
                    <td className="px-4 py-3">
                      <EditableCell
                        value={b.nom_fournisseur}
                        type="select"
                        options={["SYSCO", "AMBELYS", "TERREAZUR"]}
                        onSave={save("nom_fournisseur")}
                        renderValue={(v) => supplierBadge(v as string | null)}
                      />
                    </td>
                    {/* Date livraison */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <EditableCell
                        value={b.date_livraison}
                        type="date"
                        onSave={save("date_livraison")}
                        renderValue={(v) => formatDate(v as string | null)}
                        className="text-neutral-600 dark:text-neutral-400"
                      />
                    </td>
                    {/* Montant */}
                    <td className="px-4 py-3 text-right">
                      <EditableCell
                        value={b.montant_total}
                        type="number"
                        onSave={save("montant_total")}
                        renderValue={(v) => formatMontant(v as number | null)}
                        className="text-neutral-800 dark:text-neutral-200"
                      />
                    </td>
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
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {/* Voir le PDF */}
                        {b.fichier_stocke && (
                          <button
                            onClick={() => setPdfViewer({ url: getPdfUrl(b.fichier_stocke!), titre: b.fichier_stocke! })}
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
                        {b.numero_bon_livraison && (
                          <button
                            onClick={() => setModalBon(b)}
                            title="Gérer le rattachement"
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
      {modalBon && modalBon.numero_bon_livraison && (
        <ModalRattachement
          mode="bl_vers_facture"
          numeroSource={modalBon.numero_bon_livraison}
          factureRattachee={modalBon.numero_facture_rattachee}
          onClose={() => setModalBon(null)}
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
