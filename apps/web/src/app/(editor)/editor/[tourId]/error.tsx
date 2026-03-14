"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCcw, ArrowLeft } from "lucide-react";

export default function EditorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Editor error:", error);
  }, [error]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[var(--bg)] px-4 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--destructive)]/10">
        <AlertTriangle className="h-6 w-6 text-[var(--destructive)]" />
      </div>
      <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">
        Editor failed to load
      </h2>
      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">
        There was a problem loading the tour editor. Your work has been saved — try reloading.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-alt)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-light)]"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
