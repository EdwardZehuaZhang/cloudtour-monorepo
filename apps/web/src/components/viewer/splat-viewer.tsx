"use client";

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { Maximize2, Share2 } from "lucide-react";
import { ViewerProvider } from "./viewer-context";

// ---- Types ----------------------------------------------------------------

export interface SplatViewerProps {
  /** URL to the splat file (.ply, .splat, .spz) */
  src: string;
  /** Optional scene title displayed during loading */
  sceneTitle?: string;
  /** Fallback thumbnail shown on error */
  thumbnailUrl?: string;
  /** Camera initial position [x, y, z] */
  initialCameraPosition?: [number, number, number];
  /** Camera look‑at target [x, y, z] */
  initialCameraLookAt?: [number, number, number];
  /** Extra class names for the container */
  className?: string;
  /** Optional children rendered on top of the viewer (waypoints, hotspots) */
  children?: ReactNode;
  /** Called when share button is clicked */
  onShare?: () => void;
}

// ---- Helpers ---------------------------------------------------------------

function cls(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

// ---- Component -------------------------------------------------------------

export function SplatViewer({
  src,
  sceneTitle,
  thumbnailUrl,
  initialCameraPosition = [0, 10, 15],
  initialCameraLookAt = [0, 0, 0],
  className,
  children,
  onShare,
}: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<
    import("@mkkellogg/gaussian-splats-3d").Viewer | null
  >(null);

  const [loadingState, setLoadingState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [isHovering, setIsHovering] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Progressive blur level: 1 = full blur, 0 = sharp
  const [blurLevel, setBlurLevel] = useState(1);

  // ---- Viewer lifecycle ----------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return;

    let disposed = false;

    async function init() {
      setLoadingState("loading");
      setBlurLevel(1);

      try {
        // Dynamic import – keep gaussian-splats-3d out of the initial bundle
        const GaussianSplats3D = await import(
          "@mkkellogg/gaussian-splats-3d"
        );

        if (disposed) return;

        const viewer = new GaussianSplats3D.Viewer({
          rootElement: container,
          selfDrivenMode: true,
          useBuiltInControls: true,
          initialCameraPosition,
          initialCameraLookAt,
          cameraUp: [0, 1, 0],
          sceneRevealMode: GaussianSplats3D.SceneRevealMode.Gradual,
          logLevel: GaussianSplats3D.LogLevel.None,
          sharedMemoryForWorkers: false,
          antialiased: true,
          showLoadingUI: false,
          ignoreDevicePixelRatio: false,
        } as Record<string, unknown>);

        viewerRef.current = viewer;

        // Start progressive blur reveal
        const blurInterval = setInterval(() => {
          setBlurLevel((prev) => {
            const next = prev - 0.05;
            if (next <= 0) {
              clearInterval(blurInterval);
              return 0;
            }
            return next;
          });
        }, 80);

        await viewer.addSplatScene(src, {
          showLoadingUI: false,
          progressiveLoad: true,
        });

        if (disposed) {
          clearInterval(blurInterval);
          viewer.dispose();
          return;
        }

        // Clear any remaining blur
        clearInterval(blurInterval);
        setBlurLevel(0);
        setLoadingState("loaded");
      } catch (err) {
        console.error("[SplatViewer] Failed to load scene:", err);
        if (!disposed) setLoadingState("error");
      }
    }

    init();

    return () => {
      disposed = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch {
          // Viewer may already be disposed
        }
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ---- Fullscreen ----------------------------------------------------------

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      el.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // ---- Context value for overlay children -----------------------------------

  const viewerContextValue = useMemo(
    () => ({
      viewer: viewerRef.current,
      container: containerRef.current,
    }),
    // Re-compute when loadingState changes (viewer becomes available on "loaded")
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loadingState],
  );

  // ---- Render --------------------------------------------------------------

  const showControls = isHovering && loadingState !== "error";

  return (
    <div
      ref={containerRef}
      className={cls(
        "relative w-full h-full overflow-hidden bg-black",
        className,
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Progressive blur overlay */}
      {loadingState === "loading" && blurLevel > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{
            backdropFilter: `blur(${Math.round(blurLevel * 40)}px)`,
            WebkitBackdropFilter: `blur(${Math.round(blurLevel * 40)}px)`,
            transition: "backdrop-filter 80ms linear",
          }}
        />
      )}

      {/* Scene title during load */}
      {loadingState === "loading" && sceneTitle && (
        <div
          className="absolute inset-x-0 bottom-8 z-20 flex justify-center"
          style={{
            opacity: blurLevel > 0.3 ? 1 : 0,
            transition: `opacity var(--duration-slow) var(--ease-out)`,
          }}
        >
          <span className="font-display text-lg text-white/80 tracking-wide">
            {sceneTitle}
          </span>
        </div>
      )}

      {/* Error fallback */}
      {loadingState === "error" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailUrl}
              alt={sceneTitle || "Scene preview"}
              className="absolute inset-0 h-full w-full object-cover opacity-40"
            />
          ) : null}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-white/10 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-white/60"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
            </div>
            <p className="text-sm text-white/60">Preview unavailable</p>
          </div>
        </div>
      )}

      {/* Controls overlay — ghost in on hover */}
      <div
        className="absolute inset-0 z-30 pointer-events-none"
        style={{
          opacity: showControls ? 1 : 0,
          transition: `opacity var(--duration-base) var(--ease-out)`,
        }}
      >
        {/* Top-right controls */}
        <div className="absolute top-3 right-3 flex gap-2 pointer-events-auto">
          <ControlButton
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <Maximize2 size={16} />
          </ControlButton>
          {onShare && (
            <ControlButton onClick={onShare} aria-label="Share">
              <Share2 size={16} />
            </ControlButton>
          )}
        </div>
      </div>

      {/* Overlay children (waypoints, hotspots, etc.) — provided viewer context */}
      <ViewerProvider value={viewerContextValue}>
        {children}
      </ViewerProvider>
    </div>
  );
}

// ---- Control button --------------------------------------------------------

function ControlButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cls(
        "flex h-8 w-8 items-center justify-center rounded-full",
        "text-white/80 hover:text-white",
        "transition-colors",
      )}
      style={{
        backgroundColor: "oklch(99% 0.003 68 / 0.15)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        transitionDuration: "var(--duration-fast)",
      }}
      {...props}
    >
      {children}
    </button>
  );
}
