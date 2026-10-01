export const JEV_CONSENT_VERSION = "jev-current-message-v1";
export const JEV_MODEL = "jev-1.13.0";
export const JEV_MAX_TEXT_LENGTH = 4_000;

export type JevAvailability = {
  available: boolean;
  reason: string;
  /** Opaque account/workspace scope for browser preference storage; not a credential. */
  preferenceScope: string;
  consentVersion: string;
};

export type JevRequest = {
  text: string;
  model: { providerId: string; modelId: string };
  consentVersion: string;
  privacyMode?: "public_research" | "private_workspace" | "transaction";
};

export type JevResult =
  | { status: "classified"; receipt: string; expiresAt: number; topic: string; task: string }
  | { status: "skipped" | "unavailable"; reason: string };
