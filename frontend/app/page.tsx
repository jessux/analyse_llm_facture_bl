"use client";

import { useEffect, useState, useCallback } from "react";
import UploadZone from "@/app/components/UploadZone";
import StatCard from "@/app/components/StatCard";
import { DocumentIcon, TruckIcon, EuroIcon, ChartIcon } from "@/app/components/Icons";
import { fetchStats, type Stats } from "@/lib/api";
import Link from "next/link";

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setStats(await fetchStats());
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const formatMontant = (v: number) =>
    v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 flex flex-col gap-10">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          Dashboard
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Importez vos PDF de factures et bons de livraison pour les analyser automatiquement.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Factures"
          value={stats ? stats.nb_factures : "—"}
          sub="Total analysé"
          icon={<DocumentIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Bons de livraison"
          value={stats ? stats.nb_bons : "—"}
          sub="Total analysé"
          icon={<TruckIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Montant total"
          value={stats ? formatMontant(stats.montant_total) : "—"}
          sub="Toutes factures"
          icon={<EuroIcon className="w-4 h-4" />}
        />
        <StatCard
          label="BL non rattachés"
          value={stats ? stats.bl_non_rattaches : "—"}
          sub="À vérifier"
          icon={<ChartIcon className="w-4 h-4" />}
        />
      </div>

      {/* Upload */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
            Importer des documents
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Factures et bons de livraison — SYSCO, AMBELYS, TERREAZUR
          </p>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <UploadZone onSuccess={loadStats} />
        </div>
      </section>

      {/* Quick links */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/factures"
          className="group flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 hover:shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800">
              <DocumentIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Factures</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {stats ? `${stats.nb_factures} facture${stats.nb_factures > 1 ? "s" : ""}` : "Consulter et exporter"}
              </p>
            </div>
          </div>
          <svg className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/bons-livraison"
          className="group flex items-center justify-between rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-6 py-5 hover:shadow-sm hover:border-neutral-300 dark:hover:border-neutral-700 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800">
              <TruckIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">Bons de livraison</p>
              <p className="text-xs text-neutral-400 mt-0.5">
                {stats
                  ? `${stats.nb_bons} bon${stats.nb_bons > 1 ? "s" : ""}${stats.bl_non_rattaches > 0 ? ` · ${stats.bl_non_rattaches} non rattaché${stats.bl_non_rattaches > 1 ? "s" : ""}` : ""}`
                  : "Consulter et exporter"}
              </p>
            </div>
          </div>
          <svg className="w-4 h-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>
    </main>
  );
}
