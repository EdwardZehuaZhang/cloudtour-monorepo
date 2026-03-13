"use client";

import { ImageIcon } from "lucide-react";
import type { EditorScene } from "./tour-editor";

interface InspectorPanelProps {
  scene: EditorScene | null;
  canEdit: boolean;
}

export function InspectorPanel({ scene }: InspectorPanelProps) {
  return (
    <aside
      className="flex w-[280px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)]"
      style={{ transition: "width var(--duration-base) var(--ease-out)" }}
    >
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center border-b border-[var(--border)] px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Properties
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {scene ? (
          <div className="space-y-4">
            {/* Scene title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Title
              </label>
              <p className="text-sm text-[var(--text-primary)]">
                {scene.title}
              </p>
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Description
              </label>
              <p className="text-sm text-[var(--text-secondary)]">
                {scene.description ?? "No description"}
              </p>
            </div>

            {/* File format */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Splat File
              </label>
              <p className="text-sm text-[var(--text-secondary)]">
                {scene.splat_file_format
                  ? `.${scene.splat_file_format} uploaded`
                  : "No file uploaded"}
              </p>
            </div>

            <div className="border-t border-[var(--border)] pt-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Full property editing coming in a future update.
              </p>
            </div>
          </div>
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
