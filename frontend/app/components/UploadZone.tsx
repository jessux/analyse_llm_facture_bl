"use client";

import { useCallback, useState } from "react";
import { UploadIcon, SpinnerIcon, CheckIcon, XIcon } from "./Icons";
import { uploadDocuments, patchFacture, patchBon, type UploadResult, type Facture, type BonLivraison } from "@/lib/api";

type UploadStatus = "idle" | "dragging" | "uploading" | "success" | "error";

interface UploadedFile {
  file: File;
  status: "pending" | "processing" | "done" | "updated" | "rejected" | "error";
}

interface UploadZoneProps {
  onSuccess?: () => void;
}

export default function UploadZone({ onSuccess }: UploadZoneProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [showRecapModal, setShowRecapModal] = useState(false);

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      setErrorMsg("Seuls les fichiers PDF sont acceptés.");
      setStatus("error");
      return;
    }
    setErrorMsg("");
    setResult(null);
    setShowRecapModal(false);
    setStatus("idle");
    setFiles((prev) => [
      ...prev,
      ...pdfs.map((f) => ({ file: f, status: "pending" as const })),
    ]);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setStatus("idle");
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const handleLaunch = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setResult(null);
    setFiles((prev) => prev.map((f) => ({ ...f, status: "processing" })));

    try {
      const res = await uploadDocuments(files.map((f) => f.file));
      setResult(res);
      const errorFiles    = new Set(res.erreurs.map((e) => e.fichier));
      const rejectedFiles = new Set(res.rejetes?.map((r) => r.fichier) ?? []);
      // Fichiers mis à jour : on lit res.records qui contient action + fichier_stocke
      const updatedFiles  = new Set(
        (res.records ?? [])
          .filter((r) => r.action === "updated" && (r.data as Facture | BonLivraison).fichier_stocke)
          .map((r) => (r.data as Facture | BonLivraison).fichier_stocke as string)
      );
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: errorFiles.has(f.file.name)
            ? "error"
            : rejectedFiles.has(f.file.name)
            ? "rejected"
            : updatedFiles.has(f.file.name)
            ? "updated"
            : "done",
        }))
      );
      setStatus("success");
      setShowRecapModal(true);
      onSuccess?.();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erreur inconnue.");
      setStatus("error");
      setFiles((prev) => prev.map((f) => ({ ...f, status: "error" })));
    }
  };

  const handleReset = () => {
    setFiles([]);
    setStatus("idle");
    setErrorMsg("");
    setResult(null);
    setShowRecapModal(false);
  };

  const closeRecapModal = () => setShowRecapModal(false);

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setStatus("dragging"); }}
        onDragLeave={() => setStatus((s) => s === "dragging" ? "idle" : s)}
        className={`relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-8 py-14 text-center transition-colors cursor-pointer
          ${
            status === "dragging"
              ? "border-neutral-900 bg-neutral-50 dark:border-white dark:bg-neutral-800"
              : "border-neutral-300 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900"
          }`}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800">
          <UploadIcon className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Glissez vos fichiers PDF ici
          </p>
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
            ou cliquez pour sélectionner — factures & bons de livraison
          </p>
        </div>
        <span className="text-xs text-neutral-400 dark:text-neutral-600 border border-neutral-200 dark:border-neutral-700 rounded-md px-2 py-1">
          PDF uniquement
        </span>
      </div>

      {/* Error */}
      {status === "error" && errorMsg && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3">
          <XIcon className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-400">{errorMsg}</p>
        </div>
      )}

      {/* Résultat succès */}
      {status === "success" && result && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
          <div className="flex items-start gap-2">
            <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-emerald-700 dark:text-emerald-400">
              <p className="font-medium">
                {result.traites} document{result.traites > 1 ? "s" : ""} traité{result.traites > 1 ? "s" : ""}
              </p>
              <p className="text-xs mt-0.5 opacity-90">
                Consultez le récapitulatif détaillé pour vérifier les imports, rejets et erreurs.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRecapModal(true)}
            className="flex-shrink-0 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Voir le récapitulatif
          </button>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {files.map((item, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-md bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                    <svg className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
                      {item.file.name}
                    </p>
                    <p className="text-xs text-neutral-400">{formatSize(item.file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.status === "processing" && (
                    <SpinnerIcon className="w-4 h-4 text-neutral-400 animate-spin" />
                  )}
                  {item.status === "done" && (
                    <span className="flex items-center gap-1">
                      <CheckIcon className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-emerald-600 dark:text-emerald-400">Importé</span>
                    </span>
                  )}
                  {item.status === "updated" && (
                    <span className="flex items-center gap-1">
                      <span className="text-blue-500 text-sm font-bold">↻</span>
                      <span className="text-xs text-blue-600 dark:text-blue-400">Mis à jour</span>
                    </span>
                  )}
                  {item.status === "rejected" && (
                    <span className="flex items-center gap-1">
                      <span className="text-amber-500 text-sm">⚠</span>
                      <span className="text-xs text-amber-600 dark:text-amber-400">Rejeté</span>
                    </span>
                  )}
                  {item.status === "error" && (
                    <span className="flex items-center gap-1">
                      <XIcon className="w-4 h-4 text-red-500" />
                      <span className="text-xs text-red-600 dark:text-red-400">Erreur</span>
                    </span>
                  )}
                  {item.status === "pending" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                    >
                      <XIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={handleReset}
              disabled={status === "uploading"}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors disabled:opacity-40"
            >
              Tout effacer
            </button>
            <button
              onClick={handleLaunch}
              disabled={status === "uploading" || status === "success"}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "uploading" ? (
                <>
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                  Analyse en cours…
                </>
              ) : status === "success" ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Analyse terminée
                </>
              ) : (
                "Lancer l'analyse"
              )}
            </button>
          </div>
        </div>
      )}

      {showRecapModal && result && (
        <RecapModal
          result={result}
          files={files}
          onClose={closeRecapModal}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Composant RecapModal
// ---------------------------------------------------------------------------

interface RecapModalProps {
  result: UploadResult;
  files: { file: File; status: string }[];
  onClose: () => void;
}

type EditState = Record<string, Record<string, string>>;

function fmtMontant(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function RecapModal({ result, files, onClose }: RecapModalProps) {
  // editState[recordKey][field] = valeur temporaire en cours d'édition
  const [editState, setEditState] = useState<EditState>({});
  // savingState[recordKey][field] = true quand un PATCH est en cours
  const [savingState, setSavingState] = useState<Record<string, Record<string, boolean>>>({});
  // localRecords : copie locale des records pour refléter les sauvegardes sans recharger
  const [localRecords, setLocalRecords] = useState(result.records ?? []);

  const recordKey = (r: typeof localRecords[0]) =>
    r.type === "facture"
      ? (r.data as Facture).numero_facture ?? String(Math.random())
      : (r.data as BonLivraison).numero_bon_livraison ?? String(Math.random());

  const getEdit = (key: string, field: string, fallback: string) =>
    editState[key]?.[field] ?? fallback;

  const setField = (key: string, field: string, value: string) =>
    setEditState((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [field]: value } }));

  const clearField = (key: string, field: string) =>
    setEditState((prev) => {
      const copy = { ...(prev[key] ?? {}) };
      delete copy[field];
      return { ...prev, [key]: copy };
    });

  const saveField = async (
    rec: typeof localRecords[0],
    field: string,
    value: string
  ) => {
    const key = recordKey(rec);
    setSavingState((p) => ({ ...p, [key]: { ...(p[key] ?? {}), [field]: true } }));
    try {
      const isNum = field.startsWith("prix_") || field === "montant_ttc" || field === "montant_total";
      const payload: Record<string, string | number | null> = {
        [field]: isNum ? (value === "" ? null : parseFloat(value)) : (value === "" ? null : value),
      };
      if (rec.type === "facture") {
        const updated = await patchFacture((rec.data as Facture).numero_facture!, payload as never);
        setLocalRecords((prev) =>
          prev.map((r) => (recordKey(r) === key ? { ...r, data: updated } : r))
        );
      } else {
        const updated = await patchBon((rec.data as BonLivraison).numero_bon_livraison!, payload as never);
        setLocalRecords((prev) =>
          prev.map((r) => (recordKey(r) === key ? { ...r, data: updated } : r))
        );
      }
      clearField(key, field);
    } catch {
      // laisse l'état d'édition en place si erreur
    } finally {
      setSavingState((p) => ({ ...p, [key]: { ...(p[key] ?? {}), [field]: false } }));
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
            <div>
              <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                Récapitulatif de l&apos;import
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Vérifiez et corrigez les données extraites avant de confirmer.
              </p>
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors">
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 overflow-y-auto flex flex-col gap-5">

            {/* Compteurs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-3">
                <p className="text-xs text-emerald-700 dark:text-emerald-300">Traités</p>
                <p className="text-xl font-semibold text-emerald-700 dark:text-emerald-300">{result.traites}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3">
                <p className="text-xs text-neutral-600 dark:text-neutral-300">Nouveaux</p>
                <p className="text-xl font-semibold text-neutral-900 dark:text-white">{result.created.factures + result.created.bons}</p>
              </div>
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-3">
                <p className="text-xs text-blue-700 dark:text-blue-300">Mis à jour</p>
                <p className="text-xl font-semibold text-blue-700 dark:text-blue-300">{result.updated.factures + result.updated.bons}</p>
              </div>
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-3">
                <p className="text-xs text-red-700 dark:text-red-300">Erreurs</p>
                <p className="text-xl font-semibold text-red-700 dark:text-red-300">{result.erreurs.length}</p>
              </div>
            </div>

            {/* Rejets */}
            {result.rejetes.length > 0 && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Documents rejetés ({result.rejetes.length})</p>
                <ul className="space-y-1">
                  {result.rejetes.map((r, i) => (
                    <li key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <span className="font-mono truncate">{r.fichier}</span>
                      <span className="opacity-60">·</span>
                      <span>{r.raison}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Erreurs */}
            {result.erreurs.length > 0 && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
                <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">Erreurs ({result.erreurs.length})</p>
                <ul className="space-y-1">
                  {result.erreurs.map((e, i) => (
                    <li key={i} className="text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                      <span className="font-mono truncate">{e.fichier}</span>
                      <span className="opacity-60">·</span>
                      <span>{e.erreur}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Cartes des données extraites */}
            {localRecords.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                  Données extraites — cliquez sur un champ pour le corriger
                </p>
                {localRecords.map((rec, idx) => {
                  const key = recordKey(rec);
                  const isFacture = rec.type === "facture";
                  const f = rec.data as Facture;
                  const b = rec.data as BonLivraison;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border px-5 py-4 flex flex-col gap-3 ${
                        rec.action === "created"
                          ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : "border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/20"
                      }`}
                    >
                      {/* En-tête de carte */}
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                          isFacture
                            ? "bg-neutral-100 text-neutral-700 ring-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-600"
                            : "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800"
                        }`}>
                          {isFacture ? "Facture" : "Bon de livraison"}
                        </span>
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          rec.action === "created"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800"
                            : "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800"
                        }`}>
                          {rec.action === "created" ? "Nouveau" : "Mis à jour"}
                        </span>
                        <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 truncate">
                          {isFacture ? f.fichier_source : b.fichier_source}
                        </span>
                      </div>

                      {/* Grille des champs */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
                        {isFacture ? (
                          <>
                            <RecapField
                              label="N° Facture"
                              field="numero_facture"
                              value={f.numero_facture ?? ""}
                              editVal={getEdit(key, "numero_facture", f.numero_facture ?? "")}
                              saving={savingState[key]?.numero_facture}
                              onEdit={(v) => setField(key, "numero_facture", v)}
                              onSave={(v) => saveField(rec, "numero_facture", v)}
                            />
                            <RecapField
                              label="Fournisseur"
                              field="nom_fournisseur"
                              value={f.nom_fournisseur ?? ""}
                              editVal={getEdit(key, "nom_fournisseur", f.nom_fournisseur ?? "")}
                              saving={savingState[key]?.nom_fournisseur}
                              onEdit={(v) => setField(key, "nom_fournisseur", v)}
                              onSave={(v) => saveField(rec, "nom_fournisseur", v)}
                            />
                            <RecapField
                              label="Date émission"
                              field="date_emission"
                              value={f.date_emission ?? ""}
                              editVal={getEdit(key, "date_emission", f.date_emission ?? "")}
                              saving={savingState[key]?.date_emission}
                              inputType="date"
                              onEdit={(v) => setField(key, "date_emission", v)}
                              onSave={(v) => saveField(rec, "date_emission", v)}
                            />
                            <RecapField
                              label="Échéance"
                              field="date_paiement_prevue"
                              value={f.date_paiement_prevue ?? ""}
                              editVal={getEdit(key, "date_paiement_prevue", f.date_paiement_prevue ?? "")}
                              saving={savingState[key]?.date_paiement_prevue}
                              inputType="date"
                              onEdit={(v) => setField(key, "date_paiement_prevue", v)}
                              onSave={(v) => saveField(rec, "date_paiement_prevue", v)}
                            />
                            <RecapField
                              label="Conditions paiement"
                              field="conditions_paiement"
                              value={f.conditions_paiement ?? ""}
                              editVal={getEdit(key, "conditions_paiement", f.conditions_paiement ?? "")}
                              saving={savingState[key]?.conditions_paiement}
                              onEdit={(v) => setField(key, "conditions_paiement", v)}
                              onSave={(v) => saveField(rec, "conditions_paiement", v)}
                            />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Montant TTC</span>
                              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 font-mono">
                                {fmtMontant(f.montant_ttc)} €
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <RecapField
                              label="N° BL"
                              field="numero_bon_livraison"
                              value={b.numero_bon_livraison ?? ""}
                              editVal={getEdit(key, "numero_bon_livraison", b.numero_bon_livraison ?? "")}
                              saving={savingState[key]?.numero_bon_livraison}
                              onEdit={(v) => setField(key, "numero_bon_livraison", v)}
                              onSave={(v) => saveField(rec, "numero_bon_livraison", v)}
                            />
                            <RecapField
                              label="Fournisseur"
                              field="nom_fournisseur"
                              value={b.nom_fournisseur ?? ""}
                              editVal={getEdit(key, "nom_fournisseur", b.nom_fournisseur ?? "")}
                              saving={savingState[key]?.nom_fournisseur}
                              onEdit={(v) => setField(key, "nom_fournisseur", v)}
                              onSave={(v) => saveField(rec, "nom_fournisseur", v)}
                            />
                            <RecapField
                              label="Date livraison"
                              field="date_livraison"
                              value={b.date_livraison ?? ""}
                              editVal={getEdit(key, "date_livraison", b.date_livraison ?? "")}
                              saving={savingState[key]?.date_livraison}
                              inputType="date"
                              onEdit={(v) => setField(key, "date_livraison", v)}
                              onSave={(v) => saveField(rec, "date_livraison", v)}
                            />
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Montant TTC</span>
                              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 font-mono">
                                {fmtMontant(b.montant_ttc)} €
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Facture rattachée</span>
                              <span className="text-sm font-mono text-neutral-700 dark:text-neutral-200">
                                {b.numero_facture_rattachee ?? <span className="text-neutral-400 font-sans">—</span>}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Ligne TVA résumée */}
                      {isFacture && (
                        <div className="flex flex-wrap gap-3 pt-1 border-t border-neutral-200/60 dark:border-neutral-700/40">
                          <TvaChip label="HT 5,5%" ht={f.prix_HT_5_5pct} tva={f.tva_5_5pct} verif={f.verif_tva_5_5} />
                          <TvaChip label="HT 10%" ht={f.prix_HT_10pct} tva={f.tva_10pct} verif={f.verif_tva_10} />
                          <TvaChip label="HT 20%" ht={f.prix_HT_20pct} tva={f.tva_20pct} verif={f.verif_tva_20} />
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-medium">Tot HT :</span>
                            <span className="font-mono">{fmtMontant(f.montant_total)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                            <span className="font-medium">Tot TVA :</span>
                            <span className="font-mono">{fmtMontant(f.total_tva)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
            >
              Confirmer &amp; fermer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// RecapField : champ éditable inline dans la modale
// ---------------------------------------------------------------------------

interface RecapFieldProps {
  label: string;
  field: string;
  value: string;
  editVal: string;
  saving?: boolean;
  inputType?: string;
  onEdit: (v: string) => void;
  onSave: (v: string) => void;
}

function RecapField({ label, value, editVal, saving, inputType = "text", onEdit, onSave }: RecapFieldProps) {
  const isDirty = editVal !== value;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type={inputType}
          value={editVal}
          onChange={(e) => onEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSave(editVal);
            if (e.key === "Escape") onEdit(value);
          }}
          onBlur={() => { if (isDirty) onSave(editVal); }}
          className={`w-full rounded-md border px-2 py-1 text-xs font-mono transition-colors focus:outline-none focus:ring-1 ${
            isDirty
              ? "border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/40 focus:ring-amber-400 text-amber-900 dark:text-amber-200"
              : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 focus:ring-neutral-400 text-neutral-800 dark:text-neutral-200"
          }`}
        />
        {saving && <SpinnerIcon className="w-3.5 h-3.5 text-neutral-400 animate-spin flex-shrink-0" />}
        {!saving && isDirty && (
          <span className="w-3.5 h-3.5 rounded-full bg-amber-400 flex-shrink-0" title="Modification non sauvegardée" />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TvaChip
// ---------------------------------------------------------------------------

function TvaChip({ label, ht, tva, verif }: { label: string; ht: number | null; tva: number | null; verif: string }) {
  if (ht === null && tva === null) return null;
  const ok = verif === "OK";
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${ok ? "bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"}`}>
      <span className="font-medium">{label}</span>
      <span className="font-mono">{fmtMontant(ht)}</span>
      <span className="opacity-60">/</span>
      <span className="font-mono">{fmtMontant(tva)}</span>
      <span>{ok ? "✓" : "⚠"}</span>
    </span>
  );
}
