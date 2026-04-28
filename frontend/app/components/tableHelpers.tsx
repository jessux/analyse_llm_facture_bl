/**
 * Helpers partagés entre TableauFactures et TableauBonsLivraison.
 */

export function formatDate(d: string | null): React.ReactNode {
  if (!d) return <span className="text-neutral-400">—</span>;
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatMontant(
  v: number | null | undefined,
  className?: string
): React.ReactNode {
  if (v === null || v === undefined)
    return <span className="text-neutral-400">—</span>;
  return (
    <span className={`font-mono tabular-nums ${className ?? ""}`}>
      {v.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}

export function verifBadge(
  verif: string,
  amount: number | null
): React.ReactNode {
  if (!verif || amount === null || amount === undefined)
    return <span className="text-neutral-400 font-mono tabular-nums">—</span>;
  const colorAmt =
    verif === "OK"
      ? "text-emerald-700 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";
  const icon =
    verif === "OK" ? (
      <span className="ml-1 text-emerald-600 dark:text-emerald-400 text-xs">✓</span>
    ) : (
      <span
        className="ml-1 text-red-600 dark:text-red-400 text-xs font-bold"
        title="Vérification TVA incorrecte"
      >
        ⚠
      </span>
    );
  return (
    <span className={`font-mono tabular-nums ${colorAmt}`}>
      {amount.toLocaleString("fr-FR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
      {icon}
    </span>
  );
}

export function hasVerifError(record: {
  verif_tva_5_5: string;
  verif_tva_10: string;
  verif_tva_20: string;
}): boolean {
  return (
    record.verif_tva_5_5 === "Erreur" ||
    record.verif_tva_10 === "Erreur" ||
    record.verif_tva_20 === "Erreur"
  );
}
