import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readAppSource(path: string) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

function readServerSource(path: string) {
  return readFileSync(new URL(`../../server/src/${path}`, import.meta.url), "utf8");
}

describe("Image generation backend capability contract", () => {
  test("server builds image generation capability", () => {
    const source = readServerSource("server.ts");
    expect(source).toContain("imageGeneration:");
    expect(source).toContain("buildImageGenerationCapability");
    expect(source).toContain("resolveImageGenerationProviderFromEnv");
  });

  test("server builds NFT and Walrus capabilities", () => {
    const source = readServerSource("server.ts");
    expect(source).toContain("walrusStorage:");
    expect(source).toContain("nftMinting:");
    expect(source).toContain("nftMarketplaceListing:");
    expect(source).toContain("buildWalrusStorageCapability");
    expect(source).toContain("buildNftMintingCapability");
    expect(source).toContain("buildNftMarketplaceListingCapability");
  });

  test("settings sections include image-generation and nft", () => {
    const source = readServerSource("server.ts");
    expect(source).toContain('"image-generation"');
    expect(source).toContain('"nft"');
  });

  test("app client exposes image and NFT methods", () => {
    const source = readAppSource("app/lib/matterhorn-server.ts");
    expect(source).toContain("generateImage:");
    expect(source).toContain("listGeneratedImages:");
    expect(source).toContain("createImageNftDraft:");
    expect(source).toContain("previewNftMint:");
    expect(source).toContain("previewNftListing:");
    expect(source).toContain("recordNftMintReceipt:");
    expect(source).toContain("recordNftListingReceipt:");
  });

  test("backend capability fixtures include image/NFT capabilities", () => {
    const source = readAppSource("react-app/domains/settings/backend-capabilities/backend-capability-fixtures.ts");
    expect(source).toContain("imageGeneration:");
    expect(source).toContain("nftMinting:");
    expect(source).toContain('"image-generation"');
    expect(source).toContain('"nft"');
  });
});
