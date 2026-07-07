import { describe, expect, test } from "bun:test";

import {
  buildNftMarketplaceListingCapability,
  buildNftMintingCapability,
  buildWalrusStorageCapability,
  resolveNftEnvironmentConfig,
} from "./image-nft-capabilities.js";

describe("image/NFT publishing capability config", () => {
  test("invalid Walrus URLs report error instead of working", () => {
    const config = resolveNftEnvironmentConfig({
      MATTERHORN_WALRUS_PUBLISHER_URL: "notaurl",
      MATTERHORN_WALRUS_RELAY_URL: "ipfs://not-walrus-http",
      MATTERHORN_WALRUS_STORAGE_EPOCHS: "-2",
    } as typeof process.env);

    const capability = buildWalrusStorageCapability(config);
    expect(capability.status).toBe("error");
    expect(capability.publisherConfigured).toBe(false);
    expect(capability.relayConfigured).toBe(false);
    expect(capability.details?.validationIssues).toEqual([
      expect.objectContaining({ field: "MATTERHORN_WALRUS_PUBLISHER_URL" }),
      expect.objectContaining({ field: "MATTERHORN_WALRUS_RELAY_URL" }),
      expect.objectContaining({ field: "MATTERHORN_WALRUS_STORAGE_EPOCHS" }),
    ]);
  });

  test("valid Walrus URLs normalize to working capability", () => {
    const config = resolveNftEnvironmentConfig({
      MATTERHORN_WALRUS_PUBLISHER_URL: "https://publisher.example.test/",
      MATTERHORN_WALRUS_RELAY_URL: "https://aggregator.example.test/",
      MATTERHORN_WALRUS_STORAGE_EPOCHS: "2",
    } as typeof process.env);

    const capability = buildWalrusStorageCapability(config);
    expect(capability.status).toBe("working");
    expect(capability.publisherConfigured).toBe(true);
    expect(capability.relayConfigured).toBe(true);
    expect(capability.details?.storageEpochs).toBe(2);
  });

  test("invalid Sui network marks minting and listing as setup errors", () => {
    const config = resolveNftEnvironmentConfig({
      MATTERHORN_SUI_NETWORK: "devnet",
      MATTERHORN_SUI_NFT_PACKAGE_ID: "0x1234",
      MATTERHORN_SUI_KIOSK_PACKAGE_ID: "0x4567",
      MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: "0x8910",
    } as typeof process.env);

    const minting = buildNftMintingCapability(config);
    const listing = buildNftMarketplaceListingCapability(config);
    expect(minting.status).toBe("error");
    expect(listing.status).toBe("error");
    expect(minting.details?.validationIssues).toEqual([
      expect.objectContaining({ field: "MATTERHORN_SUI_NETWORK" }),
    ]);
    expect(listing.details?.validationIssues).toEqual([
      expect.objectContaining({ field: "MATTERHORN_SUI_NETWORK" }),
    ]);
  });
});
