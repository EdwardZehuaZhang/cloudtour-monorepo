"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--destructive)]/10">
        <AlertTriangle className="h-6 w-6 text-[var(--destructive)]" />
      </div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        Something went wrong
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        We couldn&apos;t load your dashboard. This is usually temporary — try refreshing the page.
      </p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-light)]"
      >
        <RotateCcw className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
