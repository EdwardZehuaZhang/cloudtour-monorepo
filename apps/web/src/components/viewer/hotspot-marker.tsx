"use client";

import { useState } from "react";
import { Info, Image, Video, Music, Link as LinkIcon } from "lucide-react";
import type { ContentType } from "@cloudtour/types";

export interface HotspotMarkerProps {
  /** Title of the hotspot */
  title: string;
  /** Content type determines the icon */
  contentType: ContentType;
  /** Custom icon name override */
  icon?: string | null;
  /** Screen-space X position (px) */
  x: number;
  /** Screen-space Y position (px) */
  y: number;
  /** Whether the marker is visible (in front of camera) */
  visible: boolean;
  /** Whether this hotspot's info card is currently shown */
  isActive: boolean;
  /** Called when the hotspot is clicked */
  onClick: () => void;
}

function getContentIcon(contentType: ContentType) {
  switch (contentType) {
    case "image":
      return Image;
    case "video":
      return Video;
    case "audio":
      return Music;
    case "link":
      return LinkIcon;
    default:
      return Info;
  }
}

/**
 * Hotspot marker: filled circle with icon in --accent amber.
 * Scales on hover. Click shows info card.
 */
export function HotspotMarker({
  title,
  contentType,
  x,
  y,
  visible,
  isActive,
  onClick,
}: HotspotMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);
  const Icon = getContentIcon(contentType);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="absolute z-40 flex flex-col items-center gap-1 group"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${isHovered || isActive ? 1.25 : 1})`,
        transition: "transform var(--duration-base) var(--ease-out)",
        pointerEvents: "auto",
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={`View ${title}`}
    >
      {/* Filled circle with icon */}
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          backgroundColor: isActive
            ? "var(--accent)"
            : "oklch(72% 0.165 62 / 0.85)",
          boxShadow: isActive
            ? "0 0 0 3px oklch(72% 0.165 62 / 0.3)"
            : "none",
          transition:
            "background-color var(--duration-fast), box-shadow var(--duration-fast)",
        }}
      >
        <Icon size={18} className="text-white" strokeWidth={2} />
      </div>

      {/* Title tooltip */}
      <span
        className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white"
        style={{
          backgroundColor: "oklch(22% 0.02 68 / 0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          opacity: isHovered && !isActive ? 1 : 0,
          transform: `translateY(${isHovered && !isActive ? 0 : -4}px)`,
          transition:
            "opacity var(--duration-fast), transform var(--duration-fast)",
          pointerEvents: "none",
        }}
      >
        {title}
      </span>
    </button>
  );
}
