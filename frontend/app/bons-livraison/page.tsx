import TableauBonsLivraison from "@/app/components/TableauBonsLivraison";
import { TruckIcon } from "@/app/components/Icons";
import Link from "next/link";

export default function BonsLivraisonPage() {
  return (
    <main className="w-full max-w-[1920px] mx-auto px-4 py-8 flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-neutral-400">
        <Link href="/" className="hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-neutral-600 dark:text-neutral-300">Bons de livraison</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-neutral-100 dark:bg-neutral-800">
          <TruckIcon className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Bons de livraison
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Liste des bons de livraison extraits
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl px-3 py-4">
        <TableauBonsLivraison />
      </div>
    </main>
  );
}
