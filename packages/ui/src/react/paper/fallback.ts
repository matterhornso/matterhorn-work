import type { ComponentPropsWithoutRef, CSSProperties } from "react";

let webGlSupported: boolean | null = null;

export function canRenderPaperShader(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.webdriver) return false;
  if (webGlSupported !== null) return webGlSupported;

  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    webGlSupported = Boolean(context);
  } catch {
    webGlSupported = false;
  }

  return webGlSupported;
}

export function cssSize(value: string | number | undefined): string | number | undefined {
  return value;
}

export function mergeFallbackStyle(
  style: CSSProperties | undefined,
  width: string | number | undefined,
  height: string | number | undefined,
  background: string,
): CSSProperties {
  return {
    ...(style ?? {}),
    ...(width !== undefined ? { width: cssSize(width) } : {}),
    ...(height !== undefined ? { height: cssSize(height) } : {}),
    background,
  };
}

export function paperShaderFallbackDivProps(
  props: Record<string, unknown>,
): Omit<ComponentPropsWithoutRef<"div">, "style"> & { style?: CSSProperties } {
  const {
    ref: _ref,
    webGlContextAttributes: _webGlContextAttributes,
    ...rest
  } = props;
  return rest as Omit<ComponentPropsWithoutRef<"div">, "style"> & { style?: CSSProperties };
}

export function paperMeshFallbackBackground(colors: string[]): string {
  const palette = colors.length ? colors : ["#e0eaff", "#241d9a", "#f75092", "#9f50d3"];
  const [a, b, c, d] = [
    palette[0] ?? "#e0eaff",
    palette[1] ?? palette[0] ?? "#241d9a",
    palette[2] ?? palette[0] ?? "#f75092",
    palette[3] ?? palette[1] ?? "#9f50d3",
  ];

  return [
    `radial-gradient(circle at 16% 18%, ${a}, transparent 38%)`,
    `radial-gradient(circle at 84% 10%, ${b}, transparent 44%)`,
    `radial-gradient(circle at 54% 92%, ${c}, transparent 46%)`,
    `linear-gradient(135deg, ${a}, ${d})`,
  ].join(", ");
}

export function paperGrainFallbackBackground(colorBack: string, colors: string[]): string {
  const palette = colors.length ? colors : ["#7300ff", "#eba8ff", "#00bfff", "#2b00ff"];
  const [a, b, c] = [
    palette[0] ?? "#7300ff",
    palette[1] ?? palette[0] ?? "#eba8ff",
    palette[2] ?? palette[0] ?? "#00bfff",
  ];

  return [
    `radial-gradient(circle at 18% 22%, ${a}, transparent 38%)`,
    `radial-gradient(circle at 82% 18%, ${b}, transparent 42%)`,
    `radial-gradient(circle at 48% 88%, ${c}, transparent 44%)`,
    colorBack,
  ].join(", ");
}
