"use client";

import { useState, useEffect, useRef } from "react";
import { SpinnerIcon, XIcon, CheckIcon } from "./Icons";
import {
  fetchFactures,
  fetchBonsLivraison,
  rattacherBLaFacture,
  rattacherFactureaBL,
  supprimerRattachement,
  type Facture,
  type BonLivraison,
} from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "facture_vers_bl" | "bl_vers_facture";

interface ModalRattachementProps {
  /** Mode "facture_vers_bl" : on part d'une facture et on choisit un BL */
  mode: Mode;
  /** Numéro du document source (facture ou BL selon le mode) */
  numeroSource: string;
  /** BL déjà rattachés (pour le mode facture_vers_bl) */
  blRattaches?: string[];
  /** Facture déjà rattachée (pour le mode bl_vers_facture) */
  factureRattachee?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export default function ModalRattachement({
  mode,
  numeroSource,
  blRattaches = [],
  factureRattachee,
  onClose,
  onSuccess,
}: ModalRattachementProps) {
  const [search, setSearch]     = useState("");
  const [options, setOptions]   = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // On capture les valeurs initiales dans des refs pour éviter
  // que les tableaux/valeurs passés en props re-triggent le useEffect
  const initBlRattaches     = useRef(blRattaches);
  const initFactureRattachee = useRef(factureRattachee);
  const initMode             = useRef(mode);

  // Fermeture sur Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Focus auto sur le champ de recherche
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Chargement des options — une seule fois à l'ouverture du modal
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (initMode.current === "facture_vers_bl") {
          const bons = await fetchBonsLivraison();
          if (cancelled) return;
          setOptions(
            bons
              .map((b) => b.numero_bon_livraison)
              .filter((n): n is string => !!n && !initBlRattaches.current.includes(n))
          );
        } else {
          const factures = await fetchFactures();
          if (cancelled) return;
          setOptions(
            factures
              .map((f) => f.numero_facture)
              .filter((n): n is string => !!n && n !== initFactureRattachee.current)
          );
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? `Erreur : ${e.message}`
              : "Impossible de charger les options."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Cleanup : si le composant est démonté avant la fin, on ignore le résultat
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // [] = une seule fois à l'ouverture

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === "facture_vers_bl") {
        await rattacherBLaFacture(numeroSource, selected);
      } else {
        await rattacherFactureaBL(numeroSource, selected);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du rattachement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDetach = async (numeroBL: string) => {
    setSaving(true);
    setError(null);
    try {
      if (mode === "facture_vers_bl") {
        await supprimerRattachement(numeroSource, numeroBL);
      } else {
        await supprimerRattachement(selected ?? numeroBL, numeroSource);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la suppression.");
    } finally {
      setSaving(false);
    }
  };

  const title = mode === "facture_vers_bl"
    ? `Rattacher un BL à la facture ${numeroSource}`
    : `Rattacher une facture au BL ${numeroSource}`;

  const placeholder = mode === "facture_vers_bl"
    ? "Rechercher un bon de livraison…"
    : "Rechercher une facture…";

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
                {title}
              </h2>
              <p className="mt-0.5 text-xs text-neutral-400">
                {mode === "facture_vers_bl"
                  ? "Sélectionnez un ou plusieurs bons de livraison à associer."
                  : "Sélectionnez la facture à associer à ce bon de livraison."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="flex-shrink-0 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Rattachements existants (mode facture_vers_bl) */}
          {mode === "facture_vers_bl" && blRattaches.length > 0 && (
            <div className="px-6 pt-4">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                BL déjà rattachés
              </p>
              <div className="flex flex-wrap gap-2">
                {blRattaches.map((bl) => (
                  <span
                    key={bl}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                  >
                    {bl}
                    <button
                      onClick={() => handleDetach(bl)}
                      disabled={saving}
                      className="text-neutral-400 hover:text-red-500 transition-colors disabled:opacity-40"
                      title="Supprimer le rattachement"
                    >
                      <XIcon className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Rattachement existant (mode bl_vers_facture) */}
          {mode === "bl_vers_facture" && factureRattachee && (
            <div className="px-6 pt-4">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-2">
                Facture rattachée
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-800">
                {factureRattachee}
                <button
                  onClick={() => handleDetach(numeroSource)}
                  disabled={saving}
                  className="text-blue-400 hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Supprimer le rattachement"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              </span>
            </div>
          )}

          {/* Recherche + liste */}
          <div className="px-6 py-4 flex flex-col gap-3">
            <input
              ref={inputRef}
              type="text"
              placeholder={placeholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
            />

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
                <SpinnerIcon className="w-4 h-4 animate-spin" />
                Chargement…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-400">
                {options.length === 0 ? "Aucun document disponible." : "Aucun résultat."}
              </p>
            ) : (
              <ul className="max-h-52 overflow-y-auto flex flex-col gap-1 -mx-1 px-1">
                {filtered.map((opt) => (
                  <li key={opt}>
                    <button
                      onClick={() => setSelected(opt === selected ? null : opt)}
                      className={`w-full flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm font-mono text-left transition-colors
                        ${selected === opt
                          ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900"
                          : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                        }`}
                    >
                      {opt}
                      {selected === opt && <CheckIcon className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Erreur */}
          {error && (
            <div className="mx-6 mb-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={!selected || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  Enregistrement…
                </>
              ) : (
                "Rattacher"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
