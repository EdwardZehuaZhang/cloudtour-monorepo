"use client";

import { ImageIcon, Navigation, MapPin } from "lucide-react";
import type { EditorScene } from "./tour-editor";
import type { EditorWaypoint, EditorHotspot } from "./editor-markers-overlay";

interface InspectorPanelProps {
  scene: EditorScene | null;
  canEdit: boolean;
  selectedWaypoint?: EditorWaypoint | null;
  selectedHotspot?: EditorHotspot | null;
  selectedItemType?: "waypoint" | "hotspot" | "scene" | null;
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <p className="text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function PositionDisplay({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {(["x", "y", "z"] as const).map((axis) => (
        <div key={axis}>
          <label className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-secondary)]">
            {axis}
          </label>
          <p className="rounded bg-[var(--surface-alt)] px-2 py-1 text-xs font-mono text-[var(--text-primary)]">
            {(axis === "x" ? x : axis === "y" ? y : z).toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function InspectorPanel({
  scene,
  selectedWaypoint,
  selectedHotspot,
  selectedItemType,
}: InspectorPanelProps) {
  // Determine what to show: selected waypoint/hotspot takes priority over scene
  const showWaypoint = selectedItemType === "waypoint" && selectedWaypoint;
  const showHotspot = selectedItemType === "hotspot" && selectedHotspot;

  const headerLabel = showWaypoint
    ? "Waypoint"
    : showHotspot
      ? "Hotspot"
      : "Properties";

  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]"
      style={{ transition: "width var(--duration-base) var(--ease-out)" }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
        {showWaypoint && <Navigation size={12} className="text-[var(--brand)]" />}
        {showHotspot && <MapPin size={12} className="text-[var(--accent)]" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {headerLabel}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {showWaypoint ? (
          <div className="space-y-4">
            <PropertyRow label="Label" value={selectedWaypoint.label} />
            <PropertyRow label="Target Scene" value={selectedWaypoint.target_scene_id} />
            {selectedWaypoint.icon && (
              <PropertyRow label="Icon" value={selectedWaypoint.icon} />
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Position
              </label>
              <PositionDisplay {...selectedWaypoint.position_3d} />
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Full property editing coming in US-020.
              </p>
            </div>
          </div>
        ) : showHotspot ? (
          <div className="space-y-4">
            <PropertyRow label="Title" value={selectedHotspot.title} />
            <PropertyRow label="Content Type" value={selectedHotspot.content_type} />
            {selectedHotspot.content_markdown && (
              <PropertyRow label="Content" value={selectedHotspot.content_markdown} />
            )}
            {selectedHotspot.media_url && (
              <PropertyRow label="Media URL" value={selectedHotspot.media_url} />
            )}
            {selectedHotspot.icon && (
              <PropertyRow label="Icon" value={selectedHotspot.icon} />
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Position
              </label>
              <PositionDisplay {...selectedHotspot.position_3d} />
            </div>
            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Full property editing coming in US-020.
              </p>
            </div>
          </div>
        ) : scene ? (
          <div className="space-y-4">
            <PropertyRow label="Title" value={scene.title} />
            <PropertyRow
              label="Description"
              value={scene.description ?? "No description"}
            />
            <PropertyRow
              label="Splat File"
              value={
                scene.splat_file_format
                  ? `.${scene.splat_file_format} uploaded`
                  : "No file uploaded"
              }
            />
            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Full property editing coming in US-020.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--surface-alt)]">
              <ImageIcon size={18} className="text-[var(--text-secondary)]" />
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Select a scene to view its properties.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
