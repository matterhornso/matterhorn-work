type JsonSchema = Record<string, unknown>;

export type CryptoAppSchemaResult<T = unknown> = {
  ok: boolean;
  value: T | null;
  issues: string[];
};

const MAX_SCHEMA_DEPTH = 8;
const MAX_SCHEMA_NODES = 1_024;
const MAX_VALUE_NODES = 10_000;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_OBJECT_PROPERTIES = 200;
const MAX_STRING_CHARS = 100_000;
const MAX_SCHEMA_DESCRIPTION_CHARS = 500;
const MAX_SCHEMA_LITERAL_STRING_CHARS = 1_024;
const SAFE_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const SAFE_KEYS = new Set([
  "type", "description", "properties", "required", "additionalProperties", "items", "enum", "const",
  "minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems", "oneOf",
]);
const KEYS_BY_TYPE: Readonly<Record<string, ReadonlySet<string>>> = {
  object: new Set(["type", "description", "properties", "required", "additionalProperties"]),
  array: new Set(["type", "description", "items", "minItems", "maxItems"]),
  string: new Set(["type", "description", "enum", "const", "minLength", "maxLength"]),
  number: new Set(["type", "description", "enum", "const", "minimum", "maximum"]),
  integer: new Set(["type", "description", "enum", "const", "minimum", "maximum"]),
  boolean: new Set(["type", "description", "enum", "const"]),
  null: new Set(["type", "description", "enum", "const"]),
};
const UNSAFE_PROPERTY_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_PROPERTY_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const SENSITIVE_PROPERTY_KEYS = new Set([
  "accesstoken",
  "apikey",
  "apisecret",
  "authorization",
  "bearer",
  "capability",
  "capabilitytoken",
  "clientsecret",
  "credential",
  "credentials",
  "jwt",
  "mnemonic",
  "passphrase",
  "password",
  "privatekey",
  "rawsignature",
  "recoveryphrase",
  "refreshtoken",
  "secret",
  "secretkey",
  "seed",
  "seedphrase",
  "signature",
  "signedpayload",
  "signedtransaction",
  "signingpayload",
  "transactionbytes",
  "txbytes",
  "walletexport",
  "walletsignature",
]);
const EXECUTION_AUTHORITY_PROPERTY_KEYS = new Set([
  "broadcast",
  "broadcasttransaction",
  "relay",
  "relaytransaction",
  "sendtransaction",
  "sign",
  "signtransaction",
  "submit",
  "submittransaction",
]);
const SENSITIVE_PROPERTY_TOKENS = new Set([
  "authorization", "bearer", "capability", "credential", "credentials", "jwt", "mnemonic",
  "passphrase", "password", "secret", "signature", "suri",
]);
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const EMBEDDED_SECRET_LITERAL = /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bgh[ps]_[A-Za-z0-9]{20,}\b|\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b|\bsk-[A-Za-z0-9_-]{20,}\b|\bBearer\s+[A-Za-z0-9._-]{8,}\b/i;

type TraversalBudget = {
  nodes: number;
  exceeded: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaAt(value: unknown): JsonSchema | null {
  return isRecord(value) ? value : null;
}

function pathIssue(path: string, code: string): string {
  return `${path || "$"}:${code}`;
}

function consumeTraversalNode(
  budget: TraversalBudget,
  maximum: number,
  issueCode: string,
  issues: string[],
): boolean {
  if (budget.exceeded) {
    issues.push(pathIssue("$", issueCode));
    return false;
  }
  budget.nodes += 1;
  if (budget.nodes > maximum) {
    budget.exceeded = true;
    issues.push(pathIssue("$", issueCode));
    return false;
  }
  return true;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeChildPath(path: string, key: string): string {
  return SAFE_PROPERTY_KEY.test(key) ? `${path}.${key}` : `${path}.*`;
}

function validSchemaLiteral(value: unknown): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string"
    && value.length <= MAX_SCHEMA_LITERAL_STRING_CHARS
    && !CONTROL_CHARACTER.test(value)
    && !EMBEDDED_SECRET_LITERAL.test(value);
}

function literalMatchesType(type: unknown, value: unknown): boolean {
  if (type === "null") return value === null;
  if (type === "boolean") return typeof value === "boolean";
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return false;
}

function normalizedPropertyKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function propertyKeyTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .split(/[_-]+/)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
}

function hasTokenPair(tokens: readonly string[], first: string, second: string): boolean {
  return tokens.some((token, index) => token === first && tokens[index + 1] === second);
}

function hasSensitivePropertySemantics(key: string): boolean {
  const tokens = propertyKeyTokens(key);
  if (tokens.some((token) => SENSITIVE_PROPERTY_TOKENS.has(token))) return true;
  return hasTokenPair(tokens, "api", "key")
    || hasTokenPair(tokens, "api", "secret")
    || hasTokenPair(tokens, "access", "token")
    || hasTokenPair(tokens, "refresh", "token")
    || hasTokenPair(tokens, "session", "token")
    || hasTokenPair(tokens, "client", "secret")
    || hasTokenPair(tokens, "private", "key")
    || hasTokenPair(tokens, "secret", "key")
    || hasTokenPair(tokens, "seed", "phrase")
    || hasTokenPair(tokens, "seed", "words")
    || hasTokenPair(tokens, "recovery", "phrase")
    || hasTokenPair(tokens, "wallet", "export")
    || hasTokenPair(tokens, "wallet", "signature")
    || hasTokenPair(tokens, "wallet", "credential")
    || hasTokenPair(tokens, "raw", "signature")
    || hasTokenPair(tokens, "signed", "payload")
    || hasTokenPair(tokens, "signed", "transaction")
    || hasTokenPair(tokens, "signed", "order")
    || hasTokenPair(tokens, "signed", "message")
    || hasTokenPair(tokens, "signing", "payload")
    || hasTokenPair(tokens, "transaction", "bytes")
    || hasTokenPair(tokens, "tx", "bytes");
}

function hasExecutionAuthoritySemantics(key: string): boolean {
  const tokens = propertyKeyTokens(key);
  if (tokens.some((token) => ["sign", "submit", "relay", "broadcast"].includes(token))) return true;
  return hasTokenPair(tokens, "send", "transaction")
    || hasTokenPair(tokens, "execute", "transaction")
    || hasTokenPair(tokens, "execute", "order")
    || hasTokenPair(tokens, "place", "order")
    || hasTokenPair(tokens, "cancel", "order");
}

function inspectPropertyKey(key: string, path: string, issues: string[]): void {
  if (UNSAFE_PROPERTY_KEYS.has(key)) {
    issues.push(pathIssue(path, "schema_property_forbidden"));
    return;
  }
  if (!SAFE_PROPERTY_KEY.test(key)) {
    issues.push(pathIssue(path, "schema_property_name_invalid"));
    return;
  }
  const normalized = normalizedPropertyKey(key);
  if (SENSITIVE_PROPERTY_KEYS.has(normalized) || hasSensitivePropertySemantics(key)) {
    issues.push(pathIssue(path, "schema_property_sensitive_forbidden"));
  }
  if (EXECUTION_AUTHORITY_PROPERTY_KEYS.has(normalized) || hasExecutionAuthoritySemantics(key)) {
    issues.push(pathIssue(path, "schema_property_execution_authority_forbidden"));
  }
}

export function validateCryptoAppSchemaDefinition(schema: JsonSchema): string[] {
  const issues: string[] = [];
  const budget: TraversalBudget = { nodes: 0, exceeded: false };
  inspectSchema(schema, "$", 0, issues, budget);
  return [...new Set(issues)];
}

function inspectSchema(
  schema: JsonSchema,
  path: string,
  depth: number,
  issues: string[],
  budget: TraversalBudget,
): void {
  if (!consumeTraversalNode(budget, MAX_SCHEMA_NODES, "schema_node_budget_exceeded", issues)) return;
  if (depth > MAX_SCHEMA_DEPTH) {
    issues.push(pathIssue(path, "schema_depth_exceeded"));
    return;
  }
  const schemaKeys = Object.keys(schema);
  if (schemaKeys.length > SAFE_KEYS.size) {
    issues.push(pathIssue(path, "schema_keyword_unsupported"));
    return;
  }
  for (const key of schemaKeys) {
    if (!SAFE_KEYS.has(key)) issues.push(pathIssue(path, "schema_keyword_unsupported"));
  }
  if (schema.description !== undefined
    && (typeof schema.description !== "string"
      || schema.description.length > MAX_SCHEMA_DESCRIPTION_CHARS
      || CONTROL_CHARACTER.test(schema.description)
      || EMBEDDED_SECRET_LITERAL.test(schema.description))) {
    issues.push(pathIssue(path, "schema_description_invalid"));
  }
  if (Array.isArray(schema.oneOf)) {
    if (schema.oneOf.length < 1 || schema.oneOf.length > 8) issues.push(pathIssue(path, "schema_one_of_invalid"));
    if (schemaKeys.some((key) => key !== "oneOf" && key !== "description")) {
      issues.push(pathIssue(path, "schema_one_of_sibling_unsupported"));
    }
    for (const [index, option] of schema.oneOf.entries()) {
      const nested = schemaAt(option);
      if (!nested) issues.push(pathIssue(`${path}.oneOf[${index}]`, "schema_not_object"));
      else inspectSchema(nested, `${path}.oneOf[${index}]`, depth + 1, issues, budget);
      if (budget.exceeded) break;
    }
    return;
  }
  if (typeof schema.type !== "string" || !SAFE_TYPES.has(schema.type)) {
    issues.push(pathIssue(path, "schema_type_invalid"));
    return;
  }
  const applicableKeys = KEYS_BY_TYPE[schema.type];
  if (applicableKeys && schemaKeys.some((key) => SAFE_KEYS.has(key) && !applicableKeys.has(key))) {
    issues.push(pathIssue(path, "schema_keyword_inapplicable"));
  }
  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum)
      || schema.enum.length < 1
      || schema.enum.length > 100
      || schema.enum.some((value) => !validSchemaLiteral(value) || !literalMatchesType(schema.type, value))
      || new Set(schema.enum.map((value) => `${typeof value}:${String(value)}`)).size !== schema.enum.length) {
      issues.push(pathIssue(path, "schema_enum_invalid"));
    }
  }
  if (schema.const !== undefined
    && (!validSchemaLiteral(schema.const) || !literalMatchesType(schema.type, schema.const))) {
    issues.push(pathIssue(path, "schema_const_invalid"));
  }
  if (schema.type === "object") {
    if (schema.additionalProperties !== false) issues.push(pathIssue(path, "schema_object_must_be_closed"));
    if (schema.properties !== undefined && !isRecord(schema.properties)) {
      issues.push(pathIssue(path, "schema_properties_invalid"));
      return;
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const propertyKeys = Object.keys(properties);
    if (propertyKeys.length > MAX_OBJECT_PROPERTIES) {
      issues.push(pathIssue(path, "schema_properties_exceeded"));
      return;
    }
    for (const key of propertyKeys) {
      const nestedPath = safeChildPath(path, key);
      inspectPropertyKey(key, nestedPath, issues);
      const nested = schemaAt(properties[key]);
      if (!nested) issues.push(pathIssue(nestedPath, "schema_not_object"));
      else inspectSchema(nested, nestedPath, depth + 1, issues, budget);
      if (budget.exceeded) break;
    }
    if (schema.required !== undefined
      && (!Array.isArray(schema.required)
        || schema.required.some((key) => typeof key !== "string" || !propertyKeys.includes(key))
        || new Set(schema.required).size !== schema.required.length)) {
      issues.push(pathIssue(path, "schema_required_invalid"));
    }
  }
  if (schema.type === "array") {
    const items = schemaAt(schema.items);
    if (!items) issues.push(pathIssue(path, "schema_items_required"));
    else inspectSchema(items, `${path}[]`, depth + 1, issues, budget);
    for (const key of ["minItems", "maxItems"] as const) {
      if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || Number(schema[key]) < 0)) {
        issues.push(pathIssue(path, `schema_${key}_invalid`));
      }
    }
    if (typeof schema.maxItems === "number" && schema.maxItems > MAX_ARRAY_ITEMS) {
      issues.push(pathIssue(path, "schema_max_items_exceeded"));
    }
    if (typeof schema.minItems === "number"
      && typeof schema.maxItems === "number"
      && schema.minItems > schema.maxItems) {
      issues.push(pathIssue(path, "schema_item_bounds_invalid"));
    }
  }
  if (schema.type === "string") {
    for (const key of ["minLength", "maxLength"] as const) {
      if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || Number(schema[key]) < 0)) {
        issues.push(pathIssue(path, `schema_${key}_invalid`));
      }
    }
    if (typeof schema.maxLength === "number" && schema.maxLength > MAX_STRING_CHARS) {
      issues.push(pathIssue(path, "schema_max_length_exceeded"));
    }
    if (typeof schema.minLength === "number"
      && typeof schema.maxLength === "number"
      && schema.minLength > schema.maxLength) {
      issues.push(pathIssue(path, "schema_string_bounds_invalid"));
    }
  }
  if (schema.type === "number" || schema.type === "integer") {
    for (const key of ["minimum", "maximum"] as const) {
      if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))) {
        issues.push(pathIssue(path, `schema_${key}_invalid`));
      }
    }
    if (typeof schema.minimum === "number"
      && typeof schema.maximum === "number"
      && schema.minimum > schema.maximum) {
      issues.push(pathIssue(path, "schema_numeric_bounds_invalid"));
    }
  }
}

export function validateCryptoAppInput(schema: JsonSchema, value: unknown): CryptoAppSchemaResult {
  const definitionIssues = validateCryptoAppSchemaDefinition(schema);
  if (definitionIssues.length) return { ok: false, value: null, issues: definitionIssues };
  const issues: string[] = [];
  const budget: TraversalBudget = { nodes: 0, exceeded: false };
  const projected = evaluate(schema, value, "$", 0, "input", issues, budget);
  const uniqueIssues = [...new Set(issues)];
  return { ok: uniqueIssues.length === 0, value: uniqueIssues.length === 0 ? projected : null, issues: uniqueIssues };
}

export function projectCryptoAppOutput(schema: JsonSchema, value: unknown): CryptoAppSchemaResult {
  const definitionIssues = validateCryptoAppSchemaDefinition(schema);
  if (definitionIssues.length) return { ok: false, value: null, issues: definitionIssues };
  const issues: string[] = [];
  const budget: TraversalBudget = { nodes: 0, exceeded: false };
  const projected = evaluate(schema, value, "$", 0, "output", issues, budget);
  const uniqueIssues = [...new Set(issues)];
  return { ok: uniqueIssues.length === 0, value: uniqueIssues.length === 0 ? projected : null, issues: uniqueIssues };
}

function evaluate(
  schema: JsonSchema,
  value: unknown,
  path: string,
  depth: number,
  mode: "input" | "output",
  issues: string[],
  budget: TraversalBudget,
): unknown {
  if (!consumeTraversalNode(budget, MAX_VALUE_NODES, "value_node_budget_exceeded", issues)) return null;
  if (depth > MAX_SCHEMA_DEPTH) {
    issues.push(pathIssue(path, "value_depth_exceeded"));
    return null;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches: Array<{ projected: unknown; issues: string[] }> = [];
    for (const option of schema.oneOf) {
      const nestedIssues: string[] = [];
      const projected = evaluate(option as JsonSchema, value, path, depth + 1, mode, nestedIssues, budget);
      if (budget.exceeded) {
        issues.push(pathIssue("$", "value_node_budget_exceeded"));
        return null;
      }
      if (nestedIssues.length === 0) matches.push({ projected, issues: nestedIssues });
    }
    if (matches.length !== 1) {
      issues.push(pathIssue(path, "value_one_of_mismatch"));
      return null;
    }
    return matches[0]?.projected;
  }
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    issues.push(pathIssue(path, "value_const_mismatch"));
    return null;
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => Object.is(item, value))) {
    issues.push(pathIssue(path, "value_enum_mismatch"));
    return null;
  }
  switch (schema.type) {
    case "null":
      if (value !== null) issues.push(pathIssue(path, "value_type_null_required"));
      return value;
    case "boolean":
      if (typeof value !== "boolean") issues.push(pathIssue(path, "value_type_boolean_required"));
      return value;
    case "string": {
      if (typeof value !== "string") {
        issues.push(pathIssue(path, "value_type_string_required"));
        return null;
      }
      const minimum = typeof schema.minLength === "number" ? schema.minLength : 0;
      const maximum = typeof schema.maxLength === "number" ? schema.maxLength : MAX_STRING_CHARS;
      if (value.length < minimum) issues.push(pathIssue(path, "value_string_too_short"));
      if (value.length > maximum) issues.push(pathIssue(path, "value_string_too_long"));
      return value;
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value) || (schema.type === "integer" && !Number.isInteger(value))) {
        issues.push(pathIssue(path, `value_type_${schema.type}_required`));
        return null;
      }
      if (typeof schema.minimum === "number" && value < schema.minimum) issues.push(pathIssue(path, "value_number_below_minimum"));
      if (typeof schema.maximum === "number" && value > schema.maximum) issues.push(pathIssue(path, "value_number_above_maximum"));
      return value;
    }
    case "array": {
      if (!Array.isArray(value)) {
        issues.push(pathIssue(path, "value_type_array_required"));
        return null;
      }
      const minimum = typeof schema.minItems === "number" ? schema.minItems : 0;
      const maximum = typeof schema.maxItems === "number" ? schema.maxItems : MAX_ARRAY_ITEMS;
      if (value.length < minimum) issues.push(pathIssue(path, "value_array_too_short"));
      if (value.length > maximum) issues.push(pathIssue(path, "value_array_too_long"));
      const output: unknown[] = [];
      const projectedItems = value.slice(0, maximum);
      for (const [index, item] of projectedItems.entries()) {
        output.push(evaluate(
          schema.items as JsonSchema,
          item,
          `${path}[${index}]`,
          depth + 1,
          mode,
          issues,
          budget,
        ));
        if (budget.exceeded) break;
      }
      return output;
    }
    case "object": {
      if (!isRecord(value)) {
        issues.push(pathIssue(path, "value_type_object_required"));
        return null;
      }
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = Array.isArray(schema.required) ? schema.required as string[] : [];
      const valueKeys = Object.keys(value);
      if (valueKeys.length > MAX_OBJECT_PROPERTIES) {
        issues.push(pathIssue(path, "value_object_properties_exceeded"));
        return null;
      }
      for (const key of required) {
        if (!hasOwn(value, key)) issues.push(pathIssue(safeChildPath(path, key), "value_required"));
      }
      if (mode === "input") {
        for (const key of valueKeys) {
          if (!hasOwn(properties, key)) issues.push(pathIssue(safeChildPath(path, key), "value_unknown_property"));
        }
      }
      const output: Record<string, unknown> = {};
      for (const [key, nestedSchema] of Object.entries(properties)) {
        if (!hasOwn(value, key)) continue;
        output[key] = evaluate(nestedSchema, value[key], `${path}.${key}`, depth + 1, mode, issues, budget);
        if (budget.exceeded) break;
      }
      return output;
    }
    default:
      issues.push(pathIssue(path, "schema_type_invalid"));
      return null;
  }
}
