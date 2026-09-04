import { describe, expect, test } from "bun:test";

import { normalizeSuiAddress, normalizeSuiObjectId } from "@mysten/sui/utils";
import { blobIdToInt } from "@mysten/walrus";

import { createPinnedSuiWalrusCertificationVerifier } from "./sui-walrus-certification-verifier.js";

const ENDPOINT = new URL("https://fullnode.testnet.sui.io");
const OBJECT_ID = normalizeSuiObjectId("0x1234");
const OWNER_ADDRESS = normalizeSuiAddress("0xabc");
const BLOB_ID = Buffer.alloc(32, 23).toString("base64url");

function client(
  overrides: Record<string, unknown> = {},
  owner: { $kind: string; AddressOwner?: string } = {
    $kind: "AddressOwner",
    AddressOwner: OWNER_ADDRESS,
  },
) {
  return {
    walrus: {
      getBlobObject: async () => ({
        id: OBJECT_ID,
        blob_id: blobIdToInt(BLOB_ID).toString(),
        certified_epoch: 100,
        storage: { end_epoch: 110 },
        deletable: true,
        ...overrides,
      }),
    },
    ledgerService: {
      getServiceInfo: () => ({ response: Promise.resolve({ epoch: 101n }) }),
    },
    core: {
      getObjects: async () => ({ objects: [{ objectId: OBJECT_ID, owner }] }),
    },
  };
}

describe("pinned Sui Walrus certification verifier", () => {
  test("authenticates the exact testnet object, blob and live epoch window", async () => {
    const verifier = createPinnedSuiWalrusCertificationVerifier({
      endpoint: ENDPOINT,
      approvedAddresses: ["93.184.216.34"],
      createClient: () => client(),
    });
    await expect(verifier({
      network: "testnet",
      blobId: BLOB_ID,
      suiObjectId: "0x1234",
      signal: new AbortController().signal,
    })).resolves.toEqual({
      network: "testnet",
      blobId: BLOB_ID,
      suiObjectId: OBJECT_ID,
      certifiedEpoch: 100,
      currentEpoch: 101,
      validUntilEpoch: 110,
      deletable: true,
      ownerAddress: OWNER_ADDRESS,
      suiTransactionDigest: null,
    });
  });

  test("rejects mainnet before constructing a client", async () => {
    let created = false;
    const verifier = createPinnedSuiWalrusCertificationVerifier({
      endpoint: ENDPOINT,
      approvedAddresses: ["93.184.216.34"],
      createClient: () => { created = true; return client(); },
    });
    await expect(verifier({
      network: "mainnet" as "testnet",
      blobId: BLOB_ID,
      suiObjectId: OBJECT_ID,
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_evidence_walrus_mainnet_disabled");
    expect(created).toBe(false);
  });

  test("rejects wrong blob/object bindings, uncertified and expired objects", async () => {
    for (const [overrides, code] of [
      [{ id: normalizeSuiObjectId("0x5678") }, "crypto_evidence_walrus_object_binding_mismatch"],
      [{ blob_id: blobIdToInt(Buffer.alloc(32, 24).toString("base64url")).toString() }, "crypto_evidence_walrus_blob_binding_mismatch"],
      [{ certified_epoch: null }, "crypto_evidence_walrus_not_certified"],
      [{ storage: { end_epoch: 101 } }, "crypto_evidence_walrus_certification_expired"],
      [{ certified_epoch: 102 }, "crypto_evidence_walrus_certification_expired"],
    ] as const) {
      const verifier = createPinnedSuiWalrusCertificationVerifier({
        endpoint: ENDPOINT,
        approvedAddresses: ["93.184.216.34"],
        createClient: () => client(overrides),
      });
      await expect(verifier({
        network: "testnet",
        blobId: BLOB_ID,
        suiObjectId: OBJECT_ID,
        signal: new AbortController().signal,
      })).rejects.toThrow(code);
    }
  });

  test("rejects malformed IDs and aborts before network construction", async () => {
    let created = false;
    const verifier = createPinnedSuiWalrusCertificationVerifier({
      endpoint: ENDPOINT,
      approvedAddresses: ["93.184.216.34"],
      createClient: () => { created = true; return client(); },
    });
    await expect(verifier({
      network: "testnet",
      blobId: "not-a-blob-id",
      suiObjectId: OBJECT_ID,
      signal: new AbortController().signal,
    })).rejects.toThrow("crypto_evidence_walrus_blob_id_invalid");
    const controller = new AbortController();
    controller.abort();
    await expect(verifier({
      network: "testnet",
      blobId: BLOB_ID,
      suiObjectId: OBJECT_ID,
      signal: controller.signal,
    })).rejects.toThrow("crypto_evidence_walrus_aborted");
    expect(created).toBe(false);
  });

  test("requires one exact address-owned Blob object", async () => {
    for (const [owner, code] of [
      [{ $kind: "Shared" }, "crypto_evidence_walrus_wallet_owner_required"],
      [{ $kind: "AddressOwner", AddressOwner: "not-an-address" }, "crypto_evidence_walrus_owner_invalid"],
    ] as const) {
      const verifier = createPinnedSuiWalrusCertificationVerifier({
        endpoint: ENDPOINT,
        approvedAddresses: ["93.184.216.34"],
        createClient: () => client({}, owner),
      });
      await expect(verifier({
        network: "testnet",
        blobId: BLOB_ID,
        suiObjectId: OBJECT_ID,
        signal: new AbortController().signal,
      })).rejects.toThrow(code);
    }
  });
});
