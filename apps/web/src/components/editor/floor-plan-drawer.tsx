"use client";

import { ChevronUp, MapIcon } from "lucide-react";

interface FloorPlanDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function FloorPlanDrawer({ isOpen, onToggle }: FloorPlanDrawerProps) {
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
        <div className="flex h-[calc(100%-36px)] items-center justify-center px-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Floor plan upload and scene positioning coming in a future update.
          </p>
        </div>
      )}
    </div>
  );
}
