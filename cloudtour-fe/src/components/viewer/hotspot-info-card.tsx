"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { ContentType } from "@cloudtour/types";

export interface HotspotInfoCardProps {
  /** Hotspot title */
  title: string;
  /** Content type */
  contentType: ContentType;
  /** Markdown/text content */
  contentMarkdown?: string | null;
  /** Media URL (image, video, audio) */
  mediaUrl?: string | null;
  /** Which edge the card slides in from */
  edge: "left" | "right" | "top" | "bottom";
  /** Called when the card is dismissed */
  onClose: () => void;
}

/**
 * Info card that slides in from the nearest edge when a hotspot is clicked.
 */
export function HotspotInfoCard({
  title,
  contentType,
  contentMarkdown,
  mediaUrl,
  edge,
  onClose,
}: HotspotInfoCardProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger slide-in animation on mount
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    });
  }, []);

  function handleClose() {
    setIsVisible(false);
    setTimeout(onClose, 200); // Wait for animation to complete
  }

  const positionStyles = getPositionStyles(edge);
  const transformHidden = getTransformHidden(edge);

  return (
    <div
      className="absolute z-50 pointer-events-auto"
      style={{
        ...positionStyles,
        transform: isVisible ? "translate(0, 0)" : transformHidden,
        opacity: isVisible ? 1 : 0,
        transition: `transform var(--duration-base) var(--ease-out), opacity var(--duration-base) var(--ease-out)`,
      }}
    >
      <div
        className="flex max-w-xs flex-col gap-3 rounded-lg p-4 text-white"
        style={{
          backgroundColor: "oklch(22% 0.02 68 / 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          maxHeight: "50vh",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white/60 hover:text-white transition-colors"
            style={{ transitionDuration: "var(--duration-fast)" }}
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        {/* Media */}
        {mediaUrl && (contentType === "image" || contentType === "video") && (
          <div className="overflow-hidden rounded-md">
            {contentType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt={title}
                className="w-full object-cover"
                style={{ maxHeight: "200px" }}
              />
            ) : (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={mediaUrl}
                controls
                className="w-full"
                style={{ maxHeight: "200px" }}
              />
            )}
          </div>
        )}

        {mediaUrl && contentType === "audio" && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio src={mediaUrl} controls className="w-full" />
        )}

        {mediaUrl && contentType === "link" && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
            style={{ color: "var(--accent)" }}
          >
            {mediaUrl}
          </a>
        )}

        {/* Text content */}
        {contentMarkdown && (
          <p className="text-sm leading-relaxed text-white/80">
            {contentMarkdown}
          </p>
        )}
      </div>
    </div>
  );
}

function getPositionStyles(
  edge: "left" | "right" | "top" | "bottom",
): React.CSSProperties {
  switch (edge) {
    case "left":
      return { left: 12, top: "50%", marginTop: "-auto" };
    case "right":
      return { right: 12, top: "50%", marginTop: "-auto" };
    case "top":
      return { top: 12, left: "50%", marginLeft: "-auto" };
    case "bottom":
      return { bottom: 12, left: "50%", marginLeft: "-auto" };
  }
}

function getTransformHidden(edge: "left" | "right" | "top" | "bottom") {
  switch (edge) {
    case "left":
      return "translate(-100%, 0)";
    case "right":
      return "translate(100%, 0)";
    case "top":
      return "translate(0, -100%)";
    case "bottom":
      return "translate(0, 100%)";
  }
}
