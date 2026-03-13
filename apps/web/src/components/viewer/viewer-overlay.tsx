"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import type { Waypoint, Hotspot, ContentType } from "@cloudtour/types";
import { useViewerContext } from "./viewer-context";
import { WaypointMarker } from "./waypoint-marker";
import { HotspotMarker } from "./hotspot-marker";
import { HotspotInfoCard } from "./hotspot-info-card";
import {
  SceneSwitcher,
  type SceneSwitcherScene,
} from "./scene-switcher";

// ---- Types -----------------------------------------------------------------

interface ScreenPos {
  x: number;
  y: number;
  visible: boolean;
}

export interface ViewerOverlayProps {
  /** Waypoints for the current scene */
  waypoints: Waypoint[];
  /** Hotspots for the current scene */
  hotspots: Hotspot[];
  /** All scenes in the tour (for scene switcher) */
  scenes: SceneSwitcherScene[];
  /** Currently active scene ID */
  activeSceneId: string;
  /** Called when user clicks a waypoint to navigate to its target scene */
  onWaypointClick: (targetSceneId: string) => void;
  /** Called when user selects a scene from the scene switcher */
  onSceneChange: (sceneId: string) => void;
}

// ---- 3D → 2D Projection ---------------------------------------------------

const _vec3 = new THREE.Vector3();

function project3DToScreen(
  pos: { x: number; y: number; z: number },
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenPos {
  _vec3.set(pos.x, pos.y, pos.z);
  _vec3.project(camera);

  // Behind camera or outside frustum
  const visible = _vec3.z >= -1 && _vec3.z <= 1;

  return {
    x: (_vec3.x * 0.5 + 0.5) * width,
    y: (-_vec3.y * 0.5 + 0.5) * height,
    visible,
  };
}

function getNearestEdge(
  x: number,
  y: number,
  width: number,
  height: number,
): "left" | "right" | "top" | "bottom" {
  const distLeft = x;
  const distRight = width - x;
  const distTop = y;
  const distBottom = height - y;
  const min = Math.min(distLeft, distRight, distTop, distBottom);

  if (min === distLeft) return "left";
  if (min === distRight) return "right";
  if (min === distTop) return "top";
  return "bottom";
}

// ---- Component -------------------------------------------------------------

export function ViewerOverlay({
  waypoints,
  hotspots,
  scenes,
  activeSceneId,
  onWaypointClick,
  onSceneChange,
}: ViewerOverlayProps) {
  const { viewer, container } = useViewerContext();
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Projected screen positions, keyed by marker id
  const [waypointPositions, setWaypointPositions] = useState<
    Map<string, ScreenPos>
  >(new Map());
  const [hotspotPositions, setHotspotPositions] = useState<
    Map<string, ScreenPos>
  >(new Map());

  // Active hotspot (info card shown)
  const [activeHotspotId, setActiveHotspotId] = useState<string | null>(null);

  // ---- Projection loop -----------------------------------------------------

  const updatePositions = useCallback(() => {
    if (!viewer || !container) return;

    const camera = viewer.getCamera() as THREE.Camera | null;
    if (!camera) return;

    const rect = container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (width === 0 || height === 0) return;

    // Project waypoints
    const newWP = new Map<string, ScreenPos>();
    for (const wp of waypoints) {
      newWP.set(wp.id, project3DToScreen(wp.position_3d, camera, width, height));
    }
    setWaypointPositions(newWP);

    // Project hotspots
    const newHS = new Map<string, ScreenPos>();
    for (const hs of hotspots) {
      newHS.set(hs.id, project3DToScreen(hs.position_3d, camera, width, height));
    }
    setHotspotPositions(newHS);
  }, [viewer, container, waypoints, hotspots]);

  useEffect(() => {
    if (!viewer) return;

    function loop() {
      updatePositions();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [viewer, updatePositions]);

  // Reset active hotspot when scene changes
  useEffect(() => {
    setActiveHotspotId(null);
  }, [activeSceneId]);

  // ---- Handlers ------------------------------------------------------------

  const handleHotspotClick = useCallback((hotspotId: string) => {
    setActiveHotspotId((prev) => (prev === hotspotId ? null : hotspotId));
  }, []);

  // ---- Render --------------------------------------------------------------

  const containerWidth = container?.getBoundingClientRect().width ?? 0;
  const containerHeight = container?.getBoundingClientRect().height ?? 0;

  const activeHotspot = hotspots.find((h) => h.id === activeHotspotId);
  const activeHotspotPos = activeHotspotId
    ? hotspotPositions.get(activeHotspotId)
    : null;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-30 pointer-events-none"
    >
      {/* Waypoint markers */}
      {waypoints.map((wp) => {
        const pos = waypointPositions.get(wp.id);
        if (!pos) return null;
        return (
          <WaypointMarker
            key={wp.id}
            label={wp.label}
            x={pos.x}
            y={pos.y}
            visible={pos.visible}
            onClick={() => onWaypointClick(wp.target_scene_id)}
          />
        );
      })}

      {/* Hotspot markers */}
      {hotspots.map((hs) => {
        const pos = hotspotPositions.get(hs.id);
        if (!pos) return null;
        return (
          <HotspotMarker
            key={hs.id}
            title={hs.title}
            contentType={hs.content_type as ContentType}
            icon={hs.icon}
            x={pos.x}
            y={pos.y}
            visible={pos.visible}
            isActive={hs.id === activeHotspotId}
            onClick={() => handleHotspotClick(hs.id)}
          />
        );
      })}

      {/* Hotspot info card */}
      {activeHotspot && activeHotspotPos?.visible && (
        <HotspotInfoCard
          key={activeHotspot.id}
          title={activeHotspot.title}
          contentType={activeHotspot.content_type as ContentType}
          contentMarkdown={activeHotspot.content_markdown}
          mediaUrl={activeHotspot.media_url}
          edge={getNearestEdge(
            activeHotspotPos.x,
            activeHotspotPos.y,
            containerWidth,
            containerHeight,
          )}
          onClose={() => setActiveHotspotId(null)}
        />
      )}

      {/* Scene switcher */}
      <SceneSwitcher
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSceneChange={onSceneChange}
      />
    </div>
  );
}
