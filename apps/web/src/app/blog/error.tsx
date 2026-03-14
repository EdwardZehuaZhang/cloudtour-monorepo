"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function BlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Blog error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center justify-center px-4 py-24 text-center sm:px-6 lg:px-8">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--destructive)]/10">
        <AlertTriangle className="h-6 w-6 text-[var(--destructive)]" />
      </div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        Couldn&apos;t load blog
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        We had trouble loading the blog. Please try again.
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
