export type DeskTaskInputKind = "ss58" | "sui_address" | "transaction_digest" | "market" | "generic";

export type DeskTaskInputRequirement = {
  kind: DeskTaskInputKind;
  fieldId: string;
  label: string;
  actionLabel: string;
  placeholder: string;
  inputPlaceholder: string;
  helpText: string;
  missingMessage: string;
  invalidMessage: string;
};

const PROMPT_PLACEHOLDER_PATTERN = /<(?:paste|describe) ([^>]+)>/i;
const SECRET_INPUT_PATTERN =
  /\b(seed phrase|private key|mnemonic|raw signature|signed payload|wallet export|api secret|exchange secret)\b/i;
const SS58_PUBLIC_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const SUI_PUBLIC_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{32,64}$/;
const PUBLIC_DIGEST_PATTERN = /^[1-9A-HJ-NP-Za-km-zA-F0-9]{32,96}$/;

function normalizePlaceholderLabel(text: string) {
  return text
    .replace(/\b(public|transaction)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDeskTaskInputRequirement(prompt: string): DeskTaskInputRequirement | null {
  const match = prompt.match(PROMPT_PLACEHOLDER_PATTERN);
  if (!match?.[0] || !match[1]) return null;

  const placeholder = match[0];
  const description = match[1].trim();
  const lowerDescription = description.toLowerCase();

  if (lowerDescription.includes("ss58")) {
    return {
      kind: "ss58",
      fieldId: "ss58Address",
      label: "Public SS58 address",
      actionLabel: "Add address",
      placeholder,
      inputPlaceholder: "5GrwvaEF...",
      helpText: "Paste a public coldkey only. Never paste a seed phrase or private key.",
      missingMessage: "Paste the public SS58 address to start this task.",
      invalidMessage: "Use a public SS58 address, not a seed phrase or private key.",
    };
  }

  if (lowerDescription.includes("sui address")) {
    return {
      kind: "sui_address",
      fieldId: "suiAddress",
      label: "Public Sui address",
      actionLabel: "Add address",
      placeholder,
      inputPlaceholder: "0x...",
      helpText: "Use the public wallet address only. Signing stays in your Sui wallet.",
      missingMessage: "Paste the public Sui address to start this task.",
      invalidMessage: "Use a public Sui address beginning with 0x.",
    };
  }

  if (lowerDescription.includes("digest")) {
    return {
      kind: "transaction_digest",
      fieldId: "transactionDigest",
      label: "Transaction digest",
      actionLabel: "Add digest",
      placeholder,
      inputPlaceholder: "Transaction digest",
      helpText: "Use a public transaction digest after signing elsewhere.",
      missingMessage: "Paste the public transaction digest to start this task.",
      invalidMessage: "Use a public transaction digest, not a signed payload.",
    };
  }

  if (lowerDescription.includes("market")) {
    return {
      kind: "market",
      fieldId: "market",
      label: "Describe the market or trade",
      actionLabel: "Describe market",
      placeholder,
      inputPlaceholder: "e.g. YES on a September rate cut, $50",
      helpText: "Use the market question or your trade idea. A Polymarket link is optional.",
      missingMessage: "Describe the market or paste a Polymarket link to start.",
      invalidMessage: "Use a public market description or link, not wallet or API secrets.",
    };
  }

  const label = normalizePlaceholderLabel(description) || "Public context";
  return {
    kind: "generic",
    fieldId: "publicContext",
    label,
    actionLabel: "Add context",
    placeholder,
    inputPlaceholder: label,
    helpText: "Use public context only. Never paste secrets.",
    missingMessage: `Add ${label.toLowerCase()} to start this task.`,
    invalidMessage: `Use public ${label.toLowerCase()} only.`,
  };
}

export function validateDeskTaskInput(requirement: DeskTaskInputRequirement, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return requirement.missingMessage;
  if (SECRET_INPUT_PATTERN.test(trimmed)) return requirement.invalidMessage;

  switch (requirement.kind) {
    case "ss58":
      return SS58_PUBLIC_ADDRESS_PATTERN.test(trimmed) ? null : requirement.invalidMessage;
    case "sui_address":
      return SUI_PUBLIC_ADDRESS_PATTERN.test(trimmed) ? null : requirement.invalidMessage;
    case "transaction_digest":
      return PUBLIC_DIGEST_PATTERN.test(trimmed) ? null : requirement.invalidMessage;
    case "market":
      return trimmed.length >= 3 ? null : requirement.invalidMessage;
    default:
      return trimmed.length >= 2 ? null : requirement.invalidMessage;
  }
}

export function buildDeskTaskPromptWithInput(
  prompt: string,
  requirement: DeskTaskInputRequirement,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return prompt;
  const promptWithInput = prompt.includes(requirement.placeholder)
    ? prompt.replace(requirement.placeholder, trimmed)
    : `${prompt}\n\n${requirement.label}: ${trimmed}`;

  if (requirement.kind !== "market") return promptWithInput;

  return `${promptWithInput}

Treat the request above as either a natural-language market or trade description, or an optional exact Polymarket URL or slug. Search the current public Polymarket catalog to resolve the exact market. If multiple markets plausibly match, show at most three concise choices and ask me to choose before continuing. Check compliance before preparing exact order terms. The Agent draft must remain non-submittable. If the request is an eligible buy, sell, or cancel action, direct me to the separate connected-wallet trade ticket for final review and authorization. Never auto-sign, auto-submit, or place a bet from chat or a watch.`;
}

export function buildDeskTaskPromptRequestingInput(
  prompt: string,
  requirement: DeskTaskInputRequirement,
): string {
  const requestedContext = requirement.label.toLowerCase();
  const taskOutline = prompt.includes(requirement.placeholder)
    ? prompt.replace(requirement.placeholder, `[waiting for ${requestedContext}]`)
    : prompt;

  return `${taskOutline}

Before doing this task, ask me to provide ${requestedContext} in chat. Do not guess the missing information or start the task until I reply. Let me answer in the main chat composer. Ask only for public context and never request a seed phrase, private key, raw signature, signed payload, wallet export, or API secret.`;
}
