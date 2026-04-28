const API_BASE = "/backend";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FournisseurKey = string;
export const FOURNISSEURS: FournisseurKey[] = [];

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
  conditions_paiement?: string | null;
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
  records: Array<{
    type: "facture" | "bon_livraison";
    action: "created" | "updated";
    data: Facture | BonLivraison;
  }>;
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

export interface ExportFullResult {
  message: string;
  fichier: string;
  achats_cons_lignes: number;
  autres_achats_lignes: number;
  domino_jours: number;
  inputs_fournisseurs: number;
  erreurs: string[];
}

export async function exportFull(): Promise<ExportFullResult> {
  return apiFetch<ExportFullResult>("/api/export/full", {
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
  "numero_facture" | "nom_fournisseur" | "conditions_paiement"
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

export async function deleteFacture(numeroFacture: string): Promise<void> {
  await apiFetch(`/api/factures/${encodeURIComponent(numeroFacture)}`, {
    method: "DELETE",
  });
}

export async function deleteBon(numeroBL: string): Promise<void> {
  await apiFetch(`/api/bons-livraison/${encodeURIComponent(numeroBL)}`, {
    method: "DELETE",
  });
}

// ---------------------------------------------------------------------------
// DOMINO — Rapport journalier
// ---------------------------------------------------------------------------

export interface DominoFile {
  filename: string;
  date: string | null;
  imported: boolean;
  imported_at: string | null;
}

export interface DominoData {
  date: string;
  filename: string;
  ca_ttc_matin: number;
  ca_ttc_midi: number;
  ca_ttc_apm: number;
  ca_ttc_soir: number;
  ca_ttc_uber: number;
  ca_ttc_deliveroo: number;
  ca_ttc_total: number;
  tva_total: number;
  tva_55: number;
  tva_10: number;
  especes: number;
  carte_bancaire: number;
  cb_link: number;
  belorder: number;
  uber_eats: number;
  deliveroo_paiement: number;
  total_encaissements: number;
  nb_clients_matin: number;
  nb_clients_midi: number;
  nb_clients_soir: number;
  total_clients: number;
}

export interface DominoImport {
  imported_at: string;
  filename: string;
  data: DominoData;
}

export interface DominoImportResult {
  filename: string;
  date: string | null;
  skipped: boolean;
  xlsm_updated: boolean;
  cells_written: number;
  xlsm_error?: string | null;
  message: string;
  data?: DominoData;
}

export async function fetchDominoFiles(): Promise<DominoFile[]> {
  return apiFetch<DominoFile[]>("/api/domino/files");
}

export async function fetchDominoData(): Promise<DominoImport[]> {
  return apiFetch<DominoImport[]>("/api/domino/data");
}

export async function importDominoFile(
  filename: string,
  overwrite = false
): Promise<DominoImportResult> {
  return apiFetch<DominoImportResult>(
    `/api/domino/import/${encodeURIComponent(filename)}?overwrite=${overwrite}`,
    { method: "POST" }
  );
}

export async function importAllDomino(overwrite = false): Promise<{ message: string; results: DominoImportResult[] }> {
  return apiFetch(`/api/domino/import-all?overwrite=${overwrite}`, { method: "POST" });
}

export interface DominoResyncResult {
  message: string;
  total: number;
  written: number;
  skipped: number;
  errors: Array<{ date?: string; filename?: string; error: string }>;
  fichier: string;
}

export async function resyncDominoXlsm(forceOverwrite = true): Promise<DominoResyncResult> {
  return apiFetch<DominoResyncResult>(
    `/api/domino/resync-xlsm?force_overwrite=${forceOverwrite}`,
    { method: "POST" }
  );
}

export interface DominoResyncStartResult {
  job_id: string;
  status: "running";
  message: string;
}

export interface DominoResyncJobStatus {
  job_id: string;
  status: "running" | "completed" | "failed";
  message: string;
  result?: DominoResyncResult;
  error?: string;
}

export async function startDominoResyncXlsm(forceOverwrite = true): Promise<DominoResyncStartResult> {
  return apiFetch<DominoResyncStartResult>(
    `/api/domino/resync-xlsm/start?force_overwrite=${forceOverwrite}`,
    { method: "POST" }
  );
}

export async function getDominoResyncStatus(jobId: string): Promise<DominoResyncJobStatus> {
  return apiFetch<DominoResyncJobStatus>(`/api/domino/resync-xlsm/status/${encodeURIComponent(jobId)}`);
}

export interface RestoreXlsmResult {
  message: string;
  target: string;
  backup: string;
}

export async function restoreTresorerieLastGood(): Promise<RestoreXlsmResult> {
  return apiFetch<RestoreXlsmResult>("/api/export/tresorerie/restore-lastgood", {
    method: "POST",
  });
}

export interface DominoJsonImportResult {
  message: string;
  mode: "merge" | "replace";
  imported: number;
  total: number;
}

export async function importDominoJson(file: File, mode: "merge" | "replace" = "merge"): Promise<DominoJsonImportResult> {
  const form = new FormData();
  form.append("file", file);
  return apiFetch<DominoJsonImportResult>(`/api/domino/import-json?mode=${mode}`, {
    method: "POST",
    body: form,
  });
}

// ---------------------------------------------------------------------------
// Automatisation — tâches planifiées
// ---------------------------------------------------------------------------

export interface AutomationTask {
  id: string;
  label: string;
  description: string;
  interval_seconds: number;
  enabled: boolean;
  is_running: boolean;
  last_start: string | null;
  last_end: string | null;
  last_status: string;
  last_error: string | null;
  run_count: number;
  error_count: number;
  next_run: string | null;
}

export interface AutomationLog {
  timestamp: string;
  task_id: string;
  level: "info" | "warn" | "error";
  message: string;
  details: Record<string, unknown>;
}

export async function fetchAutomationTasks(): Promise<AutomationTask[]> {
  return apiFetch<AutomationTask[]>("/api/automation/tasks");
}

export async function fetchAutomationLogs(taskId?: string, limit = 200): Promise<AutomationLog[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (taskId) params.set("task_id", taskId);
  return apiFetch<AutomationLog[]>(`/api/automation/logs?${params.toString()}`);
}

export async function startAutomationTask(taskId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/automation/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST" });
}

export async function stopAutomationTask(taskId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/automation/tasks/${encodeURIComponent(taskId)}/stop`, { method: "POST" });
}

export async function runAutomationTaskNow(taskId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/automation/tasks/${encodeURIComponent(taskId)}/run-now`, { method: "POST" });
}
