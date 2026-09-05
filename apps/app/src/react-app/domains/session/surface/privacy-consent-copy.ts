import type { MatterhornAgentPrivacyPreflightResponse } from "@matterhorn-work/types/guarded-agent-runtime";

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  workspace_agent_instructions: "your coworker's instructions",
  workspace_attachment: "an attached file",
  selected_memory: "saved memory",
  linked_wallet_context: "linked wallet details",
  transaction_intent: "a proposed wallet action",
  external_tool_data: "data returned by an external tool",
};

function joinNaturalList(items: string[]): string {
  if (items.length === 0) return "private workspace data";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

export function privacyConsentCategorySummary(categories: string[]): string {
  const labels = [...new Set(categories.flatMap((category) => {
    const label = CATEGORY_LABELS[category];
    return label ? [label] : [];
  }))];
  return joinNaturalList(labels);
}

function trainingSentence(
  provider: MatterhornAgentPrivacyPreflightResponse["provider"],
): string {
  if (provider.trainingUse === "none") {
    return "The provider reports that it does not use this request for training.";
  }
  if (provider.trainingUse === "opt_in_only") {
    return "The provider may use requests for training only when its Matterhorn account has opted in.";
  }
  return "Matterhorn has not verified whether the provider uses requests for training.";
}

function retentionSentence(
  provider: MatterhornAgentPrivacyPreflightResponse["provider"],
): string {
  if (provider.retentionDays === 0) {
    return "The provider reports that it does not retain the request or response.";
  }
  if (typeof provider.retentionDays === "number") {
    const unit = provider.retentionDays === 1 ? "day" : "days";
    return `The provider may retain request data for up to ${provider.retentionDays} ${unit}.`;
  }
  return "Matterhorn has not verified how long the provider keeps request data.";
}

export function privacyConsentDetail(
  preflight: MatterhornAgentPrivacyPreflightResponse,
): string {
  const categories = privacyConsentCategorySummary(preflight.detectedData.categories);
  const destination = preflight.provider.dataLeavesMatterhorn
    ? `Matterhorn will send it to ${preflight.provider.name}.`
    : "It stays inside Matterhorn.";

  return [
    `This request includes ${categories}.`,
    destination,
    trainingSentence(preflight.provider),
    retentionSentence(preflight.provider),
    "Approval applies only to this exact request and expires in five minutes.",
  ].join(" ");
}
