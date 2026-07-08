import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  GeneratedImageCard,
  GeneratedImageLoadingCard,
  GeneratedImageErrorCard,
  GeneratedMediaHistory,
  ImageGenerationComposer,
  NftSetupRequirements,
  NftDraftPanel,
  NftPublishingReadinessRows,
  NftPublishingSetupRows,
  SessionImageGenerationPanel,
  buildNftPublishingReadinessItems,
  buildNftPublishingSetupRequirements,
  nftDraftPublishingCapabilitiesFromBackend,
  buildKioskListingTransactionFromPlan,
  buildMintTransactionFromPlan,
  receiptFromSuiWalletResult,
  generatedMediaStatusLabel,
} from "../src/react-app/domains/session/media";
import type {
  MatterhornGeneratedImage,
  MatterhornImageNftDraft,
  MatterhornNftListingPreviewResponse,
  MatterhornNftMintPreviewResponse,
} from "@matterhorn-work/types/generated-media";

const suiSender = `0x${"1".padStart(64, "0")}`;
const suiPackageId = `0x${"2".padStart(64, "0")}`;
const suiObjectId = `0x${"3".padStart(64, "0")}`;

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
  status: "draft",
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

const mockUploadedDraft: MatterhornImageNftDraft = {
  ...mockDraft,
  storage: {
    provider: "walrus",
    status: "uploaded",
    url: "walrus://blob/test",
  },
  mint: {
    status: "preview_ready",
    packageId: suiPackageId,
  },
};

const mockMintPreview: MatterhornNftMintPreviewResponse = {
  success: true,
  custody: false,
  canSubmit: false,
  signerPolicy: "client_wallet_required",
  handoff: {
    kind: "sui_wallet_standard",
    network: "sui-testnet",
    transactionKind: "programmable",
    packageId: suiPackageId,
    moduleName: "matterhorn_nft",
    functionName: "mint",
    storageUrl: "walrus://blob/test",
    metadata: mockUploadedDraft.metadata,
    steps: [{ label: "Sign", description: "Sign in a Sui wallet." }],
  },
  transactionPlan: {
    version: "matterhorn.sui.transaction-plan.v1",
    kind: "sui_move_call",
    network: "sui-testnet",
    custody: false,
    canSubmit: false,
    requiresWalletStandard: true,
    sender: suiSender,
    moveCalls: [
      {
        target: `${suiPackageId}::matterhorn_nft::mint`,
        packageId: suiPackageId,
        moduleName: "matterhorn_nft",
        functionName: "mint",
        typeArguments: [],
        arguments: [
          { label: "Name", kind: "pure", type: "string", value: "Test NFT" },
          { label: "Description", kind: "pure", type: "string", value: "A test NFT" },
          { label: "Image URL", kind: "pure", type: "string", value: "walrus://blob/test" },
          { label: "Attributes JSON", kind: "pure", type: "string", value: "[]" },
          { label: "Creator", kind: "pure", type: "address", value: suiSender },
        ],
      },
    ],
    sdkHints: {
      packageName: "@mysten/sui",
      importPath: "@mysten/sui/transactions",
      builder: "new Transaction()",
    },
    missingInputs: [],
  },
  setupRequirements: [],
  draft: mockUploadedDraft,
};

const mockListingPreview: MatterhornNftListingPreviewResponse = {
  success: true,
  custody: false,
  canSubmit: false,
  signerPolicy: "client_wallet_required",
  handoff: {
    kind: "sui_wallet_standard",
    network: "sui-testnet",
    transactionKind: "kiosk_listing",
    marketplace: "sui_kiosk",
    kioskPackageId: "0x2",
    transferPolicyPackageId: "0x2",
    priceMist: "1000000000",
    objectId: suiObjectId,
    steps: [{ label: "List", description: "Sign the Kiosk listing externally." }],
  },
  transactionPlan: {
    version: "matterhorn.sui.transaction-plan.v1",
    kind: "sui_kiosk_listing",
    network: "sui-testnet",
    custody: false,
    canSubmit: false,
    requiresWalletStandard: true,
    sender: suiSender,
    marketplace: "sui_kiosk",
    nftObjectId: suiObjectId,
    nftType: `${suiPackageId}::matterhorn_nft::MatterhornNFT`,
    kioskId: `0x${"4".padStart(64, "0")}`,
    kioskOwnerCapId: `0x${"5".padStart(64, "0")}`,
    transferPolicyId: `0x${"6".padStart(64, "0")}`,
    priceMist: "1000000000",
    sdkHints: {
      packageName: "@mysten/kiosk",
      builder: "KioskTransaction",
      method: "placeAndList",
    },
    missingInputs: [],
  },
  setupRequirements: [],
  draft: {
    ...mockUploadedDraft,
    mint: {
      status: "confirmed",
      transactionDigest: "mint_digest",
      objectId: suiObjectId,
      packageId: suiPackageId,
    },
    listing: {
      status: "preview_ready",
      itemType: `${suiPackageId}::matterhorn_nft::MatterhornNFT`,
      priceMist: "1000000000",
    },
  },
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

describe("Generated media history", () => {
  test("renders recent images with NFT status and actions", () => {
    const html = renderToStaticMarkup(React.createElement(GeneratedMediaHistory, {
      items: [
        {
          id: "img_test",
          workspaceId: "ws_test",
          image: mockImage,
          drafts: [mockUploadedDraft],
          latestDraft: mockUploadedDraft,
          status: "mint_preview_ready",
          createdAt: mockImage.createdAt,
          updatedAt: mockUploadedDraft.updatedAt,
        },
      ],
      selectedImageId: "img_test",
      onSelectImage: () => {},
      onMakeNft: () => {},
    }));

    expect(html).toContain("Recent images");
    expect(html).toContain("a tiny robot");
    expect(html).toContain("Mint ready");
    expect(html).toContain("NFT");
    expect(generatedMediaStatusLabel({
      id: "img_test",
      workspaceId: "ws_test",
      image: mockImage,
      drafts: [],
      status: "generated",
      createdAt: mockImage.createdAt,
      updatedAt: mockImage.createdAt,
    })).toBe("Image");
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
      listGeneratedMediaHistory: async () => ({ success: true, items: [], counts: { images: 0, drafts: 0, minted: 0, listed: 0 } }),
      getGeneratedImageFile: async () => ({ data: new ArrayBuffer(0), contentType: "image/png", filename: null }),
      generateImage: async () => ({ success: true, image: mockImage }),
      listImageNftDrafts: async () => ({ success: true, drafts: [] }),
      createImageNftDraft: async () => ({ success: true, draft: mockDraft }),
      prepareNftStorage: async () => ({ success: true, draft: mockDraft }),
      uploadNftStorage: async () => ({ success: true, draft: mockDraft }),
      previewNftMint: async () => mockMintPreview,
      recordNftMintReceipt: async () => ({ success: true, custody: false, containsSignatureMaterial: false, draft: mockDraft }),
      previewNftListing: async () => mockListingPreview,
      recordNftListingReceipt: async () => ({ success: true, custody: false, containsSignatureMaterial: false, draft: mockDraft }),
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

  test("session panel preserves configured backend capability details for NFT readiness", () => {
    const nftCapabilities = nftDraftPublishingCapabilitiesFromBackend({
      walrusStorage: {
        status: "working",
        publisherConfigured: true,
        relayConfigured: true,
      },
      nftMinting: {
        status: "preview",
        network: "sui-testnet",
        custody: false,
        signing: "client_wallet",
        packageConfigured: true,
        kioskConfigured: false,
      },
      nftMarketplaceListing: {
        status: "preview",
        network: "sui-testnet",
        custody: false,
        signing: "client_wallet",
        packageConfigured: true,
        kioskConfigured: true,
      },
    });
    const items = buildNftPublishingReadinessItems({
      imageGeneration: {
        status: "working",
        value: `${mockImage.provider}/${mockImage.model}`,
      },
      ...nftCapabilities,
    });

    expect(items.map((item) => item.value)).toEqual([
      "mock/mock-image-1",
      "Publisher and relay configured",
      "Sui testnet · Package configured",
      "Sui testnet · Kiosk ready",
    ]);
    expect(items.map((item) => item.value).join(" ")).not.toContain("needed");
  });

  test("component source exposes mint preview, wallet signing, and receipt fields", () => {
    const source = readFileSync("apps/app/src/react-app/domains/session/media/nft-draft-panel.tsx", "utf8");
    expect(source).toContain("Mint plan ready");
    expect(source).toContain("Sign mint in wallet");
    expect(source).toContain("Mint digest");
    expect(source).toContain("Minted object id");
    expect(source).toContain("onRecordMintReceipt");
  });

  test("component source exposes marketplace listing preview and receipt fields", () => {
    const source = readFileSync("apps/app/src/react-app/domains/session/media/nft-draft-panel.tsx", "utf8");
    expect(source).toContain("Marketplace listing");
    expect(source).toContain("Listing plan ready");
    expect(source).toContain("Sign listing in wallet");
    expect(source).toContain("Price (MIST)");
    expect(source).toContain("Listing transaction digest");
    expect(source).toContain("onRecordListingReceipt");
  });

  test("component source exposes publishing readiness before NFT actions", () => {
    const source = readFileSync("apps/app/src/react-app/domains/session/media/nft-draft-panel.tsx", "utf8");
    expect(source).toContain("Publishing readiness");
    expect(source).toContain("Create the local draft anytime");
    expect(source).toContain("Public storage");
    expect(source).toContain("Sui minting");
    expect(source).toContain("Marketplace listing");
  });

  test("component renders backend NFT setup requirements", () => {
    const html = renderToStaticMarkup(
      React.createElement(NftSetupRequirements, {
        requirements: [
          {
            key: "sui_nft_package",
            label: "Sui NFT package",
            status: "missing",
            envVar: "MATTERHORN_SUI_NFT_PACKAGE_ID",
            description: "Mint previews need the Move package id.",
          },
          {
            key: "sui_nft_module",
            label: "Sui NFT module",
            status: "configured",
            envVar: "MATTERHORN_SUI_NFT_MODULE_NAME",
            description: "Defaults to matterhorn_nft.",
          },
        ],
      }),
    );
    expect(html).toContain("Setup needed");
    expect(html).toContain("MATTERHORN_SUI_NFT_PACKAGE_ID");
    expect(html).not.toContain("MATTERHORN_SUI_NFT_MODULE_NAME");
  });

  test("component renders capability setup requirements before NFT actions", () => {
    const requirements = buildNftPublishingSetupRequirements({
      imageGeneration: {
        status: "needs_setup",
        setupRequirements: [{
          key: "openai_api_key",
          label: "OpenAI API key",
          status: "missing",
          envVar: "OPENAI_API_KEY",
          description: "Set OPENAI_API_KEY to enable OpenAI image generation.",
        }],
      },
      walrusStorage: { status: "needs_setup", publisherConfigured: false, relayConfigured: false },
      nftMinting: { status: "needs_setup", network: "sui-testnet", custody: false, signing: "client_wallet", packageConfigured: false, kioskConfigured: false },
      nftMarketplaceListing: { status: "needs_setup", network: "sui-testnet", custody: false, signing: "client_wallet", packageConfigured: false, kioskConfigured: false },
    });
    const html = renderToStaticMarkup(React.createElement(NftPublishingSetupRows, {
      requirements,
      description: "These setup gates come from the local Matterhorn backend.",
    }));

    expect(html).toContain("Required setup");
    expect(html).toContain("OPENAI_API_KEY");
    expect(html).toContain("MATTERHORN_WALRUS_PUBLISHER_URL");
    expect(html).toContain("MATTERHORN_SUI_NFT_PACKAGE_ID");
    expect(html).toContain("MATTERHORN_SUI_KIOSK_PACKAGE_ID");
  });

  test("publishing readiness rows summarize generated image and NFT setup states", () => {
    const items = buildNftPublishingReadinessItems({
      imageGeneration: {
        status: "working",
        providers: [{ status: "working", label: "Mock", provider: "mock", model: "mock-image-1", size: "1024x1024", quality: "auto", format: "png" }],
        defaultProvider: "mock",
        defaultModel: "mock-image-1",
      },
      walrusStorage: { status: "needs_setup", publisherConfigured: false, relayConfigured: false },
      nftMinting: { status: "needs_setup", network: "sui-testnet", custody: false, signing: "client_wallet", packageConfigured: false, kioskConfigured: false },
      nftMarketplaceListing: { status: "needs_setup", network: "sui-testnet", custody: false, signing: "client_wallet", packageConfigured: false, kioskConfigured: false },
    });
    const html = renderToStaticMarkup(React.createElement(NftPublishingReadinessRows, {
      items,
      title: "Publishing readiness",
      description: "Public actions need setup.",
      surface: true,
    }));

    expect(html).toContain("Publishing readiness");
    expect(html).toContain("mock/mock-image-1");
    expect(html).toContain("Publisher/relay needed");
    expect(html).toContain("Package needed");
    expect(html).toContain("Kiosk/TransferPolicy needed");
  });
});

describe("Sui NFT transaction plan helpers", () => {
  test("builds a wallet transaction from the backend mint plan", () => {
    const transaction = buildMintTransactionFromPlan(mockMintPreview.transactionPlan, suiSender);
    const data = transaction.getData();
    const moveCall = data.commands[0] as {
      MoveCall?: {
        package: string;
        module: string;
        function: string;
        typeArguments: string[];
        arguments: Array<{ Input: number; type?: string; $kind: string }>;
      };
    };

    expect(data.sender).toBe(suiSender);
    expect(data.inputs).toHaveLength(5);
    expect(data.commands).toHaveLength(1);
    expect(moveCall.MoveCall).toMatchObject({
      package: suiPackageId,
      module: "matterhorn_nft",
      function: "mint",
      typeArguments: [],
    });
    expect(moveCall.MoveCall?.arguments).toEqual([
      { Input: 0, type: "pure", $kind: "Input" },
      { Input: 1, type: "pure", $kind: "Input" },
      { Input: 2, type: "pure", $kind: "Input" },
      { Input: 3, type: "pure", $kind: "Input" },
      { Input: 4, type: "pure", $kind: "Input" },
    ]);
  });

  test("rejects unsafe or mismatched mint transaction plans before wallet signing", () => {
    const submitCapablePlan = structuredClone(mockMintPreview.transactionPlan) as typeof mockMintPreview.transactionPlan;
    (submitCapablePlan as unknown as { canSubmit: boolean }).canSubmit = true;
    expect(() => buildMintTransactionFromPlan(submitCapablePlan, suiSender)).toThrow("must not allow Matterhorn submission");

    const mismatchedTargetPlan = structuredClone(mockMintPreview.transactionPlan) as typeof mockMintPreview.transactionPlan;
    mismatchedTargetPlan.moveCalls[0]!.target = `${suiPackageId}::other_module::mint`;
    expect(() => buildMintTransactionFromPlan(mismatchedTargetPlan, suiSender)).toThrow("target does not match");

    const missingInputPlan = structuredClone(mockMintPreview.transactionPlan) as typeof mockMintPreview.transactionPlan;
    missingInputPlan.missingInputs = ["public_image_uri"];
    expect(() => buildMintTransactionFromPlan(missingInputPlan, suiSender)).toThrow("missing inputs");
  });

  test("builds a wallet transaction from the backend Kiosk listing plan", () => {
    const transaction = buildKioskListingTransactionFromPlan(mockListingPreview.transactionPlan, suiSender);
    const data = transaction.getData();
    const moveCall = data.commands[0] as {
      MoveCall?: {
        package: string;
        module: string;
        function: string;
        typeArguments: string[];
        arguments: Array<{ Input: number; type?: string; $kind: string }>;
      };
    };

    expect(data.sender).toBe(suiSender);
    expect(data.inputs).toHaveLength(4);
    expect(data.inputs).toContainEqual(expect.objectContaining({
      UnresolvedObject: { objectId: mockListingPreview.transactionPlan.kioskId },
    }));
    expect(data.inputs).toContainEqual(expect.objectContaining({
      UnresolvedObject: { objectId: mockListingPreview.transactionPlan.kioskOwnerCapId },
    }));
    expect(data.inputs).toContainEqual(expect.objectContaining({
      UnresolvedObject: { objectId: mockListingPreview.transactionPlan.nftObjectId },
    }));
    expect(data.commands).toHaveLength(1);
    expect(moveCall.MoveCall).toMatchObject({
      package: "0x0000000000000000000000000000000000000000000000000000000000000002",
      module: "kiosk",
      function: "place_and_list",
      typeArguments: [mockListingPreview.transactionPlan.nftType],
    });
    expect(moveCall.MoveCall?.arguments).toEqual([
      { Input: 0, type: "object", $kind: "Input" },
      { Input: 1, type: "object", $kind: "Input" },
      { Input: 2, type: "object", $kind: "Input" },
      { Input: 3, type: "pure", $kind: "Input" },
    ]);
  });

  test("rejects unsafe or incomplete listing transaction plans before wallet signing", () => {
    const custodialPlan = structuredClone(mockListingPreview.transactionPlan) as typeof mockListingPreview.transactionPlan;
    (custodialPlan as unknown as { custody: boolean }).custody = true;
    expect(() => buildKioskListingTransactionFromPlan(custodialPlan, suiSender)).toThrow("must be non-custodial");

    const missingKioskPlan = structuredClone(mockListingPreview.transactionPlan) as typeof mockListingPreview.transactionPlan;
    missingKioskPlan.kioskOwnerCapId = "";
    expect(() => buildKioskListingTransactionFromPlan(missingKioskPlan, suiSender)).toThrow("missing Kiosk owner cap");

    const noWalletStandardPlan = structuredClone(mockListingPreview.transactionPlan) as typeof mockListingPreview.transactionPlan;
    (noWalletStandardPlan as unknown as { requiresWalletStandard: boolean }).requiresWalletStandard = false;
    expect(() => buildKioskListingTransactionFromPlan(noWalletStandardPlan, suiSender)).toThrow("wallet-standard signer");
  });

  test("extracts digest and minted object id from wallet results", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "Transaction",
      Transaction: {
        digest: "9uMintDigest",
        objectChanges: [
          { type: "created", objectId: suiObjectId },
        ],
      },
    });
    expect(receipt).toEqual({
      digest: "9uMintDigest",
      status: "success",
      objectId: suiObjectId,
      error: null,
    });
  });

  test("extracts minted object id from parsed Sui transaction effects", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "Transaction",
      Transaction: {
        digest: "9uMintDigest",
        effects: {
          status: { success: true, error: null },
          gasObject: {
            objectId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            inputState: "Exists",
            outputState: "ObjectWrite",
            idOperation: "None",
          },
          changedObjects: [
            {
              objectId: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
              inputState: "Exists",
              outputState: "ObjectWrite",
              idOperation: "None",
            },
            {
              objectId: suiObjectId,
              inputState: "DoesNotExist",
              outputState: "ObjectWrite",
              idOperation: "Created",
            },
          ],
        },
      },
    });

    expect(receipt.objectId).toBe(suiObjectId);
  });

  test("extracts minted object id from JSON-RPC created effects", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "Transaction",
      Transaction: {
        digest: "9uJsonRpcDigest",
        effects: {
          status: { success: true, error: null },
          created: [
            {
              reference: {
                objectId: suiObjectId,
                version: "1",
                digest: "createdObjectDigest",
              },
              owner: { AddressOwner: suiSender },
            },
          ],
        },
      },
    });

    expect(receipt).toMatchObject({
      digest: "9uJsonRpcDigest",
      status: "success",
      objectId: suiObjectId,
      error: null,
    });
  });

  test("extracts minted object id from GraphQL object change nodes", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "Transaction",
      Transaction: {
        digest: "9uGraphqlDigest",
        effects: {
          status: { success: true, error: null },
          objectChanges: {
            nodes: [
              {
                address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                idCreated: false,
              },
              {
                address: suiObjectId,
                idCreated: true,
              },
            ],
          },
        },
      },
    });

    expect(receipt.objectId).toBe(suiObjectId);
  });

  test("handles direct transaction result objects from wallet adapters", () => {
    const receipt = receiptFromSuiWalletResult({
      digest: "9uDirectDigest",
      status: { success: true, error: null },
      effects: {
        changedObjects: [
          {
            objectId: suiObjectId,
            inputState: "DoesNotExist",
            outputState: "ObjectWrite",
            idOperation: "Created",
          },
        ],
      },
    });

    expect(receipt).toEqual({
      digest: "9uDirectDigest",
      status: "success",
      objectId: suiObjectId,
      error: null,
    });
  });

  test("does not mistake gas or mutated objects for minted object ids", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "Transaction",
      Transaction: {
        digest: "9uMintDigest",
        effects: {
          status: { success: true, error: null },
          changedObjects: [
            {
              objectId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              inputState: "Exists",
              outputState: "ObjectWrite",
              idOperation: "None",
            },
          ],
        },
      },
    });

    expect(receipt.objectId).toBeNull();
  });

  test("extracts wallet failure messages from dApp Kit failed transaction results", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "FailedTransaction",
      FailedTransaction: {
        digest: "9uFailedDigest",
        status: {
          success: false,
          error: { message: "MoveAbort in NFT mint" },
        },
      },
    });

    expect(receipt).toEqual({
      digest: "9uFailedDigest",
      status: "failure",
      objectId: null,
      error: "MoveAbort in NFT mint",
    });
  });

  test("extracts string wallet failure messages", () => {
    const receipt = receiptFromSuiWalletResult({
      $kind: "FailedTransaction",
      FailedTransaction: {
        digest: "9uFailedDigest",
        status: {
          success: false,
          error: "MoveAbort in NFT mint",
        },
      },
    });

    expect(receipt).toEqual({
      digest: "9uFailedDigest",
      status: "failure",
      objectId: null,
      error: "MoveAbort in NFT mint",
    });
  });
});
