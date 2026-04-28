import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
}

export default function StatCard({ label, value, sub, icon }: StatCardProps) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
          {value}
        </p>
        {sub && (
          <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>
        )}
      </div>
    </div>
  );
}
