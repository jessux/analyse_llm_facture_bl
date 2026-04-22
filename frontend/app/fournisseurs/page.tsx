"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchFournisseurs,
  createFournisseur,
  updateFournisseur,
  deleteFournisseur,
  type Fournisseur,
} from "@/lib/api";
import { BuildingIcon, PlusIcon, PencilIcon, TrashIcon, SpinnerIcon, CheckIcon, XIcon } from "@/app/components/Icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BADGE_COLORS = [
  "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:ring-blue-800",
  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:ring-emerald-800",
  "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:ring-amber-800",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:ring-violet-800",
  "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-400 dark:ring-rose-800",
  "bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:ring-cyan-800",
];

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

// ---------------------------------------------------------------------------
// Formulaire d'ajout / édition
// ---------------------------------------------------------------------------

interface FormState {
  id: string;
  nom_affiche: string;
  patterns_raw: string; // saisie libre, séparée par virgules
}

const EMPTY_FORM: FormState = { id: "", nom_affiche: "", patterns_raw: "" };

interface FournisseurFormProps {
  initial?: Fournisseur;
  onSave: (data: { id: string; nom_affiche: string; patterns: string[] }) => Promise<void>;
  onCancel: () => void;
  isEdit?: boolean;
}

function FournisseurForm({ initial, onSave, onCancel, isEdit = false }: FournisseurFormProps) {
  const [form, setForm] = useState<FormState>(
    initial
      ? { id: initial.id, nom_affiche: initial.nom_affiche, patterns_raw: initial.patterns.join(", ") }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom_affiche.trim()) { setError("Le nom affiché est obligatoire."); return; }
    if (!isEdit && !form.id.trim()) { setError("L'identifiant est obligatoire."); return; }
    setSaving(true);
    setError(null);
    try {
      const patterns = form.patterns_raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      await onSave({ id: form.id.trim().toUpperCase(), nom_affiche: form.nom_affiche.trim(), patterns });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la sauvegarde.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {!isEdit && (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            Identifiant interne <span className="text-red-500">*</span>
          </label>
          <input
            value={form.id}
            onChange={set("id")}
            placeholder="ex: METRO"
            className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition font-mono uppercase"
          />
          <p className="text-xs text-neutral-400">Majuscules, sans espaces. Utilisé en interne et dans les prompts IA.</p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Nom affiché <span className="text-red-500">*</span>
        </label>
        <input
          value={form.nom_affiche}
          onChange={set("nom_affiche")}
          placeholder="ex: Metro"
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
        />
        <p className="text-xs text-neutral-400">Nom écrit dans la colonne C de l&apos;onglet Achats Cons.</p>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          Mots-clés de détection
        </label>
        <input
          value={form.patterns_raw}
          onChange={set("patterns_raw")}
          placeholder="ex: metro, métro cash"
          className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm text-neutral-800 dark:text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white transition"
        />
        <p className="text-xs text-neutral-400">
          Séparés par des virgules. Utilisés pour reconnaître le fournisseur dans les PDFs.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
        >
          {saving ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
          {isEdit ? "Enregistrer" : "Ajouter"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Carte fournisseur
// ---------------------------------------------------------------------------

interface FournisseurCardProps {
  fournisseur: Fournisseur;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function FournisseurCard({ fournisseur, onEdit, onDelete, deleting }: FournisseurCardProps) {
  const color = colorForId(fournisseur.id);
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-5 py-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className={`flex items-center justify-center w-10 h-10 rounded-lg text-sm font-bold ring-1 ring-inset flex-shrink-0 ${color}`}>
          {fournisseur.nom_affiche.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              {fournisseur.nom_affiche}
            </span>
            <span className="text-xs font-mono text-neutral-400 dark:text-neutral-500 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded">
              {fournisseur.id}
            </span>
          </div>
          {fournisseur.patterns.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {fournisseur.patterns.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-neutral-100 text-neutral-600 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:ring-neutral-700"
                >
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-neutral-400">Aucun mot-clé de détection</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Navigation vers vues filtrées */}
        <a
          href={`/factures?fournisseur=${encodeURIComponent(fournisseur.nom_affiche)}`}
          title="Voir les factures de ce fournisseur"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Factures
        </a>
        <a
          href={`/bons-livraison?fournisseur=${encodeURIComponent(fournisseur.nom_affiche)}`}
          title="Voir les bons de livraison de ce fournisseur"
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors whitespace-nowrap"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          BL
        </a>
        <button
          onClick={onEdit}
          title="Modifier"
          className="flex items-center justify-center w-8 h-8 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        >
          <PencilIcon className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title="Supprimer"
          className="flex items-center justify-center w-8 h-8 rounded-md text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40 transition-colors"
        >
          {deleting ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : <TrashIcon className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function FournisseursPage() {
  const [data, setData]           = useState<Fournisseur[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<Fournisseur | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchFournisseurs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (body: { id: string; nom_affiche: string; patterns: string[] }) => {
    await createFournisseur(body);
    setShowForm(false);
    await load();
  };

  const handleUpdate = async (body: { id: string; nom_affiche: string; patterns: string[] }) => {
    if (!editTarget) return;
    await updateFournisseur(editTarget.id, { nom_affiche: body.nom_affiche, patterns: body.patterns });
    setEditTarget(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteFournisseur(id);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur lors de la suppression.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 flex flex-col gap-8">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Fournisseurs
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Gérez les fournisseurs reconnus par l&apos;IA lors de l&apos;analyse des PDFs.
          </p>
        </div>
        {!showForm && !editTarget && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors flex-shrink-0"
          >
            <PlusIcon className="w-4 h-4" />
            Ajouter
          </button>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showForm && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-6 py-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">
            Nouveau fournisseur
          </h2>
          <FournisseurForm
            onSave={handleCreate}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {/* Erreur suppression */}
      {deleteError && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="ml-4 text-red-400 hover:text-red-600 transition-colors">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Liste */}
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

      {!loading && !error && (
        <div className="flex flex-col gap-3">
          {data.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-neutral-400">
              <BuildingIcon className="w-10 h-10 opacity-30" />
              <p className="text-sm">Aucun fournisseur. Cliquez sur &quot;Ajouter&quot; pour commencer.</p>
            </div>
          ) : (
            data.map((f) =>
              editTarget?.id === f.id ? (
                /* Formulaire d'édition inline */
                <div key={f.id} className="rounded-xl border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-6 py-5">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-white mb-4">
                    Modifier — {f.nom_affiche}
                  </h2>
                  <FournisseurForm
                    initial={f}
                    onSave={handleUpdate}
                    onCancel={() => setEditTarget(null)}
                    isEdit
                  />
                </div>
              ) : (
                <FournisseurCard
                  key={f.id}
                  fournisseur={f}
                  onEdit={() => { setEditTarget(f); setShowForm(false); }}
                  onDelete={() => handleDelete(f.id)}
                  deleting={deletingId === f.id}
                />
              )
            )
          )}
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <p className="text-xs text-neutral-400 dark:text-neutral-600">
          {data.length} fournisseur{data.length > 1 ? "s" : ""}
        </p>
      )}
    </main>
  );
}
