"use client"

import { MeshGradient, type MeshGradientProps } from "@paper-design/shaders-react"
import { resolvePaperMeshGradientConfig } from "../../common/paper"
import {
  canRenderPaperShader,
  mergeFallbackStyle,
  paperMeshFallbackBackground,
  paperShaderFallbackDivProps,
} from "./fallback"

export interface PaperMeshGradientProps
  extends Omit<
    MeshGradientProps,
    "colors" | "distortion" | "swirl" | "grainMixer" | "grainOverlay" | "speed" | "frame"
  > {
  seed?: string
  fill?: boolean
  colors?: string[]
  distortion?: number
  swirl?: number
  grainMixer?: number
  grainOverlay?: number
  speed?: number
  frame?: number
}

export function PaperMeshGradient({
  seed,
  fill = true,
  colors,
  distortion,
  swirl,
  grainMixer,
  grainOverlay,
  speed,
  frame,
  width,
  height,
  ...props
}: PaperMeshGradientProps) {
  const resolved = resolvePaperMeshGradientConfig({
    seed,
    colors,
    distortion,
    swirl,
    grainMixer,
    grainOverlay,
    speed,
    frame,
  })
  const resolvedWidth = width ?? (fill ? "100%" : undefined)
  const resolvedHeight = height ?? (fill ? "100%" : undefined)

  if (!canRenderPaperShader()) {
    const fallbackProps = paperShaderFallbackDivProps(props as Record<string, unknown>)
    return (
      <div
        {...fallbackProps}
        style={mergeFallbackStyle(
          fallbackProps.style,
          resolvedWidth,
          resolvedHeight,
          paperMeshFallbackBackground(resolved.colors),
        )}
      />
    )
  }

  return (
    <MeshGradient
      {...props}
      width={resolvedWidth}
      height={resolvedHeight}
      colors={resolved.colors}
      distortion={resolved.distortion}
      swirl={resolved.swirl}
      grainMixer={resolved.grainMixer}
      grainOverlay={resolved.grainOverlay}
      speed={resolved.speed}
      frame={resolved.frame}
    />
  )
}
