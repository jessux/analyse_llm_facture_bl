"use client";

import { useCallback, useState } from "react";
import { UploadIcon, SpinnerIcon, CheckIcon, XIcon } from "./Icons";

type UploadStatus = "idle" | "dragging" | "uploading" | "success" | "error";

interface UploadedFile {
  name: string;
  size: number;
  status: "pending" | "processing" | "done" | "error";
}

export default function UploadZone() {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const pdfs = Array.from(incoming).filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      setErrorMsg("Seuls les fichiers PDF sont acceptés.");
      setStatus("error");
      return;
    }
    setErrorMsg("");
    const newFiles: UploadedFile[] = pdfs.map((f) => ({
      name: f.name,
      size: f.size,
      status: "pending",
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    setStatus("idle");
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setStatus("idle");
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setStatus("dragging");
  };

  const onDragLeave = () => setStatus("idle");

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const handleLaunch = () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setFiles((prev) => prev.map((f) => ({ ...f, status: "processing" })));

    // Simulation — à remplacer par l'appel API réel
    setTimeout(() => {
      setFiles((prev) => prev.map((f) => ({ ...f, status: "done" })));
      setStatus("success");
    }, 2500);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
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
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
            {files.length} fichier{files.length > 1 ? "s" : ""} sélectionné{files.length > 1 ? "s" : ""}
          </p>
          <ul className="flex flex-col gap-2">
            {files.map((file, i) => (
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
                      {file.name}
                    </p>
                    <p className="text-xs text-neutral-400">{formatSize(file.size)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {file.status === "processing" && (
                    <SpinnerIcon className="w-4 h-4 text-neutral-400 animate-spin" />
                  )}
                  {file.status === "done" && (
                    <CheckIcon className="w-4 h-4 text-emerald-500" />
                  )}
                  {file.status === "error" && (
                    <XIcon className="w-4 h-4 text-red-500" />
                  )}
                  {file.status === "pending" && (
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
              onClick={() => setFiles([])}
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
                  Traitement en cours…
                </>
              ) : status === "success" ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Traitement terminé
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
