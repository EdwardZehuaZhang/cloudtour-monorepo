"use client";

export interface SceneSwitcherScene {
  id: string;
  title: string;
}

export interface SceneSwitcherProps {
  scenes: SceneSwitcherScene[];
  activeSceneId: string;
  onSceneChange: (sceneId: string) => void;
}

/**
 * Horizontal pill row at bottom-center of the viewer.
 * Active scene has brand underline. Only shown if >1 scene.
 */
export function SceneSwitcher({
  scenes,
  activeSceneId,
  onSceneChange,
}: SceneSwitcherProps) {
  if (scenes.length <= 1) return null;

  return (
    <div className="absolute bottom-4 left-1/2 z-40 -translate-x-1/2 pointer-events-auto">
      <div
        className="flex items-center gap-1 rounded-full px-2 py-1.5"
        style={{
          backgroundColor: "oklch(22% 0.02 68 / 0.65)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSceneChange(scene.id)}
              className="relative px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                color: isActive
                  ? "white"
                  : "oklch(85% 0.015 68 / 0.7)",
                transitionDuration: "var(--duration-fast)",
              }}
              aria-label={`Switch to ${scene.title}`}
              aria-current={isActive ? "true" : undefined}
            >
              {scene.title}
              {/* Brand underline for active scene */}
              {isActive && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full"
                  style={{
                    width: "60%",
                    backgroundColor: "var(--brand)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
