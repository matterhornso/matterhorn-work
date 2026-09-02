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
      expect.stringContaining("schema_keyword_unsupported"),
    ]));
  });

  test("rejects ambiguous or unsafe schema metadata without echoing it", () => {
    const secret = "sk-this-is-a-fake-token-1234567890";
    const injectedKeyword = `prompt\n${secret}`;
    const cases = [
      { type: "string", description: "x".repeat(501) },
      { type: "string", description: `public result\n${secret}` },
      { type: "string", enum: ["safe", secret] },
      { type: "string", enum: ["safe", "safe"] },
      { type: "integer", const: "1" },
      { type: "string", const: { hidden: true } },
      { oneOf: [{ type: "string" }], type: "string" },
      { type: "array", minItems: 2, maxItems: 1, items: { type: "string" } },
      { type: "string", minLength: 2, maxLength: 1 },
      { type: "number", minimum: 2, maximum: 1 },
      {
        type: "string",
        properties: { privateKey: { type: "string" } },
        additionalProperties: false,
      },
      { type: "string", [injectedKeyword]: true },
    ];
    const issues = cases.flatMap((candidate) => validateCryptoAppSchemaDefinition(candidate));
    expect(issues).toEqual(expect.arrayContaining([
      "$:schema_description_invalid",
      "$:schema_enum_invalid",
      "$:schema_const_invalid",
      "$:schema_one_of_sibling_unsupported",
      "$:schema_item_bounds_invalid",
      "$:schema_string_bounds_invalid",
      "$:schema_numeric_bounds_invalid",
      "$:schema_keyword_inapplicable",
      "$:schema_keyword_unsupported",
    ]));
    expect(JSON.stringify(issues)).not.toContain(secret);
    expect(JSON.stringify(issues)).not.toContain(injectedKeyword);
  });

  test("redacts unknown input field names and ignores inherited values", () => {
    const attackerField = `secret\n${"x".repeat(70)}`;
    const unknown = validateCryptoAppInput(schema, {
      market: "SUI",
      size: 1,
      [attackerField]: "must-not-echo",
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.issues).toContain("$.*:value_unknown_property");
    expect(JSON.stringify(unknown)).not.toContain(attackerField);
    expect(JSON.stringify(unknown)).not.toContain("must-not-echo");

    const inherited = Object.create({ market: "SUI" }) as Record<string, unknown>;
    inherited.size = 1;
    const inheritedResult = validateCryptoAppInput(schema, inherited);
    expect(inheritedResult.ok).toBe(false);
    expect(inheritedResult.issues).toContain("$.market:value_required");
  });

  test("rejects secret and execution-authority properties at every schema depth", () => {
    const unsafe = {
      type: "object",
      additionalProperties: false,
      properties: {
        publicEvidence: {
          type: "object",
          additionalProperties: false,
          properties: {
            private_key: { type: "string" },
            actions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  submitTransaction: { type: "boolean" },
                  rawSignature: { type: "string" },
                },
              },
            },
          },
        },
      },
    };
    expect(validateCryptoAppSchemaDefinition(unsafe)).toEqual(expect.arrayContaining([
      expect.stringContaining("$.publicEvidence.private_key:schema_property_sensitive_forbidden"),
      expect.stringContaining("$.publicEvidence.actions[].submitTransaction:schema_property_execution_authority_forbidden"),
      expect.stringContaining("$.publicEvidence.actions[].rawSignature:schema_property_sensitive_forbidden"),
    ]));
    const projected = projectCryptoAppOutput(unsafe, {
      publicEvidence: {
        private_key: "must-not-project",
        actions: [{ submitTransaction: true, rawSignature: "must-not-project" }],
      },
    });
    expect(projected.ok).toBe(false);
    expect(projected.value).toBeNull();
    expect(JSON.stringify(projected)).not.toContain("must-not-project");
  });

  test("rejects composite authority names without blocking public crypto identifiers", () => {
    const unsafe = {
      type: "object",
      additionalProperties: false,
      properties: {
        providerApiKey: { type: "string" },
        exchangeCredentialValue: { type: "string" },
        signedOrder: { type: "string" },
        executeTransaction: { type: "boolean" },
        placeOrder: { type: "boolean" },
      },
    };
    expect(validateCryptoAppSchemaDefinition(unsafe)).toEqual(expect.arrayContaining([
      "$.providerApiKey:schema_property_sensitive_forbidden",
      "$.exchangeCredentialValue:schema_property_sensitive_forbidden",
      "$.signedOrder:schema_property_sensitive_forbidden",
      "$.executeTransaction:schema_property_execution_authority_forbidden",
      "$.placeOrder:schema_property_execution_authority_forbidden",
    ]));

    const publicIdentifiers = {
      type: "object",
      additionalProperties: false,
      properties: {
        tokenId: { type: "string" },
        outcomeTokens: { type: "array", items: { type: "string" } },
        hotkey: { type: "string" },
        signer: { type: "string" },
        transactionHash: { type: "string" },
      },
    };
    expect(validateCryptoAppSchemaDefinition(publicIdentifiers)).toEqual([]);
  });

  test("rejects non-ASCII, confusable, and unbounded property names without echoing them", () => {
    const unsafe = {
      type: "object",
      additionalProperties: false,
      properties: {
        "privаteKey": { type: "string" },
        "destination.address": { type: "string" },
        ["a".repeat(65)]: { type: "string" },
      },
    };
    const issues = validateCryptoAppSchemaDefinition(unsafe);
    expect(issues).toContain("$.*:schema_property_name_invalid");
    expect(JSON.stringify(issues)).not.toContain("privаteKey");
    expect(JSON.stringify(issues)).not.toContain("destination.address");
    expect(JSON.stringify(issues)).not.toContain("a".repeat(65));
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

  test("fails closed when a schema exceeds the total traversal budget", () => {
    const properties: Record<string, unknown> = {};
    for (let group = 0; group < 200; group += 1) {
      const nestedProperties: Record<string, unknown> = {};
      for (let field = 0; field < 6; field += 1) {
        nestedProperties[`field${field}`] = { type: "integer" };
      }
      properties[`group${group}`] = {
        type: "object",
        additionalProperties: false,
        properties: nestedProperties,
      };
    }
    expect(validateCryptoAppSchemaDefinition({
      type: "object",
      additionalProperties: false,
      properties,
    })).toContain("$:schema_node_budget_exceeded");
  });

  test("fails closed when runtime projection exceeds its total traversal budget", () => {
    const nestedArraySchema = {
      type: "array",
      maxItems: 1_000,
      items: {
        type: "array",
        maxItems: 1_000,
        items: { type: "integer" },
      },
    };
    const result = projectCryptoAppOutput(
      nestedArraySchema,
      Array.from({ length: 101 }, () => Array.from({ length: 101 }, () => 1)),
    );
    expect(result).toEqual({
      ok: false,
      value: null,
      issues: ["$:value_node_budget_exceeded"],
    });
  });

  test("rejects oversized input objects before scanning attacker-controlled fields", () => {
    const oversized = Object.fromEntries(
      Array.from({ length: 201 }, (_, index) => [`unknown${index}`, index]),
    );
    const result = validateCryptoAppInput(schema, oversized);
    expect(result).toEqual({
      ok: false,
      value: null,
      issues: ["$:value_object_properties_exceeded"],
    });
  });
});
