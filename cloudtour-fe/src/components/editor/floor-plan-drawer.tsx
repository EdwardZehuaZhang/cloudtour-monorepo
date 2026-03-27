"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronUp, MapIcon, Upload, Trash2, ImageIcon } from "lucide-react";
import type { EditorScene } from "./tour-editor";
import type { ScenePosition } from "@cloudtour/types";

export interface FloorPlanData {
  id: string;
  tour_id: string;
  image_url: string;
  scene_positions: ScenePosition[];
}

interface FloorPlanDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  tourId: string;
  orgId: string;
  scenes: EditorScene[];
  activeSceneId: string | null;
  canEdit: boolean;
  floorPlan: FloorPlanData | null;
  onFloorPlanChange: (floorPlan: FloorPlanData | null) => void;
  onSelectScene: (sceneId: string) => void;
}

export function FloorPlanDrawer({
  isOpen,
  onToggle,
  tourId,
  orgId,
  scenes,
  activeSceneId,
  canEdit,
  floorPlan,
  onFloorPlanChange,
  onSelectScene,
}: FloorPlanDrawerProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Upload floor plan image ------------------------------------------------

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true);

    try {
      // Step 1: Get presigned URL
      const uploadRes = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours/${tourId}/floor-plan/upload`,
        { method: "POST" },
      );
      if (!uploadRes.ok) {
        console.error("[FloorPlan] Failed to get upload URL");
        return;
      }
      const { upload_url } = await uploadRes.json();

      // Step 2: Upload file directly to storage
      const uploadToStorage = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadToStorage.ok) {
        console.error("[FloorPlan] Failed to upload file");
        return;
      }

      // Step 3: Confirm upload
      const confirmRes = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours/${tourId}/floor-plan/upload`,
        { method: "PUT" },
      );
      if (!confirmRes.ok) {
        console.error("[FloorPlan] Failed to confirm upload");
        return;
      }

      const { data } = await confirmRes.json();
      onFloorPlanChange(data);
    } catch (err) {
      console.error("[FloorPlan] Upload error:", err);
    } finally {
      setIsUploading(false);
    }
  }, [orgId, tourId, onFloorPlanChange]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [handleUpload]);

  // ---- Delete floor plan ------------------------------------------------------

  const handleDelete = useCallback(async () => {
    const res = await fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours/${tourId}/floor-plan`,
      { method: "DELETE" },
    );
    if (res.ok) {
      onFloorPlanChange(null);
    }
  }, [orgId, tourId, onFloorPlanChange]);

  // ---- Drag scene markers onto floor plan -------------------------------------

  const getRelativePosition = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const img = imageRef.current;
      if (!img) return null;

      const rect = img.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;

      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [],
  );

  const handleMarkerMouseDown = useCallback(
    (e: React.MouseEvent, sceneId: string) => {
      if (!canEdit) return;
      e.preventDefault();
      e.stopPropagation();
      setDraggingSceneId(sceneId);
      const pos = getRelativePosition(e.clientX, e.clientY);
      if (pos) setDragPos(pos);
    },
    [canEdit, getRelativePosition],
  );

  useEffect(() => {
    if (!draggingSceneId) return;

    const handleMouseMove = (e: MouseEvent) => {
      const pos = getRelativePosition(e.clientX, e.clientY);
      if (pos) setDragPos(pos);
    };

    const handleMouseUp = (e: MouseEvent) => {
      const pos = getRelativePosition(e.clientX, e.clientY);
      if (pos && floorPlan) {
        const existingPositions = floorPlan.scene_positions.filter(
          (sp) => sp.scene_id !== draggingSceneId,
        );
        const newPositions = [...existingPositions, { scene_id: draggingSceneId, ...pos }];

        // Optimistic update
        onFloorPlanChange({ ...floorPlan, scene_positions: newPositions });

        // Sync to API
        fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours/${tourId}/floor-plan`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scene_positions: newPositions }),
        }).catch((err) => console.error("[FloorPlan] Failed to sync positions:", err));
      }

      setDraggingSceneId(null);
      setDragPos(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [draggingSceneId, floorPlan, orgId, tourId, getRelativePosition, onFloorPlanChange]);

  // ---- Drop unplaced scene from scene palette ---------------------------------

  const handleImageDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const sceneId = e.dataTransfer.getData("text/scene-id");
      if (!sceneId || !floorPlan) return;

      const pos = getRelativePosition(e.clientX, e.clientY);
      if (!pos) return;

      const existingPositions = floorPlan.scene_positions.filter(
        (sp) => sp.scene_id !== sceneId,
      );
      const newPositions = [...existingPositions, { scene_id: sceneId, ...pos }];

      onFloorPlanChange({ ...floorPlan, scene_positions: newPositions });

      fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001") + `/api/orgs/${orgId}/tours/${tourId}/floor-plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene_positions: newPositions }),
      }).catch((err) => console.error("[FloorPlan] Failed to sync positions:", err));
    },
    [floorPlan, orgId, tourId, getRelativePosition, onFloorPlanChange],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  // ---- Get scene marker position (from state or drag) -------------------------

  const getMarkerPosition = (sceneId: string) => {
    if (draggingSceneId === sceneId && dragPos) return dragPos;
    return floorPlan?.scene_positions.find((sp) => sp.scene_id === sceneId) ?? null;
  };

  // ---- Unplaced scenes --------------------------------------------------------

  const placedSceneIds = new Set(
    floorPlan?.scene_positions.map((sp) => sp.scene_id) ?? [],
  );
  const unplacedScenes = scenes.filter((s) => !placedSceneIds.has(s.id));

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--surface)]"
      style={{
        height: isOpen ? "200px" : "36px",
        transition: "height var(--duration-base) var(--ease-out)",
      }}
    >
      {/* Toggle bar */}
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 w-full items-center justify-between px-4 text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--text-primary)]"
      >
        <div className="flex items-center gap-2">
          <MapIcon size={14} />
          <span className="text-xs font-medium">Floor Plan</span>
        </div>
        <ChevronUp
          size={14}
          className="transition-transform duration-base"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Drawer content */}
      {isOpen && (
        <div className="flex h-[calc(100%-36px)] gap-3 overflow-hidden px-4 pb-3">
          {!floorPlan ? (
            /* No floor plan ?upload prompt */
            <div className="flex flex-1 items-center justify-center">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[var(--border)] px-8 py-4 text-[var(--text-secondary)] transition-colors duration-fast hover:border-[var(--brand)] hover:text-[var(--brand)]"
                >
                  <Upload size={20} />
                  <span className="text-xs font-medium">
                    {isUploading ? "Uploading..." : "Upload floor plan image"}
                  </span>
                  <span className="text-[10px] opacity-60">
                    PNG, JPG, or WebP
                  </span>
                </button>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  No floor plan uploaded yet.
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          ) : (
            /* Floor plan exists ?show image with markers + unplaced scenes */
            <>
              {/* Floor plan image with draggable markers */}
              <div
                ref={containerRef}
                className="relative flex-1 overflow-hidden rounded-md bg-[var(--bg)]"
                onDrop={handleImageDrop}
                onDragOver={handleDragOver}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imageRef}
                  src={floorPlan.image_url}
                  alt="Floor plan"
                  className="h-full w-full object-contain"
                  draggable={false}
                />

                {/* Scene markers on the floor plan */}
                {scenes.map((scene) => {
                  const pos = getMarkerPosition(scene.id);
                  if (!pos) return null;

                  const isActive = scene.id === activeSceneId;
                  const isDragging = scene.id === draggingSceneId;

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      className="absolute flex items-center justify-center rounded-full border-2 transition-transform duration-fast"
                      style={{
                        left: `${pos.x * 100}%`,
                        top: `${pos.y * 100}%`,
                        transform: `translate(-50%, -50%) ${isDragging ? "scale(1.3)" : isActive ? "scale(1.15)" : "scale(1)"}`,
                        width: "24px",
                        height: "24px",
                        backgroundColor: isActive
                          ? "var(--brand)"
                          : "var(--surface)",
                        borderColor: isActive
                          ? "var(--brand)"
                          : "var(--text-secondary)",
                        cursor: canEdit ? "grab" : "pointer",
                        zIndex: isDragging ? 20 : isActive ? 10 : 1,
                      }}
                      title={scene.title}
                      onClick={() => onSelectScene(scene.id)}
                      onMouseDown={(e) => handleMarkerMouseDown(e, scene.id)}
                    >
                      <span
                        className="text-[9px] font-bold"
                        style={{
                          color: isActive
                            ? "white"
                            : "var(--text-primary)",
                        }}
                      >
                        {scene.sort_order + 1}
                      </span>
                    </button>
                  );
                })}

                {/* Delete floor plan button */}
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="absolute right-2 top-2 rounded-md bg-[var(--surface)] p-1 text-[var(--text-secondary)] opacity-0 transition-opacity duration-fast hover:text-red-500 group-hover:opacity-100"
                    style={{ opacity: 1 }}
                    title="Remove floor plan"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>

              {/* Unplaced scenes palette */}
              {canEdit && unplacedScenes.length > 0 && (
                <div className="flex w-28 flex-col gap-1 overflow-y-auto">
                  <span className="mb-1 text-[10px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">
                    Drag to place
                  </span>
                  {unplacedScenes.map((scene) => (
                    <div
                      key={scene.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/scene-id", scene.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className="flex cursor-grab items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px] text-[var(--text-primary)] transition-colors duration-fast hover:border-[var(--brand)]"
                    >
                      {scene.thumbnail_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={scene.thumbnail_url}
                          alt=""
                          className="h-4 w-4 rounded-sm object-cover"
                        />
                      ) : (
                        <ImageIcon size={10} className="text-[var(--text-secondary)]" />
                      )}
                      <span className="truncate">{scene.title}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Replace floor plan */}
              {canEdit && (
                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors duration-fast hover:text-[var(--brand)]"
                    title="Replace floor plan"
                  >
                    <Upload size={14} />
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}


