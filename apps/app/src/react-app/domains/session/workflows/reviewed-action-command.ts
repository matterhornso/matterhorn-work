import type {
  MatterhornDeskAgentDeskId,
  ReviewedActionDraftHandoff,
} from "@matterhorn-work/types";

type ReviewedActionProtocol = ReviewedActionDraftHandoff["protocol"];

function finitePositive(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function finiteOrderId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requestedNetwork(normalized: string): "testnet" | "mainnet" {
  return /\b(mainnet|live|real funds?)\b/.test(normalized) ? "mainnet" : "testnet";
}

function requestedSlippageBps(normalized: string): number {
  const match = normalized.match(
    /\bslippage\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*(bps|%)/,
  ) ?? normalized.match(
    /\b(\d+(?:\.\d+)?)\s*(bps|%)\s+slippage\b/,
  );
  const value = finitePositive(match?.[1]);
  if (value === null) return 100;
  return Math.min(5_000, Math.max(1, Math.round(match?.[2] === "%" ? value * 100 : value)));
}

function hyperliquidOrderTerms(normalized: string): {
  asset: string;
  side: "buy" | "sell";
  size: number;
  orderType: "market" | "limit";
  limitPrice: number | null;
} | null {
  const sideMatch = normalized.match(/\b(buy|sell|long|short)\b/);
  if (!sideMatch) return null;
  const amountThenAsset = normalized.match(
    /\b(?:buy|sell|long|short)\b\s+(\d[\d,]*(?:\.\d+)?)\s*([a-z][a-z0-9]{1,11})\b/,
  );
  const assetThenAmount = normalized.match(
    /\b(?:buy|sell|long|short)\b\s+([a-z][a-z0-9]{1,11})\s+(\d[\d,]*(?:\.\d+)?)\b/,
  );
  const size = finitePositive(amountThenAsset?.[1] ?? assetThenAmount?.[2]);
  const asset = (amountThenAsset?.[2] ?? assetThenAmount?.[1])?.toUpperCase();
  if (!asset || size === null) return null;
  const orderType = /\blimit\b/.test(normalized) ? "limit" : "market";
  const priceMatch = normalized.match(
    /(?:\bat\b|@|\bprice\s*(?:of|=|:)?\s*)\s*\$?(\d[\d,]*(?:\.\d+)?)/,
  );
  const limitPrice = orderType === "limit" ? finitePositive(priceMatch?.[1]) : null;
  if (orderType === "limit" && limitPrice === null) return null;
  return {
    asset,
    side: sideMatch[1] === "sell" || sideMatch[1] === "short" ? "sell" : "buy",
    size,
    orderType,
    limitPrice,
  };
}

function commandProtocol(
  text: string,
  deskId: MatterhornDeskAgentDeskId | null | undefined,
): ReviewedActionProtocol | null {
  const normalized = text.toLowerCase();
  if (/\bhyperliquid\b/.test(normalized)) return "hyperliquid";
  if (/\bpolymarket\b/.test(normalized)) return "polymarket";
  if (/\b(bittensor|tao)\b/.test(normalized)) return "bittensor";
  if (/\bsui\b/.test(normalized)) return "sui";
  if (deskId === "hyperliquid" || deskId === "polymarket" || deskId === "bittensor" || deskId === "sui") return deskId;
  return null;
}

function hyperliquidCommand(text: string): ReviewedActionDraftHandoff | null {
  const normalized = text.toLowerCase();
  const network = requestedNetwork(normalized);
  const slippageBps = requestedSlippageBps(normalized);

  if (/\bcancel\b/.test(normalized)) {
    const orderId = finiteOrderId(
      normalized.match(/\border(?:\s+id)?\s*(?:=|:|#)?\s*(\d+)\b/)?.[1],
    );
    const asset = normalized.match(/\b(?:for|on)\s+([a-z][a-z0-9]{1,11})\b/)?.[1]?.toUpperCase()
      ?? normalized.match(/\b([a-z][a-z0-9]{1,11})\s+(?:order\s*)?#?\d+\b/)?.[1]?.toUpperCase();
    if (orderId === null || !asset) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "composer-command",
      draft: {
        operation: "cancel_order",
        network,
        asset,
        orderId,
        side: null,
        size: null,
        orderType: null,
        limitPrice: null,
        slippageBps: null,
        reduceOnly: null,
      },
    };
  }

  if (/\bclose\b/.test(normalized)) {
    const amountThenAsset = normalized.match(/\bclose\b\s+(\d[\d,]*(?:\.\d+)?)\s*([a-z][a-z0-9]{1,11})\b/);
    const assetThenAmount = normalized.match(/\bclose\b\s+([a-z][a-z0-9]{1,11})\s+(\d[\d,]*(?:\.\d+)?)\b/);
    const size = finitePositive(amountThenAsset?.[1] ?? assetThenAmount?.[2]);
    const asset = (amountThenAsset?.[2] ?? assetThenAmount?.[1])?.toUpperCase();
    const direction = normalized.match(/\b(long|short|buy|sell)\b/)?.[1];
    if (!asset || size === null || !direction) return null;
    const side = direction === "long" || direction === "sell" ? "sell" : "buy";
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "composer-command",
      draft: {
        operation: "close_position",
        network,
        asset,
        orderId: null,
        side,
        size,
        orderType: "market",
        limitPrice: null,
        slippageBps,
        reduceOnly: true,
      },
    };
  }

  const terms = hyperliquidOrderTerms(normalized);
  if (!terms) return null;
  const isModify = /\b(modify|replace|update)\b/.test(normalized);
  const orderId = isModify
    ? finiteOrderId(
        normalized.match(/\border(?:\s+id)?\s*(?:=|:|#)?\s*(\d+)\b/)?.[1],
      )
    : null;
  if (isModify && orderId === null) return null;

  if (isModify) {
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "hyperliquid",
      source: "composer-command",
      draft: {
        operation: "modify_order",
        network,
        asset: terms.asset,
        orderId: orderId!,
        side: terms.side,
        size: terms.size,
        orderType: terms.orderType,
        limitPrice: terms.limitPrice,
        slippageBps,
        reduceOnly: /\breduce[- ]?only\b/.test(normalized),
      },
    };
  }

  return {
    version: "matterhorn.reviewed-action-handoff.v1",
    protocol: "hyperliquid",
    source: "composer-command",
    draft: {
      operation: "place_order",
      network,
      asset: terms.asset,
      orderId: null,
      side: terms.side,
      size: terms.size,
      orderType: terms.orderType,
      limitPrice: terms.limitPrice,
      slippageBps,
      reduceOnly: /\breduce[- ]?only\b/.test(normalized),
    },
  };
}

function polymarketCommand(text: string): ReviewedActionDraftHandoff | null {
  const normalized = text.toLowerCase();
  if (/\bcancel\b/.test(normalized)) {
    const cancelAll = /\bcancel\s+all\b/.test(normalized);
    const orderIds = Array.from(
      normalized.matchAll(/\border(?:\s+id)?\s*(?:=|:|#)?\s*([a-z0-9_-]{6,128})\b/g),
    )
      .map((match) => match[1]);
    if (!cancelAll && orderIds.length === 0) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "polymarket",
      source: "composer-command",
      draft: {
        operation: "cancel",
        marketId: null,
        outcome: null,
        amountUsdc: null,
        amountShares: null,
        slippageTolerance: null,
        orderIds: cancelAll ? [] : orderIds,
        cancelAll,
      },
    };
  }

  const operation = /\bsell\b/.test(normalized) ? "sell" : "buy";
  if (!/\b(buy|sell|bet|order|trade)\b/.test(normalized)) return null;

  const outcome = normalized.match(/\b(yes|no)\b/)?.[1];
  const dollarAmount = text.match(/\$\s*(\d[\d,]*(?:\.\d+)?)/)?.[1];
  const usdcAmount = normalized.match(/(\d[\d,]*(?:\.\d+)?)\s*usdc\b/)?.[1];
  const amountUsdc = finitePositive(dollarAmount ?? usdcAmount);
  const amountShares = finitePositive(
    normalized.match(/\bsell\b\s+(\d[\d,]*(?:\.\d+)?)\s*(?:yes|no)?\s*shares?\b/)?.[1]
      ?? normalized.match(/\b(\d[\d,]*(?:\.\d+)?)\s*shares?\b/)?.[1],
  );
  const marketId = text.match(/\bmarket(?:\s+id)?\s*(?:=|:|#)?\s*([a-zA-Z0-9_-]{3,128})\b/i)?.[1]
    ?? text.match(/polymarket\.com\/(?:event|market)\/([a-zA-Z0-9_-]{3,128})/i)?.[1];
  if (
    !outcome
    || !marketId
    || (operation === "buy" && amountUsdc === null)
    || (operation === "sell" && amountShares === null)
  ) return null;

  const slippage = finitePositive(
    normalized.match(/\bslippage\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*%/)?.[1],
  );
  const commonDraft = {
    marketId,
    outcome: outcome === "yes" ? "Yes" : "No",
    slippageTolerance: Math.min(50, slippage ?? 2),
    orderIds: [] as [],
    cancelAll: false as const,
  };
  return operation === "buy"
    ? {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "polymarket",
        source: "composer-command",
        draft: {
          operation: "buy",
          ...commonDraft,
          amountUsdc: amountUsdc!,
          amountShares: null,
        },
      }
    : {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "polymarket",
        source: "composer-command",
        draft: {
          operation: "sell",
          ...commonDraft,
          amountUsdc: null,
          amountShares: amountShares!,
        },
      };
}

function bittensorCommand(text: string): ReviewedActionDraftHandoff | null {
  const normalized = text.toLowerCase();
  const operation = /\bunstake\b/.test(normalized)
    ? "unstake"
    : /\bstake\b/.test(normalized)
      ? "stake"
      : "transfer";
  if (operation === "transfer" && !/\b(send|transfer)\b/.test(normalized)) return null;

  const amount = normalized.match(
    /\b(?:send|transfer|stake|unstake)\b\s+(\d[\d,]*(?:\.\d+)?)\s*(?:tao)?\b/,
  )?.[1];
  const amountTao = finitePositive(amount);
  const destination = text.match(/\bto\s+([1-9A-HJ-NP-Za-km-z]{47,64})\b/)?.[1];
  const sender = text.match(/\bfrom\s+([1-9A-HJ-NP-Za-km-z]{47,64})\b/)?.[1] ?? null;
  const hotkey = text.match(/\b(?:to|from|validator|hotkey)\s+([1-9A-HJ-NP-Za-km-z]{47,64})\b/)?.[1];
  const netuidText = normalized.match(/\b(?:subnet|netuid)\s*(?:=|:|#)?\s*(\d{1,5})\b/)?.[1];
  const netuid = netuidText ? Number(netuidText) : null;
  if (amountTao === null) return null;
  if (operation === "transfer" && !destination) return null;
  if (operation !== "transfer" && (!hotkey || netuid === null || netuid > 65_535)) return null;

  return {
    version: "matterhorn.reviewed-action-handoff.v1",
    protocol: "bittensor",
    source: "composer-command",
    draft: operation === "transfer"
      ? {
          operation,
          sender,
          destination: destination!,
          hotkey: null,
          netuid: null,
          amountTao: String(amountTao),
        }
      : {
          operation,
          sender,
          destination: null,
          hotkey: hotkey!,
          netuid: netuid!,
          amountTao: String(amountTao),
        },
  };
}

function suiCommand(text: string): ReviewedActionDraftHandoff | null {
  const normalized = text.toLowerCase();
  if (!/\b(send|transfer)\b/.test(normalized)) return null;
  const network = requestedNetwork(normalized);
  const addressPattern = "0x[0-9a-fA-F]{1,64}";
  const sender = text.match(new RegExp(`\\bfrom\\s+(${addressPattern})\\b`, "i"))?.[1] ?? null;

  if (/\b(batch|many|multiple)\b/.test(normalized)) {
    const transfers: Array<{ recipient: string; amount: string }> = [];
    const pairPattern = new RegExp(`(?:\\bto\\s+)?(${addressPattern})\\s*(?:,|:|=|\\s)\\s*(\\d+(?:\\.\\d+)?)`, "gi");
    for (const match of text.matchAll(pairPattern)) {
      const amount = finitePositive(match[2]);
      if (amount !== null) transfers.push({ recipient: match[1], amount: String(amount) });
    }
    if (transfers.length < 2 || transfers.length > 16) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "composer-command",
      draft: {
        operation: "batch_transfer_sui",
        network,
        sender,
        recipient: null,
        amount: null,
        coinType: null,
        objectId: null,
        transfers,
      },
    };
  }

  const recipient = text.match(new RegExp(`\\bto\\s+(${addressPattern})\\b`, "i"))?.[1];
  if (!recipient) return null;

  if (/\b(object|nft)\b/.test(normalized)) {
    const objectId = text.match(new RegExp(`\\b(?:object|nft)\\s+(${addressPattern})\\b`, "i"))?.[1];
    if (!objectId) return null;
    return {
      version: "matterhorn.reviewed-action-handoff.v1",
      protocol: "sui",
      source: "composer-command",
      draft: {
        operation: "transfer_object",
        network,
        sender,
        recipient,
        amount: null,
        coinType: null,
        objectId,
        transfers: [],
      },
    };
  }

  const coinType = text.match(/(0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? null;
  const amountText = normalized.match(/\b(?:send|transfer)\b\s+(\d+(?:\.\d+)?)/)?.[1];
  const amount = finitePositive(amountText);
  if (amount === null) return null;
  return coinType
    ? {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "composer-command",
        draft: {
          operation: "transfer_coin",
          network,
          sender,
          recipient,
          amount: String(amount),
          coinType,
          objectId: null,
          transfers: [],
        },
      }
    : {
        version: "matterhorn.reviewed-action-handoff.v1",
        protocol: "sui",
        source: "composer-command",
        draft: {
          operation: "transfer_sui",
          network,
          sender,
          recipient,
          amount: String(amount),
          coinType: null,
          objectId: null,
          transfers: [],
        },
      };
}

export function reviewedActionHandoffFromComposer(
  text: string,
  deskId: MatterhornDeskAgentDeskId | null | undefined,
): ReviewedActionDraftHandoff | null {
  const protocol = commandProtocol(text.trim(), deskId);
  if (protocol === "hyperliquid") return hyperliquidCommand(text);
  if (protocol === "polymarket") return polymarketCommand(text);
  if (protocol === "bittensor") return bittensorCommand(text);
  if (protocol === "sui") return suiCommand(text);
  return null;
}
