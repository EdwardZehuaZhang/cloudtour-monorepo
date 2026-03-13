"use client";

import { useState, useCallback } from "react";
import type { TourStatus, TourCategory, Role, SplatFileFormat, CameraPosition } from "@cloudtour/types";
import { EditorHeader } from "./editor-header";
import { SceneList } from "./scene-list";
import { InspectorPanel } from "./inspector-panel";
import { FloorPlanDrawer } from "./floor-plan-drawer";
import { EditorViewport } from "./editor-viewport";
import { MobileEditorNotice } from "./mobile-editor-notice";

// ---- Types ------------------------------------------------------------------

export interface EditorTour {
  id: string;
  org_id: string;
  title: string;
  slug: string;
  description: string | null;
  status: TourStatus;
  category: TourCategory;
  tags: string[];
  location: string | null;
  cover_image_url: string | null;
}

export interface EditorScene {
  id: string;
  tour_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  splat_url: string | null;
  splat_file_format: SplatFileFormat | null;
  thumbnail_url: string | null;
  default_camera_position: CameraPosition | null;
}

interface TourEditorProps {
  tour: EditorTour;
  scenes: EditorScene[];
  userRole: Role;
}

// ---- Component --------------------------------------------------------------

export function TourEditor({ tour, scenes: initialScenes, userRole }: TourEditorProps) {
  const [tourTitle, setTourTitle] = useState(tour.title);
  const [tourStatus, setTourStatus] = useState(tour.status);
  const [scenes, setScenes] = useState<EditorScene[]>(initialScenes);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(
    initialScenes[0]?.id ?? null
  );
  const [isFloorPlanOpen, setIsFloorPlanOpen] = useState(false);

  const canEdit = userRole !== "viewer";
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;

  // ---- Scene reorder (optimistic) -------------------------------------------

  const handleReorderScenes = useCallback(
    (reordered: EditorScene[]) => {
      // Optimistic UI update
      setScenes(reordered);

      // Background sync — update sort_order for each scene
      reordered.forEach((scene, index) => {
        if (scene.sort_order !== index) {
          fetch(
            `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${scene.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sort_order: index }),
            }
          ).catch((err) =>
            console.error("[Editor] Failed to sync scene order:", err)
          );
        }
      });
    },
    [tour.org_id, tour.id]
  );

  // ---- Add scene ------------------------------------------------------------

  const handleAddScene = useCallback(async () => {
    const res = await fetch(
      `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: `Scene ${scenes.length + 1}` }),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error("[Editor] Failed to add scene:", body);
      return;
    }

    const newScene = await res.json();
    setScenes((prev) => [...prev, newScene]);
    setActiveSceneId(newScene.id);
  }, [tour.org_id, tour.id, scenes.length]);

  // ---- Title update ---------------------------------------------------------

  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      setTourTitle(newTitle);

      fetch(`/api/orgs/${tour.org_id}/tours/${tour.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      }).catch((err) =>
        console.error("[Editor] Failed to update title:", err)
      );
    },
    [tour.org_id, tour.id]
  );

  // ---- Publish --------------------------------------------------------------

  const handlePublish = useCallback(async () => {
    const res = await fetch(
      `/api/orgs/${tour.org_id}/tours/${tour.id}/publish`,
      { method: "POST" }
    );

    if (res.ok) {
      setTourStatus("published");
    }
  }, [tour.org_id, tour.id]);

  return (
    <>
      {/* Mobile: view-only notice */}
      <MobileEditorNotice />

      {/* Desktop: full editor */}
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--bg)] md:flex">
        {/* Header */}
        <EditorHeader
          title={tourTitle}
          status={tourStatus}
          slug={tour.slug}
          canEdit={canEdit}
          onTitleChange={handleTitleChange}
          onPublish={handlePublish}
        />

        {/* Main editor area */}
        <div className="relative flex flex-1 overflow-hidden">
          {/* Left: Scene list (240px) */}
          <SceneList
            scenes={scenes}
            activeSceneId={activeSceneId}
            canEdit={canEdit}
            onSelectScene={setActiveSceneId}
            onReorder={handleReorderScenes}
            onAddScene={handleAddScene}
          />

          {/* Center: 3D viewport */}
          <div className="relative flex-1 overflow-hidden">
            <EditorViewport scene={activeScene} />

            {/* Floor plan drawer at the bottom of viewport */}
            <FloorPlanDrawer
              isOpen={isFloorPlanOpen}
              onToggle={() => setIsFloorPlanOpen((prev) => !prev)}
            />
          </div>

          {/* Right: Inspector panel (280px) */}
          <InspectorPanel
            scene={activeScene}
            canEdit={canEdit}
          />
        </div>
      </div>
    </>
  );
}
