#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import process from "node:process";

const DEFAULT_SERVER_URL = "http://127.0.0.1:4125";
const DEFAULT_TOKEN = "matterhorn-media-smoke-client-token";
const DEFAULT_MINT_PACKAGE_ID = "0x1111111111111111111111111111111111111111111111111111111111111111";
const DEFAULT_NFT_OBJECT_ID = "0x7777777777777777777777777777777777777777777777777777777777777777";
const DEFAULT_SENDER = "0x8888888888888888888888888888888888888888888888888888888888888888";
const DEFAULT_KIOSK_ID = "0x4444444444444444444444444444444444444444444444444444444444444444";
const DEFAULT_KIOSK_OWNER_CAP_ID = "0x5555555555555555555555555555555555555555555555555555555555555555";
const DEFAULT_TRANSFER_POLICY_ID = "0x6666666666666666666666666666666666666666666666666666666666666666";

function parseArgs(argv) {
  const args = {
    serverUrl: process.env.MATTERHORN_MEDIA_SMOKE_SERVER_URL || DEFAULT_SERVER_URL,
    token: process.env.MATTERHORN_MEDIA_SMOKE_CLIENT_TOKEN || DEFAULT_TOKEN,
    workspaceId: process.env.MATTERHORN_MEDIA_SMOKE_WORKSPACE_ID || "",
    prompt: "a glass Matterhorn workspace terminal with a Sui NFT preview",
    title: "Smoke NFT",
    description: "Generated-media smoke draft",
    listingPriceMist: "1000",
    sender: DEFAULT_SENDER,
    kioskId: DEFAULT_KIOSK_ID,
    kioskOwnerCapId: DEFAULT_KIOSK_OWNER_CAP_ID,
    transferPolicyId: DEFAULT_TRANSFER_POLICY_ID,
    nftObjectId: DEFAULT_NFT_OBJECT_ID,
    mintPackageId: DEFAULT_MINT_PACKAGE_ID,
    json: false,
    strict: false,
    jsonOutput: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value.`);
      index += 1;
      return value;
    };
    switch (arg) {
      case "--server-url":
        args.serverUrl = next();
        break;
      case "--token":
        args.token = next();
        break;
      case "--workspace-id":
        args.workspaceId = next();
        break;
      case "--prompt":
        args.prompt = next();
        break;
      case "--title":
        args.title = next();
        break;
      case "--description":
        args.description = next();
        break;
      case "--listing-price-mist":
        args.listingPriceMist = next();
        break;
      case "--sender":
        args.sender = next();
        break;
      case "--kiosk-id":
        args.kioskId = next();
        break;
      case "--kiosk-owner-cap-id":
        args.kioskOwnerCapId = next();
        break;
      case "--transfer-policy-id":
        args.transferPolicyId = next();
        break;
      case "--nft-object-id":
        args.nftObjectId = next();
        break;
      case "--mint-package-id":
        args.mintPackageId = next();
        break;
      case "--json":
        args.json = true;
        break;
      case "--strict":
        args.strict = true;
        break;
      case "--json-output":
        args.jsonOutput = next();
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.serverUrl = args.serverUrl.replace(/\/+$/, "");
  return args;
}

function help() {
  return [
    "Matterhorn generated-media flow smoke",
    "",
    "Runs the backend flow against a running Matterhorn server:",
    "1. Generate a mock/OpenAI image.",
    "2. Create an NFT draft.",
    "3. Upload public media to Walrus.",
    "4. Prepare a Sui mint transaction plan.",
    "5. Record a public mint receipt.",
    "6. Prepare a Sui Kiosk listing transaction plan.",
    "",
    "Usage:",
    "  node scripts/generated-media-flow-smoke.mjs --server-url <url> --token <token> --strict",
    "  pnpm dev:generated-media-smoke",
    "  pnpm smoke:generated-media-flow -- --strict --json",
    "",
    "Defaults target the local dev:generated-media-smoke stack.",
  ].join("\n");
}

async function fetchJson(config, path, init = {}) {
  const response = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${init.method || "GET"} ${path} -> ${response.status}`);
    error.payload = payload;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function resolveWorkspaceId(config) {
  if (config.workspaceId) return config.workspaceId;
  const payload = await fetchJson(config, "/workspaces");
  const id =
    String(payload.activeId ?? "").trim() ||
    String(payload.items?.[0]?.id ?? payload.workspaces?.[0]?.id ?? "").trim();
  if (!id) throw new Error("Matterhorn server did not report a workspace id.");
  return id;
}

async function runGeneratedMediaFlow(config) {
  const report = {
    ready: false,
    metadata: {
      generatedAt: new Date().toISOString(),
      serverUrl: config.serverUrl,
      workspaceId: "",
    },
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
    },
    stages: [],
    artifacts: {},
  };

  async function stage(id, label, run) {
    const startedAt = Date.now();
    try {
      const result = await run();
      report.stages.push({
        id,
        label,
        status: "pass",
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      report.stages.push({
        id,
        label,
        status: "fail",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        details: error?.payload,
      });
      throw error;
    }
  }

  try {
    const workspaceId = await stage("workspace", "Resolve active workspace", () => resolveWorkspaceId(config));
    report.metadata.workspaceId = workspaceId;

    const capabilities = await stage("capabilities", "Read generated-media capabilities", () => fetchJson(config, "/api/backend/capabilities"));
    report.artifacts.capabilities = {
      imageGeneration: capabilities.imageGeneration?.status,
      walrusStorage: capabilities.walrusStorage?.status,
      nftMinting: capabilities.nftMinting?.status,
      nftMarketplaceListing: capabilities.nftMarketplaceListing?.status,
    };

    const image = await stage("image.generate", "Generate image", () => fetchJson(config, `/workspace/${workspaceId}/images/generate`, {
      method: "POST",
      body: JSON.stringify({ prompt: config.prompt }),
    }));
    report.artifacts.image = {
      id: image.image?.id,
      provider: image.image?.provider,
      outputId: image.image?.outputId,
      sha256: image.image?.sha256,
    };

    const draft = await stage("nft.draft", "Create NFT draft", () => fetchJson(config, `/workspace/${workspaceId}/images/${image.image.id}/nft-draft`, {
      method: "POST",
      body: JSON.stringify({
        title: config.title,
        description: config.description,
        listingPriceMist: config.listingPriceMist,
      }),
    }));
    report.artifacts.draft = {
      id: draft.draft?.id,
      status: draft.draft?.status,
    };

    const upload = await stage("walrus.upload", "Upload media to Walrus", () => fetchJson(config, `/workspace/${workspaceId}/nft-drafts/${draft.draft.id}/storage/upload`, {
      method: "POST",
    }));
    report.artifacts.storage = {
      status: upload.draft?.storage?.status,
      blobId: upload.draft?.storage?.blobId,
      url: upload.draft?.storage?.url,
    };

    const mintPreview = await stage("sui.mint_preview", "Prepare Sui mint preview", () => fetchJson(config, `/workspace/${workspaceId}/nft-drafts/${draft.draft.id}/mint/preview`, {
      method: "POST",
    }));
    const packageId = mintPreview.handoff?.packageId || config.mintPackageId;
    const moduleName = mintPreview.handoff?.moduleName || "matterhorn_media";
    report.artifacts.mintPreview = {
      kind: mintPreview.transactionPlan?.kind,
      target: mintPreview.transactionPlan?.moveCalls?.[0]?.target,
      custody: mintPreview.custody,
      canSubmit: mintPreview.canSubmit,
    };

    const mintReceipt = await stage("sui.mint_receipt", "Record Sui mint receipt", () => fetchJson(config, `/workspace/${workspaceId}/nft-drafts/${draft.draft.id}/mint/receipt`, {
      method: "POST",
      body: JSON.stringify({
        transactionDigest: "0xsmokemintdigest",
        objectId: config.nftObjectId,
        network: "sui-testnet",
        packageId,
      }),
    }));
    report.artifacts.mintReceipt = {
      status: mintReceipt.draft?.mint?.status,
      objectId: mintReceipt.draft?.mint?.objectId,
    };

    const listingPreview = await stage("sui.listing_preview", "Prepare Sui Kiosk listing preview", () => fetchJson(config, `/workspace/${workspaceId}/nft-drafts/${draft.draft.id}/listing/preview`, {
      method: "POST",
      body: JSON.stringify({
        sender: config.sender,
        nftType: `${packageId}::${moduleName}::MatterhornNFT`,
        kioskId: config.kioskId,
        kioskOwnerCapId: config.kioskOwnerCapId,
        transferPolicyId: config.transferPolicyId,
        priceMist: config.listingPriceMist,
      }),
    }));
    report.artifacts.listingPreview = {
      kind: listingPreview.transactionPlan?.kind,
      marketplace: listingPreview.transactionPlan?.marketplace,
      custody: listingPreview.custody,
      canSubmit: listingPreview.canSubmit,
    };

    report.ready = report.stages.every((item) => item.status === "pass");
  } catch (error) {
    report.ready = false;
    report.error = error instanceof Error ? error.message : String(error);
  }

  return report;
}

function emitReport(report, config) {
  const serialized = JSON.stringify(report, null, 2);
  if (config.jsonOutput) writeFileSync(config.jsonOutput, `${serialized}\n`);
  if (config.json) {
    process.stdout.write(`${serialized}\n`);
    return;
  }

  process.stdout.write(`Matterhorn generated-media flow smoke: ${report.ready ? "PASS" : "FAIL"}\n`);
  for (const stage of report.stages) {
    process.stdout.write(`- ${stage.status.toUpperCase()} ${stage.id}: ${stage.label}${stage.error ? ` (${stage.error})` : ""}\n`);
  }
  if (config.jsonOutput) process.stdout.write(`JSON report: ${config.jsonOutput}\n`);
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  if (config.help) {
    console.log(help());
    return;
  }

  const report = await runGeneratedMediaFlow(config);
  emitReport(report, config);
  if (config.strict && !report.ready) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
