/** @jsxImportSource react */
import type { CSSProperties } from "react";
import { Dumbbell } from "lucide-react";
import { resolveExtensionIconSrc } from "../../../design-system/extension-icon-src";
import { getCustomerProtocolDeskVisual, type CustomerProtocolDeskId, type CustomerProtocolDeskVisual } from "./protocol-desk-ui";

type ProtocolBrandLogoProps = {
  id?: CustomerProtocolDeskId | string | null;
  visual?: CustomerProtocolDeskVisual | null;
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function ProtocolBrandLogo({
  id,
  visual: providedVisual,
  size = 24,
  className,
  style,
}: ProtocolBrandLogoProps) {
  const visual = providedVisual ?? getCustomerProtocolDeskVisual(id);
  const asset = visual?.brandAsset;
  const fallback = visual?.fallbackInitials ?? String(id ?? "").slice(0, 2).toUpperCase();

  if (!visual) return null;

  if (asset?.darkAssetPath || asset?.lightAssetPath) {
    const src = resolveExtensionIconSrc(asset.lightAssetPath || asset.darkAssetPath || "");
    const darkSrc = asset.darkAssetPath ? resolveExtensionIconSrc(asset.darkAssetPath) : null;
    const img = (
      <img
        alt={`${visual.displayName} logo`}
        className={className}
        height={size}
        src={src}
        style={{
          display: "block",
          height: size,
          width: size,
          objectFit: "contain",
          ...style,
        }}
        width={size}
      />
    );

    if (asset.darkAssetPath && asset.lightAssetPath) {
      return (
        <picture>
          <source media="(prefers-color-scheme: dark)" srcSet={darkSrc ?? src} />
          {img}
        </picture>
      );
    }

    return (
      img
    );
  }

  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        alignItems: "center",
        display: "inline-flex",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: Math.max(9, Math.round(size * 0.42)),
        fontWeight: 800,
        height: size,
        justifyContent: "center",
        lineHeight: 1,
        width: size,
        ...style,
      }}
    >
      {fallback}
    </span>
  );
}

/**
 * Desk marks use the same visual identity as their launcher in the app rail.
 * Longevity deliberately uses the familiar Dumbbell mark instead of its
 * separate asset so the desk and rail do not present competing identities.
 */
export function ProtocolDeskMark({
  id,
  visual,
  size = 24,
  className,
  style,
}: ProtocolBrandLogoProps) {
  const deskId = visual?.id ?? id;

  if (deskId === "wellness") {
    return <Dumbbell aria-hidden="true" className={className} size={size} style={style} />;
  }

  return <ProtocolBrandLogo id={id} visual={visual} size={size} className={className} style={style} />;
}
