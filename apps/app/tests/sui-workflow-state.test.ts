import { describe, expect, test } from "bun:test";

import {
  getSuiWorkflowAvailability,
  type SuiWorkflowAvailabilityInput,
} from "../src/react-app/domains/wallet/sui-workflow-state";

const READY_INPUT: SuiWorkflowAvailabilityInput = {
  clientReady: true,
  workspaceReady: true,
  sender: "0x2",
  recipient: "0x3",
  amountSui: "1",
  previewReady: false,
  previewSender: null,
  connectedAddress: null,
  digest: "",
};

describe("Sui workflow state", () => {
  test("blocks preview and receipt writes when the Matterhorn engine is offline", () => {
    const result = getSuiWorkflowAvailability({ ...READY_INPUT, clientReady: false });

    expect(result).toMatchObject({
      canPreparePreview: false,
      preparePreviewReason: "Matterhorn Desks engine is offline.",
      canSignPreview: false,
      signPreviewReason: "Matterhorn Desks engine is offline.",
      canImportReceipt: false,
      importReceiptReason: "Matterhorn Desks engine is offline.",
      nextAction: "connect_engine",
    });
  });

  test("requires a workspace before saving Sui evidence", () => {
    const result = getSuiWorkflowAvailability({ ...READY_INPUT, workspaceReady: false });

    expect(result.canPreparePreview).toBe(false);
    expect(result.preparePreviewReason).toBe("Open a workspace before saving Sui evidence.");
    expect(result.nextAction).toBe("open_workspace");
  });

  test("reports the next missing preview field in order", () => {
    expect(getSuiWorkflowAvailability({ ...READY_INPUT, sender: "" }).nextAction).toBe("enter_sender");
    expect(getSuiWorkflowAvailability({ ...READY_INPUT, recipient: "" }).nextAction).toBe("enter_recipient");
    expect(getSuiWorkflowAvailability({ ...READY_INPUT, amountSui: "" }).nextAction).toBe("enter_amount");
  });

  test("enables preview preparation before wallet signing", () => {
    const result = getSuiWorkflowAvailability(READY_INPUT);

    expect(result.canPreparePreview).toBe(true);
    expect(result.preparePreviewReason).toBeNull();
    expect(result.canSignPreview).toBe(false);
    expect(result.signPreviewReason).toBe("Prepare a Sui handoff before signing.");
    expect(result.nextAction).toBe("prepare_preview");
  });

  test("uses transaction-specific readiness for coin, object, and batch actions", () => {
    const blocked = getSuiWorkflowAvailability({
      ...READY_INPUT,
      recipient: "",
      amountSui: "",
      transactionDetailsReady: false,
      transactionDetailsReason: "Add at least two valid recipients and amounts.",
    });
    const ready = getSuiWorkflowAvailability({
      ...READY_INPUT,
      recipient: "",
      amountSui: "",
      transactionDetailsReady: true,
    });

    expect(blocked).toMatchObject({
      canPreparePreview: false,
      preparePreviewReason: "Add at least two valid recipients and amounts.",
    });
    expect(ready).toMatchObject({
      canPreparePreview: true,
      preparePreviewReason: null,
      nextAction: "prepare_preview",
    });
  });

  test("requires the connected Sui wallet to match the handoff sender", () => {
    const result = getSuiWorkflowAvailability({
      ...READY_INPUT,
      previewReady: true,
      previewSender: "0x2",
      connectedAddress: "0x9",
    });

    expect(result.canSignPreview).toBe(false);
    expect(result.signPreviewReason).toBe("The connected Sui wallet does not match the handoff sender.");
    expect(result.nextAction).toBe("connect_sender_wallet");
  });

  test("enables wallet signing when the handoff sender matches", () => {
    const result = getSuiWorkflowAvailability({
      ...READY_INPUT,
      previewReady: true,
      previewSender: "0x2",
      connectedAddress: "0X2",
    });

    expect(result.canSignPreview).toBe(true);
    expect(result.signPreviewReason).toBeNull();
    expect(result.nextAction).toBe("sign_in_wallet");
  });

  test("uses copy handoff instead of direct signing when wallet-standard connect is not available", () => {
    const result = getSuiWorkflowAvailability({
      ...READY_INPUT,
      previewReady: true,
      previewSender: "0x2",
      directWalletAvailable: false,
    });

    expect(result.canSignPreview).toBe(false);
    expect(result.signPreviewReason).toBe("Sign this handoff in an external Sui wallet or protocol client.");
    expect(result.nextAction).toBe("copy_handoff");
  });

  test("allows receipt import with a public digest even without a prepared preview", () => {
    const result = getSuiWorkflowAvailability({
      ...READY_INPUT,
      sender: "",
      recipient: "",
      amountSui: "",
      digest: "5xY8P6TQ4qGsGLk1qUZ9vCkD8uWnz1wQp2mgSm7Jyzky",
    });

    expect(result.canPreparePreview).toBe(false);
    expect(result.canImportReceipt).toBe(true);
    expect(result.importReceiptReason).toBeNull();
    expect(result.nextAction).toBe("import_receipt");
  });
});
