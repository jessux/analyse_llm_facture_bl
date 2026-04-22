const API_BASE = "/backend";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Facture {
  numero_facture: string | null;
  nom_fournisseur: "SYSCO" | "AMBELYS" | "TERREAZUR" | null;
  date_emission: string | null;
  date_paiement_prevue: string | null;
  montant_total: number | null;
  prix_HT_5_5pct: number | null;
  prix_HT_10pct: number | null;
  prix_HT_20pct: number | null;
  bons_livraisons: string[];
  fichier_source: string;
}

export interface BonLivraison {
  numero_bon_livraison: string | null;
  nom_fournisseur: "SYSCO" | "AMBELYS" | "TERREAZUR" | null;
  date_livraison: string | null;
  montant_total: number | null;
  numero_facture_rattachee: string | null;
  fichier_source: string;
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

export function getExcelDownloadUrl(): string {
  return `${API_BASE}/api/export/excel`;
}

export async function resetStore(): Promise<void> {
  await apiFetch("/api/reset", { method: "DELETE" });
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

export async function supprimerRattachement(
  numeroFacture: string,
  numeroBL: string
): Promise<void> {
  await apiFetch(
    `/api/factures/${encodeURIComponent(numeroFacture)}/rattacher/${encodeURIComponent(numeroBL)}`,
    { method: "DELETE" }
  );
}
