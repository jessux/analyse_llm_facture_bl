const API_BASE = "/backend";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FournisseurKey = "SYSCO" | "AMBELYS" | "TERREAZUR";
export const FOURNISSEURS: FournisseurKey[] = ["SYSCO", "AMBELYS", "TERREAZUR"];

export interface Facture {
  numero_facture: string | null;
  nom_fournisseur: FournisseurKey | null;
  date_emission: string | null;
  date_paiement_prevue: string | null;
  // Bases HT (éditables)
  prix_HT_5_5pct: number | null;
  prix_HT_10pct: number | null;
  prix_HT_20pct: number | null;
  // Dérivés calculés côté serveur
  montant_total: number | null;
  tva_5_5pct: number | null;
  tva_10pct: number | null;
  tva_20pct: number | null;
  total_tva: number | null;
  montant_ttc: number | null;
  verif_tva_5_5: string;
  verif_tva_10: string;
  verif_tva_20: string;
  bons_livraisons: string[];
  fichier_source: string;
  fichier_stocke: string | null;
}

export interface BonLivraison {
  numero_bon_livraison: string | null;
  nom_fournisseur: FournisseurKey | null;
  date_livraison: string | null;
  // Bases HT (éditables)
  prix_HT_5_5pct: number | null;
  prix_HT_10pct: number | null;
  prix_HT_20pct: number | null;
  // Dérivés calculés côté serveur
  montant_total: number | null;
  tva_5_5pct: number | null;
  tva_10pct: number | null;
  tva_20pct: number | null;
  total_tva: number | null;
  montant_ttc: number | null;
  verif_tva_5_5: string;
  verif_tva_10: string;
  verif_tva_20: string;
  numero_facture_rattachee: string | null;
  fichier_source: string;
  fichier_stocke: string | null;
}

export function getPdfUrl(fichierStocke: string): string {
  return `${API_BASE}/api/documents/${encodeURIComponent(fichierStocke)}`;
}

export interface Stats {
  nb_factures: number;
  nb_bons: number;
  montant_total: number;
  bl_non_rattaches: number;
}

export interface UploadResult {
  traites: number;
  created: { factures: number; bons: number };
  updated: { factures: number; bons: number };
  rejetes: { fichier: string; type: string; raison: string }[];
  erreurs: { fichier: string; erreur: string }[];
  // rétrocompat
  factures: number;
  bons: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`[${res.status}] ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function uploadDocuments(files: File[]): Promise<UploadResult> {
  const form = new FormData();
  for (const file of files) {
    form.append("files", file);
  }
  return apiFetch<UploadResult>("/api/upload", {
    method: "POST",
    body: form,
  });
}

export async function fetchFactures(): Promise<Facture[]> {
  return apiFetch<Facture[]>("/api/factures");
}

export async function fetchBonsLivraison(): Promise<BonLivraison[]> {
  return apiFetch<BonLivraison[]>("/api/bons-livraison");
}

export async function fetchStats(): Promise<Stats> {
  return apiFetch<Stats>("/api/stats");
}

export function getTresorerieDownloadUrl(): string {
  return `${API_BASE}/api/export/tresorerie/download`;
}

export async function resetStore(): Promise<void> {
  await apiFetch("/api/reset", { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Fournisseurs
// ---------------------------------------------------------------------------

export interface Fournisseur {
  id: string;
  nom_affiche: string;
  patterns: string[];
}

export async function fetchFournisseurs(): Promise<Fournisseur[]> {
  return apiFetch<Fournisseur[]>("/api/fournisseurs");
}

export async function createFournisseur(body: {
  id: string;
  nom_affiche: string;
  patterns: string[];
}): Promise<Fournisseur> {
  return apiFetch<Fournisseur>("/api/fournisseurs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateFournisseur(
  id: string,
  body: { nom_affiche?: string; patterns?: string[] }
): Promise<Fournisseur> {
  return apiFetch<Fournisseur>(`/api/fournisseurs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteFournisseur(id: string): Promise<void> {
  await apiFetch(`/api/fournisseurs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface ExportTresorerieResult {
  lignes_inserees: number;
  fichier: string;
  message: string;
}

export async function exportTresorerie(): Promise<ExportTresorerieResult> {
  return apiFetch<ExportTresorerieResult>("/api/export/tresorerie", {
    method: "POST",
  });
}

export async function rattacherBLaFacture(
  numeroFacture: string,
  numeroBL: string
): Promise<{ facture: Facture; bon: BonLivraison }> {
  return apiFetch(`/api/factures/${encodeURIComponent(numeroFacture)}/rattacher`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numero_bon_livraison: numeroBL }),
  });
}

export async function rattacherFactureaBL(
  numeroBL: string,
  numeroFacture: string
): Promise<{ bon: BonLivraison; facture: Facture }> {
  return apiFetch(`/api/bons-livraison/${encodeURIComponent(numeroBL)}/rattacher`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ numero_facture: numeroFacture }),
  });
}

export type PatchFacturePayload = Partial<Pick<Facture,
  "date_emission" | "date_paiement_prevue" |
  "prix_HT_5_5pct" | "prix_HT_10pct" | "prix_HT_20pct" |
  "numero_facture" | "nom_fournisseur"
>>;

export type PatchBonPayload = Partial<Pick<BonLivraison,
  "date_livraison" |
  "prix_HT_5_5pct" | "prix_HT_10pct" | "prix_HT_20pct" |
  "numero_bon_livraison" | "nom_fournisseur"
>>;

export async function patchFacture(
  numeroFacture: string,
  payload: PatchFacturePayload
): Promise<Facture> {
  return apiFetch<Facture>(`/api/factures/${encodeURIComponent(numeroFacture)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function patchBon(
  numeroBL: string,
  payload: PatchBonPayload
): Promise<BonLivraison> {
  return apiFetch<BonLivraison>(`/api/bons-livraison/${encodeURIComponent(numeroBL)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function supprimerRattachement(
  numeroFacture: string,
  numeroBL: string
): Promise<void> {
  await apiFetch(
    `/api/factures/${encodeURIComponent(numeroFacture)}/rattacher/${encodeURIComponent(numeroBL)}`,
    { method: "DELETE" }
  );
}
