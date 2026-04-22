"use client";

import { useState } from "react";
import { supplierBadge } from "./Badge";
import { DownloadIcon } from "./Icons";

export interface Facture {
  numero_facture: string | null;
  nom_fournisseur: "SYSCO" | "AMBELYS" | "TERREAZUR" | null;
  date_emission: string | null;
  date_paiement_prevue: string | null;
  montant_total: number | null;
  prix_HT_5_5pct: number | null;
  prix_HT_10pct: number | null;
  prix_HT_20pct: number | null;
  bons_livraisons: string[];
  fichier_source: string;
}

const MOCK_FACTURES: Facture[] = [
  {
    numero_facture: "FAC-2024-001",
    nom_fournisseur: "SYSCO",
    date_emission: "2024-03-01",
    date_paiement_prevue: "2024-04-01",
    montant_total: 4820.5,
    prix_HT_5_5pct: 1200,
    prix_HT_10pct: 2100,
    prix_HT_20pct: 1520.5,
    bons_livraisons: ["BL-001", "BL-002"],
    fichier_source: "facture_sysco_mars.pdf",
  },
  {
    numero_facture: "FAC-2024-002",
    nom_fournisseur: "AMBELYS",
    date_emission: "2024-03-05",
    date_paiement_prevue: "2024-04-05",
    montant_total: 1340.0,
    prix_HT_5_5pct: null,
    prix_HT_10pct: 800,
    prix_HT_20pct: 540,
    bons_livraisons: ["BL-010"],
    fichier_source: "facture_ambelys_mars.pdf",
  },
  {
    numero_facture: "FAC-2024-003",
    nom_fournisseur: "TERREAZUR",
    date_emission: "2024-03-10",
    date_paiement_prevue: null,
    montant_total: 2200.0,
    prix_HT_5_5pct: 2200,
    prix_HT_10pct: null,
    prix_HT_20pct: null,
    bons_livraisons: [],
    fichier_source: "facture_terreazur_mars.pdf",
  },
];

function formatDate(d: string | null) {
  if (!d) return <span className="text-neutral-400">—</span>;
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatMontant(v: number | null) {
  if (v === null) return <span className="text-neutral-400">—</span>;
  return (
    <span className="font-mono">
      {v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
    </span>
  );
}

export default function TableauFactures({ data = MOCK_FACTURES }: { data?: Facture[] }) {
  const [search, setSearch] = useState("");

  const filtered = data.filter((f) => {
    const q = search.toLowerCase();
    return (
      f.numero_facture?.toLowerCase().includes(q) ||
      f.nom_fournisseur?.toLowerCase().includes(q) ||
      f.fichier_source.toLowerCase().includes(q)
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
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">
          <DownloadIcon className="w-4 h-4" />
          Exporter
        </button>
      </div>

      {/* Table */}
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
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-neutral-400">
                  Aucune facture trouvée.
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
                    {f.date_paiement_prevue ? (
                      <span className={
                        new Date(f.date_paiement_prevue) < new Date()
                          ? "text-red-600 dark:text-red-400 font-medium"
                          : "text-neutral-600 dark:text-neutral-400"
                      }>
                        {formatDate(f.date_paiement_prevue)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-800 dark:text-neutral-200">{formatMontant(f.montant_total)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_5_5pct)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_10pct)}</td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">{formatMontant(f.prix_HT_20pct)}</td>
                  <td className="px-4 py-3">
                    {f.bons_livraisons.length > 0 ? (
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

      <p className="text-xs text-neutral-400 dark:text-neutral-600">
        {filtered.length} résultat{filtered.length > 1 ? "s" : ""}
        {search && ` pour « ${search} »`}
      </p>
    </div>
  );
}
