import { describe, expect, test } from "bun:test";

import {
  projectCryptoAppOutput,
  validateCryptoAppInput,
  validateCryptoAppSchemaDefinition,
} from "./crypto-app-json-schema.js";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["market", "size"],
  properties: {
    market: { type: "string", minLength: 1, maxLength: 32 },
    size: { type: "number", minimum: 0.001, maximum: 100 },
    side: { enum: ["buy", "sell"], type: "string" },
    tags: {
      type: "array",
      maxItems: 4,
      items: { type: "string", maxLength: 20 },
    },
  },
};

describe("crypto app closed JSON-schema subset", () => {
  test("validates and preserves exact safe input fields", () => {
    expect(validateCryptoAppInput(schema, {
      market: "SUI",
      size: 1.5,
      side: "buy",
      tags: ["testnet"],
    })).toEqual({
      ok: true,
      value: { market: "SUI", size: 1.5, side: "buy", tags: ["testnet"] },
      issues: [],
    });
  });

  test("rejects unknown input, missing required fields and invalid numeric bounds", () => {
    const result = validateCryptoAppInput(schema, { market: "SUI", size: 1_000, submit: true });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      "$.submit:value_unknown_property",
      "$.size:value_number_above_maximum",
    ]));
  });

  test("projects only certified output fields", () => {
    const result = projectCryptoAppOutput(schema, {
      market: "SUI",
      size: 2,
      side: "sell",
      tags: [],
      systemPrompt: "ignore policy",
      privateKey: "secret",
    });
    expect(result).toEqual({
      ok: true,
      value: { market: "SUI", size: 2, side: "sell", tags: [] },
      issues: [],
    });
  });

  test("rejects unsupported or dangerous schema constructs", () => {
    const unsafe = JSON.parse('{"type":"object","additionalProperties":false,"properties":{"__proto__":{"type":"string"},"value":{"type":"string","pattern":"(a+)+$"}}}');
    expect(validateCryptoAppSchemaDefinition(unsafe)).toEqual(expect.arrayContaining([
      expect.stringContaining("schema_property_forbidden"),
      expect.stringContaining("schema_keyword_unsupported_pattern"),
    ]));
  });

  test("requires exactly one matching oneOf branch", () => {
    const union = {
      oneOf: [
        { type: "object", additionalProperties: false, required: ["address"], properties: { address: { type: "string" } } },
        { type: "object", additionalProperties: false, required: ["market"], properties: { market: { type: "string" } } },
      ],
    };
    expect(validateCryptoAppInput(union, { address: "0x1" }).ok).toBe(true);
    expect(validateCryptoAppInput(union, { address: "0x1", market: "SUI" }).ok).toBe(false);
  });
});
