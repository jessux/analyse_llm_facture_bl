"use client";

interface PaginationProps {
  page: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export default function Pagination({
  page,
  pages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [20, 50, 100],
}: PaginationProps) {
  if (pages <= 0) return null;

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Génère les numéros de pages à afficher (avec ellipsis)
  const pageNumbers: (number | "...")[] = [];
  if (pages <= 7) {
    for (let i = 1; i <= pages; i++) pageNumbers.push(i);
  } else {
    pageNumbers.push(1);
    if (page > 3) pageNumbers.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) {
      pageNumbers.push(i);
    }
    if (page < pages - 2) pageNumbers.push("...");
    pageNumbers.push(pages);
  }

  const btnBase =
    "flex items-center justify-center min-w-[2rem] h-8 px-2 rounded-md text-xs font-medium transition-colors";
  const btnActive =
    "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900";
  const btnInactive =
    "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800";
  const btnDisabled =
    "text-neutral-300 dark:text-neutral-700 cursor-not-allowed";

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-neutral-500 dark:text-neutral-400">
      {/* Infos */}
      <span>
        {total === 0
          ? "Aucun résultat"
          : `${from}–${to} sur ${total} résultat${total > 1 ? "s" : ""}`}
      </span>

      {/* Contrôles */}
      <div className="flex items-center gap-2">
        {/* Sélecteur de limite */}
        {onLimitChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-400">Lignes :</span>
            <select
              value={limit}
              onChange={(e) => {
                onLimitChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-xs text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              {limitOptions.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Bouton précédent */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={`${btnBase} ${page <= 1 ? btnDisabled : btnInactive}`}
          aria-label="Page précédente"
        >
          ‹
        </button>

        {/* Numéros de pages */}
        <div className="flex items-center gap-0.5">
          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1 text-neutral-400">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p as number)}
                className={`${btnBase} ${p === page ? btnActive : btnInactive}`}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </button>
            )
          )}
        </div>

        {/* Bouton suivant */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          className={`${btnBase} ${page >= pages ? btnDisabled : btnInactive}`}
          aria-label="Page suivante"
        >
          ›
        </button>
      </div>
    </div>
  );
}
