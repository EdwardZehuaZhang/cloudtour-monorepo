"use client";

import { Layers } from "lucide-react";
import { SplatViewer } from "@/components/viewer/splat-viewer";
import type { Position3D } from "@cloudtour/types";
import type { EditorScene } from "./tour-editor";
import {
  EditorMarkersOverlay,
  type EditorWaypoint,
  type EditorHotspot,
} from "./editor-markers-overlay";
import type { EditorMode } from "./viewport-toolbar";

interface EditorViewportProps {
  scene: EditorScene | null;
  editorMode: EditorMode;
  waypoints: EditorWaypoint[];
  hotspots: EditorHotspot[];
  canEdit: boolean;
  selectedItemId: string | null;
  onPlaceWaypoint: (position: Position3D) => void;
  onPlaceHotspot: (position: Position3D) => void;
  onMoveWaypoint: (id: string, position: Position3D) => void;
  onMoveHotspot: (id: string, position: Position3D) => void;
  onSelectItem: (type: "waypoint" | "hotspot", id: string) => void;
}

export function EditorViewport({
  scene,
  editorMode,
  waypoints,
  hotspots,
  canEdit,
  selectedItemId,
  onPlaceWaypoint,
  onPlaceHotspot,
  onMoveWaypoint,
  onMoveHotspot,
  onSelectItem,
}: EditorViewportProps) {
  if (!scene) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black/5">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface)]">
          <Layers size={20} className="text-[var(--text-secondary)]" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Select or add a scene to view it here.
        </p>
      </div>
    );
  }

  if (!scene.splat_url) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-black/5">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface)]">
          <Layers size={20} className="text-[var(--text-secondary)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {scene.title}
        </p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Upload a splat file (.ply, .splat, .spz) to preview this scene.
        </p>
      </div>
    );
  }

  const cameraPos = scene.default_camera_position;

  return (
    <SplatViewer
      src={scene.splat_url}
      sceneTitle={scene.title}
      thumbnailUrl={scene.thumbnail_url ?? undefined}
      initialCameraPosition={
        cameraPos
          ? [cameraPos.position.x, cameraPos.position.y, cameraPos.position.z]
          : undefined
      }
      initialCameraLookAt={
        cameraPos
          ? [cameraPos.target.x, cameraPos.target.y, cameraPos.target.z]
          : undefined
      }
    >
      <EditorMarkersOverlay
        waypoints={waypoints}
        hotspots={hotspots}
        editorMode={editorMode}
        canEdit={canEdit}
        onPlaceWaypoint={onPlaceWaypoint}
        onPlaceHotspot={onPlaceHotspot}
        onMoveWaypoint={onMoveWaypoint}
        onMoveHotspot={onMoveHotspot}
        onSelectItem={onSelectItem}
        selectedItemId={selectedItemId}
      />
    </SplatViewer>
  );
}
