"use client";

import { useState, useCallback } from "react";
import {
  ImageIcon,
  Navigation,
  MapPin,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { ContentType } from "@cloudtour/types";
import type { EditorScene } from "./tour-editor";
import type { EditorWaypoint, EditorHotspot } from "./editor-markers-overlay";

// ---- Types ------------------------------------------------------------------

interface InspectorPanelProps {
  scene: EditorScene | null;
  scenes: EditorScene[];
  canEdit: boolean;
  selectedWaypoint?: EditorWaypoint | null;
  selectedHotspot?: EditorHotspot | null;
  selectedItemType?: "waypoint" | "hotspot" | "scene" | null;
  onSceneChange?: (sceneId: string, field: string, value: unknown) => void;
  onWaypointChange?: (waypointId: string, field: string, value: unknown) => void;
  onHotspotChange?: (hotspotId: string, field: string, value: unknown) => void;
  onDeleteWaypoint?: (waypointId: string) => void;
  onDeleteHotspot?: (hotspotId: string) => void;
}

// ---- Shared field components ------------------------------------------------

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        rows={rows ?? 3}
        maxLength={maxLength}
        className="w-full resize-y rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] focus:border-[var(--brand)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--brand)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PositionDisplay({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <div>
      <FieldLabel>Position</FieldLabel>
      <div className="grid grid-cols-3 gap-2">
        {(["x", "y", "z"] as const).map((axis) => (
          <div key={axis}>
            <span className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-secondary)]">
              {axis}
            </span>
            <p className="rounded bg-[var(--surface-alt)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]">
              {(axis === "x" ? x : axis === "y" ? y : z).toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <p className="text-sm text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  defaultOpen,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);

  return (
    <div className="border-t border-[var(--border)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  );
}

function DeleteButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div className="border-t border-[var(--border)] pt-3">
      <button
        type="button"
        onClick={onClick}
        className="w-full rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
      >
        {label}
      </button>
    </div>
  );
}

// ---- Scene inspector --------------------------------------------------------

function SceneInspector({
  scene,
  canEdit,
  onSceneChange,
}: {
  scene: EditorScene;
  canEdit: boolean;
  onSceneChange?: (sceneId: string, field: string, value: unknown) => void;
}) {
  const handleChange = useCallback(
    (field: string, value: unknown) => {
      onSceneChange?.(scene.id, field, value);
    },
    [scene.id, onSceneChange],
  );

  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        value={scene.title}
        onChange={(v) => handleChange("title", v)}
        disabled={!canEdit}
        placeholder="Scene title"
        maxLength={200}
      />

      <TextAreaField
        label="Description"
        value={scene.description ?? ""}
        onChange={(v) => handleChange("description", v || null)}
        disabled={!canEdit}
        placeholder="Describe this scene..."
        maxLength={2000}
      />

      <ReadOnlyField
        label="Splat File"
        value={
          scene.splat_file_format
            ? `.${scene.splat_file_format} uploaded`
            : "No file uploaded"
        }
      />

      {/* Advanced: Camera defaults (collapsible) */}
      <CollapsibleSection title="Camera Defaults">
        {scene.default_camera_position ? (
          <>
            <div>
              <FieldLabel>Camera Position</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {(["x", "y", "z"] as const).map((axis) => (
                  <div key={axis}>
                    <span className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-secondary)]">
                      {axis}
                    </span>
                    <p className="rounded bg-[var(--surface-alt)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]">
                      {scene.default_camera_position!.position[axis].toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <FieldLabel>Camera Target</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                {(["x", "y", "z"] as const).map((axis) => (
                  <div key={axis}>
                    <span className="mb-0.5 block text-[10px] font-medium uppercase text-[var(--text-secondary)]">
                      {axis}
                    </span>
                    <p className="rounded bg-[var(--surface-alt)] px-2 py-1 font-mono text-xs text-[var(--text-primary)]">
                      {scene.default_camera_position!.target[axis].toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-xs text-[var(--text-secondary)]">
            No camera defaults set. Camera will use the viewer&apos;s default position.
          </p>
        )}
      </CollapsibleSection>

      {/* Advanced: SEO (collapsible) */}
      <CollapsibleSection title="SEO">
        <p className="text-xs text-[var(--text-secondary)]">
          Scene-level SEO metadata is inherited from the tour. Configure tour SEO in Tour Settings.
        </p>
      </CollapsibleSection>
    </div>
  );
}

// ---- Waypoint inspector -----------------------------------------------------

const CONTENT_TYPE_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "audio", label: "Audio" },
  { value: "link", label: "Link" },
];

function WaypointInspector({
  waypoint,
  scenes,
  canEdit,
  onWaypointChange,
  onDeleteWaypoint,
}: {
  waypoint: EditorWaypoint;
  scenes: EditorScene[];
  canEdit: boolean;
  onWaypointChange?: (waypointId: string, field: string, value: unknown) => void;
  onDeleteWaypoint?: (waypointId: string) => void;
}) {
  const handleChange = useCallback(
    (field: string, value: unknown) => {
      onWaypointChange?.(waypoint.id, field, value);
    },
    [waypoint.id, onWaypointChange],
  );

  const targetSceneOptions = scenes.map((s) => ({
    value: s.id,
    label: s.title,
  }));

  return (
    <div className="space-y-4">
      <TextField
        label="Label"
        value={waypoint.label}
        onChange={(v) => handleChange("label", v)}
        disabled={!canEdit}
        placeholder="Waypoint label"
        maxLength={200}
      />

      <SelectField
        label="Target Scene"
        value={waypoint.target_scene_id}
        onChange={(v) => handleChange("target_scene_id", v)}
        disabled={!canEdit}
        options={targetSceneOptions}
      />

      <TextField
        label="Icon"
        value={waypoint.icon ?? ""}
        onChange={(v) => handleChange("icon", v || null)}
        disabled={!canEdit}
        placeholder="Icon name (optional)"
        maxLength={50}
      />

      <PositionDisplay {...waypoint.position_3d} />

      {canEdit && onDeleteWaypoint && (
        <DeleteButton
          label="Delete Waypoint"
          onClick={() => onDeleteWaypoint(waypoint.id)}
        />
      )}
    </div>
  );
}

// ---- Hotspot inspector ------------------------------------------------------

function HotspotInspector({
  hotspot,
  canEdit,
  onHotspotChange,
  onDeleteHotspot,
}: {
  hotspot: EditorHotspot;
  canEdit: boolean;
  onHotspotChange?: (hotspotId: string, field: string, value: unknown) => void;
  onDeleteHotspot?: (hotspotId: string) => void;
}) {
  const handleChange = useCallback(
    (field: string, value: unknown) => {
      onHotspotChange?.(hotspot.id, field, value);
    },
    [hotspot.id, onHotspotChange],
  );

  return (
    <div className="space-y-4">
      <TextField
        label="Title"
        value={hotspot.title}
        onChange={(v) => handleChange("title", v)}
        disabled={!canEdit}
        placeholder="Hotspot title"
        maxLength={200}
      />

      <SelectField
        label="Content Type"
        value={hotspot.content_type}
        onChange={(v) => handleChange("content_type", v)}
        disabled={!canEdit}
        options={CONTENT_TYPE_OPTIONS}
      />

      <TextAreaField
        label="Content"
        value={hotspot.content_markdown ?? ""}
        onChange={(v) => handleChange("content_markdown", v || null)}
        disabled={!canEdit}
        placeholder="Markdown content..."
        rows={4}
        maxLength={10000}
      />

      <TextField
        label="Media URL"
        value={hotspot.media_url ?? ""}
        onChange={(v) => handleChange("media_url", v || null)}
        disabled={!canEdit}
        placeholder="https://..."
      />

      <TextField
        label="Icon"
        value={hotspot.icon ?? ""}
        onChange={(v) => handleChange("icon", v || null)}
        disabled={!canEdit}
        placeholder="Icon name (optional)"
        maxLength={50}
      />

      <PositionDisplay {...hotspot.position_3d} />

      {canEdit && onDeleteHotspot && (
        <DeleteButton
          label="Delete Hotspot"
          onClick={() => onDeleteHotspot(hotspot.id)}
        />
      )}
    </div>
  );
}

// ---- Main inspector panel ---------------------------------------------------

export function InspectorPanel({
  scene,
  scenes,
  canEdit,
  selectedWaypoint,
  selectedHotspot,
  selectedItemType,
  onSceneChange,
  onWaypointChange,
  onHotspotChange,
  onDeleteWaypoint,
  onDeleteHotspot,
}: InspectorPanelProps) {
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
        {showWaypoint && (
          <Navigation size={12} className="text-[var(--brand)]" />
        )}
        {showHotspot && <MapPin size={12} className="text-[var(--accent)]" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {headerLabel}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {showWaypoint ? (
          <WaypointInspector
            waypoint={selectedWaypoint}
            scenes={scenes}
            canEdit={canEdit}
            onWaypointChange={onWaypointChange}
            onDeleteWaypoint={onDeleteWaypoint}
          />
        ) : showHotspot ? (
          <HotspotInspector
            hotspot={selectedHotspot}
            canEdit={canEdit}
            onHotspotChange={onHotspotChange}
            onDeleteHotspot={onDeleteHotspot}
          />
        ) : scene ? (
          <SceneInspector
            scene={scene}
            canEdit={canEdit}
            onSceneChange={onSceneChange}
          />
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
