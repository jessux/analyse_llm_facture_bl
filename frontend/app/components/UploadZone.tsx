"use client";

import { useCallback, useState } from "react";
import { UploadIcon, SpinnerIcon, CheckIcon, XIcon } from "./Icons";
import { uploadDocuments, type UploadResult } from "@/lib/api";

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
      const updatedFiles  = new Set([
        // on ne peut pas savoir par fichier si c'est updated sans info supplémentaire
        // on marque "updated" si le fichier n'est ni en erreur ni rejeté et qu'il y a des updates
      ]);
      setFiles((prev) =>
        prev.map((f) => ({
          ...f,
          status: errorFiles.has(f.file.name)
            ? "error"
            : rejectedFiles.has(f.file.name)
            ? "rejected"
            : "done",
        }))
      );
      setStatus("success");
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
  };

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
        <div className="flex flex-col gap-2">
          {/* Ligne principale */}
          <div className="flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 px-4 py-3">
            <CheckIcon className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-medium">
                {result.traites} document{result.traites > 1 ? "s" : ""} traité{result.traites > 1 ? "s" : ""}
              </span>
              {result.created.factures + result.created.bons > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  +{result.created.factures + result.created.bons} nouveau{result.created.factures + result.created.bons > 1 ? "x" : ""}
                </span>
              )}
              {result.updated.factures + result.updated.bons > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 dark:bg-blue-900 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  ↻ {result.updated.factures + result.updated.bons} mis à jour
                </span>
              )}
            </div>
          </div>

          {/* Documents rejetés (numéro null) */}
          {result.rejetes?.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                {result.rejetes.length} document{result.rejetes.length > 1 ? "s" : ""} rejeté{result.rejetes.length > 1 ? "s" : ""} — numéro non extrait
              </p>
              <ul className="flex flex-col gap-1">
                {result.rejetes.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-mono truncate">{r.fichier}</span>
                    <span className="text-amber-400 dark:text-amber-600">·</span>
                    <span>{r.raison}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Erreurs techniques */}
          {result.erreurs.length > 0 && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1.5">
                {result.erreurs.length} erreur{result.erreurs.length > 1 ? "s" : ""} technique{result.erreurs.length > 1 ? "s" : ""}
              </p>
              <ul className="flex flex-col gap-1">
                {result.erreurs.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                    <span className="font-mono truncate">{e.fichier}</span>
                    <span className="text-red-400 dark:text-red-600">·</span>
                    <span>{e.erreur}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
    </div>
  );
}
