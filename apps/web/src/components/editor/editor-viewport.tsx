"use client";

import { Layers } from "lucide-react";
import { SplatViewer } from "@/components/viewer/splat-viewer";
import type { EditorScene } from "./tour-editor";

interface EditorViewportProps {
  scene: EditorScene | null;
}

export function EditorViewport({ scene }: EditorViewportProps) {
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
    />
  );
}
