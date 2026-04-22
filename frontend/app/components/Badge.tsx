type BadgeVariant = "success" | "warning" | "error" | "neutral" | "info";

const variants: Record<BadgeVariant, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800",
  warning: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800",
  error:   "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-400 dark:ring-red-800",
  neutral: "bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700",
  info:    "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800",
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export default function Badge({ label, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${variants[variant]}`}
    >
      {label}
    </span>
  );
}

export function supplierBadge(name: string | null) {
  if (!name) return <Badge label="—" variant="neutral" />;
  // Couleurs fixes pour les fournisseurs historiques, neutral pour les nouveaux
  const map: Record<string, BadgeVariant> = {
    SYSCO: "info",
    AMBELYS: "success",
    TERREAZUR: "warning",
  };
  return <Badge label={name} variant={map[name] ?? "neutral"} />;
}

export function typeBadge(type: string | null) {
  if (!type) return <Badge label="—" variant="neutral" />;
  return type === "facture"
    ? <Badge label="Facture" variant="info" />
    : <Badge label="Bon de livraison" variant="success" />;
}
