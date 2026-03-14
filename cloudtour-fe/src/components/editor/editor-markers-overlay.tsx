"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import * as THREE from "three";
import type { Position3D, ContentType } from "@cloudtour/types";
import { useViewerContext } from "@/components/viewer/viewer-context";
import type { EditorMode } from "./viewport-toolbar";

// ---- Types -----------------------------------------------------------------

export interface EditorWaypoint {
  id: string;
  scene_id: string;
  target_scene_id: string;
  label: string;
  icon: string | null;
  position_3d: Position3D;
}

export interface EditorHotspot {
  id: string;
  scene_id: string;
  title: string;
  content_type: ContentType;
  content_markdown: string | null;
  media_url: string | null;
  icon: string | null;
  position_3d: Position3D;
}

interface ScreenPos {
  x: number;
  y: number;
  visible: boolean;
}

interface EditorMarkersOverlayProps {
  waypoints: EditorWaypoint[];
  hotspots: EditorHotspot[];
  editorMode: EditorMode;
  canEdit: boolean;
  onPlaceWaypoint: (position: Position3D) => void;
  onPlaceHotspot: (position: Position3D) => void;
  onMoveWaypoint: (id: string, position: Position3D) => void;
  onMoveHotspot: (id: string, position: Position3D) => void;
  onSelectItem: (type: "waypoint" | "hotspot", id: string) => void;
  selectedItemId: string | null;
}

// ---- 3D → 2D Projection ---------------------------------------------------

const _vec3 = new THREE.Vector3();

function project3DToScreen(
  pos: Position3D,
  camera: THREE.Camera,
  width: number,
  height: number,
): ScreenPos {
  _vec3.set(pos.x, pos.y, pos.z);
  _vec3.project(camera);
  const visible = _vec3.z >= -1 && _vec3.z <= 1;
  return {
    x: (_vec3.x * 0.5 + 0.5) * width,
    y: (-_vec3.y * 0.5 + 0.5) * height,
    visible,
  };
}

/** Unproject screen coords to a 3D point at a fixed depth. */
function screenTo3D(
  screenX: number,
  screenY: number,
  camera: THREE.Camera,
  width: number,
  height: number,
  depth: number = 5,
): Position3D {
  const ndcX = (screenX / width) * 2 - 1;
  const ndcY = -(screenY / height) * 2 + 1;

  const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
  const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);

  const dir = far.sub(near).normalize();
  const point = near.add(dir.multiplyScalar(depth));

  return { x: point.x, y: point.y, z: point.z };
}

// ---- Component -------------------------------------------------------------

export function EditorMarkersOverlay({
  waypoints,
  hotspots,
  editorMode,
  canEdit,
  onPlaceWaypoint,
  onPlaceHotspot,
  onMoveWaypoint,
  onMoveHotspot,
  onSelectItem,
  selectedItemId,
}: EditorMarkersOverlayProps) {
  const { viewer, container } = useViewerContext();
  const overlayRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Projected screen positions
  const [waypointPositions, setWaypointPositions] = useState<Map<string, ScreenPos>>(
    new Map(),
  );
  const [hotspotPositions, setHotspotPositions] = useState<Map<string, ScreenPos>>(
    new Map(),
  );

  // Drag state
  const [dragTarget, setDragTarget] = useState<{
    type: "waypoint" | "hotspot";
    id: string;
  } | null>(null);
  const [dragScreenPos, setDragScreenPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Pulsing ring for click-to-place
  const [clickIndicator, setClickIndicator] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // ---- Projection loop -----------------------------------------------------

  const updatePositions = useCallback(() => {
    if (!viewer || !container) return;
    const camera = viewer.getCamera() as THREE.Camera | null;
    if (!camera) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const newWP = new Map<string, ScreenPos>();
    for (const wp of waypoints) {
      newWP.set(wp.id, project3DToScreen(wp.position_3d, camera, rect.width, rect.height));
    }
    setWaypointPositions(newWP);

    const newHS = new Map<string, ScreenPos>();
    for (const hs of hotspots) {
      newHS.set(hs.id, project3DToScreen(hs.position_3d, camera, rect.width, rect.height));
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

  // ---- Click to place ------------------------------------------------------

  const handleOverlayClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!canEdit || editorMode === "select") return;
      if (!viewer || !container) return;
      if (dragTarget) return; // Don't place during drag

      const camera = viewer.getCamera() as THREE.Camera | null;
      if (!camera) return;

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      const position = screenTo3D(localX, localY, camera, rect.width, rect.height);

      // Show click indicator
      setClickIndicator({ x: localX, y: localY });
      setTimeout(() => setClickIndicator(null), 600);

      if (editorMode === "waypoint") {
        onPlaceWaypoint(position);
      } else if (editorMode === "hotspot") {
        onPlaceHotspot(position);
      }
    },
    [canEdit, editorMode, viewer, container, dragTarget, onPlaceWaypoint, onPlaceHotspot],
  );

  // ---- Drag to reposition --------------------------------------------------

  const handleDragStart = useCallback(
    (type: "waypoint" | "hotspot", id: string, e: ReactMouseEvent) => {
      if (!canEdit) return;
      e.stopPropagation();
      e.preventDefault();
      setDragTarget({ type, id });
      setDragScreenPos({ x: e.clientX, y: e.clientY });
    },
    [canEdit],
  );

  useEffect(() => {
    if (!dragTarget) return;

    function onMouseMove(e: globalThis.MouseEvent) {
      setDragScreenPos({ x: e.clientX, y: e.clientY });
    }

    function onMouseUp(e: globalThis.MouseEvent) {
      if (!dragTarget || !viewer || !container) {
        setDragTarget(null);
        setDragScreenPos(null);
        return;
      }

      const camera = viewer.getCamera() as THREE.Camera | null;
      if (!camera) {
        setDragTarget(null);
        setDragScreenPos(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const position = screenTo3D(localX, localY, camera, rect.width, rect.height);

      if (dragTarget.type === "waypoint") {
        onMoveWaypoint(dragTarget.id, position);
      } else {
        onMoveHotspot(dragTarget.id, position);
      }

      setDragTarget(null);
      setDragScreenPos(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragTarget, viewer, container, onMoveWaypoint, onMoveHotspot]);

  // ---- Cursor style --------------------------------------------------------

  const cursorClass =
    editorMode === "waypoint" || editorMode === "hotspot"
      ? "cursor-crosshair"
      : "";

  // ---- Render ---------------------------------------------------------------

  return (
    <div
      ref={overlayRef}
      className={`absolute inset-0 z-30 ${cursorClass}`}
      style={{ pointerEvents: editorMode !== "select" || dragTarget ? "auto" : "none" }}
      onClick={handleOverlayClick}
    >
      {/* Click-to-place indicator (pulsing ring) */}
      {clickIndicator && (
        <div
          className="pointer-events-none absolute"
          style={{
            left: clickIndicator.x,
            top: clickIndicator.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <div
            className="h-10 w-10 rounded-full border-2"
            style={{
              borderColor:
                editorMode === "waypoint" ? "var(--brand)" : "var(--accent)",
              animation: "editor-pulse-ring 600ms var(--ease-out) forwards",
            }}
          />
        </div>
      )}

      {/* Waypoint markers (edit mode) */}
      {waypoints.map((wp) => {
        const pos =
          dragTarget?.type === "waypoint" && dragTarget.id === wp.id && dragScreenPos
            ? {
                x:
                  dragScreenPos.x -
                  (container?.getBoundingClientRect().left ?? 0),
                y:
                  dragScreenPos.y -
                  (container?.getBoundingClientRect().top ?? 0),
                visible: true,
              }
            : waypointPositions.get(wp.id);
        if (!pos || !pos.visible) return null;

        const isSelected = selectedItemId === wp.id;
        const isDragging =
          dragTarget?.type === "waypoint" && dragTarget.id === wp.id;

        return (
          <div
            key={wp.id}
            className="absolute z-40 flex flex-col items-center gap-1"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, -50%) scale(${isSelected ? 1.15 : 1})`,
              transition: isDragging
                ? "none"
                : "transform var(--duration-base) var(--ease-out)",
              pointerEvents: "auto",
              animation:
                wp.id === selectedItemId
                  ? undefined
                  : "editor-marker-appear 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            {/* Drag handle on hover */}
            <button
              type="button"
              className={`group relative ${
                canEdit ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem("waypoint", wp.id);
              }}
              onMouseDown={(e) => canEdit && handleDragStart("waypoint", wp.id, e)}
              aria-label={`Waypoint: ${wp.label}`}
            >
              <svg
                width="40"
                height="40"
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="20"
                  cy="20"
                  r="17"
                  stroke="var(--brand)"
                  strokeWidth={isSelected ? "3" : "2.5"}
                  fill="none"
                  opacity={0.85}
                />
                {isSelected && (
                  <circle
                    cx="20"
                    cy="20"
                    r="17"
                    fill="var(--brand)"
                    opacity={0.15}
                  />
                )}
                <path
                  d="M16 13L24 20L16 27"
                  stroke="var(--brand)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* Label */}
            <span
              className="pointer-events-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{
                backgroundColor: "oklch(22% 0.02 68 / 0.75)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {wp.label}
            </span>
          </div>
        );
      })}

      {/* Hotspot markers (edit mode) */}
      {hotspots.map((hs) => {
        const pos =
          dragTarget?.type === "hotspot" && dragTarget.id === hs.id && dragScreenPos
            ? {
                x:
                  dragScreenPos.x -
                  (container?.getBoundingClientRect().left ?? 0),
                y:
                  dragScreenPos.y -
                  (container?.getBoundingClientRect().top ?? 0),
                visible: true,
              }
            : hotspotPositions.get(hs.id);
        if (!pos || !pos.visible) return null;

        const isSelected = selectedItemId === hs.id;
        const isDragging =
          dragTarget?.type === "hotspot" && dragTarget.id === hs.id;

        return (
          <div
            key={hs.id}
            className="absolute z-40 flex flex-col items-center gap-1"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translate(-50%, -50%) scale(${isSelected ? 1.15 : 1})`,
              transition: isDragging
                ? "none"
                : "transform var(--duration-base) var(--ease-out)",
              pointerEvents: "auto",
              animation:
                hs.id === selectedItemId
                  ? undefined
                  : "editor-marker-appear 300ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
            }}
          >
            <button
              type="button"
              className={`group relative ${
                canEdit ? "cursor-grab active:cursor-grabbing" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem("hotspot", hs.id);
              }}
              onMouseDown={(e) => canEdit && handleDragStart("hotspot", hs.id, e)}
              aria-label={`Hotspot: ${hs.title}`}
            >
              <svg
                width="36"
                height="36"
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="var(--accent)"
                  opacity={0.9}
                />
                {isSelected && (
                  <circle
                    cx="18"
                    cy="18"
                    r="17"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    fill="none"
                    opacity={0.5}
                  />
                )}
                {/* Info "i" icon */}
                <text
                  x="18"
                  y="23"
                  textAnchor="middle"
                  fill="white"
                  fontSize="16"
                  fontWeight="600"
                  fontFamily="var(--font-geist-sans), sans-serif"
                >
                  i
                </text>
              </svg>
            </button>
            {/* Title */}
            <span
              className="pointer-events-none whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white"
              style={{
                backgroundColor: "oklch(22% 0.02 68 / 0.75)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {hs.title}
            </span>
          </div>
        );
      })}
    </div>
  );
}
