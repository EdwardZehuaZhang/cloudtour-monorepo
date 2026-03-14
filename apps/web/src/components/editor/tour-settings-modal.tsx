"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@cloudtour/ui";
import { Copy, Check, QrCode, ExternalLink, Upload, X } from "lucide-react";
import type { TourCategory } from "@cloudtour/types";

// ---- Types ------------------------------------------------------------------

export interface TourSettingsData {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  category: TourCategory;
  tags: string[];
  location: string | null;
  cover_image_url: string | null;
}

interface TourSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tour: TourSettingsData;
  canEdit: boolean;
  appUrl: string;
  onSave: (updates: Partial<TourSettingsData>) => void;
}

// ---- Category labels --------------------------------------------------------

const CATEGORY_OPTIONS: { value: TourCategory; label: string }[] = [
  { value: "real_estate", label: "Real Estate" },
  { value: "tourism", label: "Tourism" },
  { value: "museum", label: "Museum" },
  { value: "education", label: "Education" },
  { value: "other", label: "Other" },
];

// ---- Component --------------------------------------------------------------

export function TourSettingsModal({
  open,
  onOpenChange,
  tour,
  canEdit,
  appUrl,
  onSave,
}: TourSettingsModalProps) {
  // Form state — initialize from tour props
  const [title, setTitle] = useState(tour.title);
  const [slug, setSlug] = useState(tour.slug);
  const [description, setDescription] = useState(tour.description ?? "");
  const [category, setCategory] = useState<TourCategory>(tour.category);
  const [tagsInput, setTagsInput] = useState(tour.tags.join(", "));
  const [location, setLocation] = useState(tour.location ?? "");
  const [slugError, setSlugError] = useState<string | null>(null);

  // Sharing
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync form when tour changes (e.g. title updated from header)
  useEffect(() => {
    setTitle(tour.title);
    setSlug(tour.slug);
    setDescription(tour.description ?? "");
    setCategory(tour.category);
    setTagsInput(tour.tags.join(", "));
    setLocation(tour.location ?? "");
    setSlugError(null);
  }, [tour]);

  const publicUrl = `${appUrl}/tours/${slug}`;
  const embedCode = `<iframe src="${publicUrl}?embed=true" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;

  // ---- Handlers -------------------------------------------------------------

  const handleSlugChange = useCallback((value: string) => {
    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-{2,}/g, "-");
    setSlug(cleaned);
    setSlugError(null);
  }, []);

  const handleSave = useCallback(() => {
    // Validate slug
    const trimmedSlug = slug.replace(/^-|-$/g, "");
    if (!trimmedSlug) {
      setSlugError("Slug cannot be empty");
      return;
    }

    // Parse tags
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const updates: Partial<TourSettingsData> = {};
    if (title !== tour.title) updates.title = title;
    if (trimmedSlug !== tour.slug) updates.slug = trimmedSlug;
    if (description !== (tour.description ?? ""))
      updates.description = description || null;
    if (category !== tour.category) updates.category = category;
    if (tagsInput !== tour.tags.join(", ")) updates.tags = tags;
    if (location !== (tour.location ?? ""))
      updates.location = location || null;

    if (Object.keys(updates).length > 0) {
      onSave(updates);
    }
    onOpenChange(false);
  }, [
    title,
    slug,
    description,
    category,
    tagsInput,
    location,
    tour,
    onSave,
    onOpenChange,
  ]);

  const handleCopy = useCallback(
    (text: string, field: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedField(field);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
      });
    },
    [],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tour Settings</DialogTitle>
          <DialogDescription>
            Configure tour metadata, SEO, and sharing options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Metadata Section ─────────────────────────────────── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Metadata
            </h3>

            {/* Title */}
            <div className="space-y-1.5">
              <label
                htmlFor="settings-title"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Title
              </label>
              <input
                id="settings-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label
                htmlFor="settings-description"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Description
              </label>
              <textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canEdit}
                rows={3}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60"
              />
            </div>

            {/* Category + Location row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="settings-category"
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Category
                </label>
                <select
                  id="settings-category"
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as TourCategory)
                  }
                  disabled={!canEdit}
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60"
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="settings-location"
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Location
                </label>
                <input
                  id="settings-location"
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={!canEdit}
                  placeholder="e.g. Bangkok, Thailand"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60"
                />
              </div>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label
                htmlFor="settings-tags"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Tags
              </label>
              <input
                id="settings-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                disabled={!canEdit}
                placeholder="architecture, interior, modern (comma-separated)"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60"
              />
              <p className="text-[11px] text-[var(--text-secondary)]">
                Comma-separated, max 20 tags
              </p>
            </div>

            {/* Cover Image */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Cover Image
              </label>
              {tour.cover_image_url ? (
                <div className="relative overflow-hidden rounded-md border border-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tour.cover_image_url}
                    alt="Tour cover"
                    className="h-32 w-full object-cover"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onSave({ cover_image_url: null })}
                      className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
                      aria-label="Remove cover image"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center rounded-md border-2 border-dashed border-[var(--border)] text-[var(--text-secondary)]">
                  <div className="flex flex-col items-center gap-1 text-xs">
                    <Upload size={16} />
                    <span>Cover image upload coming soon</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── SEO Section ──────────────────────────────────────── */}
          <section className="space-y-4 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              SEO &amp; URL
            </h3>

            <div className="space-y-1.5">
              <label
                htmlFor="settings-slug"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                URL Slug
              </label>
              <input
                id="settings-slug"
                type="text"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                disabled={!canEdit}
                className={`w-full rounded-md border bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors duration-fast focus:border-[var(--brand)] disabled:opacity-60 ${
                  slugError
                    ? "border-red-400"
                    : "border-[var(--border)]"
                }`}
              />
              {slugError && (
                <p className="text-xs text-red-500">{slugError}</p>
              )}
              <div className="flex items-center gap-1.5 rounded-md bg-[var(--bg)] px-3 py-2">
                <span className="text-xs text-[var(--text-secondary)]">
                  {appUrl}/tours/
                </span>
                <span className="text-xs font-medium text-[var(--brand)]">
                  {slug || "..."}
                </span>
              </div>
            </div>
          </section>

          {/* ── Sharing Section ──────────────────────────────────── */}
          <section className="space-y-4 border-t border-[var(--border)] pt-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Sharing
            </h3>

            {/* Direct link */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Direct Link
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={publicUrl}
                  readOnly
                  className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(publicUrl, "link")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)]"
                  aria-label="Copy link"
                >
                  {copiedField === "link" ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)]"
                  aria-label="Open in new tab"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            {/* Embed code */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Embed Code
              </label>
              <div className="flex gap-2">
                <textarea
                  value={embedCode}
                  readOnly
                  rows={3}
                  className="flex-1 resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopy(embedCode, "embed")}
                  className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)]"
                  aria-label="Copy embed code"
                >
                  {copiedField === "embed" ? (
                    <Check size={14} className="text-emerald-500" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                QR Code
              </label>
              {showQr ? (
                <div className="flex flex-col items-center gap-3 rounded-md border border-[var(--border)] bg-white p-4">
                  {/* SVG-based QR code — simple representation */}
                  <QrCodeSvg url={publicUrl} />
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Scan to open tour
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowQr(false)}
                    className="text-xs text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                  >
                    Hide QR code
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowQr(true)}
                  className="flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
                >
                  <QrCode size={14} />
                  Generate QR code
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition-colors duration-fast hover:bg-[var(--brand-light)]"
            >
              Save changes
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---- Simple QR code SVG component ------------------------------------------
// Generates a basic QR-code-like pattern using a URL hash for visual representation.
// For production, use a proper QR library — this is a visual placeholder that
// communicates the concept.

function QrCodeSvg({ url }: { url: string }) {
  // Generate a deterministic pattern from the URL
  const hash = simpleHash(url);
  const size = 21; // Standard QR code minimum modules
  const cellSize = 8;
  const svgSize = size * cellSize;

  const cells: boolean[][] = Array.from({ length: size }, () =>
    Array.from<boolean>({ length: size }).fill(false),
  );

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = cells[y]!;
      if (isFinderPattern(x, y, size)) {
        row[x] = true;
      } else if (!isFinderBorder(x, y, size)) {
        const bitIndex = (y * size + x) % 32;
        row[x] = ((hash >> bitIndex) & 1) === 1;
      }
    }
  }

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      className="rounded"
    >
      <rect width={svgSize} height={svgSize} fill="white" />
      {cells.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="black"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

function isFinderPattern(x: number, y: number, size: number): boolean {
  const corners: [number, number][] = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];

  for (const [cx, cy] of corners) {
    const rx = x - cx;
    const ry = y - cy;
    if (rx >= 0 && rx < 7 && ry >= 0 && ry < 7) {
      if (
        rx === 0 || rx === 6 || ry === 0 || ry === 6 ||
        (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4)
      ) {
        return true;
      }
    }
  }
  return false;
}

function isFinderBorder(x: number, y: number, size: number): boolean {
  const corners: [number, number][] = [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
  ];

  for (const [cx, cy] of corners) {
    const rx = x - cx;
    const ry = y - cy;
    if (rx >= 0 && rx < 7 && ry >= 0 && ry < 7) {
      return true;
    }
  }
  return false;
}
