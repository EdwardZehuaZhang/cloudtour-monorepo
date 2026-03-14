"use client";

import { createContext, useContext } from "react";
import type { Viewer } from "@mkkellogg/gaussian-splats-3d";

interface ViewerContextValue {
  /** The gaussian-splats-3d Viewer instance, null until loaded */
  viewer: Viewer | null;
  /** The container element the viewer renders into */
  container: HTMLDivElement | null;
}

const ViewerContext = createContext<ViewerContextValue>({
  viewer: null,
  container: null,
});

export const ViewerProvider = ViewerContext.Provider;

export function useViewerContext() {
  return useContext(ViewerContext);
}
