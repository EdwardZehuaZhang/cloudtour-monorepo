"use client";

import { useState } from "react";

export interface WaypointMarkerProps {
  /** Label displayed on hover */
  label: string;
  /** Screen-space X position (px) */
  x: number;
  /** Screen-space Y position (px) */
  y: number;
  /** Whether the marker is visible (in front of camera) */
  visible: boolean;
  /** Called when the waypoint is clicked */
  onClick: () => void;
}

/**
 * Waypoint marker: hollow circle with directional arrow in --brand color.
 * Scales on hover. Click navigates to target scene.
 */
export function WaypointMarker({
  label,
  x,
  y,
  visible,
  onClick,
}: WaypointMarkerProps) {
  const [isHovered, setIsHovered] = useState(false);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="absolute z-40 flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 group"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${isHovered ? 1.25 : 1})`,
        transition: "transform var(--duration-base) var(--ease-out)",
        pointerEvents: "auto",
      }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={`Navigate to ${label}`}
    >
      {/* Hollow circle with directional arrow */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Outer hollow circle */}
        <circle
          cx="20"
          cy="20"
          r="17"
          stroke="var(--brand)"
          strokeWidth="2.5"
          fill="none"
          opacity={isHovered ? 1 : 0.85}
        />
        {/* Semi-transparent fill on hover */}
        <circle
          cx="20"
          cy="20"
          r="17"
          fill="var(--brand)"
          opacity={isHovered ? 0.15 : 0}
          style={{ transition: "opacity var(--duration-fast)" }}
        />
        {/* Directional arrow (chevron right) */}
        <path
          d="M16 13L24 20L16 27"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Label tooltip */}
      <span
        className="whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-white"
        style={{
          backgroundColor: "oklch(22% 0.02 68 / 0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          opacity: isHovered ? 1 : 0,
          transform: `translateY(${isHovered ? 0 : -4}px)`,
          transition:
            "opacity var(--duration-fast), transform var(--duration-fast)",
          pointerEvents: "none",
        }}
      >
        {label}
      </span>
    </button>
  );
}
