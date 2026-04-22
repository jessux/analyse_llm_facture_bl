"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { SpinnerIcon, CheckIcon, XIcon } from "./Icons";

type FieldType = "date" | "number" | "text" | "select";

interface EditableCellProps {
  /** Valeur actuelle (string ISO pour les dates, number pour les montants) */
  value: string | number | null;
  type: FieldType;
  /** Options pour le type "select" */
  options?: string[];
  /** Appelé avec la nouvelle valeur string (dates en ISO, nombres en string) */
  onSave: (newValue: string) => Promise<void>;
  /** Formatage pour l'affichage en mode lecture */
  renderValue?: (v: string | number | null) => React.ReactNode;
  className?: string;
  /** Indique si la cellule est en surbrillance (échéance dépassée, etc.) */
  highlight?: string;
}

export default function EditableCell({
  value,
  type,
  options = [],
  onSave,
  renderValue,
  className = "",
  highlight,
}: EditableCellProps) {
  const [editing, setEditing]   = useState(false);
  const [draft, setDraft]       = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  // Convertit la valeur courante en string pour l'input
  const toInputValue = useCallback((v: string | number | null): string => {
    if (v === null || v === undefined) return "";
    if (type === "date") {
      // Accepte "2024-03-01" ou "01/03/2024"
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      return s;
    }
    return String(v);
  }, [type]);

  const startEditing = () => {
    setDraft(toInputValue(value));
    setError(null);
    setEditing(true);
  };

  // Focus auto dès que l'input apparaît
  useEffect(() => {
    if (editing) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [editing]);

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const commit = async () => {
    const trimmed = draft.trim();

    // Validation locale
    if (type === "date" && trimmed) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        setError("Format attendu : YYYY-MM-DD");
        return;
      }
    }
    if (type === "number" && trimmed) {
      if (isNaN(Number(trimmed.replace(",", ".")))) {
        setError("Valeur numérique invalide");
        return;
      }
    }

    // Pas de changement → on ferme sans appel API
    if (trimmed === toInputValue(value)) {
      setEditing(false);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Pour les nombres, on normalise la virgule en point
      const normalized = type === "number"
        ? String(parseFloat(trimmed.replace(",", ".")))
        : trimmed;
      await onSave(normalized);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  };

  // --- Mode lecture ---
  if (!editing) {
    return (
      <div
        onDoubleClick={startEditing}
        title="Double-cliquez pour modifier"
        className={`group relative cursor-pointer select-none rounded px-1 -mx-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors ${className}`}
      >
        <span className={highlight ?? ""}>
          {renderValue ? renderValue(value) : (value ?? <span className="text-neutral-400">—</span>)}
        </span>
        {/* Indicateur discret au survol */}
        <span className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg className="w-3 h-3 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </span>
      </div>
    );
  }

  // --- Mode édition ---
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {type === "select" ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className="rounded border border-neutral-900 dark:border-white bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
          >
            <option value="">—</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type === "date" ? "date" : type === "number" ? "number" : "text"}
            step={type === "number" ? "0.01" : undefined}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className={`rounded border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm px-2 py-1 focus:outline-none focus:ring-2 transition
              ${error
                ? "border-red-400 focus:ring-red-400"
                : "border-neutral-900 dark:border-white focus:ring-neutral-900 dark:focus:ring-white"
              }
              ${type === "number" ? "w-28 font-mono" : type === "date" ? "w-36" : "w-36"}
            `}
          />
        )}

        {saving ? (
          <SpinnerIcon className="w-4 h-4 text-neutral-400 animate-spin flex-shrink-0" />
        ) : (
          <>
            <button
              onMouseDown={(e) => { e.preventDefault(); commit(); }}
              className="flex items-center justify-center w-6 h-6 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 transition-colors flex-shrink-0"
              title="Valider (Entrée)"
            >
              <CheckIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); cancel(); }}
              className="flex items-center justify-center w-6 h-6 rounded text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors flex-shrink-0"
              title="Annuler (Échap)"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Message d'erreur inline */}
      {error && (
        <p className="text-xs text-red-500 dark:text-red-400 pl-1">{error}</p>
      )}
    </div>
  );
}
