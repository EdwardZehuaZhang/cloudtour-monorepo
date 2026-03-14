"use client";

import { RotateCcw, Navigation, MapPin, Map } from "lucide-react";

export type EditorMode = "select" | "waypoint" | "hotspot";

interface ViewportToolbarProps {
  editorMode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  onCameraReset: () => void;
  onFloorPlanToggle: () => void;
  isFloorPlanOpen: boolean;
  canEdit: boolean;
}

export function ViewportToolbar({
  editorMode,
  onModeChange,
  onCameraReset,
  onFloorPlanToggle,
  isFloorPlanOpen,
  canEdit,
}: ViewportToolbarProps) {
  return (
    <div
      className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full px-1.5 py-1"
      style={{
        backgroundColor: "oklch(22% 0.02 68 / 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* Camera reset */}
      <ToolbarButton
        icon={<RotateCcw size={15} />}
        label="Reset camera"
        onClick={onCameraReset}
        isActive={false}
      />

      {canEdit && (
        <>
          <div className="mx-0.5 h-4 w-px bg-white/20" />

          {/* Waypoint mode toggle */}
          <ToolbarButton
            icon={<Navigation size={15} />}
            label="Place waypoint"
            onClick={() =>
              onModeChange(editorMode === "waypoint" ? "select" : "waypoint")
            }
            isActive={editorMode === "waypoint"}
          />

          {/* Hotspot mode toggle */}
          <ToolbarButton
            icon={<MapPin size={15} />}
            label="Place hotspot"
            onClick={() =>
              onModeChange(editorMode === "hotspot" ? "select" : "hotspot")
            }
            isActive={editorMode === "hotspot"}
          />
        </>
      )}

      <div className="mx-0.5 h-4 w-px bg-white/20" />

      {/* Floor plan toggle */}
      <ToolbarButton
        icon={<Map size={15} />}
        label="Toggle floor plan"
        onClick={onFloorPlanToggle}
        isActive={isFloorPlanOpen}
      />
    </div>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  isActive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
        isActive
          ? "bg-white/25 text-white"
          : "text-white/70 hover:bg-white/15 hover:text-white"
      }`}
      style={{ transitionDuration: "var(--duration-fast)" }}
      aria-label={label}
      title={label}
    >
      {icon}
    </button>
  );
}
