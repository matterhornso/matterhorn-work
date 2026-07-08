import { describe, expect, test } from "bun:test";

import {
  buildImageGenerationCapability,
  buildNftMarketplaceListingCapability,
  buildNftMintingCapability,
  buildWalrusStorageCapability,
  resolveNftEnvironmentConfig,
} from "./image-nft-capabilities.js";

describe("image/NFT publishing capability config", () => {
  test("OpenAI image generation setup reports the exact missing env var", () => {
    const capability = buildImageGenerationCapability({
      status: "needs_setup",
      label: "OpenAI image provider",
      provider: "openai",
      model: "gpt-image-1",
      size: "1024x1024",
      quality: "auto",
      format: "png",
      message: "Set OPENAI_API_KEY to enable OpenAI image generation.",
    });

    expect(capability.status).toBe("needs_setup");
    expect(capability.setupRequirements).toEqual([{
      key: "openai_api_key",
      label: "OpenAI API key",
      status: "missing",
      envVar: "OPENAI_API_KEY",
      description: "Set OPENAI_API_KEY to enable OpenAI image generation.",
    }]);
  });

  test("invalid image generation setup reports a structured setup requirement", () => {
    const capability = buildImageGenerationCapability({
      status: "error",
      label: "Image provider configuration",
      provider: "mock",
      model: "mock-image-1",
      size: "2048x2048",
      quality: "auto",
      format: "png",
      message: "MATTERHORN_IMAGE_SIZE must be one of 1024x1024, 1536x1024, 1024x1536, auto.",
    });

    expect(capability.status).toBe("error");
    expect(capability.setupRequirements?.[0]).toMatchObject({
      key: "image_size",
      label: "Image size",
      status: "invalid",
      envVar: "MATTERHORN_IMAGE_SIZE",
    });
  });

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
    expect(capability.setupRequirements).toEqual([
      expect.objectContaining({
        key: "walrus_publisher",
        status: "invalid",
        envVar: "MATTERHORN_WALRUS_PUBLISHER_URL",
      }),
      expect.objectContaining({
        key: "walrus_relay",
        status: "invalid",
        envVar: "MATTERHORN_WALRUS_RELAY_URL",
      }),
      expect.objectContaining({
        key: "walrus_storage_epochs",
        status: "invalid",
        envVar: "MATTERHORN_WALRUS_STORAGE_EPOCHS",
      }),
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
    expect(capability.setupRequirements).toEqual([
      expect.objectContaining({ key: "walrus_publisher", status: "configured" }),
      expect.objectContaining({ key: "walrus_relay", status: "configured" }),
    ]);
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
    expect(minting.setupRequirements).toEqual([
      expect.objectContaining({
        key: "sui_network",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NETWORK",
      }),
      expect.objectContaining({
        key: "sui_nft_package",
        status: "configured",
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      }),
      expect.objectContaining({
        key: "sui_nft_module",
        status: "configured",
        envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
      }),
    ]);
    expect(listing.setupRequirements).toEqual([
      expect.objectContaining({
        key: "sui_network",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NETWORK",
      }),
      expect.objectContaining({
        key: "sui_kiosk_package",
        status: "configured",
        envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      }),
      expect.objectContaining({
        key: "sui_transfer_policy",
        status: "configured",
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      }),
    ]);
  });

  test("invalid configured Sui package ids are setup errors instead of preview-ready", () => {
    const config = resolveNftEnvironmentConfig({
      MATTERHORN_SUI_NETWORK: "sui-testnet",
      MATTERHORN_SUI_NFT_PACKAGE_ID: "not-a-sui-object",
      MATTERHORN_SUI_NFT_MODULE_NAME: "not-a-module-name",
      MATTERHORN_SUI_KIOSK_PACKAGE_ID: "not-a-kiosk-package",
      MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID: "not-a-policy-package",
      MATTERHORN_SUI_KIOSK_ID: "not-a-kiosk",
      MATTERHORN_SUI_KIOSK_OWNER_CAP_ID: "not-an-owner-cap",
      MATTERHORN_SUI_TRANSFER_POLICY_ID: "not-a-transfer-policy",
      MATTERHORN_SUI_NFT_TYPE: "not-a-full-type",
    } as typeof process.env);

    const minting = buildNftMintingCapability(config);
    const listing = buildNftMarketplaceListingCapability(config);

    expect(minting.status).toBe("error");
    expect(listing.status).toBe("error");
    expect(minting.setupRequirements).toEqual([
      expect.objectContaining({
        key: "sui_nft_package",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
      }),
      expect.objectContaining({
        key: "sui_nft_module",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
      }),
    ]);
    expect(listing.setupRequirements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "sui_kiosk_package",
        status: "invalid",
        envVar: "MATTERHORN_SUI_KIOSK_PACKAGE_ID",
      }),
      expect.objectContaining({
        key: "sui_transfer_policy",
        status: "invalid",
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_PACKAGE_ID",
      }),
      expect.objectContaining({
        key: "sui_nft_type",
        status: "invalid",
        envVar: "MATTERHORN_SUI_NFT_TYPE",
      }),
      expect.objectContaining({
        key: "sui_kiosk_id",
        status: "invalid",
        envVar: "MATTERHORN_SUI_KIOSK_ID",
      }),
      expect.objectContaining({
        key: "sui_kiosk_owner_cap",
        status: "invalid",
        envVar: "MATTERHORN_SUI_KIOSK_OWNER_CAP_ID",
      }),
      expect.objectContaining({
        key: "sui_transfer_policy",
        status: "invalid",
        envVar: "MATTERHORN_SUI_TRANSFER_POLICY_ID",
      }),
    ]));
  });
});
