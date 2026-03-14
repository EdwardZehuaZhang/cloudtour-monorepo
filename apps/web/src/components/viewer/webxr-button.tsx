"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface WebXRButtonProps {
  /** Reference to the Three.js renderer for attaching XR sessions */
  getRenderer?: () => { xr: { setSession: (session: XRSession) => Promise<void> } } | null;
  /** Additional class names */
  className?: string;
}

type XRAvailability = "checking" | "available" | "unavailable";

/**
 * Custom visionOS-inspired spatial computing glyph.
 * Rounded rectangle "visor" with subtle eye lens shapes — NOT generic VR goggles.
 */
function VisionOSGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Visor body — rounded pill shape like Apple Vision Pro */}
      <path
        d="M2 12C2 9.5 4 7 7 7h10c3 0 5 2.5 5 5s-2 5-5 5H7c-3 0-5-2.5-5-5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Left lens */}
      <ellipse
        cx="9"
        cy="12"
        rx="2.5"
        ry="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* Right lens */}
      <ellipse
        cx="15"
        cy="12"
        rx="2.5"
        ry="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {/* Bridge connector */}
      <path
        d="M11.5 12h1"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WebXRButton({ getRenderer, className }: WebXRButtonProps) {
  const [availability, setAvailability] = useState<XRAvailability>("checking");
  const sessionRef = useRef<XRSession | null>(null);
  const [sessionActive, setSessionActive] = useState(false);

  // Check WebXR immersive-vr support
  useEffect(() => {
    async function checkXR() {
      if (typeof navigator === "undefined" || !("xr" in navigator)) {
        setAvailability("unavailable");
        return;
      }

      try {
        const supported = await navigator.xr!.isSessionSupported(
          "immersive-vr",
        );
        setAvailability(supported ? "available" : "unavailable");
      } catch {
        setAvailability("unavailable");
      }
    }

    checkXR();
  }, []);

  const handleClick = useCallback(async () => {
    // End existing session
    if (sessionRef.current) {
      await sessionRef.current.end();
      sessionRef.current = null;
      setSessionActive(false);
      return;
    }

    if (!navigator.xr) return;

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
      });

      sessionRef.current = session;
      setSessionActive(true);

      // If a Three.js renderer is available, attach the XR session
      const renderer = getRenderer?.();
      if (renderer) {
        await renderer.xr.setSession(session);
      }

      session.addEventListener("end", () => {
        sessionRef.current = null;
        setSessionActive(false);
      });
    } catch (err) {
      console.error("[WebXR] Failed to start session:", err);
    }
  }, [getRenderer]);

  // Gracefully hidden when not supported
  if (availability !== "available") return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={[
        "flex items-center gap-2 rounded-full px-3 py-2",
        "text-white/80 hover:text-white",
        "transition-colors",
        "pointer-events-auto",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        backgroundColor: "oklch(99% 0.003 68 / 0.15)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        transitionDuration: "var(--duration-fast)",
      }}
      aria-label={
        sessionActive
          ? "Exit immersive view"
          : "View in Apple Vision Pro"
      }
    >
      <VisionOSGlyph size={18} />
      <span className="text-xs font-medium whitespace-nowrap">
        {sessionActive ? "Exit immersive view" : "View in Apple Vision Pro"}
      </span>
    </button>
  );
}
