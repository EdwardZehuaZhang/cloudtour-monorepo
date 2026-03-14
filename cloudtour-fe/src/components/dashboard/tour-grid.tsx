"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
  Globe,
  Plus,
  MapPin,
  Layers,
} from "lucide-react";
import type { Tour } from "@cloudtour/types";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TourWithSceneCount extends Tour {
  scene_count: number;
  first_scene_splat_url: string | null;
  first_scene_thumbnail_url: string | null;
}

interface TourGridProps {
  tours: TourWithSceneCount[];
  orgId: string;
}

// ─── Mini SplatViewer Preview (lazy on hover) ───────────────────────────────

function MiniSplatPreview({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<unknown>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function init() {
      if (!containerRef.current) return;

      try {
        const GaussianSplats3D = await import(
          "@mkkellogg/gaussian-splats-3d"
        );
        if (disposed) return;

        const viewer = new GaussianSplats3D.Viewer({
          cameraUp: [0, -1, 0],
          initialCameraPosition: [0, 0, 4],
          initialCameraLookAt: [0, 0, 0],
          selfDrivenMode: true,
          useBuiltInControls: false,
          showLoadingUI: false,
          sharedMemoryForWorkers: false,
          sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
          rootElement: containerRef.current,
        });

        viewerRef.current = viewer;

        await viewer.addSplatScene(src, { showLoadingUI: false });
        if (!disposed) setLoaded(true);
      } catch {
        // Silently fail for preview
      }
    }

    init();

    return () => {
      disposed = true;
      try {
        if (viewerRef.current) {
          (viewerRef.current as { dispose: () => void }).dispose();
        }
      } catch {
        // May already be disposed
      }
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      style={{
        opacity: loaded ? 1 : 0,
        transition: "opacity var(--duration-base) var(--ease-out)",
      }}
    />
  );
}

// ─── Tour Card ──────────────────────────────────────────────────────────────

function TourCard({
  tour,
  isHero,
  index,
}: {
  tour: TourWithSceneCount;
  isHero: boolean;
  index: number;
}) {
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (tour.first_scene_splat_url) {
      hoverTimerRef.current = setTimeout(() => {
        setShowPreview(true);
      }, 300);
    }
  }, [tour.first_scene_splat_url]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setShowPreview(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const statusBadge = {
    draft: { label: "Draft", className: "bg-[var(--surface-alt)] text-[var(--text-secondary)]" },
    published: { label: "Live", className: "bg-emerald-100 text-emerald-700" },
    archived: { label: "Archived", className: "bg-amber-100 text-amber-700" },
  }[tour.status];

  return (
    <div
      className={`group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] transition-shadow ${isHero ? "col-span-2 row-span-1" : ""}`}
      style={{
        animation: `dashboard-fade-up var(--duration-slow) var(--ease-out) both`,
        animationDelay: `${index * 30}ms`,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Thumbnail / Preview Area */}
      <div
        className={`relative overflow-hidden bg-[var(--surface-alt)] ${isHero ? "aspect-[16/9]" : "aspect-[3/2]"}`}
      >
        {/* Thumbnail image */}
        {tour.first_scene_thumbnail_url || tour.cover_image_url ? (
          <Image
            src={tour.first_scene_thumbnail_url ?? tour.cover_image_url ?? ""}
            alt={tour.title}
            fill
            className="object-cover"
            sizes={isHero ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 768px) 33vw, 100vw"}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Layers className="h-10 w-10 text-[var(--text-secondary)] opacity-30" />
          </div>
        )}

        {/* Mini SplatViewer preview on hover */}
        {showPreview && tour.first_scene_splat_url && (
          <MiniSplatPreview src={tour.first_scene_splat_url} />
        )}

        {/* Hover overlay gradient */}
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent transition-opacity"
          style={{
            opacity: isHovered ? 1 : 0,
            transitionDuration: "var(--duration-base)",
          }}
        />

        {/* Status badge */}
        <div className="absolute left-3 top-3 z-20">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>

        {/* Hover actions */}
        <div
          className="absolute right-3 top-3 z-20 flex items-center gap-1 transition-opacity"
          style={{
            opacity: isHovered ? 1 : 0,
            transitionDuration: "var(--duration-base)",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            className="rounded-md bg-white/80 p-1.5 backdrop-blur-sm transition-colors hover:bg-white"
          >
            <MoreHorizontal className="h-4 w-4 text-[var(--text-primary)]" />
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-3 top-12 z-40 w-40 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg">
              <button
                onClick={() => router.push(`/editor/${tour.id}`)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {tour.status === "published" && (
                <button
                  onClick={() => window.open(`/tours/${tour.slug}`, "_blank")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-alt)]"
                >
                  <Globe className="h-3.5 w-3.5" /> View public
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--destructive)] hover:bg-[var(--surface-alt)]"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </>
        )}

        {/* View count overlay (bottom-left on hover) */}
        {tour.view_count > 0 && (
          <div
            className="absolute bottom-3 left-3 z-20 flex items-center gap-1 text-xs text-white transition-opacity"
            style={{
              opacity: isHovered ? 1 : 0,
              transitionDuration: "var(--duration-base)",
            }}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>{tour.view_count.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <button
        onClick={() => router.push(`/editor/${tour.id}`)}
        className="w-full p-4 text-left"
      >
        <h3
          className={`font-display font-semibold text-[var(--text-primary)] ${isHero ? "text-lg" : "text-base"}`}
        >
          {tour.title}
        </h3>

        {tour.description && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {tour.description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            <Layers className="h-3 w-3" />
            {tour.scene_count} {tour.scene_count === 1 ? "scene" : "scenes"}
          </span>
          {tour.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {tour.location}
            </span>
          )}
          {tour.category !== "other" && (
            <span className="capitalize">{tour.category.replace("_", " ")}</span>
          )}
        </div>
      </button>
    </div>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ orgId }: { orgId: string }) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {/* Demo tour card (greyed) */}
      <div className="col-span-2 overflow-hidden rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] opacity-60">
        <div className="aspect-[16/9] bg-[var(--surface-alt)]">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8">
            <Layers className="h-12 w-12 text-[var(--text-secondary)] opacity-40" />
            <p className="text-center text-sm text-[var(--text-secondary)]">
              This is where your first tour will appear.
              <br />
              Tours are immersive 3D experiences built from Gaussian splat files.
            </p>
          </div>
        </div>
        <div className="p-4">
          <div className="h-4 w-3/4 rounded bg-[var(--surface-alt)]" />
          <div className="mt-2 h-3 w-1/2 rounded bg-[var(--surface-alt)]" />
          <div className="mt-3 flex gap-3">
            <div className="h-3 w-16 rounded bg-[var(--surface-alt)]" />
            <div className="h-3 w-20 rounded bg-[var(--surface-alt)]" />
          </div>
        </div>
      </div>

      {/* CTA card */}
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--brand)] bg-[oklch(96%_0.02_268/0.3)] p-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)]">
          <Plus className="h-6 w-6 text-white" />
        </div>
        <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">
          Create your first tour
        </h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Upload .ply, .splat, or .spz files to build a spatial tour that anyone can explore in
          their browser.
        </p>
        <button
          onClick={() => {
            // Create a new tour via API then redirect to editor
            createTour(orgId).then((tourId) => {
              if (tourId) router.push(`/editor/${tourId}`);
            });
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-light)]"
        >
          <Plus className="h-4 w-4" />
          New Tour
        </button>
      </div>
    </div>
  );
}

// ─── Create Tour Helper ─────────────────────────────────────────────────────

async function createTour(orgId: string): Promise<string | null> {
  try {
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled Tour" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}

// ─── Tour Grid ──────────────────────────────────────────────────────────────

export function TourGrid({ tours, orgId }: TourGridProps) {
  const router = useRouter();

  if (tours.length === 0) {
    return <EmptyState orgId={orgId} />;
  }

  return (
    <div>
      {/* Create tour button */}
      <div className="mb-6 flex justify-end">
        <button
          onClick={() => {
            createTour(orgId).then((tourId) => {
              if (tourId) router.push(`/editor/${tourId}`);
            });
          }}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--accent-light)]"
        >
          <Plus className="h-4 w-4" />
          New Tour
        </button>
      </div>

      {/* Asymmetric masonry grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {tours.map((tour, i) => (
          <TourCard
            key={tour.id}
            tour={tour}
            isHero={i === 0}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

export type { TourWithSceneCount };

