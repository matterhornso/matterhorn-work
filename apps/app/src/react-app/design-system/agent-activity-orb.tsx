/** @jsxImportSource react */
import type { OrbSize, OrbState } from "thinking-orbs";
import { ThinkingOrb } from "thinking-orbs";

export type AgentActivityKind =
  | "planning"
  | "reading"
  | "searching"
  | "connecting"
  | "working"
  | "synthesizing"
  | "composing"
  | "listening"
  | "shaping"
  | "idle";

export const AGENT_ACTIVITY_ORB_STATE: Record<AgentActivityKind, OrbState> = {
  planning: "solving",
  reading: "searching",
  searching: "searching",
  connecting: "connecting",
  working: "working",
  synthesizing: "weaving",
  composing: "composing",
  listening: "listening",
  shaping: "shaping",
  idle: "breathing",
};

export function orbStateForAgentActivity(activity: AgentActivityKind): OrbState {
  return AGENT_ACTIVITY_ORB_STATE[activity];
}

type AgentActivityOrbBaseProps = {
  activity: AgentActivityKind;
  size?: OrbSize;
  className?: string;
};

type AgentActivityOrbProps = AgentActivityOrbBaseProps & (
  | { decorative?: true; label?: never }
  | { decorative: false; label: string }
);

/**
 * Matterhorn's single visual vocabulary for active agent work.
 *
 * Most placements sit inside a live status region, so the canvas is
 * presentation-only and the nearby text owns the announcement. Standalone
 * placements must opt out of `decorative` and provide a specific label.
 */
export function AgentActivityOrb({
  activity,
  size = 20,
  className,
  decorative = true,
  label,
}: AgentActivityOrbProps) {
  return (
    <ThinkingOrb
      state={orbStateForAgentActivity(activity)}
      size={size}
      theme="auto"
      className={className}
      role={decorative ? "presentation" : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? "" : label}
    />
  );
}
