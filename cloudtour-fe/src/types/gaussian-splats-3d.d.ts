declare module "@mkkellogg/gaussian-splats-3d" {
  export const SceneRevealMode: {
    Default: 0;
    Gradual: 1;
    Instant: 2;
  };

  export const LogLevel: {
    None: 0;
    Error: 1;
    Warning: 2;
    Info: 3;
    Debug: 4;
  };

  export const RenderMode: {
    Always: 0;
    OnChange: 1;
    Never: 2;
  };

  export const SceneFormat: {
    Ply: 0;
    Splat: 1;
    Ksplat: 2;
    Spz: 3;
  };

  export const WebXRMode: {
    None: 0;
    VR: 1;
    AR: 2;
  };

  export interface ViewerOptions {
    rootElement?: HTMLElement;
    selfDrivenMode?: boolean;
    useBuiltInControls?: boolean;
    initialCameraPosition?: [number, number, number];
    initialCameraLookAt?: [number, number, number];
    cameraUp?: [number, number, number];
    sceneRevealMode?: number;
    logLevel?: number;
    sharedMemoryForWorkers?: boolean;
    antialiased?: boolean;
    showLoadingUI?: boolean;
    ignoreDevicePixelRatio?: boolean;
    halfPrecisionCovariancesOnGPU?: boolean;
    dynamicScene?: boolean;
    gpuAcceleratedSort?: boolean;
    renderMode?: number;
    webXRMode?: number;
    kernel2DSize?: number;
    maxScreenSpaceSplatSize?: number;
    sphericalHarmonicsDegree?: number;
    enableOptionalEffects?: boolean;
    focalAdjustment?: number;
    [key: string]: unknown;
  }

  export interface AddSplatSceneOptions {
    showLoadingUI?: boolean;
    progressiveLoad?: boolean;
    format?: number;
    position?: [number, number, number];
    rotation?: [number, number, number, number];
    scale?: [number, number, number];
    [key: string]: unknown;
  }

  export class Viewer {
    constructor(options?: ViewerOptions);
    addSplatScene(
      path: string,
      options?: AddSplatSceneOptions,
    ): Promise<void>;
    dispose(): void;
    start(): void;
    stop(): void;
    setSize(width: number, height: number): void;
    update(): void;
    getCamera(): unknown;
    getRenderer(): unknown;
    getScene(): unknown;
  }

  export class DropInViewer extends Viewer {}
}
