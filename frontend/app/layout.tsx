import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/app/components/ThemeProvider";
import Navbar from "@/app/components/Navbar";

export const metadata: Metadata = {
  title: "Marjo — Gestion Factures",
  description: "Analyse automatique de factures et bons de livraison par IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white transition-colors">
        <ThemeProvider>
          <Navbar />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-neutral-200 dark:border-neutral-800 py-4 px-6">
            <p className="text-xs text-center text-neutral-400 dark:text-neutral-600">
              Marjo · Gestion Factures & Bons de livraison
            </p>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
