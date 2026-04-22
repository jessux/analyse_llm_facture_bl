"use client";

import { useEffect, useState } from "react";
import { XIcon, DownloadIcon, SpinnerIcon } from "./Icons";

interface ModalPDFProps {
  url: string;
  titre: string;
  onClose: () => void;
}

export default function ModalPDF({ url, titre, onClose }: ModalPDFProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);

  // Fermeture sur Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Empêche le scroll du body pendant que le modal est ouvert
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal plein écran */}
      <div className="fixed inset-0 z-50 flex flex-col m-4 md:m-8 rounded-2xl overflow-hidden shadow-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Icône PDF */}
            <div className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-red-50 dark:bg-red-950">
              <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200 truncate">
              {titre}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Télécharger */}
            <a
              href={url}
              download={titre}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              Télécharger
            </a>
            {/* Fermer */}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label="Fermer"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewer */}
        <div className="relative flex-1 bg-neutral-100 dark:bg-neutral-950">
          {/* Spinner pendant le chargement */}
          {!loaded && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <SpinnerIcon className="w-6 h-6 animate-spin" />
              <span className="text-sm">Chargement du document…</span>
            </div>
          )}

          {/* Erreur */}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-neutral-400">
              <svg className="w-12 h-12 text-neutral-300 dark:text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Impossible d&apos;afficher ce document.
              </p>
              <a
                href={url}
                download={titre}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-200 transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                Télécharger à la place
              </a>
            </div>
          )}

          {/* iframe PDF */}
          <iframe
            src={`${url}#toolbar=1&navpanes=0&scrollbar=1`}
            className={`w-full h-full border-0 transition-opacity duration-300 ${loaded && !error ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setLoaded(true)}
            onError={() => { setError(true); setLoaded(true); }}
            title={titre}
          />
        </div>
      </div>
    </>
  );
}
