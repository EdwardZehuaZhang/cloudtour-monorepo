"use client";

import Link from "next/link";
import { Monitor } from "lucide-react";

export function MobileEditorNotice() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center md:hidden">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface)]">
        <Monitor size={24} className="text-[var(--brand)]" />
      </div>

      <h1 className="font-display text-xl font-semibold text-[var(--text-primary)]">
        Desktop Required
      </h1>

      <p className="mt-2 max-w-sm text-sm text-[var(--text-secondary)]">
        The tour editor is a desktop experience. Please open this page on a
        device with a larger screen to edit your tour.
      </p>

      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition-colors duration-fast hover:bg-[var(--brand-light)]"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
