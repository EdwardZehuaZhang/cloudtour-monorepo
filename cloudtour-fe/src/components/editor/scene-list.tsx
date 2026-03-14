"use client";

import { useState, useRef, useCallback } from "react";
import { GripVertical, Plus, Upload, ImageIcon } from "lucide-react";
import type { EditorScene } from "./tour-editor";

interface SceneListProps {
  scenes: EditorScene[];
  activeSceneId: string | null;
  canEdit: boolean;
  onSelectScene: (sceneId: string) => void;
  onReorder: (scenes: EditorScene[]) => void;
  onAddScene: () => void;
}

export function SceneList({
  scenes,
  activeSceneId,
  canEdit,
  onSelectScene,
  onReorder,
  onAddScene,
}: SceneListProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
      setDragIndex(index);
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIndex(index);
  }, []);

  const handleDragEnter = useCallback(() => {
    dragCounterRef.current++;
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setOverIndex(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);

      if (isNaN(fromIndex) || fromIndex === toIndex) {
        setDragIndex(null);
        setOverIndex(null);
        dragCounterRef.current = 0;
        return;
      }

      const reordered = [...scenes];
      const [moved] = reordered.splice(fromIndex, 1);
      if (moved) {
        reordered.splice(toIndex, 0, moved);
        onReorder(
          reordered.map((s, i) => ({ ...s, sort_order: i }))
        );
      }

      setDragIndex(null);
      setOverIndex(null);
      dragCounterRef.current = 0;
    },
    [scenes, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setOverIndex(null);
    dragCounterRef.current = 0;
  }, []);

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]"
      style={{ transition: "width var(--duration-base) var(--ease-out)" }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Scenes
        </span>
        <span className="text-xs text-[var(--text-secondary)]">
          {scenes.length}
        </span>
      </div>

      {/* Scene items */}
      <div className="flex-1 overflow-y-auto p-2">
        {scenes.length === 0 && (
          <button
            type="button"
            onClick={canEdit ? onAddScene : undefined}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--border)] px-4 py-8 text-center transition-colors duration-base ${
              canEdit
                ? "cursor-pointer hover:border-[var(--brand)] hover:bg-[var(--brand)]/5"
                : "cursor-default"
            }`}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-alt)]">
              <Upload size={18} className="text-[var(--text-secondary)]" />
            </div>
            <p className="text-xs font-medium text-[var(--text-primary)]">
              {canEdit ? "Add your first scene" : "No scenes yet"}
            </p>
            <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
              Supports .ply .splat .spz
            </p>
          </button>
        )}

        {scenes.map((scene, index) => {
          const isActive = scene.id === activeSceneId;
          const isDragging = dragIndex === index;
          const isDropTarget = overIndex === index && dragIndex !== null && dragIndex !== index;

          return (
            <div
              key={scene.id}
              draggable={canEdit}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => onSelectScene(scene.id)}
              className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-md p-1.5 transition-colors duration-fast ${
                isActive
                  ? "bg-[var(--brand)]/10 ring-1 ring-[var(--brand)]/20"
                  : "hover:bg-[var(--surface-alt)]"
              } ${isDragging ? "opacity-40" : ""} ${
                isDropTarget ? "ring-2 ring-[var(--brand)]/40" : ""
              }`}
            >
              {/* Drag handle */}
              {canEdit && (
                <div className="flex shrink-0 cursor-grab items-center text-[var(--text-secondary)] opacity-0 transition-opacity duration-fast group-hover:opacity-100 active:cursor-grabbing">
                  <GripVertical size={14} />
                </div>
              )}

              {/* Thumbnail */}
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded bg-[var(--surface-alt)]">
                {scene.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={scene.thumbnail_url}
                    alt={scene.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon
                      size={14}
                      className="text-[var(--text-secondary)]/50"
                    />
                  </div>
                )}
                {/* Sort order badge */}
                <span className="absolute bottom-0.5 left-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/50 text-[9px] font-medium text-white">
                  {index + 1}
                </span>
              </div>

              {/* Scene info */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--text-primary)]">
                  {scene.title}
                </p>
                <p className="truncate text-[10px] text-[var(--text-secondary)]">
                  {scene.splat_file_format
                    ? `.${scene.splat_file_format}`
                    : "No file"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add scene button */}
      {canEdit && (
        <div className="shrink-0 border-t border-[var(--border)] p-2">
          <button
            type="button"
            onClick={onAddScene}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[var(--border)] py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 hover:text-[var(--brand)]"
          >
            <Plus size={14} />
            Add Scene
          </button>
        </div>
      )}
    </aside>
  );
}
