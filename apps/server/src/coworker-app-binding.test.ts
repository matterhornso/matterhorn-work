import { describe, expect, test } from "bun:test";

import type {
  MatterhornCoworkerProfile,
  MatterhornCoworkerResourceScope,
  MatterhornCryptoAppConnectionState,
} from "@matterhorn-work/types/crypto-coworkers";

import type { MatterhornCryptoAppRuntimeServices } from "./crypto-app-runtime.js";
import {
  buildCoworkerRunBinding,
  coworkerAppBindingsAreActive,
} from "./server.js";

function profile(): MatterhornCoworkerProfile {
  return {
    version: "matterhorn.coworker-profile.v1",
    id: "cw_sui",
    workspaceId: "ws_alpha",
    ownerId: "account_alpha",
    name: "Sui helper",
    role: "market_analyst",
    mission: "Read approved public Sui data.",
    state: "active",
    revision: 1,
    policyVersion: "coworker-policy-1",
    allowedAppIds: ["matterhorn.sui-testnet"],
    allowedActionIds: ["sui_account_read"],
    allowedNetworks: ["sui:testnet"],
    allowedAssets: ["SUI"],
    automaticAuthorities: ["read"],
    limits: {
      perActionUsd: 0,
      dailyUsd: 0,
      weeklyUsd: 0,
      maxSlippageBps: 0,
      maxLeverage: 1,
      minimumReserveUsd: 0,
      maxActiveWatches: 0,
      maxReadCallsPerRun: 4,
      maxPrepareCallsPerFamily: 0,
    },
    privacy: {
      allowedDataLabels: ["public", "untrusted_external"],
      allowUnverifiedProviderConsent: false,
    },
    escalation: {
      privateDataRequiresDisclosure: true,
      transactionRequiresWalletReview: true,
      walletSubmission: "connected_wallet_only",
    },
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
}

function polymarketProfile(): MatterhornCoworkerProfile {
  return {
    ...profile(),
    id: "cw_polymarket",
    name: "Prediction market helper",
    mission: "Read certified public market and order-book evidence.",
    allowedAppIds: ["matterhorn.polymarket-clob-research"],
    allowedActionIds: ["polymarket_orderbook_read"],
    allowedNetworks: ["polymarket:public"],
  };
}

function resourceScope(overrides: Partial<MatterhornCoworkerResourceScope> = {}): MatterhornCoworkerResourceScope {
  return {
    version: "matterhorn.coworker-resource-scope.v1",
    workspaceId: "ws_alpha",
    ownerId: "account_alpha",
    coworkerId: "cw_sui",
    revision: 1,
    profileRevision: 1,
    agentFiles: [],
    memories: [],
    connections: [{
      id: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionIds: ["sui_account_read"],
      networks: ["sui:testnet"],
    }],
    privacy: { mode: "private_workspace", unverifiedProviderConsent: false },
    scopeHash: "a".repeat(64),
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

function polymarketResourceScope(): MatterhornCoworkerResourceScope {
  return resourceScope({
    coworkerId: "cw_polymarket",
    connections: [{
      id: "cxc_polymarket_clob",
      appId: "matterhorn.polymarket-clob-research",
      manifestRevision: "1.0.0",
      actionIds: ["polymarket_orderbook_read"],
      networks: ["polymarket:public"],
    }],
  });
}

function runtime(state: MatterhornCryptoAppConnectionState = "active", options: {
  workspaceId?: string;
  appId?: string;
  connectionId?: string;
  actionId?: string;
  network?: string;
  manifestRevision?: string;
} = {}): MatterhornCryptoAppRuntimeServices {
  const workspaceId = options.workspaceId ?? "ws_alpha";
  const appId = options.appId ?? "matterhorn.sui-testnet";
  const connectionId = options.connectionId ?? "cxc_sui";
  const actionId = options.actionId ?? "sui_account_read";
  const network = options.network ?? "sui:testnet";
  const manifestRevision = options.manifestRevision ?? "1.0.0";
  return {
    mode: "enforce",
    ready: true,
    catalog: {
      listConnections: (requestedWorkspaceId: string) => requestedWorkspaceId === workspaceId ? [{
        version: "matterhorn.crypto-app-connection.v1",
        id: connectionId,
        workspaceId,
        appId,
        manifestRevision,
        state,
        grantedActionIds: [actionId],
        grantedScopes: [],
        grantedNetworks: [network],
        credential: { type: "none", connected: true },
        availability: "available",
        createdAt: "2026-08-20T00:00:00.000Z",
        updatedAt: "2026-08-20T00:00:00.000Z",
      }] : [],
      get: () => ({
        appId,
        manifestRevision,
        actions: [{ id: actionId }],
        networks: [{ chainId: network }],
      }),
    },
    operator: null,
    developerPortal: null,
    router: null,
    verifySuiTransaction: null,
    purgeWorkspace: () => ({ connections: 0, usage: 0, circuits: 0 }),
    purgeAccount: () => ({ developers: 0, keys: 0, submissions: 0 }),
    close: () => undefined,
  } as unknown as MatterhornCryptoAppRuntimeServices;
}

describe("interactive coworker crypto-app binding", () => {
  test("binds exact tenant connection, certification, action and network", () => {
    const cryptoApps = runtime();
    const binding = buildCoworkerRunBinding(profile(), cryptoApps, resourceScope());
    expect(binding.actionBindings).toEqual([{
      connectionId: "cxc_sui",
      appId: "matterhorn.sui-testnet",
      manifestRevision: "1.0.0",
      actionId: "sui_account_read",
      network: "sui:testnet",
      proxyToolName: "matterhorn_sui_get_balance",
      access: "read",
    }]);
    expect(coworkerAppBindingsAreActive(cryptoApps, binding)).toBe(true);
  });

  test("binds the Polymarket coworker only to the separately certified public CLOB read", () => {
    const binding = buildCoworkerRunBinding(
      polymarketProfile(),
      runtime("active", {
        appId: "matterhorn.polymarket-clob-research",
        connectionId: "cxc_polymarket_clob",
        actionId: "polymarket_orderbook_read",
        network: "polymarket:public",
      }),
      polymarketResourceScope(),
    );
    expect(binding.actionBindings).toEqual([{
      connectionId: "cxc_polymarket_clob",
      appId: "matterhorn.polymarket-clob-research",
      manifestRevision: "1.0.0",
      actionId: "polymarket_orderbook_read",
      network: "polymarket:public",
      proxyToolName: "matterhorn_polymarket_get_orderbook",
      access: "read",
    }]);
  });

  test("fails closed for missing, paused, revoked, wrong-action and wrong-network connections", () => {
    for (const candidate of [
      runtime("paused"),
      runtime("revoked"),
      runtime("active", { workspaceId: "ws_other" }),
      runtime("active", { actionId: "sui_transfer_preview" }),
      runtime("active", { network: "sui:mainnet" }),
    ]) {
      expect(buildCoworkerRunBinding(profile(), candidate, resourceScope()).actionBindings).toEqual([]);
    }
  });

  test("invalidates an existing run snapshot after the connection is paused", () => {
    const binding = buildCoworkerRunBinding(profile(), runtime("active"), resourceScope());
    expect(coworkerAppBindingsAreActive(runtime("paused"), binding)).toBe(false);
    expect(coworkerAppBindingsAreActive(runtime("active", { manifestRevision: "2.0.0" }), binding)).toBe(false);
  });

  test("uses only the exact reviewed connection scope and disables unverified-provider consent", () => {
    const permissiveProfile: MatterhornCoworkerProfile = {
      ...profile(),
      privacy: {
        allowedDataLabels: ["public", "workspace_private", "untrusted_external"],
        allowUnverifiedProviderConsent: true,
      },
    };
    const binding = buildCoworkerRunBinding(permissiveProfile, runtime(), resourceScope());
    expect(binding.actionBindings.map((action) => action.connectionId)).toEqual(["cxc_sui"]);
    expect(binding.allowUnverifiedProviderConsent).toBe(false);

    const wrongConnection = resourceScope({
      connections: [{
        ...resourceScope().connections[0],
        id: "cxc_not_reviewed",
      }],
    });
    expect(buildCoworkerRunBinding(permissiveProfile, runtime(), wrongConnection).actionBindings).toEqual([]);
  });

  test("grants no crypto app authority before the user approves a resource scope", () => {
    expect(buildCoworkerRunBinding(profile(), runtime()).actionBindings).toEqual([]);
  });
});
