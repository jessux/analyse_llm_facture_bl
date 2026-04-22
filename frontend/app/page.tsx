import UploadZone from "@/app/components/UploadZone";
import StatCard from "@/app/components/StatCard";
import { DocumentIcon, TruckIcon, EuroIcon, ChartIcon } from "@/app/components/Icons";
import Link from "next/link";

export default function Home() {
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
          value="3"
          sub="Ce mois-ci"
          icon={<DocumentIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Bons de livraison"
          value="4"
          sub="Ce mois-ci"
          icon={<TruckIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Montant total"
          value="8 360,50 €"
          sub="Factures du mois"
          icon={<EuroIcon className="w-4 h-4" />}
        />
        <StatCard
          label="BL non rattachés"
          value="1"
          sub="À vérifier"
          icon={<ChartIcon className="w-4 h-4" />}
        />
      </div>

      {/* Upload */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
              Importer des documents
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Factures et bons de livraison — SYSCO, AMBELYS, TERREAZUR
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-6">
          <UploadZone />
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
              <p className="text-xs text-neutral-400 mt-0.5">Consulter et exporter</p>
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
              <p className="text-xs text-neutral-400 mt-0.5">Consulter et exporter</p>
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
