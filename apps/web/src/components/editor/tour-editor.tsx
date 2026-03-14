"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { TourStatus, TourCategory, Role, SplatFileFormat, CameraPosition, Position3D, ContentType } from "@cloudtour/types";
import { EditorHeader } from "./editor-header";
import { SceneList } from "./scene-list";
import { InspectorPanel } from "./inspector-panel";
import { FloorPlanDrawer, type FloorPlanData } from "./floor-plan-drawer";
import { EditorViewport } from "./editor-viewport";
import { MobileEditorNotice } from "./mobile-editor-notice";
import { ViewportToolbar, type EditorMode } from "./viewport-toolbar";
import type { EditorWaypoint, EditorHotspot } from "./editor-markers-overlay";

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

// ---- Debounce helper -------------------------------------------------------

function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
    },
    [delay],
  ) as T;
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
  const [floorPlan, setFloorPlan] = useState<FloorPlanData | null>(null);

  // Editor mode & marker state
  const [editorMode, setEditorMode] = useState<EditorMode>("select");
  const [waypoints, setWaypoints] = useState<EditorWaypoint[]>([]);
  const [hotspots, setHotspots] = useState<EditorHotspot[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemType, setSelectedItemType] = useState<"waypoint" | "hotspot" | "scene" | null>(null);

  const canEdit = userRole !== "viewer";
  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;

  // ---- Fetch waypoints/hotspots when active scene changes ------------------

  useEffect(() => {
    if (!activeSceneId) {
      setWaypoints([]);
      setHotspots([]);
      return;
    }

    let cancelled = false;

    async function fetchMarkers() {
      const [wpRes, hsRes] = await Promise.all([
        fetch(
          `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/waypoints`,
        ),
        fetch(
          `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/hotspots`,
        ),
      ]);

      if (cancelled) return;

      if (wpRes.ok) {
        const wpBody = await wpRes.json();
        setWaypoints(
          (wpBody.data ?? []).map((wp: Record<string, unknown>) => ({
            ...wp,
            position_3d: wp.position_3d as Position3D,
          })),
        );
      }

      if (hsRes.ok) {
        const hsBody = await hsRes.json();
        setHotspots(
          (hsBody.data ?? []).map((hs: Record<string, unknown>) => ({
            ...hs,
            position_3d: hs.position_3d as Position3D,
          })),
        );
      }
    }

    fetchMarkers().catch((err) =>
      console.error("[Editor] Failed to fetch markers:", err),
    );

    return () => {
      cancelled = true;
    };
  }, [activeSceneId, tour.org_id, tour.id]);

  // ---- Fetch floor plan on mount ----------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchFloorPlan() {
      const res = await fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/floor-plan`,
      );
      if (cancelled || !res.ok) return;
      const body = await res.json();
      setFloorPlan(body.data ?? null);
    }

    fetchFloorPlan().catch((err) =>
      console.error("[Editor] Failed to fetch floor plan:", err),
    );

    return () => {
      cancelled = true;
    };
  }, [tour.org_id, tour.id]);

  // Reset editor mode and selection when scene changes
  useEffect(() => {
    setEditorMode("select");
    setSelectedItemId(null);
    setSelectedItemType(null);
  }, [activeSceneId]);

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

  // ---- Place waypoint -------------------------------------------------------

  const handlePlaceWaypoint = useCallback(
    async (position: Position3D) => {
      if (!activeSceneId) return;

      const otherScenes = scenes.filter((s) => s.id !== activeSceneId);
      const targetScene = otherScenes[0];
      if (!targetScene) {
        console.warn("[Editor] Need at least 2 scenes to create a waypoint");
        return;
      }

      const tempId = `temp-${Date.now()}`;
      const tempWaypoint: EditorWaypoint = {
        id: tempId,
        scene_id: activeSceneId,
        target_scene_id: targetScene.id,
        label: `Go to ${targetScene.title}`,
        icon: null,
        position_3d: position,
      };
      setWaypoints((prev) => [...prev, tempWaypoint]);
      setSelectedItemId(tempId);
      setSelectedItemType("waypoint");

      const res = await fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/waypoints`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_scene_id: targetScene.id,
            label: `Go to ${targetScene.title}`,
            position_3d: position,
          }),
        },
      );

      if (res.ok) {
        const created = await res.json();
        setWaypoints((prev) =>
          prev.map((wp) =>
            wp.id === tempId
              ? { ...created, position_3d: created.position_3d as Position3D }
              : wp,
          ),
        );
        setSelectedItemId(created.id);
      } else {
        setWaypoints((prev) => prev.filter((wp) => wp.id !== tempId));
        setSelectedItemId(null);
        setSelectedItemType(null);
      }
    },
    [activeSceneId, scenes, tour.org_id, tour.id],
  );

  // ---- Place hotspot --------------------------------------------------------

  const handlePlaceHotspot = useCallback(
    async (position: Position3D) => {
      if (!activeSceneId) return;

      const tempId = `temp-${Date.now()}`;
      const tempHotspot: EditorHotspot = {
        id: tempId,
        scene_id: activeSceneId,
        title: "New hotspot",
        content_type: "text" as ContentType,
        content_markdown: null,
        media_url: null,
        icon: null,
        position_3d: position,
      };
      setHotspots((prev) => [...prev, tempHotspot]);
      setSelectedItemId(tempId);
      setSelectedItemType("hotspot");

      const res = await fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/hotspots`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "New hotspot",
            content_type: "text",
            position_3d: position,
          }),
        },
      );

      if (res.ok) {
        const created = await res.json();
        setHotspots((prev) =>
          prev.map((hs) =>
            hs.id === tempId
              ? { ...created, position_3d: created.position_3d as Position3D }
              : hs,
          ),
        );
        setSelectedItemId(created.id);
      } else {
        setHotspots((prev) => prev.filter((hs) => hs.id !== tempId));
        setSelectedItemId(null);
        setSelectedItemType(null);
      }
    },
    [activeSceneId, tour.org_id, tour.id],
  );

  // ---- Move waypoint (optimistic + debounced sync) --------------------------

  const syncWaypointPosition = useDebouncedCallback(
    (waypointId: string, position: Position3D) => {
      if (!activeSceneId) return;
      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/waypoints/${waypointId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position_3d: position }),
        },
      ).catch((err) =>
        console.error("[Editor] Failed to sync waypoint position:", err),
      );
    },
    500,
  );

  const handleMoveWaypoint = useCallback(
    (id: string, position: Position3D) => {
      setWaypoints((prev) =>
        prev.map((wp) => (wp.id === id ? { ...wp, position_3d: position } : wp)),
      );
      syncWaypointPosition(id, position);
    },
    [syncWaypointPosition],
  );

  // ---- Move hotspot (optimistic + debounced sync) ---------------------------

  const syncHotspotPosition = useDebouncedCallback(
    (hotspotId: string, position: Position3D) => {
      if (!activeSceneId) return;
      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/hotspots/${hotspotId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position_3d: position }),
        },
      ).catch((err) =>
        console.error("[Editor] Failed to sync hotspot position:", err),
      );
    },
    500,
  );

  const handleMoveHotspot = useCallback(
    (id: string, position: Position3D) => {
      setHotspots((prev) =>
        prev.map((hs) => (hs.id === id ? { ...hs, position_3d: position } : hs)),
      );
      syncHotspotPosition(id, position);
    },
    [syncHotspotPosition],
  );

  // ---- Select item ----------------------------------------------------------

  const handleSelectItem = useCallback(
    (type: "waypoint" | "hotspot", id: string) => {
      setSelectedItemId((prev) => (prev === id ? null : id));
      setSelectedItemType(type);
    },
    [],
  );

  // ---- Camera reset placeholder ---------------------------------------------

  const handleCameraReset = useCallback(() => {
    // Camera reset placeholder — SplatViewer manages its own camera
  }, []);

  // ---- Scene property change (optimistic + debounced sync) ------------------

  const syncSceneProperty = useDebouncedCallback(
    (sceneId: string, field: string, value: unknown) => {
      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${sceneId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      ).catch((err) =>
        console.error("[Editor] Failed to sync scene property:", err),
      );
    },
    500,
  );

  const handleSceneChange = useCallback(
    (sceneId: string, field: string, value: unknown) => {
      setScenes((prev) =>
        prev.map((s) =>
          s.id === sceneId ? { ...s, [field]: value } : s,
        ),
      );
      syncSceneProperty(sceneId, field, value);
    },
    [syncSceneProperty],
  );

  // ---- Waypoint property change (optimistic + debounced sync) ---------------

  const syncWaypointProperty = useDebouncedCallback(
    (waypointId: string, field: string, value: unknown) => {
      if (!activeSceneId) return;
      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/waypoints/${waypointId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      ).catch((err) =>
        console.error("[Editor] Failed to sync waypoint property:", err),
      );
    },
    500,
  );

  const handleWaypointChange = useCallback(
    (waypointId: string, field: string, value: unknown) => {
      setWaypoints((prev) =>
        prev.map((wp) =>
          wp.id === waypointId ? { ...wp, [field]: value } : wp,
        ),
      );
      syncWaypointProperty(waypointId, field, value);
    },
    [syncWaypointProperty],
  );

  // ---- Hotspot property change (optimistic + debounced sync) ----------------

  const syncHotspotProperty = useDebouncedCallback(
    (hotspotId: string, field: string, value: unknown) => {
      if (!activeSceneId) return;
      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/hotspots/${hotspotId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [field]: value }),
        },
      ).catch((err) =>
        console.error("[Editor] Failed to sync hotspot property:", err),
      );
    },
    500,
  );

  const handleHotspotChange = useCallback(
    (hotspotId: string, field: string, value: unknown) => {
      setHotspots((prev) =>
        prev.map((hs) =>
          hs.id === hotspotId ? { ...hs, [field]: value } : hs,
        ),
      );
      syncHotspotProperty(hotspotId, field, value);
    },
    [syncHotspotProperty],
  );

  // ---- Delete waypoint ------------------------------------------------------

  const handleDeleteWaypoint = useCallback(
    async (waypointId: string) => {
      if (!activeSceneId) return;

      setWaypoints((prev) => prev.filter((wp) => wp.id !== waypointId));
      if (selectedItemId === waypointId) {
        setSelectedItemId(null);
        setSelectedItemType(null);
      }

      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/waypoints/${waypointId}`,
        { method: "DELETE" },
      ).catch((err) =>
        console.error("[Editor] Failed to delete waypoint:", err),
      );
    },
    [activeSceneId, selectedItemId, tour.org_id, tour.id],
  );

  // ---- Delete hotspot -------------------------------------------------------

  const handleDeleteHotspot = useCallback(
    async (hotspotId: string) => {
      if (!activeSceneId) return;

      setHotspots((prev) => prev.filter((hs) => hs.id !== hotspotId));
      if (selectedItemId === hotspotId) {
        setSelectedItemId(null);
        setSelectedItemType(null);
      }

      fetch(
        `/api/orgs/${tour.org_id}/tours/${tour.id}/scenes/${activeSceneId}/hotspots/${hotspotId}`,
        { method: "DELETE" },
      ).catch((err) =>
        console.error("[Editor] Failed to delete hotspot:", err),
      );
    },
    [activeSceneId, selectedItemId, tour.org_id, tour.id],
  );

  // ---- Get selected waypoint/hotspot for inspector --------------------------

  const selectedWaypoint = selectedItemType === "waypoint"
    ? waypoints.find((wp) => wp.id === selectedItemId) ?? null
    : null;
  const selectedHotspot = selectedItemType === "hotspot"
    ? hotspots.find((hs) => hs.id === selectedItemId) ?? null
    : null;

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
            <EditorViewport
              scene={activeScene}
              editorMode={editorMode}
              waypoints={waypoints}
              hotspots={hotspots}
              canEdit={canEdit}
              selectedItemId={selectedItemId}
              onPlaceWaypoint={handlePlaceWaypoint}
              onPlaceHotspot={handlePlaceHotspot}
              onMoveWaypoint={handleMoveWaypoint}
              onMoveHotspot={handleMoveHotspot}
              onSelectItem={handleSelectItem}
            />

            {/* Viewport toolbar */}
            <ViewportToolbar
              editorMode={editorMode}
              onModeChange={setEditorMode}
              onCameraReset={handleCameraReset}
              onFloorPlanToggle={() => setIsFloorPlanOpen((prev) => !prev)}
              isFloorPlanOpen={isFloorPlanOpen}
              canEdit={canEdit}
            />

            {/* Floor plan drawer at the bottom of viewport */}
            <FloorPlanDrawer
              isOpen={isFloorPlanOpen}
              onToggle={() => setIsFloorPlanOpen((prev) => !prev)}
              tourId={tour.id}
              orgId={tour.org_id}
              scenes={scenes}
              activeSceneId={activeSceneId}
              canEdit={canEdit}
              floorPlan={floorPlan}
              onFloorPlanChange={setFloorPlan}
              onSelectScene={setActiveSceneId}
            />
          </div>

          {/* Right: Inspector panel (280px) */}
          <InspectorPanel
            scene={activeScene}
            scenes={scenes}
            canEdit={canEdit}
            selectedWaypoint={selectedWaypoint}
            selectedHotspot={selectedHotspot}
            selectedItemType={selectedItemType}
            onSceneChange={handleSceneChange}
            onWaypointChange={handleWaypointChange}
            onHotspotChange={handleHotspotChange}
            onDeleteWaypoint={handleDeleteWaypoint}
            onDeleteHotspot={handleDeleteHotspot}
          />
        </div>
      </div>
    </>
  );
}
