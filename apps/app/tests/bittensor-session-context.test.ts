import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";

import {
  addBittensorContextToResolvedText,
  buildBittensorCardActionContext,
  describeBittensorSessionContext,
  getBittensorSessionContext,
  readBittensorContextFromEventDetail,
  readBittensorContextFromToolOutput,
  sanitizeBittensorSessionContext,
  useBittensorSessionContextStore,
} from "../src/react-app/domains/session/surface/bittensor-context-store";

const VALID_SS58 = "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF";
const VALID_HOTKEY = "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspKqjH8dY4zNnVJX";
const SESSION_ID = "session-bittensor-context-test";

function readReactSource(path: string) {
  return readFileSync(new URL(`../src/react-app/${path}`, import.meta.url), "utf8");
}

afterEach(() => {
  useBittensorSessionContextStore.getState().clearContext(SESSION_ID);
});

describe("Bittensor evidence UI contract", () => {
  test("visible Bittensor cards can be saved as explicit public project evidence", () => {
    const messageList = readReactSource("domains/session/surface/message-list.tsx");
    const surface = readReactSource("domains/session/surface/session-surface.tsx");

    expect(messageList).toContain("export type BittensorPublicEvidenceCard");
    expect(messageList).toContain("BittensorEvidenceSaveButton");
    expect(messageList).toContain("Save to Outputs");
    expect(messageList).toContain("onSaveBittensorEvidence");
    expect(messageList).toContain("onSaveEvidence={props.onSaveBittensorEvidence}");
    expect(surface).toContain("handleSaveBittensorEvidence");
    expect(surface).toContain("workspaceBittensorPublicReadEvidence");
    expect(surface).toContain("matterhorn:project-evidence-updated");
    expect(surface).toContain("matterhorn:task-log-updated");
    expect(surface).toContain("bittensor.evidence.saved");
  });

  test("Bittensor evidence save stores public card fields rather than raw tool internals", () => {
    const surface = readReactSource("domains/session/surface/session-surface.tsx");

    expect(surface).toContain("publicBittensorEvidenceCard");
    expect(surface).toContain('source: "visible_bittensor_card"');
    expect(surface).toContain("cards: [publicCard]");
    expect(surface).not.toContain("data: card.data");
    expect(surface).not.toContain("source: card.source");
  });

  test("wallet-approved protocol receipts stay attached to the active workspace and session", () => {
    const panel = readReactSource("domains/wallet/pages/BittensorPanel.tsx");
    const walletPanel = readReactSource("domains/wallet/WalletPanel.tsx");
    const sessionRuntime = readReactSource("domains/wallet/session-wallet-runtime.tsx");
    const sessionPage = readReactSource("domains/session/chat/session-page.tsx");

    expect(sessionPage).toContain("workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}");
    expect(sessionPage).toContain("sessionId={props.selectedSessionId}");
    expect(sessionRuntime).toContain("workspaceId={props.workspaceId}");
    expect(sessionRuntime).toContain("sessionId={props.sessionId}");
    expect(walletPanel).toContain("workspaceId={workspaceId}");
    expect(walletPanel).toContain("sessionId={sessionId}");
    expect(panel).toContain("/hyperliquid/orders/submit");
    expect(panel).toContain("/polymarket/orders/receipt");
    expect(panel).toContain("/bittensor/extrinsics/receipt");
    expect(panel).toContain("Saved to Outputs · {evidencePath}");
    expect(panel).toContain("Matterhorn never stores the wallet signature after submission.");
  });
});

describe("Bittensor session context", () => {
  test("reads public context from Bittensor chat tool output", () => {
    const context = readBittensorContextFromToolOutput({
      context: {
        id: "bt-chat-test-abc123",
        ss58Address: VALID_SS58,
        netuid: 14,
        amountTao: "1",
        validatorHotkey: VALID_HOTKEY,
        lastIntent: "stake_plan",
        lastExecution: "unsigned_preview",
        updatedAt: "2026-06-10T00:00:00.000Z",
        warnings: ["External signature required"],
      },
    });

    expect(context?.id).toBe("bt-chat-test-abc123");
    expect(context?.ss58Address).toBe(VALID_SS58);
    expect(context?.netuid).toBe(14);
    expect(context?.validatorHotkey).toBe(VALID_HOTKEY);
    expect(context?.warnings).toEqual(["External signature required"]);
  });

  test("accepts panel handoff context without trusting arbitrary nested objects", () => {
    const context = readBittensorContextFromEventDetail({
      prompt: "Compare validators for this subnet",
      context: {
        netuid: "14",
        subnet: { name: "Nested object should not leak into prompt context" },
      },
    });

    expect(context?.id).toMatch(/^bt-chat-/);
    expect(context?.netuid).toBe(14);
    expect(context?.ss58Address).toBeNull();
  });

  test("adds context to resolved Bittensor prompts only", () => {
    const context = sanitizeBittensorSessionContext({
      id: "bt-chat-test-context",
      ss58Address: VALID_SS58,
      netuid: 14,
      amountTao: "1",
      validatorHotkey: VALID_HOTKEY,
    });

    expect(context).not.toBeNull();
    const resolved = addBittensorContextToResolvedText("where am I staked?", context);
    expect(resolved).toContain("Bittensor active context:");
    expect(resolved).toContain("contextId: bt-chat-test-context");
    expect(resolved).toContain(`ss58Address: ${VALID_SS58}`);
    expect(resolved).toContain("Use bittensor_chat");

    const unrelated = addBittensorContextToResolvedText("summarize this product note", context);
    expect(unrelated).toBe("summarize this product note");
  });

  test("does not duplicate visible context blocks", () => {
    const context = sanitizeBittensorSessionContext({ id: "bt-chat-test-existing", netuid: 14 });
    const prompt = "compare validators\n\nBittensor context:\n- netuid: 14";

    expect(addBittensorContextToResolvedText(prompt, context)).toBe(prompt);
  });

  test("merges context by session and keeps a readable strip label", () => {
    const store = useBittensorSessionContextStore.getState();
    const first = sanitizeBittensorSessionContext({ id: "bt-chat-test-merge", ss58Address: VALID_SS58 });
    const second = sanitizeBittensorSessionContext({ id: "bt-chat-test-merge", netuid: 14, validatorHotkey: VALID_HOTKEY });
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    store.setContext(SESSION_ID, first!);
    store.setContext(SESSION_ID, second!);

    const merged = getBittensorSessionContext(useBittensorSessionContextStore.getState(), SESSION_ID);
    expect(merged?.ss58Address).toBe(VALID_SS58);
    expect(merged?.netuid).toBe(14);
    expect(merged?.validatorHotkey).toBe(VALID_HOTKEY);
    expect(describeBittensorSessionContext(merged!)).toContain("wallet 5Grwva...jY9uQF");
    expect(describeBittensorSessionContext(merged!)).toContain("subnet 14");
  });

  test("builds structured chat context from validator card actions", () => {
    const context = buildBittensorCardActionContext({
      data: {
        candidate: { netuid: 14, hotkey: VALID_HOTKEY },
        comparison: { netuid: 14, strategy: "balanced" },
      },
    }, {
      payload: { prompt: "Plan stake for this validator" },
    });

    expect(context).toEqual({
      netuid: 14,
      validatorHotkey: VALID_HOTKEY,
    });
  });

  test("builds structured chat context from quote and wallet cards", () => {
    const quoteContext = buildBittensorCardActionContext({
      data: {
        quote: {
          netuid: 77,
          amountTao: "1.5",
          validatorHotkey: VALID_HOTKEY,
        },
      },
    }, {
      payload: { prompt: "Review this quote" },
    });

    expect(quoteContext).toEqual({
      netuid: 77,
      amountTao: "1.5",
      validatorHotkey: VALID_HOTKEY,
    });

    const walletContext = buildBittensorCardActionContext({
      data: { wallet: { ss58Address: VALID_SS58, taoBalance: 3 } },
    }, {
      payload: { prompt: "Where am I staked?" },
    });

    expect(walletContext).toEqual({
      ss58Address: VALID_SS58,
      coldkey: VALID_SS58,
    });
  });

  test("lets explicit action payload context override card data", () => {
    const context = buildBittensorCardActionContext({
      data: { candidate: { netuid: 14, hotkey: VALID_HOTKEY } },
    }, {
      payload: {
        prompt: "Plan stake",
        netuid: 21,
        amountTao: "2",
      },
    });

    expect(context).toEqual({
      netuid: 21,
      validatorHotkey: VALID_HOTKEY,
      amountTao: "2",
    });
  });
});
