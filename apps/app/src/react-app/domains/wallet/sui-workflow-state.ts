export type SuiWorkflowAvailabilityInput = {
  clientReady: boolean;
  workspaceReady: boolean;
  sender: string | null | undefined;
  recipient: string | null | undefined;
  amountSui: string | null | undefined;
  previewReady: boolean;
  previewSender?: string | null;
  connectedAddress?: string | null;
  directWalletAvailable?: boolean;
  digest: string | null | undefined;
};

export type SuiWorkflowAvailability = {
  canPreparePreview: boolean;
  preparePreviewReason: string | null;
  canSignPreview: boolean;
  signPreviewReason: string | null;
  canImportReceipt: boolean;
  importReceiptReason: string | null;
  nextAction:
    | "connect_engine"
    | "open_workspace"
    | "enter_sender"
    | "enter_recipient"
    | "enter_amount"
    | "prepare_preview"
    | "connect_sender_wallet"
    | "sign_in_wallet"
    | "copy_handoff"
    | "import_receipt";
};

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function sameAddress(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right?.trim().toLowerCase();
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function firstBlockingReason(input: SuiWorkflowAvailabilityInput): {
  nextAction: SuiWorkflowAvailability["nextAction"];
  reason: string | null;
} {
  if (!input.clientReady) {
    return { nextAction: "connect_engine", reason: "Matterhorn Work engine is offline." };
  }
  if (!input.workspaceReady) {
    return { nextAction: "open_workspace", reason: "Open a workspace before saving Sui evidence." };
  }
  if (!hasValue(input.sender)) {
    return { nextAction: "enter_sender", reason: "Enter the public sender address." };
  }
  if (!hasValue(input.recipient)) {
    return { nextAction: "enter_recipient", reason: "Enter the public recipient address." };
  }
  if (!hasValue(input.amountSui)) {
    return { nextAction: "enter_amount", reason: "Enter the SUI amount." };
  }
  return { nextAction: "prepare_preview", reason: null };
}

export function getSuiWorkflowAvailability(input: SuiWorkflowAvailabilityInput): SuiWorkflowAvailability {
  const previewBlocker = firstBlockingReason(input);
  const canPreparePreview = previewBlocker.reason === null;
  const directWalletAvailable = input.directWalletAvailable ?? true;

  let signPreviewReason: string | null = null;
  if (!canPreparePreview) {
    signPreviewReason = previewBlocker.reason;
  } else if (!input.previewReady) {
    signPreviewReason = "Prepare a Sui preview before signing.";
  } else if (!directWalletAvailable) {
    signPreviewReason = "Sign this handoff in an external Sui wallet or protocol client.";
  } else if (!hasValue(input.connectedAddress)) {
    signPreviewReason = "Connect the Sui wallet that owns the sender address.";
  } else if (!sameAddress(input.connectedAddress, input.previewSender ?? input.sender)) {
    signPreviewReason = "The connected Sui wallet does not match the preview sender.";
  }

  const canSignPreview = signPreviewReason === null;

  let importReceiptReason: string | null = null;
  if (!input.clientReady) {
    importReceiptReason = "Matterhorn Work engine is offline.";
  } else if (!input.workspaceReady) {
    importReceiptReason = "Open a workspace before saving Sui evidence.";
  } else if (!hasValue(input.digest)) {
    importReceiptReason = "Paste the public Sui transaction digest.";
  }

  const canImportReceipt = importReceiptReason === null;
  const nextAction: SuiWorkflowAvailability["nextAction"] = (() => {
    if (!input.clientReady) return "connect_engine";
    if (!input.workspaceReady) return "open_workspace";
    if (canImportReceipt && !input.previewReady) return "import_receipt";
    if (!canPreparePreview) return previewBlocker.nextAction;
    if (!input.previewReady) return "prepare_preview";
    if (!directWalletAvailable) return "copy_handoff";
    if (!hasValue(input.connectedAddress)) return "connect_sender_wallet";
    if (!sameAddress(input.connectedAddress, input.previewSender ?? input.sender)) return "connect_sender_wallet";
    if (canSignPreview) return "sign_in_wallet";
    if (canImportReceipt) return "import_receipt";
    return "prepare_preview";
  })();

  return {
    canPreparePreview,
    preparePreviewReason: previewBlocker.reason,
    canSignPreview,
    signPreviewReason,
    canImportReceipt,
    importReceiptReason,
    nextAction,
  };
}
