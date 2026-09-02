import type { MatterhornCryptoAppManifest } from "@matterhorn-work/types/crypto-coworkers";

import {
  validateCryptoAppFixture,
  type MatterhornCryptoAppFixture,
  type MatterhornCryptoAppFixtureReport,
} from "./fixture.js";

export type MatterhornCryptoProtocolFixturePack = {
  version: "matterhorn.crypto-protocol-fixture-pack.v1";
  protocol: "sui" | "hyperliquid" | "bittensor";
  network: "sui:testnet" | "hyperliquid:testnet" | "bittensor:test";
  fixtures: MatterhornCryptoAppFixture[];
};

export type MatterhornCryptoProtocolFixturePackReport = {
  version: "matterhorn.crypto-protocol-fixture-pack-report.v1";
  protocol: MatterhornCryptoProtocolFixturePack["protocol"];
  network: MatterhornCryptoProtocolFixturePack["network"];
  appId: string;
  manifestRevision: string;
  passed: boolean;
  networkDeclared: boolean;
  fixtures: MatterhornCryptoAppFixtureReport[];
};

const SUI_SENDER = `0x${"1".repeat(64)}`;
const SUI_RECIPIENT = `0x${"2".repeat(64)}`;
const HYPERLIQUID_ACCOUNT = `0x${"3".repeat(40)}`;
const BITTENSOR_SENDER = `5${"C".repeat(47)}`;
const BITTENSOR_DESTINATION = `5${"D".repeat(47)}`;
const BITTENSOR_HOTKEY = `5${"E".repeat(47)}`;
const OBSERVED_AT = "2026-09-01T12:00:00.000Z";

function clonePack(pack: MatterhornCryptoProtocolFixturePack): MatterhornCryptoProtocolFixturePack {
  return structuredClone(pack);
}

function canonicalFixtureValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFixtureValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalFixtureValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Public-data and wallet-review shaped fixtures; all values are inert testnet examples. */
export function createMatterhornSuiTestnetFixturePack(): MatterhornCryptoProtocolFixturePack {
  return clonePack({
    version: "matterhorn.crypto-protocol-fixture-pack.v1",
    protocol: "sui",
    network: "sui:testnet",
    fixtures: [
      {
        actionId: "sui_account_read",
        input: { address: SUI_SENDER },
        output: {
          address: SUI_SENDER,
          coinType: "0x2::sui::SUI",
          balanceAtomic: "1000000000",
          decimals: 9,
          symbol: "SUI",
          checkpoint: "testnet-checkpoint-100",
          observedAt: OBSERVED_AT,
        },
      },
      {
        actionId: "sui_transfer_preview",
        input: { sender: SUI_SENDER, recipient: SUI_RECIPIENT, amountSui: "0.1" },
        output: {
          preparedActionId: "fixture-sui-transfer-1",
          network: "sui:testnet",
          sender: SUI_SENDER,
          recipient: SUI_RECIPIENT,
          amountSui: "0.1",
          estimatedGasMist: "2000000",
          simulationReference: "testnet-checkpoint-100:fixture-dry-run-1",
          expiresAt: "2026-09-01T12:00:15.000Z",
        },
      },
    ],
  });
}

/** Public-data and wallet-review shaped fixtures; all values are inert testnet examples. */
export function createMatterhornHyperliquidTestnetFixturePack(): MatterhornCryptoProtocolFixturePack {
  return clonePack({
    version: "matterhorn.crypto-protocol-fixture-pack.v1",
    protocol: "hyperliquid",
    network: "hyperliquid:testnet",
    fixtures: [
      {
        actionId: "hyperliquid_market_read",
        input: { limit: 10 },
        output: {
          markets: [{ asset: "BTC", markPrice: "64000", fundingRate: "0.0001", openInterest: "1000" }],
          observedAt: OBSERVED_AT,
        },
      },
      {
        actionId: "hyperliquid_orderbook_read",
        input: { asset: "BTC" },
        output: {
          asset: "BTC",
          bids: [{ price: "63999", size: "0.1" }],
          asks: [{ price: "64001", size: "0.1" }],
          observedAt: OBSERVED_AT,
        },
      },
      {
        actionId: "hyperliquid_account_exposure",
        input: { address: HYPERLIQUID_ACCOUNT },
        output: {
          address: HYPERLIQUID_ACCOUNT,
          accountValueUsd: "1000",
          marginUsedUsd: "100",
          positions: [{
            asset: "BTC",
            side: "long",
            size: "0.01",
            entryPrice: "63000",
            unrealizedPnlUsd: "10",
            leverage: "2",
          }],
          observedAt: OBSERVED_AT,
        },
      },
      {
        actionId: "hyperliquid_preview_order",
        input: {
          address: HYPERLIQUID_ACCOUNT,
          asset: "BTC",
          side: "buy",
          size: "0.01",
          orderType: "limit",
          price: "63000",
          reduceOnly: false,
          maxSlippageBps: 50,
        },
        output: {
          preparedActionId: "fixture-hyperliquid-order-1",
          network: "hyperliquid:testnet",
          address: HYPERLIQUID_ACCOUNT,
          asset: "BTC",
          side: "buy",
          size: "0.01",
          orderType: "limit",
          limitPrice: "63000",
          reduceOnly: false,
          maxSlippageBps: 50,
          notionalUsd: "630",
          accountValueUsd: "1000",
          marginUsedUsd: "100",
          projectedReserveUsd: "270",
          effectiveLeverage: "2",
          simulationReference: "testnet-market-version-100:fixture-preview-1",
          expiresAt: "2026-09-01T12:00:05.000Z",
        },
      },
    ],
  });
}

/** Public Bittensor reads plus inert wallet-review previews. No signature or submit material is present. */
export function createMatterhornBittensorTestnetFixturePack(): MatterhornCryptoProtocolFixturePack {
  return clonePack({
    version: "matterhorn.crypto-protocol-fixture-pack.v1",
    protocol: "bittensor",
    network: "bittensor:test",
    fixtures: [
      {
        actionId: "bittensor_subnet_list",
        input: { limit: 2 },
        output: {
          network: "bittensor:test",
          subnets: [{
            netuid: 14,
            name: "TAOHash",
            symbol: "SN14",
            category: "Compute and infrastructure",
            description: "Inert public testnet subnet fixture.",
            priceTao: 0.5,
            emission: 0.15,
            tempo: 360,
          }],
          block: 123456,
          observedAt: OBSERVED_AT,
        },
      },
      {
        actionId: "bittensor_subnet_read",
        input: { netuid: 14, validatorLimit: 2 },
        output: {
          network: "bittensor:test",
          subnet: {
            netuid: 14,
            name: "TAOHash",
            symbol: "SN14",
            category: "Compute and infrastructure",
            description: "Inert public testnet subnet fixture.",
            priceTao: 0.5,
            emission: 0.15,
            tempo: 360,
          },
          validators: [{
            uid: 1,
            hotkey: `5${"A".repeat(47)}`,
            stake: 1000,
            trust: 0.9,
            validatorTrust: 0.8,
            dividends: 0.2,
            emission: 0.1,
            active: true,
            validatorPermit: true,
          }],
          totalStake: 1000,
          dynamicBlock: 123456,
          metagraphBlock: 123457,
          observedAt: OBSERVED_AT,
        },
      },
      ...(["transfer", "stake", "unstake"] as const).map((action) => ({
        actionId: `bittensor_prepare_${action}`,
        input: action === "transfer"
          ? { sender: BITTENSOR_SENDER, destination: BITTENSOR_DESTINATION, amountTao: "0.1" }
          : { sender: BITTENSOR_SENDER, hotkey: BITTENSOR_HOTKEY, netuid: 14, amountTao: "0.1" },
        output: {
          preparedActionId: `fixture-bittensor-${action}-1`,
          network: "bittensor:test",
          action,
          sender: BITTENSOR_SENDER,
          destination: action === "transfer" ? BITTENSOR_DESTINATION : null,
          hotkey: action === "transfer" ? null : BITTENSOR_HOTKEY,
          netuid: action === "transfer" ? null : 14,
          amountTao: "0.1",
          availableTao: "10",
          currentStakeTao: action === "transfer" ? null : "2",
          expectedAlpha: action === "transfer" ? null : "0.19",
          networkFeeTao: "0.0001",
          swapFeeTao: action === "transfer" ? null : "0.00005",
          slippageBps: action === "transfer" ? null : 25,
          block: 123456,
          simulationReference: `sha256:${action === "transfer" ? "3".repeat(64) : action === "stake" ? "4".repeat(64) : "5".repeat(64)}`,
          expiresAt: "2026-09-01T12:00:15.000Z",
        },
      })),
    ],
  });
}

/**
 * Runs only closed-schema validation/projection. It does not contact the app,
 * prove runtime behavior, certify a manifest, or authorize a capability.
 */
export function validateMatterhornCryptoProtocolFixturePack(
  manifest: MatterhornCryptoAppManifest,
  pack: MatterhornCryptoProtocolFixturePack,
): MatterhornCryptoProtocolFixturePackReport {
  const networkDeclared = manifest.networks.some((network) => (
    network.protocol === pack.protocol
    && network.chainId === pack.network
    && network.environment === "testnet"
  ));
  const fixtures = pack.fixtures.map((fixture) => {
    const report = validateCryptoAppFixture(manifest, fixture);
    const projectionComplete = report.output.ok
      && canonicalFixtureValue(report.output.value) === canonicalFixtureValue(fixture.output);
    if (projectionComplete) return report;
    return {
      ...report,
      passed: false,
      output: {
        ...report.output,
        issues: [...report.output.issues, "$:fixture_output_projection_incomplete"],
      },
    };
  });
  return {
    version: "matterhorn.crypto-protocol-fixture-pack-report.v1",
    protocol: pack.protocol,
    network: pack.network,
    appId: manifest.appId,
    manifestRevision: manifest.manifestRevision,
    passed: networkDeclared && fixtures.length > 0 && fixtures.every((fixture) => fixture.passed),
    networkDeclared,
    fixtures,
  };
}
