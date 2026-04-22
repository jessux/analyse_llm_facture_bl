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
        <>
          <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={closeRecapModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl flex flex-col">
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-100 dark:border-neutral-800">
                <div>
                  <h2 className="text-base font-semibold text-neutral-900 dark:text-white">
                    Récapitulatif de l'import
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Vérifiez les documents importés, rejetés et les éventuelles erreurs.
                  </p>
                </div>
                <button
                  onClick={closeRecapModal}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex flex-col gap-4">
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

                {result.rejetes.length > 0 && (
                  <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">
                      Documents rejetés ({result.rejetes.length})
                    </p>
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

                {result.erreurs.length > 0 && (
                  <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">
                      Erreurs techniques ({result.erreurs.length})
                    </p>
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

                <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
                  <div className="px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    Détail des fichiers sélectionnés
                  </div>
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {files.map((item, i) => (
                      <li key={i} className="px-4 py-2 text-xs flex items-center justify-between gap-3">
                        <span className="font-mono truncate text-neutral-700 dark:text-neutral-200">{item.file.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-medium ${
                            item.status === "done"
                              ? "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300"
                              : item.status === "rejected"
                              ? "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
                              : item.status === "error"
                              ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
                              : "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                          }`}
                        >
                          {item.status === "done"
                            ? "Importé"
                            : item.status === "rejected"
                            ? "Rejeté"
                            : item.status === "error"
                            ? "Erreur"
                            : item.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
                <button
                  onClick={closeRecapModal}
                  className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
