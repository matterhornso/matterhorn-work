#!/usr/bin/env bun
/**
 * Simulate Agent Conversation Flow
 * Tests the system prompt + tool invocation logic without running the full app.
 * This validates that the agent would follow the reasoning chains correctly.
 */

import {
  shouldInjectCryptoPrompt,
  buildCryptoSystemPrompt,
} from "../apps/app/src/react-app/domains/wallet/prompts/crypto-system-prompt";

// ============================================================
// Simulate LLM behavior with the crypto prompt
// ============================================================

interface SimulatedMessage {
  role: "user" | "assistant";
  content: string;
}

interface SimulatedToolCall {
  tool: string;
  args: Record<string, unknown>;
}

function simulateAgentResponse(
  userMessage: string,
  walletConnected: boolean,
  walletAddress: string | null,
  chainId: number | null,
): { response: string; tools: SimulatedToolCall[]; promptInjected: boolean } {
  const promptInjected = walletConnected && shouldInjectCryptoPrompt(userMessage);

  const tools: SimulatedToolCall[] = [];
  let response = "";

  if (!promptInjected) {
    return {
      response: "I don't see any crypto context here. How can I help?",
      tools: [],
      promptInjected: false,
    };
  }

  // Simulate reasoning based on keywords
  const msg = userMessage.toLowerCase();

  // Order matters: specific keywords first, then general
  if (msg.includes("funding") || msg.includes("perp")) {
    tools.push({
      tool: "hl_getFundingRates",
      args: { symbol: "ETH" },
    });
    response = "ETH funding rate: 0.00125% (mark: $1,978.5, OI: $680M). Positive rate = longs pay shorts.";
  } else if (msg.includes("prediction") || msg.includes("polymarket")) {
    tools.push({
      tool: "pm_searchEvents",
      args: { query: "crypto", limit: 5 },
    });
    response = "Polymarket crypto markets: 'BTC above $100K by end of year?' YES 67% / NO 33%, vol $12M.";
  } else if (msg.includes("yield") || msg.includes("apy") || msg.includes("defi")) {
    tools.push({
      tool: "crypto_getYields",
      args: { chain: "Base", limit: 5 },
    });
    response = "Top yields on Base: Aave USDC 4.2% APY, Morpho ETH 3.8% APY, Uniswap ETH-USDC 8.5% APY.";
  } else if (msg.includes("send") || msg.includes("transfer")) {
    tools.push({ tool: "wallet_getBalance", args: { address: walletAddress, chainId } });
    response = "I'll check your balance first, then verify the transaction details before you approve.";
  } else if (msg.includes("balance") || msg.includes("wallet")) {
    tools.push({
      tool: "wallet_getBalance",
      args: { address: walletAddress, chainId },
    });
    response = `You have ~0.01 ETH and 0 USDC on Base Sepolia (address: ${walletAddress}).`;
  } else if (msg.includes("price") && !msg.includes("eth perp")) {
    tools.push({
      tool: "crypto_getPrices",
      args: { ids: ["ethereum", "bitcoin"] },
    });
    response = "ETH is ~$1,975 (+2.3% 24h), BTC is ~$69,500 (+1.1% 24h).";
  } else if (msg.includes("swap") || msg.includes("buy") || msg.includes("sell")) {
    // Full reasoning chain
    tools.push({ tool: "wallet_getBalance", args: { address: walletAddress, chainId } });
    tools.push({ tool: "crypto_getPrices", args: { ids: ["ethereum"] } });

    if (!process.env.ONE_INCH_API_KEY) {
      response = "I need a 1inch API key to build swaps. Get one free at portal.1inch.dev and set ONE_INCH_API_KEY.";
    } else {
      tools.push({
        tool: "crypto_buildSwap",
        args: { chainId, fromToken: "WETH", toToken: "USDC", amount: "1000000000000000", fromAddress: walletAddress, slippage: 1 },
      });
      response = "Building swap: 0.001 ETH → ~1.97 USDC. I'll simulate first to verify it won't revert.";
    }
  } else {
    response = "I can help with crypto research and on-chain actions. What would you like to know?";
  }

  return { response, tools, promptInjected };
}

// ============================================================
// Test scenarios
// ============================================================

const scenarios = [
  {
    name: "Balance inquiry",
    message: "What's my ETH balance?",
    walletConnected: true,
    expectedTools: ["wallet_getBalance"],
    expectedResponseIncludes: "ETH",
  },
  {
    name: "Price research",
    message: "What's the current price of ETH?",
    walletConnected: true,
    expectedTools: ["crypto_getPrices"],
    expectedResponseIncludes: "$",
  },
  {
    name: "Yield research",
    message: "Where's the best yield on Base?",
    walletConnected: true,
    expectedTools: ["crypto_getYields"],
    expectedResponseIncludes: "APY",
  },
  {
    name: "Hyperliquid funding",
    message: "Show me ETH perp funding rates on Hyperliquid",
    walletConnected: true,
    expectedTools: ["hl_getFundingRates"],
    expectedResponseIncludes: "funding",
  },
  {
    name: "Polymarket research",
    message: "What crypto prediction markets exist on Polymarket?",
    walletConnected: true,
    expectedTools: ["pm_searchEvents"],
    expectedResponseIncludes: "Polymarket",
  },
  {
    name: "Swap proposal (no API key)",
    message: "I want to swap 0.001 ETH to USDC",
    walletConnected: true,
    expectedTools: ["wallet_getBalance", "crypto_getPrices"],
    expectedResponseIncludes: "1inch API key",
  },
  {
    name: "Non-crypto message",
    message: "What's the weather today?",
    walletConnected: true,
    expectedTools: [],
    expectedResponseIncludes: "crypto context",
  },
  {
    name: "Wallet not connected",
    message: "What's my ETH balance?",
    walletConnected: false,
    expectedTools: [],
    expectedResponseIncludes: "crypto context",
  },
  {
    name: "Mainnet warning context",
    message: "Send 0.01 ETH to 0x123",
    walletConnected: true,
    expectedTools: ["wallet_getBalance"],
    expectedResponseIncludes: "balance",
  },
];

// ============================================================
// Run tests
// ============================================================

let PASS = 0;
let FAIL = 0;

function green(s: string) { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string) { return `\x1b[31m${s}\x1b[0m`; }

console.log("");
console.log("========================================");
console.log("  Simulated Agent Conversation Tests");
console.log("========================================");
console.log("");

for (const scenario of scenarios) {
  process.stdout.write(`  ${scenario.name.padEnd(50)} `);

  const result = simulateAgentResponse(
    scenario.message,
    scenario.walletConnected,
    "0x0000000000000000000000000000000000000000",
    84532,
  );

  const toolsMatch =
    scenario.expectedTools.length === result.tools.length &&
    scenario.expectedTools.every((t, i) => result.tools[i]?.tool === t);

  const responseMatch = result.response.includes(scenario.expectedResponseIncludes);

  if (toolsMatch && responseMatch) {
    console.log(green("PASS"));
    PASS++;
  } else {
    console.log(red("FAIL"));
    FAIL++;
    if (!toolsMatch) {
      console.log(`    Expected tools: ${scenario.expectedTools.join(", ")}`);
      console.log(`    Actual tools:   ${result.tools.map((t) => t.tool).join(", ") || "none"}`);
    }
    if (!responseMatch) {
      console.log(`    Expected response to include: "${scenario.expectedResponseIncludes}"`);
      console.log(`    Actual response: "${result.response.slice(0, 80)}..."`);
    }
  }
}

// ============================================================
// Prompt quality checks
// ============================================================
console.log("");
console.log("[Prompt Quality Checks]");

const prompt = buildCryptoSystemPrompt("0x0000", 84532, "0.01", "0");

const qualityChecks = [
  { check: prompt.includes("wallet_getBalance"), label: "has wallet_getBalance" },
  { check: prompt.includes("crypto_getPrices"), label: "has crypto_getPrices" },
  { check: prompt.includes("hl_getFundingRates"), label: "has hl_getFundingRates" },
  { check: prompt.includes("pm_searchEvents"), label: "has pm_searchEvents" },
  { check: prompt.includes("NEVER"), label: "has safety NEVER rules" },
  { check: prompt.includes("step-by-step"), label: "has step-by-step reasoning" },
  { check: prompt.includes("simulate"), label: "mentions simulation" },
  { check: prompt.includes("Chain ID:"), label: "mentions chain context" },
];

for (const { check, label } of qualityChecks) {
  process.stdout.write(`  ${label.padEnd(50)} `);
  if (check) { console.log(green("PASS")); PASS++; }
  else { console.log(red("FAIL")); FAIL++; }
}

// ============================================================
// Summary
// ============================================================
console.log("");
console.log("========================================");
console.log(`  PASS: ${PASS}  FAIL: ${FAIL}`);
console.log("========================================");

if (FAIL === 0) {
  console.log(green("ALL SIMULATED CONVERSATION TESTS PASSED"));
  console.log("");
  console.log("Note: These are simulated tests. For true validation, run the");
  console.log("Matterhorn Desks app and test with a real LLM session.");
  process.exit(0);
} else {
  console.log(red("SOME TESTS FAILED"));
  process.exit(1);
}
