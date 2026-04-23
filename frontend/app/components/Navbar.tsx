"use client";

import { useTheme } from "./ThemeProvider";
import { SunIcon, MoonIcon, BuildingIcon } from "./Icons";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <a
        href={href}
        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          active
            ? "text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800"
            : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }`}
      >
        {label}
      </a>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-950/90 backdrop-blur-sm">
      <div className="w-full max-w-[1920px] mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo / Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-900 dark:bg-white">
            <svg
              className="w-4 h-4 text-white dark:text-neutral-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <span className="text-sm font-semibold text-neutral-900 dark:text-white tracking-tight">
              Marjo
            </span>
            <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500 font-medium uppercase tracking-widest">
              Gestion Factures
            </span>
          </div>
        </div>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLink("/", "Dashboard")}
          {navLink("/factures", "Factures")}
          {navLink("/bons-livraison", "Bons de livraison")}
          {navLink("/domino", "DOMINO")}
          {navLink("/automatisation", "Automatisation")}
          <a
            href="/fournisseurs"
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              pathname.startsWith("/fournisseurs")
                ? "text-neutral-900 dark:text-white bg-neutral-100 dark:bg-neutral-800"
                : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            <BuildingIcon className="w-3.5 h-3.5" />
            Fournisseurs
          </a>
        </nav>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Changer le thème"
          className="flex items-center justify-center w-9 h-9 rounded-lg border border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition-colors"
        >
          {theme === "dark" ? (
            <SunIcon className="w-4 h-4" />
          ) : (
            <MoonIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </header>
  );
}
