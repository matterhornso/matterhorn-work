import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, test } from "bun:test";

import type { MatterhornCryptoAppTransportExecutor } from "./crypto-app-adapter-router.js";
import { runCryptoAppManifestConformance } from "./crypto-app-conformance.js";
import {
  createFirstPartyCryptoAppCertificationDriver,
  type MatterhornFirstPartyCertificationInputs,
} from "./first-party-crypto-app-certification-driver.js";
import { certifyMatterhornFirstPartyCryptoApp } from "./first-party-crypto-app-certifier.js";
import {
  buildMatterhornFirstPartyBittensorTestnetManifest,
  buildMatterhornFirstPartyPolymarketResearchManifest,
  buildMatterhornFirstPartyTestnetManifests,
} from "./first-party-crypto-apps.js";
import { runCryptoAppRuntimeCertificationHarness } from "./crypto-app-runtime-certification-harness.js";
import { verifyCryptoAppRuntimeCertificationReport } from "./crypto-app-runtime-certification.js";

const NOW = "2026-09-01T12:00:00.000Z";
const PEER = "93.184.216.34";
const SUI_ADDRESS = `0x${"1".repeat(64)}`;
const SUI_RECIPIENT = `0x${"2".repeat(64)}`;
const HYPERLIQUID_ADDRESS = `0x${"a".repeat(40)}`;
const BITTENSOR_SENDER = `5${"C".repeat(47)}`;
const BITTENSOR_DESTINATION = `5${"D".repeat(47)}`;
const BITTENSOR_HOTKEY = `5${"E".repeat(47)}`;
const keys = generateKeyPairSync("ed25519");

const manifests = [...buildMatterhornFirstPartyTestnetManifests({
  publisherId: "matterhorn",
  publisherKeyId: "certification-test",
  sign: (payload) => sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
  suiTestnetEndpoint: "https://fullnode.testnet.sui.io",
  hyperliquidTestnetEndpoint: "https://api.hyperliquid-testnet.xyz/info",
  privacyPolicyUrl: "https://matterhorn.so/privacy",
  securityContact: "security@matterhorn.so",
}), buildMatterhornFirstPartyBittensorTestnetManifest({
  publisherId: "matterhorn",
  publisherKeyId: "certification-test",
  sign: (payload) => sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
  bittensorTestnetSidecarEndpoint: "https://bittensor-testnet.gateway.matterhorn.so",
  privacyPolicyUrl: "https://matterhorn.so/privacy",
  securityContact: "security@matterhorn.so",
})];

const inputs: MatterhornFirstPartyCertificationInputs = {
  sui_account_read: { address: SUI_ADDRESS },
  sui_transfer_preview: { sender: SUI_ADDRESS, recipient: SUI_RECIPIENT, amountSui: "0.01" },
  hyperliquid_market_read: { limit: 2 },
  hyperliquid_orderbook_read: { asset: "BTC" },
  hyperliquid_account_exposure: { address: HYPERLIQUID_ADDRESS },
  hyperliquid_preview_order: {
    address: HYPERLIQUID_ADDRESS,
    asset: "BTC",
    side: "buy",
    size: "0.01",
    orderType: "market",
    reduceOnly: false,
    maxSlippageBps: 50,
  },
  bittensor_subnet_list: { limit: 2 },
  bittensor_subnet_read: { netuid: 14, validatorLimit: 2 },
  bittensor_prepare_transfer: { sender: BITTENSOR_SENDER, destination: BITTENSOR_DESTINATION, amountTao: "0.1" },
  bittensor_prepare_stake: { sender: BITTENSOR_SENDER, hotkey: BITTENSOR_HOTKEY, netuid: 14, amountTao: "0.1" },
  bittensor_prepare_unstake: { sender: BITTENSOR_SENDER, hotkey: BITTENSOR_HOTKEY, netuid: 14, amountTao: "0.1" },
};

function output(actionId: string): unknown {
  if (actionId === "sui_account_read") return {
    address: SUI_ADDRESS,
    coinType: `${`0x${"0".repeat(63)}`}2::sui::SUI`,
    balanceAtomic: "1000000000",
    decimals: 9,
    symbol: "SUI",
    checkpoint: "123456",
    observedAt: NOW,
  };
  if (actionId === "sui_transfer_preview") return {
    preparedActionId: "sui_preview_certification",
    network: "sui:testnet",
    sender: SUI_ADDRESS,
    recipient: SUI_RECIPIENT,
    amountSui: "0.01",
    estimatedGasMist: "1000",
    simulationReference: `sha256:${"1".repeat(64)}`,
    expiresAt: "2026-09-01T12:00:15.000Z",
  };
  if (actionId === "hyperliquid_market_read") return {
    markets: [{ asset: "BTC", markPrice: "64000", fundingRate: "-0.0001", openInterest: "100" }],
    observedAt: NOW,
  };
  if (actionId === "hyperliquid_orderbook_read") return {
    asset: "BTC",
    bids: [{ price: "63990", size: "1" }],
    asks: [{ price: "64010", size: "1" }],
    observedAt: NOW,
  };
  if (actionId === "hyperliquid_account_exposure") return {
    address: HYPERLIQUID_ADDRESS,
    accountValueUsd: "1000",
    marginUsedUsd: "0",
    positions: [],
    observedAt: NOW,
  };
  if (actionId === "hyperliquid_preview_order") return {
    preparedActionId: "hl_preview_certification",
    network: "hyperliquid:testnet",
    address: HYPERLIQUID_ADDRESS,
    asset: "BTC",
    side: "buy",
    size: "0.01",
    orderType: "market",
    limitPrice: "64320",
    reduceOnly: false,
    maxSlippageBps: 50,
    notionalUsd: "643.2",
    accountValueUsd: "1000",
    marginUsedUsd: "0",
    projectedReserveUsd: "356.8",
    effectiveLeverage: "2",
    simulationReference: `sha256:${"2".repeat(64)}`,
    expiresAt: "2026-09-01T12:00:30.000Z",
  };
  if (actionId === "bittensor_subnet_list") return {
    network: "bittensor:test",
    subnets: [{
      netuid: 14,
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute",
      description: "Testnet subnet",
      priceTao: 0.5,
      emission: 0.15,
      tempo: 360,
    }],
    block: 123456,
    observedAt: NOW,
  };
  if (actionId === "bittensor_subnet_read") return {
    network: "bittensor:test",
    subnet: {
      netuid: 14,
      name: "TAOHash",
      symbol: "SN14",
      category: "Compute",
      description: "Testnet subnet",
      priceTao: 0.5,
      emission: 0.15,
      tempo: 360,
    },
    validators: [{
      uid: 1,
      hotkey: `5${"A".repeat(47)}`,
      stake: 1_000,
      trust: 0.9,
      validatorTrust: 0.8,
      dividends: 0.2,
      emission: 0.1,
      active: true,
      validatorPermit: true,
    }],
    totalStake: 1_000,
    dynamicBlock: 123456,
    metagraphBlock: 123457,
    observedAt: NOW,
  };
  if (["bittensor_prepare_transfer", "bittensor_prepare_stake", "bittensor_prepare_unstake"].includes(actionId)) {
    const action = actionId.replace("bittensor_prepare_", "") as "transfer" | "stake" | "unstake";
    const transfer = action === "transfer";
    return {
      preparedActionId: `bt_${action}_certification`,
      network: "bittensor:test",
      action,
      sender: BITTENSOR_SENDER,
      destination: transfer ? BITTENSOR_DESTINATION : null,
      hotkey: transfer ? null : BITTENSOR_HOTKEY,
      netuid: transfer ? null : 14,
      amountTao: "0.1",
      availableTao: "10",
      currentStakeTao: transfer ? null : "2",
      expectedAlpha: transfer ? null : "0.19",
      networkFeeTao: "0.0001",
      swapFeeTao: transfer ? null : "0.00005",
      slippageBps: transfer ? null : 25,
      block: 123456,
      simulationReference: `sha256:${action === "transfer" ? "3" : action === "stake" ? "4" : "5"}`.padEnd(71, action === "transfer" ? "3" : action === "stake" ? "4" : "5"),
      expiresAt: "2026-09-01T12:00:15.000Z",
    };
  }
  if (actionId === "execute_transaction") {
    throw new Error("first_party_app_action_invalid");
  }
  throw new Error(actionId.startsWith("sui_")
    ? "first_party_sui_action_invalid"
    : actionId.startsWith("hyperliquid_")
      ? "first_party_hyperliquid_action_invalid"
      : "first_party_bittensor_action_invalid");
}

const executor: MatterhornCryptoAppTransportExecutor = async (request) => {
  if (request.signal.aborted) throw new Error("certification_probe_aborted");
  if (request.action.id === "execute_transaction") {
    throw new Error(request.appId.includes("sui")
      ? "first_party_sui_action_invalid"
      : request.appId.includes("hyperliquid")
        ? "first_party_hyperliquid_action_invalid"
        : "first_party_bittensor_action_invalid");
  }
  return {
    data: output(request.action.id),
    source: request.appId,
    observedAt: NOW,
    blockOrVersion: "certification-version",
    costMicros: 0,
    connectedAddress: PEER,
  };
};

describe("first-party crypto app certification driver", () => {
  test("executes every adversarial probe for Sui, Hyperliquid, and Bittensor without retaining identities", async () => {
    for (const manifest of manifests) {
      const staticReport = runCryptoAppManifestConformance(manifest, {
        publisherKey: keys.publicKey,
        policyVersion: "policy-certification-1",
        targetEnvironment: "testnet",
        now: () => new Date(NOW),
      });
      const report = await runCryptoAppRuntimeCertificationHarness({
        manifest,
        staticReport,
        driver: createFirstPartyCryptoAppCertificationDriver({
          actionInputs: inputs,
          executor,
          resolveDns: async () => [{ address: PEER, family: 4 }],
          now: () => new Date(NOW),
        }),
        now: () => new Date("2026-09-01T12:01:00.000Z"),
      });
      expect(report.passed).toBe(true);
      expect(verifyCryptoAppRuntimeCertificationReport(report, manifest, staticReport)).toBe(true);
      expect(report.probes.every((probe) => probe.passed && probe.evidenceHash.length === 64)).toBe(true);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain(SUI_ADDRESS);
      expect(serialized).not.toContain(HYPERLIQUID_ADDRESS);
      expect(serialized).not.toContain(BITTENSOR_SENDER);
      expect(serialized).not.toContain("accountValueUsd");
    }
  });

  test("fails closed when required live action inputs are absent or look secret-bearing", async () => {
    const manifest = manifests.find((item) => item.appId === "matterhorn.sui-testnet")!;
    const staticReport = runCryptoAppManifestConformance(manifest, {
      publisherKey: keys.publicKey,
      policyVersion: "policy-certification-1",
      targetEnvironment: "testnet",
      now: () => new Date(NOW),
    });
    const invalidInputs: MatterhornFirstPartyCertificationInputs[] = [
      { sui_account_read: { address: SUI_ADDRESS } },
      {
        ...inputs,
        sui_transfer_preview: {
          sender: SUI_ADDRESS,
          recipient: SUI_RECIPIENT,
          amountSui: "0.01",
          private_key: "must-never-enter-certification",
        },
      },
    ];
    for (const actionInputs of invalidInputs) {
      const report = await runCryptoAppRuntimeCertificationHarness({
        manifest,
        staticReport,
        driver: createFirstPartyCryptoAppCertificationDriver({
          actionInputs,
          executor,
          resolveDns: async () => [{ address: PEER, family: 4 }],
          now: () => new Date(NOW),
        }),
      });
      expect(report.passed).toBe(false);
      expect(JSON.stringify(report)).not.toContain("must-never-enter-certification");
    }
  });

  test("builds exact operator promotion bodies without retaining private inputs", async () => {
    for (const manifest of manifests) {
      const promotion = await certifyMatterhornFirstPartyCryptoApp({
        manifest,
        publisherPublicKey: keys.publicKey,
        policyVersion: "policy-certification-1",
        actionInputs: inputs,
        driver: createFirstPartyCryptoAppCertificationDriver({
          actionInputs: inputs,
          executor,
          resolveDns: async () => [{ address: PEER, family: 4 }],
          now: () => new Date(NOW),
        }),
        now: () => new Date(NOW),
      });
      expect(Object.keys(promotion).sort()).toEqual(["report", "runtimeReport", "state"]);
      expect(promotion.state).toBe("certified_testnet");
      expect(promotion.report.passed).toBe(true);
      expect(promotion.runtimeReport.passed).toBe(true);
      const serialized = JSON.stringify(promotion);
      expect(serialized).not.toContain(SUI_ADDRESS);
      expect(serialized).not.toContain(SUI_RECIPIENT);
    }
  });

  test("does not promote the mainnet Polymarket research contract through the testnet certifier", async () => {
    const manifest = buildMatterhornFirstPartyPolymarketResearchManifest({
      publisherId: "matterhorn",
      publisherKeyId: "certification-test",
      sign: (payload) => sign(null, Buffer.from(payload), keys.privateKey).toString("base64url"),
      polymarketGammaEndpoint: "https://gamma-api.polymarket.com",
      privacyPolicyUrl: "https://matterhorn.so/privacy",
      securityContact: "security@matterhorn.so",
    });
    await expect(certifyMatterhornFirstPartyCryptoApp({
      manifest,
      publisherPublicKey: keys.publicKey,
      policyVersion: "policy-certification-1",
      actionInputs: { polymarket_market_search: { query: "SUI", limit: 5 } },
      driver: createFirstPartyCryptoAppCertificationDriver({
        actionInputs: { polymarket_market_search: { query: "SUI", limit: 5 } },
        executor,
        resolveDns: async () => [{ address: PEER, family: 4 }],
        now: () => new Date(NOW),
      }),
      now: () => new Date(NOW),
    })).rejects.toThrow("first_party_certification_scope_invalid");
  });
});
