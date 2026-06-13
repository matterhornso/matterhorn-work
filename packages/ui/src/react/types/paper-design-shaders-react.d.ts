declare module "@paper-design/shaders-react" {
  import type { ComponentProps, ComponentType } from "react";
  import type { GrainGradientShape } from "@paper-design/shaders";

  export interface GrainGradientProps extends Omit<ComponentProps<"div">, "color"> {
    colorBack?: string;
    colors?: string[];
    softness?: number;
    intensity?: number;
    noise?: number;
    shape?: GrainGradientShape;
    speed?: number;
    frame?: number;
    fit?: string;
    rotation?: number;
    scale?: number;
    originX?: number;
    originY?: number;
    offsetX?: number;
    offsetY?: number;
    worldWidth?: number;
    worldHeight?: number;
    width?: string | number;
    height?: string | number;
  }

  export const GrainGradient: ComponentType<GrainGradientProps>;

  export interface MeshGradientProps extends Omit<ComponentProps<"div">, "color"> {
    colors?: string[];
    distortion?: number;
    swirl?: number;
    grainMixer?: number;
    grainOverlay?: number;
    speed?: number;
    frame?: number;
    width?: string | number;
    height?: string | number;
  }

  export const MeshGradient: ComponentType<MeshGradientProps>;
}
