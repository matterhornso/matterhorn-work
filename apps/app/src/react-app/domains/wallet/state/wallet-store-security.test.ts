import { describe, expect, test } from "bun:test";
import { computeTxValueUSD, parseTxValueWei } from "./wallet-store";

describe("wallet transaction value parsing", () => {
  test("treats raw integer strings as wei, not decimal ETH", () => {
    expect(parseTxValueWei("1000000000000000000")).toBe(1_000_000_000_000_000_000n);
    expect(computeTxValueUSD("1000000000000000000")).toBe(2000);
  });

  test("supports hex wei and decimal ETH for manual requests", () => {
    expect(parseTxValueWei("0xde0b6b3a7640000")).toBe(1_000_000_000_000_000_000n);
    expect(parseTxValueWei("0.01")).toBe(10_000_000_000_000_000n);
    expect(computeTxValueUSD("0.01")).toBe(20);
  });

  test("rejects malformed values before wallet submission", () => {
    expect(() => parseTxValueWei("-1")).toThrow("Transaction value must be hex wei, raw wei, or decimal ETH");
    expect(() => parseTxValueWei("not-a-number")).toThrow("Transaction value must be hex wei, raw wei, or decimal ETH");
  });
});
