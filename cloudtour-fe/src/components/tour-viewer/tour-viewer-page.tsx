"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  Waypoint,
  Hotspot,
  CameraPosition,
  Position3D,
  ContentType,
  SplatFileFormat,
} from "@cloudtour/types";
import { SplatViewer } from "@/components/viewer/splat-viewer";
import { ViewerOverlay } from "@/components/viewer/viewer-overlay";
import { MapPin, Eye, Calendar, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PublicNavbar } from "@/components/public-site/public-navbar";

// ---- Types ------------------------------------------------------------------

interface TourScene {
  id: string;
  tour_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  splat_url: string | null;
  splat_file_format: SplatFileFormat | null;
  thumbnail_url: string | null;
  default_camera_position: CameraPosition | null;
  waypoints: Array<{
    id: string;
    scene_id: string;
    target_scene_id: string;
    label: string;
    icon: string | null;
    position_3d: Position3D;
  }>;
  hotspots: Array<{
    id: string;
    scene_id: string;
    title: string;
    content_type: ContentType;
    content_markdown: string | null;
    media_url: string | null;
    icon: string | null;
    position_3d: Position3D;
  }>;
}

interface TourData {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  tags: string[];
  location: string | null;
  cover_image_url: string | null;
  view_count: number;
  created_at: string;
  scenes: TourScene[];
  organization: { name: string; slug: string } | null;
}

export interface TourViewerPageProps {
  tour: TourData;
  slug: string;
}

// ---- Component --------------------------------------------------------------

export function TourViewerPage({ tour, slug }: TourViewerPageProps) {
  const [activeSceneId, setActiveSceneId] = useState<string>(
    tour.scenes[0]?.id ?? ""
  );

  const activeScene = tour.scenes.find((s) => s.id === activeSceneId);

  // Record view on mount
  useEffect(() => {
    fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/tours/${slug}/view`, { method: "POST" }).catch(() => {
      // Non-critical 鈥?silently fail
    });
  }, [slug]);

  const handleWaypointClick = useCallback((targetSceneId: string) => {
    setActiveSceneId(targetSceneId);
  }, []);

  const handleSceneChange = useCallback((sceneId: string) => {
    setActiveSceneId(sceneId);
  }, []);

  const handleShare = useCallback(() => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: tour.title, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).catch(() => {});
    }
  }, [tour.title]);

  const cameraPos = activeScene?.default_camera_position;
  const initialPosition: [number, number, number] = cameraPos
    ? [cameraPos.position.x, cameraPos.position.y, cameraPos.position.z]
    : [0, 10, 15];
  const initialLookAt: [number, number, number] = cameraPos
    ? [cameraPos.target.x, cameraPos.target.y, cameraPos.target.z]
    : [0, 0, 0];

  const formattedDate = new Date(tour.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg)" }}>
      {/* Navigation */}

      <PublicNavbar offset />

      <section className="border-b border-[oklch(22%_0.02_68_/_0.08)]" style={{ backgroundColor: "var(--surface)" }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/explore"
                className="flex items-center gap-1.5 text-sm transition-colors"
                style={{
                  color: "var(--text-primary)",
                  opacity: 0.6,
                  transitionDuration: "var(--duration-fast)",
                }}
              >
                <ArrowLeft size={16} />
                <span>Explore</span>
              </Link>
              <span className="text-sm" style={{ color: "var(--text-primary)", opacity: 0.2 }}>/</span>
              <h1
                className="font-display text-lg font-medium truncate max-w-[300px] sm:max-w-none"
                style={{ color: "var(--text-primary)" }}
              >
                {tour.title}
              </h1>
            </div>
            {tour.organization && (
              <span className="hidden sm:block text-sm" style={{ color: "var(--text-primary)", opacity: 0.5 }}>
                by {tour.organization.name}
              </span>
            )}
          </div>
        </div>
      </section>


      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Viewer */}
          <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: "16/9", minHeight: "400px" }}>
            {activeScene?.splat_url ? (
              <SplatViewer
                src={activeScene.splat_url}
                sceneTitle={activeScene.title}
                thumbnailUrl={activeScene.thumbnail_url ?? undefined}
                initialCameraPosition={initialPosition}
                initialCameraLookAt={initialLookAt}
                className="w-full h-full"
                onShare={handleShare}
              >
                <ViewerOverlay
                  waypoints={activeScene.waypoints as Waypoint[]}
                  hotspots={activeScene.hotspots as Hotspot[]}
                  scenes={tour.scenes.map((s) => ({
                    id: s.id,
                    title: s.title,
                  }))}
                  activeSceneId={activeSceneId}
                  onWaypointClick={handleWaypointClick}
                  onSceneChange={handleSceneChange}
                />
              </SplatViewer>
            ) : (
              <div className="flex h-full items-center justify-center bg-black/5 rounded-xl">
                <p className="text-sm" style={{ color: "var(--text-primary)", opacity: 0.4 }}>
                  No scene available
                </p>
              </div>
            )}
          </div>

          {/* Sidebar 鈥?Tour info + scene thumbnails */}
          <aside className="flex flex-col gap-5">
            {/* Tour metadata */}
            <div className="flex flex-col gap-3">
              <h2
                className="font-display text-2xl font-semibold leading-tight"
                style={{ color: "var(--text-primary)" }}
              >
                {tour.title}
              </h2>

              {tour.description && (
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: "var(--text-primary)", opacity: 0.7 }}
                >
                  {tour.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-primary)", opacity: 0.5 }}>
                {tour.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {tour.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Eye size={12} />
                  {tour.view_count.toLocaleString()} views
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {formattedDate}
                </span>
              </div>

              {/* Tags */}
              {tour.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {tour.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: "oklch(38% 0.16 268 / 0.08)",
                        color: "var(--brand)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Scene thumbnails grid */}
            {tour.scenes.length > 1 && (
              <div className="flex flex-col gap-2">
                <h3
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: "var(--text-primary)", opacity: 0.4 }}
                >
                  Scenes ({tour.scenes.length})
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {tour.scenes.map((scene) => {
                    const isActive = scene.id === activeSceneId;
                    return (
                      <button
                        key={scene.id}
                        type="button"
                        onClick={() => handleSceneChange(scene.id)}
                        className="group relative overflow-hidden rounded-lg transition-all"
                        style={{
                          aspectRatio: "16/10",
                          outline: isActive
                            ? "2px solid var(--brand)"
                            : "1px solid oklch(22% 0.02 68 / 0.1)",
                          outlineOffset: isActive ? "1px" : "0px",
                          transitionDuration: "var(--duration-fast)",
                        }}
                        aria-label={`View ${scene.title}`}
                        aria-current={isActive ? "true" : undefined}
                      >
                        {scene.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={scene.thumbnail_url}
                            alt={scene.title}
                            className="h-full w-full object-cover transition-transform"
                            style={{
                              transform: isActive ? "scale(1.05)" : "scale(1)",
                              transitionDuration: "var(--duration-base)",
                              transitionTimingFunction: "var(--ease-out)",
                            }}
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center"
                            style={{ backgroundColor: "oklch(22% 0.02 68 / 0.05)" }}
                          >
                            <span className="text-xs" style={{ color: "var(--text-primary)", opacity: 0.3 }}>
                              No preview
                            </span>
                          </div>
                        )}
                        <div
                          className="absolute inset-x-0 bottom-0 px-2 py-1.5"
                          style={{
                            background:
                              "linear-gradient(transparent, oklch(22% 0.02 68 / 0.7))",
                          }}
                        >
                          <span className="text-xs font-medium text-white truncate block">
                            {scene.title}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Apple Vision Pro CTA */}
            <div
              className="rounded-lg p-4 text-center"
              style={{ backgroundColor: "oklch(22% 0.02 68 / 0.03)" }}
            >
              <p
                className="text-xs mb-2"
                style={{ color: "var(--text-primary)", opacity: 0.5 }}
              >
                Experience this tour in spatial computing
              </p>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "var(--brand)",
                  color: "white",
                  transitionDuration: "var(--duration-fast)",
                }}
                onClick={() => {
                  // WebXR launch handled by the SplatViewer's WebXRButton
                  const viewer = document.querySelector("[data-viewer-container]");
                  if (viewer) viewer.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8Z" />
                  <path d="M6 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
                  <path d="M14 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
                </svg>
                Open in Apple Vision Pro
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
