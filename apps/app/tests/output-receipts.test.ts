import { describe, expect, test } from "bun:test";
import type { MatterhornProjectEvidenceEvent } from "@matterhorn-work/types/project-evidence";

import type { OpenTarget } from "../src/react-app/domains/session/artifacts/open-target";
import {
  mergeOpenTargetsWithWorkflowOutputReceipts,
  openTargetFromWorkflowOutputReceipt,
  workflowOutputReceiptsFromEvidence,
} from "../src/react-app/domains/session/artifacts/output-receipts";

function makeEvent(overrides: Partial<MatterhornProjectEvidenceEvent> = {}): MatterhornProjectEvidenceEvent {
  return {
    id: "evt_1",
    workspaceId: "ws_1",
    type: "task.output_saved",
    source: "task_events",
    timestamp: "2026-07-05T10:00:00.000Z",
    title: "Saved output",
    summary: "longevity;session-alpha",
    desk: "longevity",
    sessionSlug: "session-alpha",
    taskId: "task_1",
    outputPath: "outputs/longevity/session-alpha/plan.md",
    artifactPaths: ["outputs/longevity/session-alpha/plan.md"],
    ...overrides,
  };
}

describe("workflow output receipts", () => {
  test("maps output-saved evidence into receipts", () => {
    const receipts = workflowOutputReceiptsFromEvidence([makeEvent()]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      kind: "workflow",
      outputPath: "outputs/longevity/session-alpha/plan.md",
      title: "Saved output",
      desk: "longevity",
      sessionSlug: "session-alpha",
      taskId: "task_1",
      status: "saved",
      artifactCount: 1,
    });
  });

  test("creates receipt targets that the Outputs panel can preview", () => {
    const [receipt] = workflowOutputReceiptsFromEvidence([makeEvent()]);
    const target = openTargetFromWorkflowOutputReceipt(receipt);

    expect(target).toMatchObject({
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      exists: true,
      reason: "workflow output receipt",
    });
  });

  test("maps generated image evidence into Outputs receipts", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "img_evt",
        type: "image.generated",
        title: "Image generated",
        summary: "mock;mock-image-1;.matterhorn-work/outputs/images/img_123.png",
        desk: undefined,
        sessionSlug: undefined,
        taskId: "image_gen_img_123",
        outputPath: ".matterhorn-work/outputs/images/img_123.png",
        artifactPaths: [".matterhorn-work/outputs/images/img_123.png"],
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      kind: "image",
      outputPath: ".matterhorn-work/outputs/images/img_123.png",
      title: "Image generated: img_123.png",
      status: "generated",
      taskId: "image_gen_img_123",
    });

    const target = openTargetFromWorkflowOutputReceipt(receipts[0]);
    expect(target).toMatchObject({
      id: "file:.matterhorn-work/outputs/images/img_123.png",
      preview: "image",
      exists: true,
    });
  });

  test("maps NFT evidence with output paths into Outputs receipts", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "nft_evt",
        type: "nft.listed",
        title: "NFT listed",
        summary: "nft;nft_draft_1",
        desk: "nft",
        taskId: "nft_listing_nft_draft_1",
        outputPath: ".matterhorn-work/outputs/nft-receipts/nft_draft_1/listing-receipt.json",
        artifactPaths: [".matterhorn-work/outputs/nft-receipts/nft_draft_1/listing-receipt.json"],
        metadata: {
          nftReceiptKind: "listing",
          nftNetwork: "sui-testnet",
          nftTransactionDigest: "0xlistingdigest",
          nftObjectId: "0xmintedobject",
          nftKioskId: "0xuserkiosk",
          nftTransferPolicyId: "0xtransferpolicy",
          custody: false,
          containsSignatureMaterial: false,
        },
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      kind: "nft",
      status: "published",
      outputPath: ".matterhorn-work/outputs/nft-receipts/nft_draft_1/listing-receipt.json",
      taskId: "nft_listing_nft_draft_1",
      nftReceipt: {
        kind: "listing",
        network: "sui-testnet",
        transactionDigest: "0xlistingdigest",
        objectId: "0xmintedobject",
        kioskId: "0xuserkiosk",
        transferPolicyId: "0xtransferpolicy",
        custody: false,
        containsSignatureMaterial: false,
      },
    });
  });

  test("maps NFT preview output handoffs into NFT preview receipts", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "nft_preview_evt",
        type: "task.output_saved",
        title: "Sui NFT mint preview",
        summary: "nft;nft_draft_1",
        desk: "nft",
        sessionSlug: "nft_draft_1",
        taskId: "nft_mint_preview_nft_draft_1",
        outputPath: ".matterhorn-work/outputs/nft-previews/nft_draft_1/mint-preview.json",
        artifactPaths: [".matterhorn-work/outputs/nft-previews/nft_draft_1/mint-preview.json"],
        metadata: {
          nftOutputKind: "mint_preview",
          nftNetwork: "sui-testnet",
          nftPackageId: "0xmintpackage",
          custody: false,
          containsSignatureMaterial: false,
        },
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      kind: "nft",
      status: "preview",
      title: "Sui NFT mint preview",
      outputPath: ".matterhorn-work/outputs/nft-previews/nft_draft_1/mint-preview.json",
      taskId: "nft_mint_preview_nft_draft_1",
      nftReceipt: {
        kind: "mint_preview",
        outputKind: "mint_preview",
        network: "sui-testnet",
        packageId: "0xmintpackage",
        custody: false,
        containsSignatureMaterial: false,
      },
    });
  });

  test("uses completed task runs as a fallback for outputs without saved events", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "run_1",
        type: "task.completed",
        source: "task_runs",
        title: "Workflow complete",
        outputPath: undefined,
        artifactPaths: [
          "outputs/longevity/session-alpha/plan.md",
          "outputs/longevity/session-alpha/checklist.json",
        ],
      }),
    ]);

    expect(receipts.map((receipt) => receipt.outputPath)).toEqual([
      "outputs/longevity/session-alpha/plan.md",
      "outputs/longevity/session-alpha/checklist.json",
    ]);
    expect(receipts.every((receipt) => receipt.status === "completed")).toBe(true);
  });

  test("prefers direct saved receipts over broader completion receipts for the same path", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "run_1",
        type: "task.completed",
        source: "task_runs",
        title: "Workflow complete",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
      makeEvent({
        id: "evt_saved",
        title: "Saved plan",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("saved");
    expect(receipts[0].title).toBe("Saved plan");
  });

  test("treats newer output-deleted evidence as a tombstone", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "evt_saved",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt_deleted",
        type: "task.output_deleted",
        title: "Output deleted",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(0);
  });

  test("keeps outputs saved after an older deletion event", () => {
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent({
        id: "evt_deleted",
        type: "task.output_deleted",
        title: "Output deleted",
        timestamp: "2026-07-05T10:00:00.000Z",
      }),
      makeEvent({
        id: "evt_saved",
        timestamp: "2026-07-05T10:05:00.000Z",
      }),
    ]);

    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe("saved");
  });

  test("merges receipt targets with message-discovered outputs", () => {
    const existingTarget: OpenTarget = {
      id: "file:outputs/longevity/session-alpha/plan.md",
      kind: "file",
      value: "outputs/longevity/session-alpha/plan.md",
      name: "plan.md",
      preview: "markdown",
      confidence: 80,
      reason: "write tool output",
      exists: true,
    };
    const receipts = workflowOutputReceiptsFromEvidence([
      makeEvent(),
      makeEvent({
        id: "evt_2",
        outputPath: "outputs/longevity/session-alpha/checklist.json",
        artifactPaths: ["outputs/longevity/session-alpha/checklist.json"],
      }),
    ]);

    const merged = mergeOpenTargetsWithWorkflowOutputReceipts([existingTarget], receipts);

    expect(merged.map((target) => target.value).sort()).toEqual([
      "outputs/longevity/session-alpha/checklist.json",
      "outputs/longevity/session-alpha/plan.md",
    ]);
    expect(merged.find((target) => target.value.endsWith("checklist.json"))?.preview).toBe("text");
    expect(merged.find((target) => target.value.endsWith("plan.md"))?.reason).toContain("workflow output receipt");
  });
});
