"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, Eye, Settings } from "lucide-react";
import type { TourStatus } from "@cloudtour/types";

interface EditorHeaderProps {
  title: string;
  status: TourStatus;
  slug: string;
  canEdit: boolean;
  onTitleChange: (newTitle: string) => void;
  onPublish: () => void;
  onSettingsClick: () => void;
}

const statusStyles: Record<TourStatus, string> = {
  draft: "bg-[var(--text-secondary)]/15 text-[var(--text-secondary)]",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-amber-100 text-amber-700",
};

export function EditorHeader({
  title,
  status,
  slug,
  canEdit,
  onTitleChange,
  onPublish,
  onSettingsClick,
}: EditorHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitTitle = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onTitleChange(trimmed);
    } else {
      setEditValue(title);
    }
    setIsEditing(false);
  }, [editValue, title, onTitleChange]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4">
      {/* Back to dashboard */}
      <Link
        href="/dashboard"
        className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
        aria-label="Back to dashboard"
      >
        <ArrowLeft size={16} />
      </Link>

      <div className="mx-1 h-5 w-px bg-[var(--border)]" />

      {/* Tour title (inline-editable) */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isEditing && canEdit ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setEditValue(title);
                setIsEditing(false);
              }
            }}
            className="h-7 min-w-0 flex-1 rounded border border-[var(--brand)] bg-transparent px-1.5 text-sm font-medium text-[var(--text-primary)] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => canEdit && setIsEditing(true)}
            className="min-w-0 truncate rounded px-1.5 py-0.5 text-sm font-medium text-[var(--text-primary)] transition-colors duration-fast hover:bg-[var(--surface-alt)]"
            title={canEdit ? "Click to edit title" : title}
          >
            {title}
          </button>
        )}

        {/* Status badge */}
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusStyles[status]}`}
        >
          {status}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5">
        {/* Preview link */}
        <Link
          href={`/tours/${slug}`}
          target="_blank"
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
        >
          <Eye size={14} />
          Preview
        </Link>

        {/* Settings button */}
        <button
          type="button"
          onClick={onSettingsClick}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-secondary)] transition-colors duration-fast hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]"
          aria-label="Tour settings"
        >
          <Settings size={14} />
        </button>

        {/* Publish button */}
        {canEdit && status === "draft" && (
          <button
            type="button"
            onClick={onPublish}
            className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--brand)] px-3 text-xs font-medium text-white transition-colors duration-fast hover:bg-[var(--brand-light)]"
          >
            <Globe size={14} />
            Publish
          </button>
        )}
      </div>
    </header>
  );
}
