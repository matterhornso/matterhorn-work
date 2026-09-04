import { describe, expect, test } from "bun:test";

import type {
  MatterhornCryptoAppResult,
  MatterhornCryptoIntent,
  MatterhornPolicyDecision,
} from "@matterhorn-work/types/crypto-coworkers";
import { MATTERHORN_POLICY_DECISION_VERSION } from "@matterhorn-work/types/crypto-coworkers";
import { isReviewedActionHandoffV2 } from "@matterhorn-work/types/reviewed-actions";

import {
  compileCertifiedCryptoIntent,
  cryptoIntentToReviewedActionHandoffV2,
  validateCryptoIntentIntegrity,
} from "./crypto-transaction-coordinator.js";

const NOW = new Date("2026-09-01T12:00:01.000Z");

function policyDecision(intent: MatterhornCryptoIntent): MatterhornPolicyDecision {
  return {
    version: MATTERHORN_POLICY_DECISION_VERSION,
    runId: intent.runId,
    intentHash: intent.intentHash,
    decision: "wallet_review_required",
    reasonCodes: ["wallet_review_required"],
    evaluatedPolicyHashes: [intent.policyHash],
    evaluatedAt: NOW.toISOString(),
    limits: [],
  };
}

function envelope(input: {
  appId: string;
  connectionId: string;
  actionId: string;
  network: string;
  result: Record<string, unknown>;
  blockOrVersion?: string | null;
}): MatterhornCryptoAppResult {
  return {
    version: "matterhorn.crypto-app-result.v1",
    app: { id: input.appId, manifestRevision: "1.0.0", connectionId: input.connectionId },
    action: { id: input.actionId, access: "prepare", network: input.network },
    timing: {
      startedAt: "2026-09-01T12:00:00.000Z",
      completedAt: "2026-09-01T12:00:00.020Z",
      durationMs: 20,
    },
    observation: {
      source: "certified testnet simulation",
      observedAt: "2026-09-01T12:00:00.000Z",
      blockOrVersion: input.blockOrVersion ?? "checkpoint:100",
      ageMs: 20,
      freshnessMaxAgeMs: 15_000,
    },
    provenance: {
      trust: "untrusted_external",
      sanitization: "typed_projection",
      evidenceReference: `sha256:${"e".repeat(64)}`,
    },
    metering: { costMicros: 0, reservationId: "reservation_prepare" },
    result: input.result,
  };
}

describe("deterministic crypto transaction coordinator", () => {
  test("compiles exact certified Sui terms and produces a wallet-only v2 handoff", () => {
    const request = {
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amountSui: "1.25",
      memo: "treasury transfer",
    };
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "a".repeat(64),
      canonicalRequestArguments: request,
      now: NOW,
      result: envelope({
        appId: "matterhorn.sui-testnet",
        connectionId: "cxc_sui",
        actionId: "sui_transfer_preview",
        network: "sui:testnet",
        result: {
          preparedActionId: "sui_preview_1",
          network: "sui:testnet",
          sender: request.sender,
          recipient: request.recipient,
          amountSui: request.amountSui,
          estimatedGasMist: "1000",
          simulationReference: `sha256:${"b".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:15.000Z",
        },
      }),
    });
    expect(intent).toMatchObject({
      version: "matterhorn.crypto-intent.v1",
      protocol: "sui",
      network: "sui:testnet",
      signer: request.sender,
      operation: "transfer_sui",
      amount: "1.25",
      asset: "SUI",
      recipient: request.recipient,
      slippageBps: null,
      capabilityClass: "wallet_review_only",
      canonicalArguments: request,
    });
    expect(validateCryptoIntentIntegrity(intent)).toEqual([]);
    const handoff = cryptoIntentToReviewedActionHandoffV2(intent, policyDecision(intent));
    expect(isReviewedActionHandoffV2(handoff)).toBe(true);
    expect(handoff).toMatchObject({
      protocol: "sui",
      runId: "run_sui_prepare",
      signer: request.sender,
      capabilityClass: "wallet_review_only",
      simulation: { reference: `sha256:${"b".repeat(64)}` },
      draft: {
        operation: "transfer_sui",
        network: "testnet",
        sender: request.sender,
        recipient: request.recipient,
        amount: "1.25",
      },
    });
  });

  test("compiles resolved Hyperliquid price, side and slippage into the reviewed ticket", () => {
    const address = `0x${"3".repeat(40)}`;
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_hl_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "c".repeat(64),
      canonicalRequestArguments: {
        address,
        asset: "BTC",
        side: "buy",
        size: "0.1",
        orderType: "limit",
        price: "64000",
        reduceOnly: false,
        maxSlippageBps: 50,
      },
      now: NOW,
      result: envelope({
        appId: "matterhorn.hyperliquid-testnet",
        connectionId: "cxc_hl",
        actionId: "hyperliquid_preview_order",
        network: "hyperliquid:testnet",
        blockOrVersion: `sha256:${"d".repeat(64)}`,
        result: {
          preparedActionId: "hl_preview_1",
          network: "hyperliquid:testnet",
          address,
          asset: "BTC",
          side: "buy",
          size: "0.1",
          orderType: "limit",
          limitPrice: "64000",
          reduceOnly: false,
          maxSlippageBps: 50,
          simulationReference: `sha256:${"d".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:30.000Z",
        },
      }),
    });
    expect(intent.canonicalArguments).toEqual({
      address,
      asset: "BTC",
      side: "buy",
      size: "0.1",
      orderType: "limit",
      limitPrice: "64000",
      reduceOnly: false,
      maxSlippageBps: 50,
    });
    expect(cryptoIntentToReviewedActionHandoffV2(intent, policyDecision(intent))).toMatchObject({
      protocol: "hyperliquid",
      signer: address,
      operation: "place_order",
      amount: "0.1",
      asset: "BTC",
      slippage: "50bps",
      draft: {
        operation: "place_order",
        network: "testnet",
        side: "buy",
        size: 0.1,
        orderType: "limit",
        limitPrice: 64_000,
        slippageBps: 50,
        reduceOnly: false,
      },
    });
  });

  test("compiles exact Polymarket token and FAK bounds into a wallet-only v2 handoff", () => {
    const signer = `0x${"4".repeat(40)}`;
    const marketId = `0x${"a".repeat(64)}`;
    const tokenId = "71321045679252212594626385532706912750332728571942532289631379312455583992563";
    const request = {
      signer,
      marketId,
      tokenId,
      outcome: "Yes",
      side: "buy",
      amountUsdc: "25",
      amountShares: null,
      maxSlippageBps: 100,
    };
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_polymarket_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "9".repeat(64),
      canonicalRequestArguments: request,
      now: NOW,
      result: envelope({
        appId: "matterhorn.polymarket-wallet-preview",
        connectionId: "cxc_polymarket",
        actionId: "polymarket_preview_order",
        network: "polymarket:polygon",
        blockOrVersion: `0x${"b".repeat(64)}`,
        result: {
          version: "matterhorn.polymarket-wallet-preview.v1",
          network: "polymarket:polygon",
          signer,
          marketId,
          tokenId,
          outcome: "Yes",
          side: "buy",
          amountUsdc: "25",
          amountShares: null,
          orderType: "FAK",
          limitPrice: "0.47",
          maxSlippageBps: 100,
          tickSize: "0.01",
          minimumOrderSize: "1",
          negativeRisk: false,
          bestPrice: "0.46",
          estimatedAverageFillPrice: "0.46",
          estimatedShares: "54.347826086956",
          estimatedProceedsUsdc: null,
          maximumSpendUsdc: "25",
          visibleDepthSufficient: true,
          snapshotHash: `0x${"b".repeat(64)}`,
          simulationReference: `sha256:${"c".repeat(64)}`,
          observedAt: "2026-09-01T12:00:00.000Z",
          expiresAt: "2026-09-01T12:00:30.000Z",
        },
      }),
    });
    expect(intent).toMatchObject({
      protocol: "polymarket",
      network: "polymarket:polygon",
      signer,
      operation: "buy",
      asset: tokenId,
      amount: "25",
      recipient: marketId,
      slippageBps: 100,
      capabilityClass: "wallet_review_only",
    });
    const handoff = cryptoIntentToReviewedActionHandoffV2(intent, policyDecision(intent));
    expect(isReviewedActionHandoffV2(handoff)).toBe(true);
    expect(handoff).toMatchObject({
      protocol: "polymarket",
      signer,
      draft: {
        operation: "buy",
        marketId,
        tokenId,
        outcome: "Yes",
        orderType: "FAK",
        limitPrice: 0.47,
        tickSize: "0.01",
        negativeRisk: false,
        amountUsdc: 25,
        slippageTolerance: 1,
      },
    });
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_polymarket_mutated",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "9".repeat(64),
      canonicalRequestArguments: request,
      now: NOW,
      result: envelope({
        appId: "matterhorn.polymarket-wallet-preview",
        connectionId: "cxc_polymarket",
        actionId: "polymarket_preview_order",
        network: "polymarket:polygon",
        result: {
          ...(intent.canonicalArguments as Record<string, unknown>),
          network: "polymarket:polygon",
          tokenId: "9",
          simulationReference: `sha256:${"c".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:30.000Z",
        },
      }),
    })).toThrow("crypto_intent_request_result_mismatch");
  });

  test("compiles exact Bittensor testnet terms into a connected-wallet-only handoff", () => {
    const sender = `5${"C".repeat(47)}`;
    const hotkey = `5${"E".repeat(47)}`;
    const request = { sender, hotkey, netuid: 14, amountTao: "0.1" };
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_bittensor_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "f".repeat(64),
      canonicalRequestArguments: request,
      now: NOW,
      result: envelope({
        appId: "matterhorn.bittensor-testnet",
        connectionId: "cxc_bittensor",
        actionId: "bittensor_prepare_stake",
        network: "bittensor:test",
        blockOrVersion: "123456",
        result: {
          preparedActionId: "bt_preview_1",
          network: "bittensor:test",
          action: "stake",
          sender,
          destination: null,
          hotkey,
          netuid: 14,
          amountTao: "0.1",
          availableTao: "10",
          currentStakeTao: "2",
          expectedAlpha: "0.19",
          networkFeeTao: "0.0001",
          swapFeeTao: "0.00005",
          slippageBps: 25,
          block: 123456,
          simulationReference: `sha256:${"9".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:15.000Z",
        },
      }),
    });
    expect(intent).toMatchObject({
      protocol: "bittensor",
      network: "bittensor:test",
      signer: sender,
      operation: "stake",
      asset: "TAO",
      amount: "0.1",
      recipient: hotkey,
      slippageBps: 25,
      canonicalArguments: request,
      capabilityClass: "wallet_review_only",
    });
    expect(validateCryptoIntentIntegrity(intent)).toEqual([]);
    expect(cryptoIntentToReviewedActionHandoffV2(intent, policyDecision(intent))).toMatchObject({
      protocol: "bittensor",
      signer: sender,
      network: "bittensor:test",
      operation: "stake",
      amount: "0.1",
      asset: "TAO",
      recipient: hotkey,
      slippage: "25bps",
      capabilityClass: "wallet_review_only",
      draft: {
        operation: "stake",
        sender,
        destination: null,
        hotkey,
        netuid: 14,
        amountTao: "0.1",
      },
    });
  });

  test("rejects Bittensor action, recipient, and amount substitution", () => {
    const sender = `5${"C".repeat(47)}`;
    const destination = `5${"D".repeat(47)}`;
    const result = envelope({
      appId: "matterhorn.bittensor-testnet",
      connectionId: "cxc_bittensor",
      actionId: "bittensor_prepare_transfer",
      network: "bittensor:test",
      result: {
        preparedActionId: "bt_preview_substituted",
        network: "bittensor:test",
        action: "transfer",
        sender,
        destination,
        hotkey: null,
        netuid: null,
        amountTao: "2",
        availableTao: "10",
        currentStakeTao: null,
        expectedAlpha: null,
        networkFeeTao: "0.0001",
        swapFeeTao: null,
        slippageBps: null,
        block: 123456,
        simulationReference: `sha256:${"8".repeat(64)}`,
        expiresAt: "2026-09-01T12:00:15.000Z",
      },
    });
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_bittensor_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "f".repeat(64),
      canonicalRequestArguments: { sender, destination, amountTao: "1" },
      result,
      now: NOW,
    })).toThrow("crypto_intent_request_result_mismatch");
    (result.result as Record<string, unknown>).amountTao = "1";
    (result.result as Record<string, unknown>).destination = `5${"F".repeat(47)}`;
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_bittensor_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "f".repeat(64),
      canonicalRequestArguments: { sender, destination, amountTao: "1" },
      result,
      now: NOW,
    })).toThrow("crypto_intent_request_result_mismatch");
  });

  test("rejects request/result confusion, stale evidence and intent mutation", () => {
    const request = {
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amountSui: "1.25",
    };
    const certified = envelope({
      appId: "matterhorn.sui-testnet",
      connectionId: "cxc_sui",
      actionId: "sui_transfer_preview",
      network: "sui:testnet",
      result: {
        preparedActionId: "sui_preview_1",
        network: "sui:testnet",
        sender: request.sender,
        recipient: request.recipient,
        amountSui: "2.00",
        estimatedGasMist: "1000",
        simulationReference: `sha256:${"b".repeat(64)}`,
        expiresAt: "2026-09-01T12:00:15.000Z",
      },
    });
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "a".repeat(64),
      canonicalRequestArguments: request,
      result: certified,
      now: NOW,
    })).toThrow("crypto_intent_request_result_mismatch");

    certified.result = { ...(certified.result as Record<string, unknown>), amountSui: "1.25" };
    certified.observation.ageMs = 20_000;
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "a".repeat(64),
      canonicalRequestArguments: request,
      result: certified,
      now: NOW,
    })).toThrow("crypto_intent_simulation_stale");

    certified.observation.ageMs = 20;
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "a".repeat(64),
      canonicalRequestArguments: request,
      result: certified,
      now: NOW,
    });
    const tampered = structuredClone(intent) as MatterhornCryptoIntent;
    tampered.canonicalArguments.amountSui = "999";
    expect(validateCryptoIntentIntegrity(tampered)).toEqual(expect.arrayContaining([
      "crypto_intent_arguments_hash_mismatch",
      "crypto_intent_hash_mismatch",
    ]));
    expect(() => cryptoIntentToReviewedActionHandoffV2(tampered, policyDecision(intent)))
      .toThrow("crypto_intent_invalid");
  });

  test("rejects a certified Hyperliquid preview that substitutes another limit price", () => {
    const address = `0x${"3".repeat(40)}`;
    const certified = envelope({
      appId: "matterhorn.hyperliquid-testnet",
      connectionId: "cxc_hl",
      actionId: "hyperliquid_preview_order",
      network: "hyperliquid:testnet",
      result: {
        preparedActionId: "hl_preview_substituted",
        network: "hyperliquid:testnet",
        address,
        asset: "BTC",
        side: "buy",
        size: "0.1",
        orderType: "limit",
        limitPrice: "65000",
        reduceOnly: false,
        maxSlippageBps: 50,
        simulationReference: `sha256:${"d".repeat(64)}`,
        expiresAt: "2026-09-01T12:00:30.000Z",
      },
    });
    expect(() => compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_hl_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "c".repeat(64),
      canonicalRequestArguments: {
        address,
        asset: "BTC",
        side: "buy",
        size: "0.1",
        orderType: "limit",
        price: "64000.00",
        reduceOnly: false,
        maxSlippageBps: 50,
      },
      now: NOW,
      result: certified,
    })).toThrow("crypto_intent_request_result_mismatch");
  });

  test("requires an exact allow decision before creating a wallet handoff", () => {
    const request = {
      sender: `0x${"1".repeat(64)}`,
      recipient: `0x${"2".repeat(64)}`,
      amountSui: "1.25",
    };
    const intent = compileCertifiedCryptoIntent({
      workspaceId: "ws_alpha",
      runId: "run_sui_prepare",
      coworkerId: "cw_transaction_coordinator",
      policyHash: "a".repeat(64),
      canonicalRequestArguments: request,
      now: NOW,
      result: envelope({
        appId: "matterhorn.sui-testnet",
        connectionId: "cxc_sui",
        actionId: "sui_transfer_preview",
        network: "sui:testnet",
        result: {
          preparedActionId: "sui_preview_1",
          network: "sui:testnet",
          sender: request.sender,
          recipient: request.recipient,
          amountSui: request.amountSui,
          estimatedGasMist: "1000",
          simulationReference: `sha256:${"b".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:15.000Z",
        },
      }),
    });
    const denied = policyDecision(intent);
    denied.decision = "deny";
    denied.reasonCodes = ["policy_recipient_denied"];
    expect(() => cryptoIntentToReviewedActionHandoffV2(intent, denied)).toThrow("crypto_intent_policy_denied");
    const wrongPolicy = policyDecision(intent);
    wrongPolicy.evaluatedPolicyHashes = ["f".repeat(64)];
    expect(() => cryptoIntentToReviewedActionHandoffV2(intent, wrongPolicy))
      .toThrow("crypto_intent_policy_denied");
  });
});
