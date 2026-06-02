import assert from "node:assert/strict";

const { shouldInjectCryptoPrompt, buildCryptoSystemPrompt } = await import(
  "../src/react-app/domains/wallet/prompts/crypto-system-prompt.ts"
);

const results = {
  ok: true,
  steps: [] as Array<Record<string, unknown>>,
};

function step(name: string, fn: () => void) {
  results.steps.push({ name, status: "running" });
  const index = results.steps.length - 1;

  try {
    fn();
    results.steps[index] = { name, status: "ok" };
  } catch (error) {
    results.ok = false;
    results.steps[index] = {
      name,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }
}

// Test cases for keyword detection
const keywordTests = [
  { msg: "What crypto should I buy today?", expected: true },
  { msg: "Show me Hyperliquid ETH funding rates", expected: true },
  { msg: "What's the weather like?", expected: false },
  { msg: "Write me a Python script", expected: false },
  { msg: "Where's the best yield on Base?", expected: true },
  { msg: "What are Polymarket crypto predictions?", expected: true },
  { msg: "Can you show me my wallet balance?", expected: true },
  { msg: "I want to trade ETH perp", expected: true },
  { msg: "How do I install npm?", expected: false },
  { msg: "Is USDC a good stablecoin?", expected: true },
  { msg: "Explain DeFi to me", expected: true },
  { msg: "Book me a flight to Paris", expected: false },
];

// Test cases for prompt content (using a sample prompt with nulls)
const samplePrompt = buildCryptoSystemPrompt(null, null, null, null);

const promptTests = [
  { check: (p: string) => p.includes("wallet_getBalance"), label: "has wallet_getBalance" },
  { check: (p: string) => p.includes("crypto_getPrices"), label: "has crypto_getPrices" },
  { check: (p: string) => p.includes("hl_getFundingRates"), label: "has hl_getFundingRates" },
  { check: (p: string) => p.includes("pm_searchEvents"), label: "has pm_searchEvents" },
  { check: (p: string) => p.includes("NEVER"), label: "has safety rules with NEVER" },
];

try {
  let passed = 0;
  let failed = 0;

  for (const { msg, expected } of keywordTests) {
    const actual = shouldInjectCryptoPrompt(msg);
    if (actual === expected) {
      passed += 1;
    } else {
      failed += 1;
      console.error(`FAIL keyword: "${msg}" expected=${String(expected)} got=${String(actual)}`);
    }
  }

  for (const { check, label } of promptTests) {
    if (check(samplePrompt)) {
      passed += 1;
    } else {
      failed += 1;
      console.error(`FAIL prompt: ${label}`);
    }
  }

  // Step tests (assert style)
  step("keyword detection count matches expected", () => {
    assert.equal(failed, 0, `${failed} keyword/prompt checks failed`);
  });

  step("prompt includes step-by-step reasoning for swaps", () => {
    const p = samplePrompt.toLowerCase();
    assert.ok(p.includes("step"), "expected step references");
    assert.ok(p.includes("swap"), "expected swap references");
  });

  step("prompt warns about simulation before signing", () => {
    const p = samplePrompt.toLowerCase();
    assert.ok(p.includes("simulate"), "expected simulation warning");
    assert.ok(p.includes("sign"), "expected signing context");
  });

  step("prompt includes error handling guidance", () => {
    const p = samplePrompt.toLowerCase();
    assert.ok(p.includes("error handling"), "expected error handling section");
    assert.ok(p.includes("api call fails") || p.includes("fails"), "expected API failure guidance");
  });

  step("prompt tells agent to NEVER guess or fabricate data", () => {
    const p = samplePrompt.toLowerCase();
    assert.ok(p.includes("never guess"), "expected NEVER guess instruction");
    assert.ok(p.includes("fabricate"), "expected fabricate warning");
  });

  step("prompt includes wallet address and balances when connected", () => {
    const withWallet = buildCryptoSystemPrompt("0x1234", 1, "1.5", "1000");
    assert.ok(withWallet.includes("0x1234"), "expected wallet address");
    assert.ok(withWallet.includes("1.5"), "expected ETH balance");
    assert.ok(withWallet.includes("1000"), "expected USDC balance");
    assert.ok(withWallet.includes("Chain ID: 1"), "expected chain ID");
  });

  console.log(`\nKeyword+Prompt checks: ${passed} passed, ${failed} failed`);
  console.log(`Quality steps: ${results.steps.filter((s) => s.status === "ok").length} passed`);

  if (failed > 0 || !results.ok) {
    throw new Error("Some tests failed.");
  }

  console.log("\nALL TESTS PASSED");
} catch (error) {
  results.ok = false;
  console.error(
    JSON.stringify(
      {
        ...results,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
