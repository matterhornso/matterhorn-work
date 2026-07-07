import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GeneratedImageCard,
  GeneratedImageLoadingCard,
  GeneratedImageErrorCard,
  ImageGenerationComposer,
  NftDraftPanel,
  SessionImageGenerationPanel,
} from "../src/react-app/domains/session/media";
import type { MatterhornGeneratedImage, MatterhornImageNftDraft } from "@matterhorn-work/types/generated-media";

const mockImage: MatterhornGeneratedImage = {
  id: "img_test",
  workspaceId: "ws_test",
  outputId: "out_test",
  provider: "mock",
  model: "mock-image-1",
  prompt: "a tiny robot",
  size: "1024x1024",
  quality: "auto",
  format: "png",
  fileName: "img_test.png",
  relativePath: ".matterhorn-work/outputs/images/img_test.png",
  contentType: "image/png",
  byteLength: 1234,
  sha256: "abcd",
  createdAt: new Date().toISOString(),
  status: "generated",
  safety: { secretsRejected: false },
};

const mockDraft: MatterhornImageNftDraft = {
  id: "nft_test",
  workspaceId: "ws_test",
  imageId: "img_test",
  title: "Test NFT",
  description: "A test NFT",
  creatorAddress: null,
  network: "sui-testnet",
  metadata: {
    name: "Test NFT",
    description: "A test NFT",
    imageUrl: null,
    attributes: [],
    license: null,
    usageNote: null,
  },
  storage: { provider: "local", status: "local_only" },
  mint: { status: "not_ready" },
  listing: { status: "not_ready" },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("Generated image card", () => {
  test("renders image metadata and actions", () => {
    const html = renderToStaticMarkup(React.createElement(GeneratedImageCard, {
      image: mockImage,
      onEditPrompt: () => {},
      onGenerateVariant: () => {},
      onSaveToOutputs: () => {},
      onMakeNft: () => {},
    }));
    expect(html).toContain("a tiny robot");
    expect(html).toContain("mock");
    expect(html).toContain("1024x1024");
    expect(html).toContain("Edit prompt");
    expect(html).toContain("Generate variant");
    expect(html).toContain("Save to outputs");
    expect(html).toContain("Make NFT");
  });

  test("loading card shows generating state", () => {
    const html = renderToStaticMarkup(React.createElement(GeneratedImageLoadingCard));
    expect(html).toContain("Generating image");
  });

  test("error card shows message and retry", () => {
    const html = renderToStaticMarkup(React.createElement(GeneratedImageErrorCard, { message: "Provider offline", onRetry: () => {} }));
    expect(html).toContain("Provider offline");
    expect(html).toContain("Retry");
  });
});

describe("Image generation composer", () => {
  test("working state renders input and button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageGenerationComposer, { capabilityStatus: "working", onGenerate: () => {} }),
    );
    expect(html).toContain("Describe an image to generate");
    expect(html).toContain("Generate");
  });

  test("needs_setup state shows setup message", () => {
    const html = renderToStaticMarkup(
      React.createElement(ImageGenerationComposer, { capabilityStatus: "needs_setup", onGenerate: () => {} }),
    );
    expect(html).toContain("needs setup");
    expect(html).toContain("Configure an image provider");
  });
});

describe("Session image generation panel", () => {
  test("renders as a compact chat composer accessory", () => {
    const client = {
      backendCapabilities: async () => { throw new Error("not used"); },
      listGeneratedImages: async () => ({ success: true, images: [] }),
      getGeneratedImageFile: async () => ({ data: new ArrayBuffer(0), contentType: "image/png", filename: null }),
      generateImage: async () => ({ success: true, image: mockImage }),
      listImageNftDrafts: async () => ({ success: true, drafts: [] }),
      createImageNftDraft: async () => ({ success: true, draft: mockDraft }),
      prepareNftStorage: async () => ({ success: true, draft: mockDraft }),
      uploadNftStorage: async () => ({ success: true, draft: mockDraft }),
      previewNftMint: async () => ({ success: true, draft: mockDraft }),
      previewNftListing: async () => ({ success: true, draft: mockDraft }),
    };
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      React.createElement(QueryClientProvider, { client: queryClient },
        React.createElement(SessionImageGenerationPanel, {
          client: client as any,
          workspaceId: "ws_test",
          sessionId: "ses_test",
          defaultOpen: true,
          capabilitiesOverride: {
            imageGeneration: { status: "working" },
            walrusStorage: { status: "needs_setup" },
            nftMinting: { status: "needs_setup" },
            nftMarketplaceListing: { status: "needs_setup" },
          },
        }),
      ),
    );

    expect(html).toContain("Generate image");
    expect(html).toContain("Describe an image to generate");
    expect(html).toContain("Ready");
  });
});

describe("NFT draft panel", () => {
  test("component renders without crashing", () => {
    const html = renderToStaticMarkup(
      React.createElement(NftDraftPanel, {
        open: true,
        onOpenChange: () => {},
        image: mockImage,
        capabilities: { walrusStorage: "needs_setup", nftMinting: "needs_setup", nftMarketplaceListing: "needs_setup" },
        onCreateDraft: () => {},
        onPrepareStorage: () => {},
        onUploadStorage: () => {},
        onPreviewMint: () => {},
        onRecordMintReceipt: () => {},
        onPreviewListing: () => {},
        onRecordListingReceipt: () => {},
      }),
    );
    expect(typeof html).toBe("string");
  });

  test("component renders with draft without crashing", () => {
    const html = renderToStaticMarkup(
      React.createElement(NftDraftPanel, {
        open: true,
        onOpenChange: () => {},
        image: mockImage,
        draft: mockDraft,
        capabilities: { walrusStorage: "needs_setup", nftMinting: "needs_setup", nftMarketplaceListing: "needs_setup" },
        onCreateDraft: () => {},
        onPrepareStorage: () => {},
        onUploadStorage: () => {},
        onPreviewMint: () => {},
        onRecordMintReceipt: () => {},
        onPreviewListing: () => {},
        onRecordListingReceipt: () => {},
      }),
    );
    expect(typeof html).toBe("string");
  });
});
