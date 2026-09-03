#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const CLIENT_TOKEN = "mwt_client_test";
const HOST_TOKEN = "mwh_host_test";
const requests = [];
const MCP_ENTRYPOINT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "index.mjs",
);

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const body = await readJson(req);
  requests.push({
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
    authorization: req.headers.authorization,
    hostToken: req.headers["x-matterhorn-host-token"],
    body,
  });

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, service: "matterhorn-work-server" });
  }
  if (req.headers.authorization !== `Bearer ${CLIENT_TOKEN}` && !url.pathname.startsWith("/approvals")) {
    return json(res, 401, { error: "unauthorized" });
  }
  if (url.pathname.startsWith("/approvals") && req.headers["x-matterhorn-host-token"] !== HOST_TOKEN) {
    return json(res, 403, { error: "forbidden" });
  }

  if (req.method === "GET" && url.pathname === "/status") {
    return json(res, 200, { ok: true, workspaces: 1 });
  }
  if (req.method === "GET" && url.pathname === "/capabilities") {
    return json(res, 200, { ok: true, tools: ["files", "approvals", "bittensor"] });
  }
  if (req.method === "GET" && url.pathname === "/workspaces") {
    return json(res, 200, { items: [{ id: "ws_1", name: "Demo", path: "/workspace" }], activeId: "ws_1" });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(body.title, "Agent session");
    return json(res, 200, { item: { id: "ses_created", title: "Agent session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions") {
    assert.equal(url.searchParams.get("limit"), "3");
    assert.equal(url.searchParams.get("search"), "demo");
    return json(res, 200, { items: [{ id: "ses_1", title: "Demo session" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { item: { id: "ses_1", title: "Demo session" } });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { items: [{ id: "msg_1", role: "user", content: "hello" }] });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/status") {
    return json(res, 200, {
      item: {
        session: { id: "ses_1", title: "Demo session" },
        status: { type: "busy" },
        busy: true,
        observedAt: 123,
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/events") {
    assert.equal(req.headers.accept, "text/event-stream");
    assert.ok(["1", "2"].includes(url.searchParams.get("maxEvents")), "unexpected maxEvents for session event route");
    assert.equal(url.searchParams.get("snapshot"), "true");
    if (url.searchParams.get("maxEvents") === "2") {
      assert.equal(url.searchParams.get("details"), "true");
      assert.equal(url.searchParams.get("since"), "7");
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(
      `id: 8\nevent: session.snapshot\ndata: ${JSON.stringify({
        type: "session.snapshot",
        cursor: "8",
        workspaceId: "ws_1",
        sessionId: "ses_1",
        observedAt: 123,
        source: "matterhorn-work-server",
        payload: { session: { id: "ses_1" }, status: { type: "busy" } },
      })}\n\n`,
    );
    res.end(
      `id: 9\nevent: session.status\ndata: ${JSON.stringify({
        type: "session.status",
        cursor: "9",
        workspaceId: "ws_1",
        sessionId: "ses_1",
        observedAt: 124,
        source: "matterhorn-work-server",
        payload: { status: { type: "busy" }, busy: true },
      })}\n\n`,
    );
    return;
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/sessions/ses_1/messages") {
    assert.equal(body.message, "Summarize this workspace");
    assert.equal(body.model.providerID, "openai");
    assert.equal(body.model.modelID, "gpt-4.1");
    assert.equal(body.agent, "build");
    assert.equal(body.noReply, true);
    return json(res, 200, { ok: true, accepted: true, sessionId: "ses_1" });
  }
  if (req.method === "GET" && url.pathname === "/workspace/ws_1/sessions/ses_1/snapshot") {
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { item: { session: { id: "ses_1" }, messages: [{ id: "msg_1" }], todos: [], statuses: [] } });
  }
  if (req.method === "DELETE" && url.pathname === "/workspace/ws_1/sessions/ses_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && url.pathname === "/workspace/ws_1/files/sessions") {
    assert.equal(body.write, false);
    return json(res, 200, { session: { id: "fs_1", workspaceId: "ws_1", canWrite: false } });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/snapshot") {
    return json(res, 200, { items: [{ path: "README.md", kind: "file", bytes: 12 }], total: 1 });
  }
  if (req.method === "GET" && url.pathname === "/files/sessions/fs_1/catalog/events") {
    if (url.searchParams.has("since")) {
      assert.equal(url.searchParams.get("since"), "4");
    }
    return json(res, 200, {
      cursor: 5,
      events: [{ cursor: 5, type: "changed", path: "README.md" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_1/read-batch") {
    assert.deepEqual(body.paths, ["README.md"]);
    return json(res, 200, {
      items: [{
        ok: true,
        path: "README.md",
        bytes: 12,
        contentBase64: Buffer.from("hello world\n", "utf8").toString("base64"),
      }],
    });
  }
  if (req.method === "POST" && url.pathname === "/files/sessions/fs_write/write-batch") {
    assert.equal(body.writes[0].contentBase64, Buffer.from("updated", "utf8").toString("base64"));
    return json(res, 200, { items: [{ ok: true, path: "README.md" }], cursor: 2 });
  }
  if (req.method === "DELETE" && url.pathname === "/files/sessions/fs_1") {
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/approvals") {
    return json(res, 200, { items: [{ id: "ap_1", action: "workspace.files.session.ops" }] });
  }
  if (req.method === "POST" && url.pathname === "/approvals/ap_1") {
    assert.equal(body.reply, "allow");
    return json(res, 200, { ok: true, allowed: true });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/markets") {
    assert.equal(url.searchParams.get("limit"), "2");
    return json(res, 200, {
      success: true,
      markets: [{ asset: "BTC", markPx: 65000, source: { source: "hyperliquid.info", freshness: "live" } }],
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/0x0000000000000000000000000000000000000001") {
    return json(res, 200, {
      success: true,
      account: { address: "0x0000000000000000000000000000000000000001", positionCount: 1, openOrderCount: 1, warnings: [] },
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/0x0000000000000000000000000000000000000001/positions") {
    return json(res, 200, {
      success: true,
      positions: [{ asset: "BTC", side: "long", size: 0.1, positionValue: 6500 }],
      notionalExposure: 6500,
      unrealizedPnl: 100,
      warnings: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/account/0x0000000000000000000000000000000000000001/open-orders") {
    return json(res, 200, {
      success: true,
      orders: [{ asset: "BTC", side: "buy", size: 0.05, limitPx: 63000 }],
      warnings: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/funding/BTC") {
    return json(res, 200, {
      success: true,
      funding: { asset: "BTC", fundingRate: 0.0001, openInterest: 1234, markPx: 65000, warnings: [] },
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/orderbook/BTC") {
    return json(res, 200, {
      success: true,
      orderbook: { asset: "BTC", bids: [{ price: 64999, size: 1 }], asks: [{ price: 65001, size: 1 }], warnings: [] },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/watches") {
    assert.equal(body.asset, "BTC");
    assert.equal(body.kind, "funding_rate");
    return json(res, 200, {
      success: true,
      watch: { version: "matterhorn.hyperliquid.watch.v1", id: "hl-watch-mcp", kind: "funding_rate", asset: "BTC" },
      cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid watch" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/watches/check") {
    const watch = body.watch ?? { id: "hl-watch-mcp", asset: "BTC" };
    const isAlert = watch.id === "hl-watch-alert";
    return json(res, 200, {
      success: true,
      checks: [{
        watch,
        watchId: watch.id,
        status: isAlert ? "triggered" : "ok",
        alerts: isAlert ? ["BTC funding moved past the configured threshold."] : [],
        source: { source: "mock.hyperliquid", freshness: "live" },
        cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid watch alert" }],
      }],
      cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid watch alert" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/watches/act") {
    assert.equal(body.watch.id, "hl-watch-alert");
    assert.equal(body.watch.asset, "BTC");
    assert.equal("message" in body, false);
    assert.equal("prompt" in body, false);
    assert.equal("apiSecret" in body, false);
    assert.equal("privateKey" in body, false);
    assert.equal("signedPayload" in body, false);
    return json(res, 200, {
      success: true,
      selectedAlert: {
        venue: "hyperliquid",
        status: "triggered",
        watchId: "hl-watch-alert",
        asset: "BTC",
        kind: "funding_rate",
        alerts: ["BTC funding moved past the configured threshold."],
      },
      action: {
        label: "Review alert with crypto chat",
        prompt: "Use unified crypto chat. Review this read-only Hyperliquid watch alert. Do not sign, submit, broadcast, auto-execute.",
      },
      chat: {
        success: true,
        venue: "hyperliquid",
        execution: "read_only",
        responseText: "Hyperliquid watch alert review ready.",
        cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid alert review" }],
        warnings: [],
      },
      safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
      source: "matterhorn_hyperliquid_watch_act",
    });
  }
  if (req.method === "GET" && url.pathname === "/api/hyperliquid/watches/digest") {
    return json(res, 200, {
      success: true,
      digest: {
        version: "matterhorn.hyperliquid.watch-digest.v1",
        total: 1,
        alertCount: 0,
        cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid digest" }],
      },
      cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid digest" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/preview") {
    assert.equal(body.asset, "BTC");
    assert.equal(body.side, "buy");
    assert.equal(body.size, 0.1);
    assert.equal("apiSecret" in body, false);
    return json(res, 200, {
      success: true,
      preview: { venue: "hyperliquid", asset: "BTC", side: "buy", size: 0.1, canSubmit: false, previewSha256: "a".repeat(64) },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/external-sign-request") {
    assert.equal(body.executionMode, "testnet_external_signer");
    assert.equal(body.asset, "BTC");
    assert.equal(body.side, "buy");
    assert.equal(body.size, 0.1);
    assert.equal("apiSecret" in body, false);
    assert.equal("privateKey" in body, false);
    assert.equal("signedPayload" in body, false);
    return json(res, 200, {
      success: true,
      signRequest: {
        version: "matterhorn.market.external-sign-request.v1",
        venue: "hyperliquid",
        routeName: "hyperliquid.orders.sign_request",
        executionMode: "testnet_external_signer",
        network: "testnet",
        action: "place_order",
        signRequestSha256: "1".repeat(64),
        previewSha256: "2".repeat(64),
        handoffSha256: "3".repeat(64),
        unsignedPayloadSha256: "4".repeat(64),
        canSubmit: false,
        liveSubmissionEnabled: false,
        signedArtifactAccepted: false,
        submitSignedAllowedByContract: false,
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/orders/external-sign-request") {
    assert.equal(body.executionMode, "testnet_external_signer");
    assert.equal(body.marketId, "0xmarket-ai");
    assert.equal(body.side, "yes");
    assert.equal(body.amountUsdc, 10);
    assert.equal("apiSecret" in body, false);
    assert.equal("privateKey" in body, false);
    assert.equal("signedPayload" in body, false);
    return json(res, 200, {
      success: true,
      signRequest: {
        version: "matterhorn.market.external-sign-request.v1",
        venue: "polymarket",
        routeName: "polymarket.orders.sign_request",
        executionMode: "testnet_external_signer",
        network: "amoy",
        action: "place_order",
        signRequestSha256: "5".repeat(64),
        previewSha256: "6".repeat(64),
        handoffSha256: "7".repeat(64),
        unsignedPayloadSha256: "8".repeat(64),
        canSubmit: false,
        liveSubmissionEnabled: false,
        signedArtifactAccepted: false,
        submitSignedAllowedByContract: false,
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/watches") {
    assert.equal(body.marketId, "0xmarket-ai");
    return json(res, 200, {
      success: true,
      watch: { version: "matterhorn.polymarket.watch.v1", id: "pm-watch-mcp", marketId: "0xmarket-ai" },
      cards: [{ kind: "polymarket_watch", title: "Polymarket watch" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/watches/check") {
    const watch = body.watch ?? { id: "pm-watch-mcp", marketId: "0xmarket-ai" };
    const isAlert = watch.id === "pm-watch-alert";
    return json(res, 200, {
      success: true,
      checks: [{
        watch,
        watchId: watch.id,
        marketId: watch.marketId,
        status: isAlert ? "triggered" : "ok",
        alerts: isAlert ? ["Market liquidity moved past the configured threshold."] : [],
        source: { source: "mock.polymarket", freshness: "live" },
        cards: [{ kind: "polymarket_watch", title: "Polymarket watch alert" }],
      }],
      cards: [{ kind: "polymarket_watch", title: "Polymarket watch alert" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/watches/act") {
    assert.equal(body.watch.id, "pm-watch-alert");
    assert.equal(body.watch.marketId, "0xmarket-ai");
    assert.equal("message" in body, false);
    assert.equal("prompt" in body, false);
    assert.equal("apiSecret" in body, false);
    assert.equal("privateKey" in body, false);
    assert.equal("signedPayload" in body, false);
    return json(res, 200, {
      success: true,
      selectedAlert: {
        venue: "polymarket",
        status: "triggered",
        watchId: "pm-watch-alert",
        marketId: "0xmarket-ai",
        alerts: ["Market liquidity moved past the configured threshold."],
      },
      action: {
        label: "Review alert with crypto chat",
        prompt: "Use unified crypto chat. Review this read-only Polymarket watch alert. Do not sign, submit, broadcast, auto-execute.",
      },
      chat: {
        success: true,
        venue: "polymarket",
        execution: "read_only",
        responseText: "Polymarket watch alert review ready.",
        cards: [{ kind: "polymarket_watch", title: "Polymarket alert review" }],
        warnings: [],
      },
      safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
      source: "matterhorn_polymarket_watch_act",
    });
  }
  if (req.method === "GET" && url.pathname === "/api/polymarket/watches/digest") {
    return json(res, 200, {
      success: true,
      digest: {
        version: "matterhorn.polymarket.watch-digest.v1",
        total: 1,
        alertCount: 0,
        cards: [{ kind: "polymarket_watch", title: "Polymarket digest" }],
      },
      cards: [{ kind: "polymarket_watch", title: "Polymarket digest" }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/orders/external-artifact/validate") {
    assert.equal(body.signRequest.venue, "hyperliquid");
    assert.equal(body.artifact.venue, "hyperliquid");
    assert.equal(body.artifact.signedArtifactRedacted, true);
    assert.equal(body.artifact.canSubmit, false);
    assert.equal("apiSecret" in body.artifact, false);
    assert.equal("privateKey" in body.artifact, false);
    assert.equal("signedPayload" in body.artifact, false);
    return json(res, 200, {
      success: true,
      validation: {
        version: "matterhorn.market.artifact-validation.v1",
        venue: "hyperliquid",
        status: "accepted_public_metadata",
        validationMode: "public_redacted_metadata",
        matchesSignRequest: true,
        signRequestSha256: body.signRequest.signRequestSha256,
        signedArtifactPublicHash: body.artifact.signedArtifactPublicHash,
        signedArtifactRedacted: true,
        redactedMetadataAccepted: true,
        canSubmit: false,
        liveSubmissionEnabled: false,
        signedArtifactAccepted: false,
        submitSignedAllowedByContract: false,
        publicAuditReceiptCandidate: {
          version: "matterhorn.market.receipt.v1",
          venue: "hyperliquid",
          status: "received",
          action: body.signRequest.action,
          previewSha256: body.signRequest.previewSha256,
          handoffSha256: body.signRequest.handoffSha256,
          warnings: ["Public audit receipt candidate only. It is not exchange submission evidence."],
        },
        errors: [],
        warnings: [],
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/orders/external-artifact/validate") {
    assert.equal(body.signRequest.venue, "polymarket");
    assert.equal(body.artifact.venue, "polymarket");
    assert.equal(body.artifact.signedArtifactRedacted, true);
    assert.equal(body.artifact.canSubmit, false);
    assert.equal("apiSecret" in body.artifact, false);
    assert.equal("privateKey" in body.artifact, false);
    assert.equal("signedPayload" in body.artifact, false);
    return json(res, 200, {
      success: true,
      validation: {
        version: "matterhorn.market.artifact-validation.v1",
        venue: "polymarket",
        status: "accepted_public_metadata",
        validationMode: "public_redacted_metadata",
        matchesSignRequest: true,
        signRequestSha256: body.signRequest.signRequestSha256,
        signedArtifactPublicHash: body.artifact.signedArtifactPublicHash,
        signedArtifactRedacted: true,
        redactedMetadataAccepted: true,
        canSubmit: false,
        liveSubmissionEnabled: false,
        signedArtifactAccepted: false,
        submitSignedAllowedByContract: false,
        publicAuditReceiptCandidate: {
          version: "matterhorn.market.receipt.v1",
          venue: "polymarket",
          status: "received",
          action: body.signRequest.action,
          previewSha256: body.signRequest.previewSha256,
          handoffSha256: body.signRequest.handoffSha256,
          warnings: ["Public audit receipt candidate only. It is not exchange submission evidence."],
        },
        errors: [],
        warnings: [],
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/hyperliquid/chat/execute") {
    if (typeof body.message === "string" && body.message.startsWith("Use unified crypto chat. Review this read-only Hyperliquid watch alert")) {
      assert.equal(body.asset, "BTC");
      assert.equal("apiSecret" in body, false);
      assert.equal("privateKey" in body, false);
      assert.equal("signedPayload" in body, false);
      return json(res, 200, {
        success: true,
        venue: "hyperliquid",
        execution: "read_only",
        responseText: "Hyperliquid watch alert review ready.",
        cards: [{ kind: "hyperliquid_watch", title: "Hyperliquid alert review" }],
        warnings: [],
      });
    }
    assert.equal(body.message, "preview buying 0.1 BTC at 65000");
    assert.equal("apiSecret" in body, false);
    return json(res, 200, {
      success: true,
      venue: "hyperliquid",
      execution: "unsigned_preview",
      responseText: "Hyperliquid preview ready.",
      preview: { venue: "hyperliquid", canSubmit: false, previewSha256: "b".repeat(64) },
      cards: [],
      warnings: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/polymarket/chat/execute") {
    if (typeof body.message === "string" && body.message.startsWith("Use unified crypto chat. Review this read-only Polymarket watch alert")) {
      assert.equal(body.marketId, "0xmarket-ai");
      assert.equal("apiSecret" in body, false);
      assert.equal("privateKey" in body, false);
      assert.equal("signedPayload" in body, false);
      return json(res, 200, {
        success: true,
        venue: "polymarket",
        execution: "read_only",
        responseText: "Polymarket watch alert review ready.",
        cards: [{ kind: "polymarket_watch", title: "Polymarket alert review" }],
        warnings: [],
      });
    }
  }
  if (req.method === "POST" && url.pathname === "/api/crypto/chat/execute") {
    assert.equal("apiSecret" in body, false);
    assert.equal(body.venue, "auto");
    if (body.message === "Can Matterhorn submit Hyperliquid and Polymarket orders yet?") {
      return json(res, 200, {
        success: true,
        venue: "auto",
        intent: "market_execution_readiness",
        execution: "read_only",
        responseText: "Can submit: No. Live submission: Off.",
        cards: [{ kind: "market_execution_readiness", title: "Market execution readiness" }],
        sharedCards: [{
          version: "matterhorn.crypto.shared-card.v1",
          kind: "readiness_report",
          venue: "auto",
          title: "Market execution readiness",
          summary: "Cross-venue execution readiness for Hyperliquid and Polymarket. This is a readiness contract, not execution permission.",
          status: "warning",
          originalKind: "market_execution_readiness",
          source: { source: "matterhorn.execution-readiness", freshness: "live" },
          warnings: ["Live submission is disabled."],
          data: {
            kind: "market_execution_readiness",
            report: {
              readyForLiveSubmission: false,
              safety: { canSubmit: false, liveSubmissionEnabled: false, signsOrSubmits: false },
            },
          },
          safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
        }],
        warnings: ["Live submission is disabled."],
      });
    }
    assert.equal(body.message, "show BTC Hyperliquid funding");
    return json(res, 200, {
      success: true,
      venue: "hyperliquid",
      intent: "market_context",
      execution: "read_only",
      responseText: "Hyperliquid funding context ready.",
      cards: [],
      sharedCards: [{
        version: "matterhorn.crypto.shared-card.v1",
        kind: "market_context",
        venue: "hyperliquid",
        title: "BTC funding",
        summary: "Read-only funding context.",
        status: "success",
        originalKind: "hyperliquid_funding",
        source: { source: "mock.hyperliquid" },
        warnings: [],
        data: { kind: "hyperliquid_funding", title: "BTC funding" },
        safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
      }],
      warnings: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/crypto/readiness") {
    return json(res, 200, {
      success: true,
      ready: true,
      status: "ready",
      report: {
        ready: true,
        checks: [
          { id: "bittensor.readiness", label: "Bittensor readiness", status: "pass" },
          { id: "hyperliquid.read_preview", label: "Hyperliquid read/preview", status: "pass" },
          { id: "polymarket.read_preview", label: "Polymarket read/preview", status: "pass" },
        ],
        safety: { nonCustodial: true, liveSubmissionEnabled: false, canSubmit: false },
      },
    });
  }
  const memoryRecord = {
    id: "mem_1",
    kind: "protocol_address",
    scope: "workspace",
    title: "Public TAO wallet",
    summary: "Public SS58 address used for Bittensor wallet reads.",
    body: { ss58Address: "5FLSigC9H8Qgje3jK5oz3t4tfY6WjA3ff4FJNqFoU4tQbUjP" },
    tags: ["bittensor", "wallet"],
    links: [],
    provenance: {
      source: "user_confirmed",
      capturedAt: "2026-06-22T00:00:00.000Z",
      capturedBy: "user",
      confidence: 1,
      reasonRemembered: "User asked Matterhorn to remember this public address.",
    },
    sensitivity: "public",
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    canUseInChat: true,
    canExport: true,
    canDelete: true,
  };
  if (req.method === "GET" && url.pathname === "/api/memory/search") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(url.searchParams.get("q"), "tao");
    assert.equal(url.searchParams.get("scope"), "workspace");
    assert.equal(url.searchParams.get("tags"), "bittensor,wallet");
    return json(res, 200, { success: true, records: [memoryRecord], count: 1 });
  }
  if (req.method === "GET" && url.pathname === "/api/memory/entities") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(url.searchParams.get("kind"), "protocol_address");
    assert.equal(url.searchParams.get("limit"), "5");
    return json(res, 200, { success: true, records: [memoryRecord], count: 1 });
  }
  if (req.method === "GET" && url.pathname === "/api/memory/entities/mem_1") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    return json(res, 200, { success: true, record: memoryRecord });
  }
  if (req.method === "POST" && url.pathname === "/api/memory/capture") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(body.record.id, "mem_2");
    return json(res, 200, { success: true, record: body.record, redactions: [] });
  }
  if (req.method === "PATCH" && url.pathname === "/api/memory/entities/mem_1") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(body.patch.summary, "Updated public wallet summary.");
    return json(res, 200, { success: true, record: { ...memoryRecord, ...body.patch } });
  }
  if (req.method === "POST" && url.pathname === "/api/memory/forget") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(body.id, "mem_1");
    assert.equal(body.reason, "No longer needed.");
    return json(res, 200, { success: true, id: "mem_1", forgotten: true });
  }
  if (req.method === "POST" && url.pathname === "/api/memory/export") {
    assert.equal(url.searchParams.get("surface"), "mcp");
    assert.equal(body.outputDir, "/tmp/matterhorn-memory-export");
    return json(res, 200, {
      success: true,
      export: {
        outputDir: "/tmp/matterhorn-memory-export",
        files: ["matterhorn-memory-export.json", "matterhorn-memory-export.sha256"],
      },
    });
  }
  if (req.method === "GET" && url.pathname === "/api/services/capabilities") {
    assert.equal(url.searchParams.get("capability"), "storage");
    return json(res, 200, {
      success: true,
      version: "matterhorn.services.capability-catalog.v1",
      status: "future_contract",
      source: "mock.services",
      safety: {
        custody: "none",
        liveExecutionEnabled: false,
        acceptsPrivateKeys: false,
        acceptsApiSecrets: false,
        acceptsRawSignatures: false,
        acceptsSecrets: false,
        canExecute: false,
      },
      capabilities: [{
        capability: "storage",
        label: "Storage",
        version: "matterhorn.services.provider-manifest.v1",
        status: "future_contract",
        liveExecutionEnabled: false,
        canExecute: false,
        discoveryFixtures: [{
          version: "matterhorn.services.discovery-fixture.v1",
          capability: "storage",
          providerId: "example-storage-ipfs",
          status: "future_contract",
          liveExecutionEnabled: false,
          canExecute: false,
        }],
      }],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/workflows/catalog") {
    assert.equal(url.searchParams.get("workflow"), "wellness_creator_workflow");
    assert.equal(url.searchParams.get("includePrompts"), "true");
    return json(res, 200, {
      ok: true,
      version: "matterhorn.workflow.catalog.v1",
      status: "catalog_only",
      source: "mock.workflows",
      safety: {
        catalogOnly: true,
        noProviderExecution: true,
        noCustody: true,
        noLiveMarketSubmit: true,
        acceptsSecrets: false,
        acceptsPrivateKeys: false,
        acceptsApiSecrets: false,
        acceptsRawSignatures: false,
        canSubmit: false,
        liveExecutionEnabled: false,
      },
      workflows: [{
        workflowId: "wellness_creator_workflow",
        category: "wellness",
        status: "live_local",
        canExecuteProviderActions: false,
        canonicalPrompts: ["Start a new longevity program", "Design the program"],
        safety: {
          acceptsSecrets: false,
          canSubmit: false,
          liveExecutionEnabled: false,
        },
      }],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/workflows/prompts") {
    assert.equal(url.searchParams.get("workflow"), "wellness_creator_workflow");
    return json(res, 200, {
      ok: true,
      version: "matterhorn.workflow.prompt-pack.v1",
      status: "catalog_only",
      source: "mock.workflows",
      safety: {
        promptPackOnly: true,
        noProviderExecution: true,
        noCustody: true,
        noLiveMarketSubmit: true,
        acceptsSecrets: false,
        acceptsPrivateKeys: false,
        acceptsApiSecrets: false,
        acceptsRawSignatures: false,
        canSubmit: false,
        liveExecutionEnabled: false,
      },
      counts: { total: 1, promptTotal: 2 },
      workflows: [{
        workflowId: "wellness_creator_workflow",
        category: "wellness",
        status: "live_local",
        starterPrompt: "Start a new longevity program",
        prompts: [
          { step: 1, prompt: "Start a new longevity program" },
          { step: 2, prompt: "Design the program with safety disclaimers" },
        ],
        safety: {
          promptPackOnly: true,
          noProviderExecution: true,
          acceptsSecrets: false,
          canSubmit: false,
          liveExecutionEnabled: false,
        },
      }],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/workflows/templates") {
    assert.equal(url.searchParams.get("customerTemplate"), "bittensor_operator");
    return json(res, 200, {
      ok: true,
      version: "matterhorn.customer.workflow.template.v1",
      status: "catalog_only",
      source: "mock.customer-templates",
      safety: {
        catalogOnly: true,
        noProviderExecution: true,
        noCustody: true,
        noLiveMarketSubmit: true,
        acceptsSecrets: false,
        acceptsPrivateKeys: false,
        acceptsApiSecrets: false,
        acceptsRawSignatures: false,
        canSubmit: false,
        liveExecutionEnabled: false,
      },
      counts: { total: 1, byCategory: { bittensor: 1 }, byStatus: { beta_ready: 1 } },
      customerTemplates: [{
        id: "bittensor_operator",
        name: "Use Bittensor",
        category: "bittensor",
        status: "beta_ready",
        examplePrompts: ["Show my TAO"],
        launch: {
          primaryCta: "Open Bittensor panel",
          secondaryCta: "Preview a stake handoff",
          defaultPrompt: "Show my TAO",
          handoffContextLabel: "Public wallet address",
          recommendedSurface: "protocol_desk",
        },
        ui: {
          iconHint: "bittensor",
          accent: "matterhorn_blue",
          shortDescription: "Read TAO balances and prepare external-signer staking handoffs.",
        },
        routing: {
          chatMode: "bittensor",
          opensPanel: "bittensor",
          startsSession: true,
        },
        safetyBoundaries: {
          acceptsSecrets: false,
          acceptsPrivateKeys: false,
          acceptsApiSecrets: false,
          acceptsRawSignatures: false,
          canSubmit: false,
          liveExecutionEnabled: false,
          canExecute: true,
          requiresExternalSigner: true,
          allowsRealFunds: false,
        },
      }],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/services/chat/plan") {
    assert.match(body.message, /paid fitness program/i);
    assert.equal(body.capability, "payments");
    return json(res, 200, {
      success: true,
      version: "matterhorn.services.chat-plan.v1",
      status: "future_contract",
      execution: "planned_not_live",
      message: body.message,
      responseText: "Matterhorn can plan this Payments workflow, but live service execution is not enabled yet.",
      matchedCapabilities: ["payments"],
      requiresClarification: false,
      clarificationQuestion: null,
      safety: {
        custody: "none",
        liveExecutionEnabled: false,
        acceptsPrivateKeys: false,
        acceptsApiSecrets: false,
        acceptsRawSignatures: false,
        acceptsSecrets: false,
        canExecute: false,
      },
      cards: [{
        kind: "service_plan",
        version: "matterhorn.services.card.v1",
        title: "Payments plan",
        capability: "payments",
        status: "future_contract",
        summary: "No real provider is wired up yet.",
        providerExamples: ["Stripe"],
        outputArtifacts: ["checkout_preview"],
        supportedUserIntents: ["Create a paid creator program"],
        safety: { canExecute: false, liveExecutionEnabled: false, acceptsSecrets: false, plannedNotLive: true },
      }],
      warnings: ["Services are future-contract only in this build."],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/crypto/market-execution-readiness") {
    return json(res, 200, {
      success: true,
      report: {
        version: "matterhorn.market.execution-readiness.v1",
        readyForLiveSubmission: false,
        status: "disabled",
        venues: [{ venue: "hyperliquid" }, { venue: "polymarket" }],
        safety: {
          nonCustodial: true,
          liveSubmissionEnabled: false,
          canSubmit: false,
          signsOrSubmits: false,
          acceptsSecrets: false,
        },
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/api/bittensor/chat/execute") {
    if (body.message === "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.") {
      assert.equal(body.netuid, 14);
      assert.equal(body.validatorHotkey, "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX");
      assert.equal("ss58Address" in body, false);
      return json(res, 200, {
        success: true,
        execution: "answered",
        responseText: "Validator alert analysis ready.",
        cards: [],
        warnings: [],
      });
    }
    assert.equal(body.message, "show my TAO");
    return json(res, 200, { success: true, execution: "clarification_required", clarificationQuestion: "What SS58 address should I use?" });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/readiness") {
    return json(res, 200, { success: true, ready: true });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities") {
    return json(res, 200, {
      success: true,
      capabilities: [{
        netuid: 14,
        name: "Mock Subnet",
        capabilityLevel: "adapter_required",
        supportedChatIntents: ["learn", "discover", "wallet", "stake_plan", "monitor", "subnet_use"],
        serviceAdapter: "inference",
        adapterStatus: { configured: false, message: "Adapter not configured." },
      }],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/capabilities/14") {
    return json(res, 200, {
      success: true,
      capability: {
        netuid: 14,
        name: "Mock Subnet",
        capabilityLevel: "adapter_required",
        serviceAdapter: "inference",
        adapterStatus: { configured: false, message: "Adapter not configured." },
      },
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/prepare") {
    assert.equal(body.action, "stake");
    assert.equal(body.netuid, 14);
    return json(res, 200, {
      success: true,
      preview: { action: "stake", netuid: 14, requiresExternalSignature: true },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/handoff") {
    assert.equal(body.preview.action, "stake");
    return json(res, 200, {
      success: true,
      handoff: { payloadSha256: "e".repeat(64), expiresAt: "2026-06-12T20:00:00.000Z" },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/receipt") {
    assert.equal(body.preview.action, "stake");
    assert.equal(body.signatureSha256, "c".repeat(64));
    assert.equal("signature" in body, false);
    assert.equal("signedPayload" in body, false);
    return json(res, 200, {
      success: true,
      receipt: {
        status: "signed_payload_received",
        action: "stake",
        netuid: 14,
        payloadSha256: body.handoff?.payloadSha256 ?? "e".repeat(64),
        signatureSha256: body.signatureSha256,
        signerAddress: body.signerAddress ?? null,
      },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/extrinsics/submit") {
    assert.equal(body.preview.action, "stake");
    assert.equal(body.signature, "0x1234567890abcdef");
    return json(res, 200, {
      success: true,
      result: { status: "sidecar_unavailable", txHash: null },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/preview") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet task");
    return json(res, 200, {
      success: true,
      preview: {
        netuid: 14,
        intent: "service_call",
        requestSha256: "d".repeat(64),
        requiresConfirmation: true,
      },
      cards: [],
    });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/subnets/14/invoke") {
    assert.equal(body.intent, "service_call");
    assert.equal(body.task, "mock subnet task");
    assert.equal(body.previewRequestSha256, "d".repeat(64));
    return json(res, 200, {
      success: true,
      invocation: { netuid: 14, intent: "service_call", supported: false },
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    return json(res, 200, { success: true, watches: [], cards: [] });
  }
  if (req.method === "POST" && url.pathname === "/api/bittensor/monitoring/watchlist") {
    assert.equal(body.kind, "slippage");
    assert.equal(body.netuid, 14);
    assert.equal(body.threshold, 0.4);
    return json(res, 200, {
      success: true,
      watch: { id: "bt-watch-mcp", kind: "slippage", netuid: 14, threshold: 0.4 },
      watches: [],
      cards: [],
    });
  }
  if (req.method === "GET" && url.pathname === "/api/bittensor/monitoring/check") {
    return json(res, 200, {
      success: true,
      evaluations: [
        { watch: { id: "bt-watch-mcp", kind: "slippage", netuid: 14 }, status: "ok" },
        {
          watch: { id: "bt-watch-alert", kind: "validator", netuid: 14, validatorHotkey: "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX", label: "Validator drift" },
          status: "alert",
          alertKey: "validator:14:bt-watch-alert",
          notificationIntent: "review_validator",
          copilotActions: [{ label: "Analyze validator", prompt: "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14." }],
        },
      ],
      cards: [],
    });
  }

  return json(res, 404, { error: "not_found", path: url.pathname });
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function createMcp(
  baseUrl,
  { profile = "full", includeHostToken = true, omitProfile = false } = {},
) {
  const child = spawn("node", [MCP_ENTRYPOINT], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_SERVER_URL: baseUrl,
      MATTERHORN_WORK_TOKEN: CLIENT_TOKEN,
      ...(includeHostToken
        ? { MATTERHORN_WORK_HOST_TOKEN: HOST_TOKEN }
        : { MATTERHORN_WORK_HOST_TOKEN: "" }),
      ...(omitProfile ? {} : { MATTERHORN_WORK_MCP_PROFILE: profile }),
    },
  });

  let nextId = 1;
  let buffer = "";
  const pending = new Map();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const entry = pending.get(message.id);
      if (entry) {
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
  });

  function ask(method, params) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) };
    const promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 45_000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timeout);
          resolve(message);
        },
      });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  return { child, ask };
}

function parseToolResult(response) {
  assert.ok(!response.error, response.error?.message);
  return JSON.parse(response.result.content[0].text);
}

const port = await listen(server);
const mcp = createMcp(`http://127.0.0.1:${port}`);

try {
  const init = await mcp.ask("initialize");
  assert.equal(init.result.serverInfo.name, "matterhorn-work-mcp");

  const listed = await mcp.ask("tools/list");
  const toolNames = listed.result.tools.map((tool) => tool.name);
  for (const expected of [
    "matterhorn_doctor",
    "matterhorn_status",
    "matterhorn_upstream_source_check",
    "matterhorn_list_workspaces",
    "matterhorn_create_session",
    "matterhorn_list_sessions",
    "matterhorn_get_session",
    "matterhorn_get_session_messages",
    "matterhorn_get_session_status",
    "matterhorn_watch_session_events",
    "matterhorn_submit_session_prompt",
    "matterhorn_get_session_snapshot",
    "matterhorn_delete_session",
    "matterhorn_create_file_session",
    "matterhorn_read_files",
    "matterhorn_write_files",
    "matterhorn_watch_file_events",
    "matterhorn_list_approvals",
    "matterhorn_crypto_chat",
    "matterhorn_crypto_readiness",
    "matterhorn_memory_search",
    "matterhorn_memory_list",
    "matterhorn_memory_get",
    "matterhorn_memory_capture",
    "matterhorn_memory_update",
    "matterhorn_memory_forget",
    "matterhorn_memory_export",
    "matterhorn_services_get_capabilities",
    "matterhorn_services_chat_plan",
    "matterhorn_workflows_catalog",
    "matterhorn_workflows_prompt_pack",
    "matterhorn_workflows_customer_templates",
    "matterhorn_crypto_live_public_qa",
    "matterhorn_market_execution_readiness",
    "matterhorn_market_execution_chain",
    "matterhorn_market_sdk_validation",
    "matterhorn_market_artifact_reconcile",
    "matterhorn_hyperliquid_chat",
    "matterhorn_hyperliquid_list_markets",
    "matterhorn_hyperliquid_get_account",
    "matterhorn_hyperliquid_get_positions",
    "matterhorn_hyperliquid_get_open_orders",
    "matterhorn_hyperliquid_get_funding",
    "matterhorn_hyperliquid_get_orderbook",
    "matterhorn_hyperliquid_create_watch",
    "matterhorn_hyperliquid_check_watches",
    "matterhorn_hyperliquid_watch_digest",
    "matterhorn_hyperliquid_act_on_watch_alert",
    "matterhorn_hyperliquid_preview_order",
    "matterhorn_hyperliquid_create_sign_request",
    "matterhorn_hyperliquid_validate_external_artifact",
    "matterhorn_polymarket_create_sign_request",
    "matterhorn_polymarket_validate_external_artifact",
    "matterhorn_polymarket_create_watch",
    "matterhorn_polymarket_check_watches",
    "matterhorn_polymarket_watch_digest",
    "matterhorn_polymarket_act_on_watch_alert",
    "matterhorn_bittensor_chat",
    "matterhorn_bittensor_list_capabilities",
    "matterhorn_bittensor_get_subnet_capability",
    "matterhorn_bittensor_adapter_canary_gate",
    "matterhorn_bittensor_prepare_extrinsic",
    "matterhorn_bittensor_create_signing_handoff",
    "matterhorn_bittensor_import_receipt",
    "matterhorn_bittensor_check_receipt",
    "matterhorn_bittensor_check_signing_handoff",
    "matterhorn_bittensor_preview_subnet_invocation",
    "matterhorn_bittensor_invoke_subnet",
    "matterhorn_bittensor_create_watch",
    "matterhorn_bittensor_list_watches",
    "matterhorn_bittensor_check_watches",
    "matterhorn_bittensor_watch_digest",
    "matterhorn_bittensor_act_on_watch_alert",
  ]) {
    assert.ok(toolNames.includes(expected), `missing ${expected}`);
  }

  const schemaText = JSON.stringify(listed.result.tools);
  assert.equal(/seed|mnemonic|privateKey|private_key|wallet export/i.test(schemaText), false);

  const invalidProfile = spawn("node", [MCP_ENTRYPOINT], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      MATTERHORN_WORK_MCP_PROFILE: "unsupported_profile",
    },
  });
  let invalidProfileError = "";
  invalidProfile.stderr.setEncoding("utf8");
  invalidProfile.stderr.on("data", (chunk) => {
    invalidProfileError += chunk;
  });
  const invalidProfileExitCode = await new Promise((resolve) => {
    invalidProfile.once("exit", resolve);
  });
  assert.equal(invalidProfileExitCode, 64);
  assert.equal(
    invalidProfileError,
    "Matterhorn MCP profile is not supported.\n",
  );

  const defaultMcp = createMcp(`http://127.0.0.1:${port}`, {
    includeHostToken: false,
    omitProfile: true,
  });
  try {
    await defaultMcp.ask("initialize");
    const defaultList = await defaultMcp.ask("tools/list");
    assert.deepEqual(
      defaultList.result.tools.map((tool) => tool.name),
      [
        "matterhorn_status",
        "matterhorn_list_workspaces",
        "matterhorn_create_session",
        "matterhorn_list_sessions",
        "matterhorn_get_session",
        "matterhorn_get_session_messages",
        "matterhorn_submit_session_prompt",
        "matterhorn_get_session_status",
        "matterhorn_watch_session_events",
        "matterhorn_get_session_snapshot",
        "matterhorn_delete_session",
      ],
      "an omitted profile must fail safe to the guarded client tool set",
    );
    const requestsBeforeDefaultHiddenCall = requests.length;
    const defaultHiddenCall = await defaultMcp.ask("tools/call", {
      name: "matterhorn_reply_approval",
      arguments: { approvalId: "approval-hidden-default", reply: "allow" },
    });
    assert.equal(defaultHiddenCall.error?.code, -32601);
    assert.equal(requests.length, requestsBeforeDefaultHiddenCall);
  } finally {
    defaultMcp.child.kill();
  }

  const guardedMcp = createMcp(`http://127.0.0.1:${port}`, {
    profile: "guarded_client",
    includeHostToken: false,
  });
  try {
    await guardedMcp.ask("initialize");
    const guardedList = await guardedMcp.ask("tools/list");
    assert.deepEqual(guardedList.result.tools.map((tool) => tool.name), [
      "matterhorn_status",
      "matterhorn_list_workspaces",
      "matterhorn_create_session",
      "matterhorn_list_sessions",
      "matterhorn_get_session",
      "matterhorn_get_session_messages",
      "matterhorn_submit_session_prompt",
      "matterhorn_get_session_status",
      "matterhorn_watch_session_events",
      "matterhorn_get_session_snapshot",
      "matterhorn_delete_session",
    ]);
    assert.ok(
      JSON.stringify(guardedList.result.tools).length < schemaText.length * 0.2,
      "guarded client profile should remove at least 80% of model-facing tool schema bytes",
    );
    const requestsBeforeHiddenCall = requests.length;
    const hiddenCall = await guardedMcp.ask("tools/call", {
      name: "matterhorn_reply_approval",
      arguments: { approvalId: "approval-hidden", reply: "allow" },
    });
    assert.equal(hiddenCall.error?.code, -32601);
    assert.equal(
      hiddenCall.error?.message,
      "Tool is not available in the configured Matterhorn MCP profile.",
    );
    assert.equal(requests.length, requestsBeforeHiddenCall);

    const guardedWorkspaces = parseToolResult(await guardedMcp.ask("tools/call", {
      name: "matterhorn_list_workspaces",
      arguments: {},
    }));
    assert.equal(guardedWorkspaces.items[0].id, "ws_1");
  } finally {
    guardedMcp.child.kill();
  }

  const descriptionFor = (name) => listed.result.tools.find((tool) => tool.name === name)?.description || "";
  const cryptoChatTool = listed.result.tools.find((tool) => tool.name === "matterhorn_crypto_chat");
  assert.ok(cryptoChatTool?.inputSchema?.properties?.destination, "crypto chat must accept a public Bittensor destination");
  assert.ok(cryptoChatTool?.inputSchema?.properties?.recipient, "crypto chat must accept a public Bittensor recipient");
  assert.ok(cryptoChatTool?.inputSchema?.properties?.coldkey, "crypto chat must accept a public Bittensor sender");
  assert.ok(cryptoChatTool?.inputSchema?.properties?.reduceOnly, "crypto chat must accept Hyperliquid reduce-only intent");
  assert.match(descriptionFor("matterhorn_crypto_chat"), /Default first Matterhorn Desks tool/i);
  assert.match(descriptionFor("matterhorn_crypto_readiness"), /customer-readiness report/i);
  assert.match(descriptionFor("matterhorn_memory_search"), /explicit Matterhorn Memory records/i);
  assert.match(descriptionFor("matterhorn_memory_capture"), /user has chosen to remember/i);
  assert.match(descriptionFor("matterhorn_memory_forget"), /Forget one explicit Matterhorn Memory record/i);
  assert.match(descriptionFor("matterhorn_services_get_capabilities"), /future decentralized service capability contracts/i);
  assert.match(descriptionFor("matterhorn_services_chat_plan"), /Plan a future decentralized service workflow/i);
  assert.match(descriptionFor("matterhorn_workflows_catalog"), /catalog-only Matterhorn Desks workflow registry/i);
  assert.match(descriptionFor("matterhorn_workflows_prompt_pack"), /copy-pasteable staged prompts/i);
  assert.match(descriptionFor("matterhorn_workflows_customer_templates"), /customer-facing Matterhorn Desks workflow templates/i);
  assert.match(descriptionFor("matterhorn_crypto_live_public_qa"), /live public-data QA pack/i);
  assert.match(descriptionFor("matterhorn_market_execution_readiness"), /execution-readiness contract/i);
  assert.match(descriptionFor("matterhorn_market_execution_chain"), /safe execution-chain command plan/i);
  assert.match(descriptionFor("matterhorn_market_sdk_validation"), /official SDK validation guide/i);
  assert.match(descriptionFor("matterhorn_market_artifact_reconcile"), /public\/redacted/i);
  assert.match(descriptionFor("matterhorn_hyperliquid_watch_digest"), /agent-facing digest/i);
  assert.match(descriptionFor("matterhorn_hyperliquid_act_on_watch_alert"), /deterministic read-only crypto-chat review/i);
  assert.match(descriptionFor("matterhorn_polymarket_watch_digest"), /agent-facing digest/i);
  assert.match(descriptionFor("matterhorn_polymarket_act_on_watch_alert"), /deterministic read-only crypto-chat review/i);
  assert.match(descriptionFor("matterhorn_bittensor_chat"), /Default first Matterhorn Desks tool/i);
  assert.match(descriptionFor("matterhorn_bittensor_list_capabilities"), /before previewing or invoking/i);
  assert.match(descriptionFor("matterhorn_bittensor_get_subnet_capability"), /before previewing or invoking/i);
  assert.match(descriptionFor("matterhorn_bittensor_preview_subnet_invocation"), /First inspect the subnet capability manifest/i);
  assert.match(descriptionFor("matterhorn_bittensor_invoke_subnet"), /capability inspection, preview, explicit confirmation/i);

  const status = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_status", arguments: {} }));
  assert.equal(status.health.ok, true);
  assert.equal(status.status.ok, true);

  const upstream = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_upstream_source_check",
    arguments: { date: "2026-06-12" },
  }));
  assert.equal(upstream.ok, true);
  assert.equal(upstream.safety.mode, "read_only_intake");
  assert.equal(upstream.plan.syncBranch, "codex/sync-runtime-2026-06-12");
  assert.equal(upstream.plan.remoteStatus.status, "not_configured");
  assert.ok(upstream.plan.conflictZones.some((zone) => zone.name === "Bittensor safety"));
  assert.ok(upstream.plan.conflictZones.some((zone) => zone.name === "Agent control surface"));
  assert.ok(upstream.plan.verificationCommands.includes("pnpm test:upstream-source-sync"));
  assert.equal(upstream.plan.nextCommands.length, 0);

  const doctor = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_doctor",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", fileSessionId: "fs_1" },
  }));
  assert.equal(doctor.ready, true);
  assert.equal(doctor.summary.fail, 0);
  assert.ok(doctor.checks.some((check) => check.id === "bittensor.readiness" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "bittensor.capabilities" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "session.events" && check.status === "pass"));
  assert.ok(doctor.checks.some((check) => check.id === "files.events" && check.status === "pass"));

  const workspaces = parseToolResult(await mcp.ask("tools/call", { name: "matterhorn_list_workspaces", arguments: {} }));
  assert.equal(workspaces.items[0].id, "ws_1");

  const createdSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_session",
    arguments: { workspaceId: "ws_1", title: "Agent session" },
  }));
  assert.equal(createdSession.item.id, "ses_created");

  const sessions = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_sessions",
    arguments: { workspaceId: "ws_1", limit: 3, search: "demo" },
  }));
  assert.equal(sessions.items[0].id, "ses_1");

  const sessionItem = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(sessionItem.item.id, "ses_1");

  const sessionMessages = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_messages",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionMessages.items[0].id, "msg_1");

  const sessionStatus = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_status",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(sessionStatus.item.status.type, "busy");
  assert.equal(sessionStatus.item.busy, true);

  const sessionEvents = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_watch_session_events",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", snapshot: true, details: true, maxEvents: 2, since: "7" },
  }));
  assert.equal(sessionEvents.count, 2);
  assert.equal(sessionEvents.lastCursor, "9");
  assert.equal(sessionEvents.events[0].event, "session.snapshot");
  assert.equal(sessionEvents.events[1].data.payload.busy, true);

  const submittedPrompt = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_submit_session_prompt",
    arguments: {
      workspaceId: "ws_1",
      sessionId: "ses_1",
      message: "Summarize this workspace",
      model: { providerID: "openai", modelID: "gpt-4.1" },
      agent: "build",
      noReply: true,
    },
  }));
  assert.equal(submittedPrompt.accepted, true);

  const sessionSnapshot = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_get_session_snapshot",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1", limit: 5 },
  }));
  assert.equal(sessionSnapshot.item.session.id, "ses_1");

  const session = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_create_file_session",
    arguments: { workspaceId: "ws_1", readOnly: true },
  }));
  assert.equal(session.session.id, "fs_1");

  const catalog = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_file_catalog",
    arguments: { sessionId: "fs_1", limit: 10 },
  }));
  assert.equal(catalog.items[0].path, "README.md");

  const fileEvents = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_watch_file_events",
    arguments: { sessionId: "fs_1", since: 4 },
  }));
  assert.equal(fileEvents.cursor, 5);
  assert.equal(fileEvents.events[0].path, "README.md");

  const read = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_read_files",
    arguments: { sessionId: "fs_1", paths: ["README.md"] },
  }));
  assert.equal(read.items[0].content, "hello world\n");
  assert.equal(read.items[0].contentBase64, undefined);

  const write = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_write_files",
    arguments: { sessionId: "fs_write", writes: [{ path: "README.md", content: "updated" }] },
  }));
  assert.equal(write.items[0].ok, true);

  const approvals = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_list_approvals",
    arguments: {},
  }));
  assert.equal(approvals.items[0].id, "ap_1");

  const approvalReply = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_reply_approval",
    arguments: { approvalId: "ap_1", reply: "allow" },
  }));
  assert.equal(approvalReply.allowed, true);

  const hyperliquidMarkets = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_list_markets",
    arguments: { limit: 2 },
  }));
  assert.equal(hyperliquidMarkets.markets[0].asset, "BTC");

  const hyperliquidAccount = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_get_account",
    arguments: { address: "0x0000000000000000000000000000000000000001" },
  }));
  assert.equal(hyperliquidAccount.account.positionCount, 1);

  const hyperliquidPositions = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_get_positions",
    arguments: { address: "0x0000000000000000000000000000000000000001" },
  }));
  assert.equal(hyperliquidPositions.positions[0].asset, "BTC");
  assert.equal(hyperliquidPositions.notionalExposure, 6500);

  const hyperliquidOpenOrders = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_get_open_orders",
    arguments: { address: "0x0000000000000000000000000000000000000001" },
  }));
  assert.equal(hyperliquidOpenOrders.orders[0].side, "buy");

  const hyperliquidFunding = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_get_funding",
    arguments: { asset: "BTC" },
  }));
  assert.equal(hyperliquidFunding.funding.asset, "BTC");
  assert.equal(hyperliquidFunding.funding.fundingRate, 0.0001);

  const hyperliquidBook = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_get_orderbook",
    arguments: { asset: "BTC" },
  }));
  assert.equal(hyperliquidBook.orderbook.asset, "BTC");

  const hyperliquidWatch = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_create_watch",
    arguments: { kind: "funding_rate", asset: "BTC", threshold: 0.01, direction: "change" },
  }));
  assert.equal(hyperliquidWatch.watch.version, "matterhorn.hyperliquid.watch.v1");
  assert.equal(hyperliquidWatch.watch.id, "hl-watch-mcp");

  const hyperliquidWatchCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_check_watches",
    arguments: { watch: hyperliquidWatch.watch },
  }));
  assert.equal(hyperliquidWatchCheck.checks[0].status, "ok");

  const hyperliquidWatchDigest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_watch_digest",
    arguments: {},
  }));
  assert.equal(hyperliquidWatchDigest.digest.version, "matterhorn.hyperliquid.watch-digest.v1");
  assert.equal(hyperliquidWatchDigest.digest.alertCount, 0);

  const hyperliquidWatchAct = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_act_on_watch_alert",
    arguments: { watch: { id: "hl-watch-alert", kind: "funding_rate", asset: "BTC" } },
  }));
  assert.equal(hyperliquidWatchAct.selectedAlert.status, "triggered");
  assert.equal(hyperliquidWatchAct.selectedAlert.asset, "BTC");
  assert.match(hyperliquidWatchAct.action.prompt, /Do not sign, submit, broadcast, auto-execute/);
  assert.equal(hyperliquidWatchAct.chat.responseText, "Hyperliquid watch alert review ready.");
  assert.equal(hyperliquidWatchAct.safety.canSubmit, false);

  const hyperliquidPreview = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_preview_order",
    arguments: { asset: "BTC", side: "buy", size: 0.1, price: 65000 },
  }));
  assert.equal(hyperliquidPreview.preview.canSubmit, false);
  assert.equal(hyperliquidPreview.preview.previewSha256.length, 64);

  const hyperliquidSignRequest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_create_sign_request",
    arguments: { executionMode: "testnet_external_signer", asset: "BTC", side: "buy", size: 0.1, price: 65000 },
  }));
  assert.equal(hyperliquidSignRequest.signRequest.version, "matterhorn.market.external-sign-request.v1");
  assert.equal(hyperliquidSignRequest.signRequest.canSubmit, false);
  assert.equal(hyperliquidSignRequest.signRequest.liveSubmissionEnabled, false);
  assert.equal(hyperliquidSignRequest.signRequest.signedArtifactAccepted, false);
  assert.equal(hyperliquidSignRequest.signRequest.submitSignedAllowedByContract, false);

  const polymarketSignRequest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_create_sign_request",
    arguments: { executionMode: "testnet_external_signer", marketId: "0xmarket-ai", amountUsdc: 10, side: "yes" },
  }));
  assert.equal(polymarketSignRequest.signRequest.version, "matterhorn.market.external-sign-request.v1");
  assert.equal(polymarketSignRequest.signRequest.canSubmit, false);
  assert.equal(polymarketSignRequest.signRequest.liveSubmissionEnabled, false);
  assert.equal(polymarketSignRequest.signRequest.signedArtifactAccepted, false);
  assert.equal(polymarketSignRequest.signRequest.submitSignedAllowedByContract, false);

  const polymarketWatch = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_create_watch",
    arguments: { marketId: "0xmarket-ai" },
  }));
  assert.equal(polymarketWatch.watch.version, "matterhorn.polymarket.watch.v1");
  assert.equal(polymarketWatch.watch.id, "pm-watch-mcp");

  const polymarketWatchCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_check_watches",
    arguments: { watch: polymarketWatch.watch },
  }));
  assert.equal(polymarketWatchCheck.checks[0].status, "ok");

  const polymarketWatchDigest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_watch_digest",
    arguments: {},
  }));
  assert.equal(polymarketWatchDigest.digest.version, "matterhorn.polymarket.watch-digest.v1");
  assert.equal(polymarketWatchDigest.digest.alertCount, 0);

  const polymarketWatchAct = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_act_on_watch_alert",
    arguments: { watch: { id: "pm-watch-alert", marketId: "0xmarket-ai" } },
  }));
  assert.equal(polymarketWatchAct.selectedAlert.status, "triggered");
  assert.equal(polymarketWatchAct.selectedAlert.marketId, "0xmarket-ai");
  assert.match(polymarketWatchAct.action.prompt, /Do not sign, submit, broadcast, auto-execute/);
  assert.equal(polymarketWatchAct.chat.responseText, "Polymarket watch alert review ready.");
  assert.equal(polymarketWatchAct.safety.canSubmit, false);

  const hyperliquidArtifactValidation = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_validate_external_artifact",
    arguments: {
      signRequest: hyperliquidSignRequest.signRequest,
      artifact: {
        version: "matterhorn.market.redacted-signed-artifact-envelope.v1",
        venue: "hyperliquid",
        routeName: "hyperliquid.orders.sign_request",
        validationMode: "public_redacted_metadata",
        executionMode: "testnet_external_signer",
        network: hyperliquidSignRequest.signRequest.network,
        action: hyperliquidSignRequest.signRequest.action,
        signRequestSha256: hyperliquidSignRequest.signRequest.signRequestSha256,
        previewSha256: hyperliquidSignRequest.signRequest.previewSha256,
        handoffSha256: hyperliquidSignRequest.signRequest.handoffSha256,
        unsignedPayloadSha256: hyperliquidSignRequest.signRequest.unsignedPayloadSha256,
        signedArtifactPublicHash: "a".repeat(64),
        signedArtifactRedacted: true,
        canSubmit: false,
        liveSubmissionEnabled: false,
      },
    },
  }));
  assert.equal(hyperliquidArtifactValidation.validation.version, "matterhorn.market.artifact-validation.v1");
  assert.equal(hyperliquidArtifactValidation.validation.canSubmit, false);
  assert.equal(hyperliquidArtifactValidation.validation.publicAuditReceiptCandidate.version, "matterhorn.market.receipt.v1");

  const polymarketArtifactValidation = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_polymarket_validate_external_artifact",
    arguments: {
      signRequest: polymarketSignRequest.signRequest,
      artifact: {
        version: "matterhorn.market.redacted-signed-artifact-envelope.v1",
        venue: "polymarket",
        routeName: "polymarket.orders.sign_request",
        validationMode: "public_redacted_metadata",
        executionMode: "testnet_external_signer",
        network: polymarketSignRequest.signRequest.network,
        action: polymarketSignRequest.signRequest.action,
        signRequestSha256: polymarketSignRequest.signRequest.signRequestSha256,
        previewSha256: polymarketSignRequest.signRequest.previewSha256,
        handoffSha256: polymarketSignRequest.signRequest.handoffSha256,
        unsignedPayloadSha256: polymarketSignRequest.signRequest.unsignedPayloadSha256,
        signedArtifactPublicHash: "b".repeat(64),
        signedArtifactRedacted: true,
        canSubmit: false,
        liveSubmissionEnabled: false,
      },
    },
  }));
  assert.equal(polymarketArtifactValidation.validation.version, "matterhorn.market.artifact-validation.v1");
  assert.equal(polymarketArtifactValidation.validation.canSubmit, false);
  assert.equal(polymarketArtifactValidation.validation.publicAuditReceiptCandidate.version, "matterhorn.market.receipt.v1");

  const marketArtifactReconciliation = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_market_artifact_reconcile",
    arguments: {
      hyperliquidArtifactValidation,
      polymarketArtifactValidation,
      requireHyperliquid: true,
      requirePolymarket: true,
    },
  }));
  assert.equal(marketArtifactReconciliation.version, "matterhorn.market.artifact-reconciliation.v1");
  assert.equal(marketArtifactReconciliation.ready, true);
  assert.equal(marketArtifactReconciliation.safety.liveSubmissionEnabled, false);
  assert.equal(marketArtifactReconciliation.safety.signsOrSubmits, false);
  assert.equal(marketArtifactReconciliation.venues.filter((venue) => venue.present && venue.ready).length, 2);

  const badMarketArtifactReconciliation = await mcp.ask("tools/call", {
    name: "matterhorn_market_artifact_reconcile",
    arguments: {
      hyperliquidArtifactValidation: {
        ...hyperliquidArtifactValidation,
        validation: {
          ...hyperliquidArtifactValidation.validation,
          publicAuditReceiptCandidate: {
            ...hyperliquidArtifactValidation.validation.publicAuditReceiptCandidate,
            signature: "0xdeadbeef",
          },
        },
      },
    },
  });
  assert.match(badMarketArtifactReconciliation.error?.message || "", /credential-shaped field/i);

  const hyperliquidChat = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_hyperliquid_chat",
    arguments: { message: "preview buying 0.1 BTC at 65000" },
  }));
  assert.equal(hyperliquidChat.execution, "unsigned_preview");
  assert.equal(hyperliquidChat.preview.canSubmit, false);

  const cryptoChat = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_crypto_chat",
    arguments: { message: "show BTC Hyperliquid funding", venue: "auto" },
  }));
  assert.equal(cryptoChat.venue, "hyperliquid");
  assert.equal(cryptoChat.execution, "read_only");
  assert.equal(cryptoChat.sharedCards[0].version, "matterhorn.crypto.shared-card.v1");
  assert.equal(cryptoChat.sharedCards[0].kind, "market_context");
  assert.equal(cryptoChat.sharedCards[0].safety.canSubmit, false);

  const cryptoExecutionReadinessChat = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_crypto_chat",
    arguments: { message: "Can Matterhorn submit Hyperliquid and Polymarket orders yet?", venue: "auto" },
  }));
  assert.equal(cryptoExecutionReadinessChat.venue, "auto");
  assert.equal(cryptoExecutionReadinessChat.intent, "market_execution_readiness");
  assert.equal(cryptoExecutionReadinessChat.execution, "read_only");
  assert.equal(cryptoExecutionReadinessChat.sharedCards[0].version, "matterhorn.crypto.shared-card.v1");
  assert.equal(cryptoExecutionReadinessChat.sharedCards[0].kind, "readiness_report");
  assert.equal(cryptoExecutionReadinessChat.sharedCards[0].safety.liveSubmissionEnabled, false);
  assert.equal(cryptoExecutionReadinessChat.sharedCards[0].safety.canSubmit, false);

  const cryptoReadiness = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_crypto_readiness",
    arguments: {},
  }));
  assert.equal(cryptoReadiness.ready, true);
  assert.equal(cryptoReadiness.report.safety.liveSubmissionEnabled, false);
  assert.equal(cryptoReadiness.report.safety.canSubmit, false);

  const memorySearch = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_search",
    arguments: { query: "tao", scope: "workspace", tags: ["bittensor", "wallet"] },
  }));
  assert.equal(memorySearch.success, true);
  assert.equal(memorySearch.records[0].id, "mem_1");

  const memoryList = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_list",
    arguments: { kind: "protocol_address", limit: 5 },
  }));
  assert.equal(memoryList.count, 1);

  const memoryGet = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_get",
    arguments: { id: "mem_1" },
  }));
  assert.equal(memoryGet.record.title, "Public TAO wallet");

  const memoryRecordToCapture = {
    ...memoryGet.record,
    id: "mem_2",
    title: "Second public TAO wallet",
    body: { ss58Address: "5GrwvaEF5zXb26Fz9rcQpDWS8K3s82vNJZyDjY41iSeQy1wW" },
  };
  const memoryCapture = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_capture",
    arguments: { record: memoryRecordToCapture },
  }));
  assert.equal(memoryCapture.record.id, "mem_2");

  const memoryUpdate = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_update",
    arguments: { id: "mem_1", patch: { summary: "Updated public wallet summary." } },
  }));
  assert.equal(memoryUpdate.record.summary, "Updated public wallet summary.");

  const memoryForget = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_forget",
    arguments: { id: "mem_1", reason: "No longer needed." },
  }));
  assert.equal(memoryForget.forgotten, true);

  const memoryExport = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_memory_export",
    arguments: { outputDir: "/tmp/matterhorn-memory-export" },
  }));
  assert.deepEqual(memoryExport.export.files, ["matterhorn-memory-export.json", "matterhorn-memory-export.sha256"]);

  const badMemoryCapture = await mcp.ask("tools/call", {
    name: "matterhorn_memory_capture",
    arguments: {
      record: {
        ...memoryRecordToCapture,
        id: "mem_bad",
        body: { privateKey: "not-allowed" },
      },
    },
  });
  assert.ok(badMemoryCapture.error, "secret-shaped memory capture should fail before calling the server");
  assert.match(badMemoryCapture.error.message, /forbidden credential-shaped field/i);

  const servicesCapabilities = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_services_get_capabilities",
    arguments: { capability: "storage" },
  }));
  assert.equal(servicesCapabilities.version, "matterhorn.services.capability-catalog.v1");
  assert.equal(servicesCapabilities.status, "future_contract");
  assert.equal(servicesCapabilities.safety.liveExecutionEnabled, false);
  assert.equal(servicesCapabilities.safety.canExecute, false);
  assert.deepEqual(servicesCapabilities.capabilities.map((item) => item.capability), ["storage"]);
  assert.equal(servicesCapabilities.capabilities[0].liveExecutionEnabled, false);
  assert.equal(servicesCapabilities.capabilities[0].canExecute, false);
  assert.equal(servicesCapabilities.capabilities[0].discoveryFixtures[0].canExecute, false);

  const workflowCatalog = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_workflows_catalog",
    arguments: { workflow: "wellness_creator_workflow", includePrompts: true },
  }));
  assert.equal(workflowCatalog.version, "matterhorn.workflow.catalog.v1");
  assert.equal(workflowCatalog.status, "catalog_only");
  assert.equal(workflowCatalog.safety.catalogOnly, true);
  assert.equal(workflowCatalog.safety.liveExecutionEnabled, false);
  assert.equal(workflowCatalog.safety.canSubmit, false);
  assert.equal(workflowCatalog.workflows[0].workflowId, "wellness_creator_workflow");
  assert.equal(workflowCatalog.workflows[0].canExecuteProviderActions, false);
  assert.equal(workflowCatalog.workflows[0].safety.acceptsSecrets, false);

  const workflowPromptPack = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_workflows_prompt_pack",
    arguments: { workflow: "wellness_creator_workflow" },
  }));
  assert.equal(workflowPromptPack.version, "matterhorn.workflow.prompt-pack.v1");
  assert.equal(workflowPromptPack.status, "catalog_only");
  assert.equal(workflowPromptPack.safety.promptPackOnly, true);
  assert.equal(workflowPromptPack.safety.liveExecutionEnabled, false);
  assert.equal(workflowPromptPack.safety.canSubmit, false);
  assert.equal(workflowPromptPack.workflows[0].workflowId, "wellness_creator_workflow");
  assert.equal(workflowPromptPack.workflows[0].prompts[0].step, 1);
  assert.equal(workflowPromptPack.workflows[0].safety.noProviderExecution, true);

  const customerTemplates = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_workflows_customer_templates",
    arguments: { customerTemplate: "bittensor_operator" },
  }));
  assert.equal(customerTemplates.version, "matterhorn.customer.workflow.template.v1");
  assert.equal(customerTemplates.status, "catalog_only");
  assert.equal(customerTemplates.safety.catalogOnly, true);
  assert.equal(customerTemplates.safety.liveExecutionEnabled, false);
  assert.equal(customerTemplates.safety.canSubmit, false);
  assert.equal(customerTemplates.customerTemplates[0].id, "bittensor_operator");
  assert.equal(customerTemplates.customerTemplates[0].launch.primaryCta, "Open Bittensor panel");
  assert.equal(customerTemplates.customerTemplates[0].ui.iconHint, "bittensor");
  assert.equal(customerTemplates.customerTemplates[0].routing.chatMode, "bittensor");
  assert.equal(customerTemplates.customerTemplates[0].routing.startsSession, true);
  assert.equal(customerTemplates.customerTemplates[0].safetyBoundaries.acceptsSecrets, false);
  assert.equal(customerTemplates.customerTemplates[0].safetyBoundaries.liveExecutionEnabled, false);

  const servicesChatPlan = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_services_chat_plan",
    arguments: { message: "Plan payments for a paid fitness program", capability: "payments" },
  }));
  assert.equal(servicesChatPlan.version, "matterhorn.services.chat-plan.v1");
  assert.equal(servicesChatPlan.execution, "planned_not_live");
  assert.equal(servicesChatPlan.safety.liveExecutionEnabled, false);
  assert.equal(servicesChatPlan.safety.canExecute, false);
  assert.equal(servicesChatPlan.cards[0].safety.canExecute, false);

  const livePublicQa = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_crypto_live_public_qa",
    arguments: {
      outputDir: `/tmp/matterhorn-live-public-qa-mcp-smoke-${process.pid}`,
      fixture: true,
      strict: true,
      hyperliquidAsset: "BTC",
    },
  }));
  assert.equal(livePublicQa.ok, true);
  assert.equal(livePublicQa.ready, true);
  assert.equal(livePublicQa.status, "SKIPPED_WITH_FIXTURE_FALLBACK");
  assert.equal(livePublicQa.safety.liveSubmissionEnabled, false);
  assert.equal(livePublicQa.safety.signsOrSubmits, false);
  assert.match(livePublicQa.markdown, /Matterhorn Desks Live Public-Data QA/);
  assert.match(livePublicQa.sha256, /matterhorn-live-public-qa\.json/);
  assert.ok(livePublicQa.report.stages.some((stage) => stage.id === "hyperliquid_watch_evidence"));
  assert.ok(livePublicQa.report.stages.some((stage) => stage.id === "polymarket_watch_evidence"));

  const marketExecutionReadiness = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_market_execution_readiness",
    arguments: {},
  }));
  assert.equal(marketExecutionReadiness.success, true);
  assert.equal(marketExecutionReadiness.report.version, "matterhorn.market.execution-readiness.v1");
  assert.equal(marketExecutionReadiness.report.readyForLiveSubmission, false);
  assert.equal(marketExecutionReadiness.report.safety.canSubmit, false);

  const marketExecutionChain = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_market_execution_chain",
    arguments: {},
  }));
  assert.equal(marketExecutionChain.success, true);
  assert.equal(marketExecutionChain.version, "matterhorn.market.execution-chain-guide.v1");
  assert.equal(marketExecutionChain.safety.canSubmit, false);
  assert.equal(marketExecutionChain.safety.liveSubmissionEnabled, false);
  assert.equal(marketExecutionChain.safety.acceptsSecrets, false);
  assert.ok(marketExecutionChain.stages.some((stage) => stage.id === "external_sign_request"));
  assert.ok(JSON.stringify(marketExecutionChain.stages).includes("matterhorn-work crypto artifact-reconcile"));

  const marketSdkValidation = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_market_sdk_validation",
    arguments: {},
  }));
  assert.equal(marketSdkValidation.success, true);
  assert.equal(marketSdkValidation.version, "matterhorn.market.sdk-validation-guide.v1");
  assert.equal(marketSdkValidation.safety.canSubmit, false);
  assert.equal(marketSdkValidation.safety.liveSubmissionEnabled, false);
  assert.equal(marketSdkValidation.safety.acceptsSecrets, false);
  assert.equal(marketSdkValidation.safety.runsPrivateSdkSigning, false);
  assert.ok(marketSdkValidation.modes.includes("operator_owned_testnet"));
  assert.ok(marketSdkValidation.networks.hyperliquid.includes("hyperliquid-testnet"));
  assert.ok(marketSdkValidation.networks.polymarket.includes("polygon-amoy"));
  assert.ok(marketSdkValidation.commands.fixtureValidation.includes("matterhorn-work crypto sdk-validate-public"));

  const marketCustomerEvidenceSummary = {
    ready: true,
    customerReadySmoke: {
      ready: true,
      requiredStages: [
        "crypto.unified_chat",
        "crypto.shared_card_contract",
        "market.execution_safety",
        "market.execution_readiness_api",
        "market.official_sdk_validation",
        "market.artifact_reconciliation",
        "market.customer_evidence_bundle",
        "hyperliquid.readiness",
        "polymarket.readiness",
        "bittensor.customer_readiness",
      ].map((id) => ({ id, label: id, status: "pass" })),
    },
    officialSdkValidation: {
      ready: true,
      allValidated: false,
      validation: { ok: true, errors: [], warnings: [] },
    },
    sdkManifestCheck: { present: true, ready: true, ok: true, fileCount: 4, venueCount: 2 },
    receiptCheck: { present: true, ready: true, ok: true, matchesHandoff: true },
    artifactReconciliation: { present: true, ready: true, venueCount: 2, readyVenues: ["hyperliquid", "polymarket"] },
    warnings: [],
    errors: [],
    safety: {
      nonCustodial: true,
      liveSubmissionEnabled: false,
      asksForSecrets: false,
      storesSecrets: false,
    },
  };
  const marketCustomerEvidenceMarkdown = [
    "# Matterhorn Desks Market Customer Evidence Bundle",
    "",
    "Result: READY_FOR_TEST_CUSTOMER_QA",
    "",
    "## Safety Posture",
    "",
    "## Official SDK Validation Evidence",
    "",
    "## SDK Run Manifest Evidence",
    "",
    "## Public Receipt Evidence",
    "",
    "## Artifact Reconciliation Evidence",
    "",
    "## Red Lines",
    "",
  ].join("\n");
  const marketEvidenceVerify = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_market_customer_evidence_verify",
    arguments: {
      bundle: marketCustomerEvidenceSummary,
      markdown: marketCustomerEvidenceMarkdown,
      requireSdkManifestCheck: true,
      requireReceiptCheck: true,
      requireArtifactReconciliation: true,
    },
  }));
  assert.equal(marketEvidenceVerify.ready, true);
  assert.equal(marketEvidenceVerify.safety.liveSubmissionEnabled, false);
  assert.ok(marketEvidenceVerify.checks.some((check) => check.id === "sdk_manifest.accepted"));
  assert.ok(marketEvidenceVerify.checks.some((check) => check.id === "receipt.accepted"));
  assert.ok(marketEvidenceVerify.checks.some((check) => check.id === "artifact_reconciliation.accepted"));

  const badMarketEvidenceVerify = await mcp.ask("tools/call", {
    name: "matterhorn_market_customer_evidence_verify",
    arguments: {
      bundle: { ...marketCustomerEvidenceSummary, rawSignature: "0xdeadbeef" },
    },
  });
  assert.match(badMarketEvidenceVerify.error?.message || "", /credential-shaped field/i);

  const bittensor = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_chat",
    arguments: { message: "show my TAO" },
  }));
  assert.equal(bittensor.execution, "clarification_required");

  const readiness = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_readiness",
    arguments: {},
  }));
  assert.equal(readiness.ready, true);

  const customerEvidenceBundle = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: {
        ready: true,
        summary: { pass: 7, fail: 0, skip: 0 },
        stages: [
          { id: "readiness", label: "Bittensor readiness", status: "pass" },
          { id: "wallet.snapshot", label: "Wallet snapshot", status: "pass" },
        ],
      },
      agentControlLiveQa: { ready: true, summary: { pass: 4, fail: 0 } },
      ci: {
        workflow_runs: [
          { name: "Matterhorn Desks Tests", conclusion: "success" },
          { name: "i18n Audit", conclusion: "success" },
          { name: "Alpha Channel macOS arm64", conclusion: "success" },
        ],
      },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
      walletTimeline: { enabled: true, snapshotCount: 2 },
      adapterCandidate: {
        readyForReadOnlyCanary: true,
        id: "docs-search-canary-v1",
        netuid: 14,
        adapterKind: "data_search",
        endpointHost: "adapter.example.com",
        summary: { pass: 11, warn: 0, fail: 0 },
        findings: [{ area: "Endpoint", status: "pass" }],
      },
      adapterCanary: {
        readyForCanary: true,
        netuid: 14,
        serviceAdapter: "data_search",
        summary: { pass: 6, warn: 1, fail: 0 },
        findings: [{ area: "Endpoint", status: "pass" }],
      },
      readonlyAdapterCanary: {
        ready: true,
        netuid: 14,
        serviceAdapter: "data_search",
        invoked: true,
        previewRequestSha256: "f".repeat(64),
        summary: { pass: 5, warn: 0, fail: 0 },
        findings: [{ area: "Invoke", status: "pass" }],
      },
      receiptCheck: {
        accepted: true,
        txHash: "0x" + "d".repeat(64),
        blockHash: "0x" + "e".repeat(64),
        status: "finalized",
        payloadSha256: "f".repeat(64),
        action: "stake",
        netuid: 14,
        summary: { pass: 5, warn: 0, fail: 0 },
        findings: [{ area: "Payload hash", status: "pass" }],
      },
      watchAutopilotScheduler: {
        ok: true,
        source: "matterhorn_bittensor_watch_autopilot_scheduler",
        iterations: 6,
        totalEvaluations: 18,
        totalAlerts: 2,
        failedChecks: 0,
        latest: { checkedAt: "2026-06-15T00:05:00.000Z" },
        safety: { custody: "none", signsOrBroadcasts: false, submitsTransactions: false, invokesSubnetServices: false },
      },
      requireAdapterCandidate: true,
      requireAdapterCanary: true,
      requireReadonlyAdapterCanary: true,
      requireReceiptCheck: true,
      requireWatchAutopilotScheduler: true,
    },
  }));
  assert.equal(customerEvidenceBundle.ready, true);
  assert.equal(customerEvidenceBundle.summary.adapterCandidate.ready, true);
  assert.equal(customerEvidenceBundle.summary.adapterCandidate.endpointHost, "adapter.example.com");
  assert.equal(customerEvidenceBundle.summary.adapterCanary.ready, true);
  assert.equal(customerEvidenceBundle.summary.readonlyAdapterCanary.ready, true);
  assert.equal(customerEvidenceBundle.summary.readonlyAdapterCanary.invoked, true);
  assert.equal(customerEvidenceBundle.summary.receiptCheck.ready, true);
  assert.equal(customerEvidenceBundle.summary.receiptCheck.status, "finalized");
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.ready, true);
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.iterations, 6);
  assert.equal(customerEvidenceBundle.summary.watchAutopilotScheduler.totalAlerts, 2);
  assert.equal(customerEvidenceBundle.safety.signsOrBroadcasts, false);
  assert.match(customerEvidenceBundle.markdown, /READY_FOR_TEST_CUSTOMERS/);
  assert.match(customerEvidenceBundle.markdown, /Wallet snapshot/);
  assert.match(customerEvidenceBundle.markdown, /Adapter candidate gate says ready/);
  assert.match(customerEvidenceBundle.markdown, /Read-only canary ready/);
  assert.match(customerEvidenceBundle.markdown, /Receipt check accepted/);
  assert.match(customerEvidenceBundle.markdown, /Scheduled watch autopilot/);
  assert.match(customerEvidenceBundle.markdown, /6 scheduled checks, 2 alerts, 18 evaluations/);

  const bittensorEvidenceVerify = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_verify",
    arguments: {
      bundle: customerEvidenceBundle.summary,
      markdown: [
        "# Matterhorn Desks Bittensor Customer Evidence Bundle",
        "",
        "## Decision",
        "",
        "- Result: READY_FOR_TEST_CUSTOMERS",
        "",
        "## Gate Summary",
        "",
        "## Before Customer Demo",
        "",
      ].join("\n"),
      requireReceiptCheck: true,
      requireReadonlyAdapterCanary: true,
      requireWatchAutopilotScheduler: true,
    },
  }));
  assert.equal(bittensorEvidenceVerify.ready, true);
  assert.equal(bittensorEvidenceVerify.safety.signsOrBroadcasts, false);
  assert.ok(bittensorEvidenceVerify.checks.some((check) => check.id === "ci.no_failures"));

  const cryptoCustomerPacket = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_crypto_customer_packet",
    arguments: {
      customerReadySmoke: {
        ready: true,
        summary: { pass: 18, fail: 0, skip: 0 },
        stages: [
          { id: "crypto.unified_chat", status: "pass" },
          { id: "crypto.direct_prompt_safety", status: "pass" },
          { id: "crypto.shared_card_contract", status: "pass" },
          { id: "market.execution_safety", status: "pass" },
          { id: "market.execution_readiness_api", status: "pass" },
          { id: "market.sign_request_phase1", status: "pass" },
          { id: "market.artifact_validation_phase2", status: "pass" },
          { id: "market.artifact_reconciliation", status: "pass" },
          { id: "market.official_sdk_validation", status: "pass" },
          { id: "market.customer_evidence_bundle", status: "pass" },
          { id: "market.customer_evidence_verify", status: "pass" },
          { id: "hyperliquid.readiness", status: "pass" },
          { id: "polymarket.readiness", status: "pass" },
          { id: "bittensor.customer_readiness", status: "pass" },
        ],
        safety: {
          nonCustodial: true,
          liveSubmissionEnabled: false,
          asksForSecrets: false,
        },
      },
      marketEvidenceVerify,
      marketSdkValidationGuide: {
        success: true,
        guide: {
          version: "matterhorn.market.sdk-validation-guide.v1",
          modes: ["fixture", "operator_owned_fixture", "operator_owned_testnet"],
          networks: {
            hyperliquid: ["fixture", "hyperliquid-testnet"],
            polymarket: ["fixture", "polygon-amoy"],
          },
          commands: {
            doctor: "matterhorn-work crypto sdk-doctor --strict --json",
            fixtureValidation: "matterhorn-work crypto sdk-validate-public --mode fixture --strict --json",
            operatorOwnedTestnetValidation: "matterhorn-work crypto sdk-validate-public --mode operator_owned_testnet --strict --json",
            operatorLoop: "matterhorn-work crypto sdk-loop --mode fixture --strict --json",
          },
          safety: {
            canSubmit: false,
            liveSubmissionEnabled: false,
            nonCustodial: true,
            acceptsSecrets: false,
            acceptsRawSignatures: false,
            acceptsSignedPayloads: false,
            runsPrivateSdkSigning: false,
            computesFinalSignatures: false,
            callsExchanges: false,
          },
        },
      },
      bittensorEvidence: bittensorEvidenceVerify,
      requireMarketEvidence: true,
      requireBittensorEvidence: true,
    },
  }));
  assert.equal(cryptoCustomerPacket.ready, true);
  assert.equal(cryptoCustomerPacket.packet.marketEvidence.ready, true);
  assert.equal(cryptoCustomerPacket.packet.marketEvidence.details.officialSdkAccepted, true);
  assert.equal(cryptoCustomerPacket.packet.marketEvidence.details.sdkManifestAccepted, true);
  assert.equal(cryptoCustomerPacket.packet.marketEvidence.details.receiptAccepted, true);
  assert.equal(cryptoCustomerPacket.packet.marketEvidence.details.artifactReconciliationAccepted, true);
  assert.equal(cryptoCustomerPacket.packet.marketSdkValidationGuide.ready, true);
  assert.equal(cryptoCustomerPacket.packet.marketSdkValidationGuide.modes.includes("operator_owned_testnet"), true);
  assert.equal(cryptoCustomerPacket.packet.marketSdkValidationGuide.networks.hyperliquid.includes("hyperliquid-testnet"), true);
  assert.equal(cryptoCustomerPacket.packet.bittensorEvidence.ready, true);
  assert.equal(cryptoCustomerPacket.safety.liveSubmissionEnabled, false);
  assert.match(cryptoCustomerPacket.markdown, /READY_FOR_TEST_CUSTOMER_QA/);
  assert.match(cryptoCustomerPacket.markdown, /Artifact reconciliation \| yes/);
  assert.match(cryptoCustomerPacket.markdown, /Market SDK-Validation Guide/);

  const badCryptoCustomerPacket = await mcp.ask("tools/call", {
    name: "matterhorn_crypto_customer_packet",
    arguments: {
      customerReadySmoke: {
        ready: true,
        rawSignature: "0xdeadbeef",
        safety: { nonCustodial: true, liveSubmissionEnabled: false, asksForSecrets: false },
      },
    },
  });
  assert.match(badCryptoCustomerPacket.error?.message || "", /credential-shaped field/i);

  const badCustomerEvidenceBundle = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: { ready: true, seedPhrase: "never" },
      ci: { workflow_runs: [{ name: "Matterhorn Desks Tests", conclusion: "success" }] },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
    },
  });
  assert.match(badCustomerEvidenceBundle.error?.message || "", /credential-shaped field/i);

  const badCustomerEvidenceReceipt = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_customer_evidence_bundle",
    arguments: {
      bittensorLiveQa: { ready: true, summary: { pass: 1, fail: 0 } },
      ci: { workflow_runs: [{ name: "Matterhorn Desks Tests", conclusion: "success" }] },
      readinessGate: "READY_FOR_TEST_CUSTOMERS",
      receiptCheck: { accepted: true, signature: "0x1234" },
    },
  });
  assert.match(badCustomerEvidenceReceipt.error?.message || "", /credential-shaped field/i);

  const capabilities = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_list_capabilities",
    arguments: {},
  }));
  assert.equal(capabilities.capabilities[0].netuid, 14);

  const capability = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_get_subnet_capability",
    arguments: { netuid: 14 },
  }));
  assert.equal(capability.capability.serviceAdapter, "inference");

  const adapterCanaryGate = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_adapter_canary_gate",
    arguments: {
      netuid: 14,
      capability: {
        netuid: 14,
        serviceAdapter: "data_search",
        endpoint: "https://adapter.example.com/search",
        configured: true,
        requiredAuth: "none",
        costModel: "free_read",
      },
      allowedHosts: ["adapter.example.com"],
      requireConfigured: true,
      strict: true,
    },
  }));
  assert.equal(adapterCanaryGate.readyForCanary, true);
  assert.equal(adapterCanaryGate.safety.callsAdapterService, false);

  const badAdapterCanaryGate = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_adapter_canary_gate",
    arguments: {
      netuid: 14,
      capability: {
        netuid: 14,
        serviceAdapter: "data_search",
        endpoint: "https://adapter.example.com/search",
        configured: true,
        seedPhrase: "never",
      },
      allowedHosts: ["adapter.example.com"],
    },
  });
  assert.match(badAdapterCanaryGate.error?.message || "", /forbidden credential or signing field/i);

  const extrinsicPreview = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_prepare_extrinsic",
    arguments: { action: "stake", netuid: 14, amountTao: "1" },
  }));
  assert.equal(extrinsicPreview.preview.requiresExternalSignature, true);

  const signingHandoff = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_create_signing_handoff",
    arguments: { preview: extrinsicPreview.preview },
  }));
  assert.equal(signingHandoff.handoff.payloadSha256.length, 64);

  const signingHandoffCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_signing_handoff",
    arguments: {
      handoff: {
        handoff: {
          ...signingHandoff.handoff,
          requiresExternalSignature: true,
          preview: { action: "stake", netuid: 14, amountTao: "1" },
        },
      },
      expectedSha: signingHandoff.handoff.payloadSha256,
      now: "2026-06-12T19:00:00.000Z",
      strict: true,
    },
  }));
  assert.equal(signingHandoffCheck.readyToSign, true);
  assert.equal(signingHandoffCheck.safety.signsOrBroadcasts, false);
  assert.match(signingHandoffCheck.markdown, /READY_FOR_EXTERNAL_SIGNER/);

  const badSigningHandoffCheck = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_signing_handoff",
    arguments: {
      handoff: {
        payloadSha256: signingHandoff.handoff.payloadSha256,
        expiresAt: "2026-06-12T20:00:00.000Z",
        signature: "0x1234",
      },
    },
  });
  assert.match(badSigningHandoffCheck.error?.message || "", /forbidden signing or credential field/i);

  const importedReceipt = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_import_receipt",
    arguments: {
      preview: extrinsicPreview.preview,
      handoff: signingHandoff.handoff,
      signatureSha256: "c".repeat(64),
      signerAddress: "5GrwvaEF5zXb26Fz9rcQpDWSi6q4zN9vX7K5Qm9P7rjY9uQF",
    },
  }));
  assert.equal(importedReceipt.receipt.status, "signed_payload_received");
  assert.equal(importedReceipt.receipt.signatureSha256, "c".repeat(64));
  assert.equal(JSON.stringify(importedReceipt).includes("0x1234567890abcdef"), false);

  const receiptCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_receipt",
    arguments: {
      receipt: {
        txHash: "0x" + "d".repeat(64),
        blockHash: "0x" + "e".repeat(64),
        status: "finalized",
        payloadSha256: signingHandoff.handoff.payloadSha256,
        action: "stake",
        netuid: 14,
      },
      expectedPayloadSha: signingHandoff.handoff.payloadSha256,
      expectedAction: "stake",
      expectedNetuid: 14,
      strict: true,
    },
  }));
  assert.equal(receiptCheck.accepted, true);
  assert.equal(receiptCheck.safety.acceptsRawSignatures, false);
  assert.match(receiptCheck.followUpPrompt, /Compare my public wallet state/i);

  const badReceiptCheck = await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_receipt",
    arguments: {
      receipt: {
        txHash: "0x" + "d".repeat(64),
        status: "finalized",
        payloadSha256: signingHandoff.handoff.payloadSha256,
        signature: "0x1234",
      },
    },
  });
  assert.match(badReceiptCheck.error?.message || "", /forbidden signing or credential field/i);

  const signedSubmit = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_submit_signed_extrinsic",
    arguments: { preview: extrinsicPreview.preview, signature: "0x1234567890abcdef" },
  }));
  assert.deepEqual(signedSubmit, {
    success: false,
    code: "wallet_airlock_required",
    tool: "matterhorn_bittensor_submit_signed_extrinsic",
    message: "This deprecated submission tool cannot sign, relay, broadcast, or submit. Regenerate a reviewed action and approve it in the connected Matterhorn wallet UI.",
  });

  const subnetPreview = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_preview_subnet_invocation",
    arguments: { netuid: 14, intent: "service_call", task: "mock subnet task" },
  }));
  assert.equal(subnetPreview.preview.requestSha256.length, 64);
  assert.equal(subnetPreview.preview.requiresConfirmation, true);

  const subnetInvoke = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_invoke_subnet",
    arguments: { netuid: 14, intent: "service_call", task: "mock subnet task", previewRequestSha256: subnetPreview.preview.requestSha256 },
  }));
  assert.equal(subnetInvoke.invocation.supported, false);

  const watchCreate = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_create_watch",
    arguments: { kind: "slippage", netuid: 14, threshold: 0.4 },
  }));
  assert.equal(watchCreate.watch.id, "bt-watch-mcp");

  const watchList = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_list_watches",
    arguments: {},
  }));
  assert.equal(watchList.watches.length, 0);

  const watchCheck = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_check_watches",
    arguments: {},
  }));
  assert.equal(watchCheck.evaluations[0].status, "ok");

  const watchDigest = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_watch_digest",
    arguments: { maxAlerts: 2 },
  }));
  assert.equal(watchDigest.total, 2);
  assert.equal(watchDigest.alertCount, 1);
  assert.equal(watchDigest.statusCounts.alert, 1);
  assert.equal(watchDigest.alerts[0].alertKey, "validator:14:bt-watch-alert");
  assert.equal(watchDigest.alerts[0].notificationIntent, "review_validator");
  assert.equal(watchDigest.alerts[0].prompt, "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.");

  const watchAct = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_bittensor_act_on_watch_alert",
    arguments: { alertKey: "validator:14:bt-watch-alert" },
  }));
  assert.equal(watchAct.selectedAlert.alertKey, "validator:14:bt-watch-alert");
  assert.equal(watchAct.selectedAlert.validatorHotkey, "5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX");
  assert.equal(watchAct.action.prompt, "Analyze validator 5F3sa2TJAWMqDhXG6jhV4N8ko9SxwGy8TpaNS1repo5EYjQX on subnet 14.");
  assert.equal(watchAct.chat.execution, "answered");
  assert.equal(watchAct.chat.responseText, "Validator alert analysis ready.");

  await mcp.ask("tools/call", {
    name: "matterhorn_close_file_session",
    arguments: { sessionId: "fs_1" },
  });

  const deletedSession = parseToolResult(await mcp.ask("tools/call", {
    name: "matterhorn_delete_session",
    arguments: { workspaceId: "ws_1", sessionId: "ses_1" },
  }));
  assert.equal(deletedSession.ok, true);

  assert.ok(requests.some((request) => request.hostToken === HOST_TOKEN && request.path === "/approvals"));
  assert.ok(requests.some((request) => request.authorization === `Bearer ${CLIENT_TOKEN}` && request.path === "/workspaces"));

  console.log("Matterhorn Desks MCP smoke test passed.");
} finally {
  mcp.child.kill();
  server.close();
}
