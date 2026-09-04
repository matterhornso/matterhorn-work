import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { normalizeSuiAddress } from "@mysten/sui/utils";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import {
  MATTERHORN_CRYPTO_APP_WALLET_CHALLENGE_VERSION,
  type MatterhornCryptoAppConnectionView,
  type MatterhornCryptoAppWalletChallenge,
  type MatterhornCryptoAppWalletChallengeRequest,
  type MatterhornCryptoAppWalletFamily,
} from "@matterhorn-work/types/crypto-coworkers";
import { getAddress, verifyMessage } from "viem";

import {
  type MatterhornCryptoAppWalletChallengeRecord,
  MatterhornCryptoAppConnectionStore,
} from "./crypto-app-connection-store.js";
import { MatterhornCryptoAppConnections } from "./crypto-app-connections.js";

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_SIGNATURE_LENGTH = 2_048;
const WALLET_PROOF_KEY_CONTEXT = "matterhorn.crypto-app-wallet-proof-key.v1";

export class MatterhornCryptoAppWalletConnectionError extends Error {
  constructor(public readonly code:
    | "wallet_connection_unavailable"
    | "wallet_connection_input_invalid"
    | "wallet_connection_authentication_mismatch"
    | "wallet_family_unsupported"
    | "wallet_family_mismatch"
    | "wallet_challenge_invalid"
    | "wallet_challenge_expired"
    | "wallet_signature_invalid") {
    super(code);
    this.name = "MatterhornCryptoAppWalletConnectionError";
  }
}

type WalletConnectionOptions = {
  connections: MatterhornCryptoAppConnections;
  store: MatterhornCryptoAppConnectionStore;
  secret: string | Buffer;
  now?: () => Date;
  challengeId?: () => string;
  proofId?: () => string;
};

function keyFromSecret(secret: string | Buffer): Buffer {
  const bytes = typeof secret === "string" ? Buffer.from(secret, "utf8") : Buffer.from(secret);
  if (bytes.byteLength < 32) {
    throw new MatterhornCryptoAppWalletConnectionError("wallet_connection_unavailable");
  }
  return createHmac("sha256", bytes).update(WALLET_PROOF_KEY_CONTEXT).digest();
}

function normalizedAddress(family: MatterhornCryptoAppWalletFamily, address: string): string {
  if (typeof address !== "string" || address.length > 256 || /[\u0000-\u0020\u007f]/.test(address)) {
    throw new MatterhornCryptoAppWalletConnectionError("wallet_connection_input_invalid");
  }
  try {
    return family === "evm" ? getAddress(address) : normalizeSuiAddress(address);
  } catch {
    throw new MatterhornCryptoAppWalletConnectionError("wallet_connection_input_invalid");
  }
}

function walletFamilyForProtocol(protocol: string): MatterhornCryptoAppWalletFamily | null {
  const normalized = protocol.trim().toLowerCase();
  if (normalized === "sui") return "sui";
  if ([
    "evm",
    "ethereum",
    "base",
    "arbitrum",
    "optimism",
    "polygon",
    "hyperliquid",
    "polymarket",
    "cow",
  ].includes(normalized)) return "evm";
  return null;
}

function challengeMessage(input: {
  challenge: MatterhornCryptoAppWalletChallengeRecord;
  walletAddress: string;
  displayName: string;
}): string {
  return [
    "Matterhorn wallet connection",
    "",
    `App: ${JSON.stringify(input.displayName)} (${input.challenge.appId})`,
    `Wallet: ${input.walletAddress}`,
    `Networks: ${input.challenge.networks.join(", ")}`,
    `Allowed tasks: ${input.challenge.actionIds.join(", ")}`,
    `Challenge: ${input.challenge.challengeId}`,
    `Issued: ${input.challenge.issuedAt}`,
    `Expires: ${input.challenge.expiresAt}`,
    "",
    "This proves wallet control only. It does not authorize spending, token approvals, transaction signing, submission, relaying, or broadcasting.",
    "Every transaction still requires a separate review in the connected wallet.",
  ].join("\n");
}

function isEvmSignature(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{130}$/.test(value);
}

async function signatureValid(input: {
  walletFamily: MatterhornCryptoAppWalletFamily;
  walletAddress: string;
  message: string;
  signature: string;
}): Promise<boolean> {
  try {
    if (input.walletFamily === "evm") {
      if (!isEvmSignature(input.signature)) return false;
      return await verifyMessage({
        address: getAddress(input.walletAddress),
        message: input.message,
        signature: input.signature,
      });
    }
    await verifyPersonalMessageSignature(
      new TextEncoder().encode(input.message),
      input.signature,
      { address: input.walletAddress },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Issues and atomically consumes tenant-bound proof-of-control challenges.
 * Raw wallet addresses, messages, and signatures never enter durable storage.
 */
export class MatterhornCryptoAppWalletConnections {
  readonly #connections: MatterhornCryptoAppConnections;
  readonly #store: MatterhornCryptoAppConnectionStore;
  readonly #digestKey: Buffer;
  readonly #now: () => Date;
  readonly #challengeId: () => string;
  readonly #proofId: () => string;

  constructor(options: WalletConnectionOptions) {
    this.#connections = options.connections;
    this.#store = options.store;
    this.#digestKey = keyFromSecret(options.secret);
    this.#now = options.now ?? (() => new Date());
    this.#challengeId = options.challengeId ?? (() => `cwc_${randomUUID()}`);
    this.#proofId = options.proofId ?? (() => `cwp_${randomUUID()}`);
  }

  issue(input: MatterhornCryptoAppWalletChallengeRequest & {
    workspaceId: string;
    accountId: string;
  }): MatterhornCryptoAppWalletChallenge {
    const grant = this.#connections.validateGrant({
      workspaceId: input.workspaceId,
      createdBy: input.accountId,
      appId: input.appId,
      grantedActionIds: input.grantedActionIds,
      grantedScopes: input.grantedScopes,
      grantedNetworks: input.grantedNetworks,
    });
    if (grant.authentication.type !== "wallet_connection") {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_connection_authentication_mismatch");
    }
    const families = new Set(grant.networks.map((network) => walletFamilyForProtocol(network.protocol)));
    if (families.has(null)) throw new MatterhornCryptoAppWalletConnectionError("wallet_family_unsupported");
    if (families.size !== 1 || !families.has(input.walletFamily)) {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_family_mismatch");
    }
    const address = normalizedAddress(input.walletFamily, input.walletAddress);
    const now = this.#now();
    const challenge: MatterhornCryptoAppWalletChallengeRecord = {
      workspaceId: input.workspaceId,
      challengeId: this.#challengeId(),
      accountId: input.accountId,
      appId: grant.appId,
      manifestRevision: grant.manifestRevision,
      walletFamily: input.walletFamily,
      addressDigest: this.#addressDigest(input.walletFamily, address),
      actionIds: [...input.grantedActionIds],
      scopes: [...input.grantedScopes],
      networks: [...input.grantedNetworks],
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString(),
      state: "pending",
      consumedAt: null,
    };
    this.#store.createWalletChallenge(challenge);
    return {
      version: MATTERHORN_CRYPTO_APP_WALLET_CHALLENGE_VERSION,
      challengeId: challenge.challengeId,
      walletFamily: challenge.walletFamily,
      message: challengeMessage({ challenge, walletAddress: address, displayName: grant.displayName }),
      expiresAt: challenge.expiresAt,
      notice: "proves_wallet_control_only",
    };
  }

  async confirm(input: {
    workspaceId: string;
    accountId: string;
    challengeId: string;
    walletAddress: string;
    signature: string;
  }): Promise<MatterhornCryptoAppConnectionView> {
    if (typeof input.signature !== "string"
      || input.signature.length < 8
      || input.signature.length > MAX_SIGNATURE_LENGTH
      || /[\u0000\r\n]/.test(input.signature)) {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_signature_invalid");
    }
    const challenge = this.#store.getWalletChallenge(input.workspaceId, input.accountId, input.challengeId);
    if (!challenge || challenge.state !== "pending") {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_challenge_invalid");
    }
    const now = this.#now();
    if (Date.parse(challenge.expiresAt) <= now.getTime()) {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_challenge_expired");
    }
    const address = normalizedAddress(challenge.walletFamily, input.walletAddress);
    const expectedDigest = this.#addressDigest(challenge.walletFamily, address);
    if (!this.#digestMatches(challenge.addressDigest, expectedDigest)) {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_signature_invalid");
    }
    const grant = this.#connections.validateGrant({
      workspaceId: challenge.workspaceId,
      createdBy: challenge.accountId,
      appId: challenge.appId,
      grantedActionIds: challenge.actionIds,
      grantedScopes: challenge.scopes,
      grantedNetworks: challenge.networks,
    });
    if (grant.manifestRevision !== challenge.manifestRevision
      || grant.authentication.type !== "wallet_connection") {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_challenge_invalid");
    }
    const message = challengeMessage({ challenge, walletAddress: address, displayName: grant.displayName });
    if (!await signatureValid({
      walletFamily: challenge.walletFamily,
      walletAddress: address,
      message,
      signature: input.signature,
    })) {
      throw new MatterhornCryptoAppWalletConnectionError("wallet_signature_invalid");
    }
    const proofId = this.#proofId();
    return this.#connections.createFromVerifiedWallet({
      workspaceId: challenge.workspaceId,
      createdBy: challenge.accountId,
      appId: challenge.appId,
      grantedActionIds: challenge.actionIds,
      grantedScopes: challenge.scopes,
      grantedNetworks: challenge.networks,
      credential: { type: "wallet_connection", walletConnectionId: proofId },
      challenge: {
        challengeId: challenge.challengeId,
        accountId: challenge.accountId,
        walletFamily: challenge.walletFamily,
        addressDigest: challenge.addressDigest,
        expiresAt: challenge.expiresAt,
        proofId,
      },
    });
  }

  #addressDigest(family: MatterhornCryptoAppWalletFamily, address: string): string {
    return createHmac("sha256", this.#digestKey)
      .update(`${family}\u0000${address}`, "utf8")
      .digest("hex");
  }

  #digestMatches(left: string, right: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
    return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
  }
}
