type JsonSchema = Record<string, unknown>;

export type CryptoAppSchemaResult<T = unknown> = {
  ok: boolean;
  value: T | null;
  issues: string[];
};

const MAX_SCHEMA_DEPTH = 8;
const MAX_ARRAY_ITEMS = 1_000;
const MAX_STRING_CHARS = 100_000;
const SAFE_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);
const SAFE_KEYS = new Set([
  "type",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "oneOf",
]);
const UNSAFE_PROPERTY_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaAt(value: unknown): JsonSchema | null {
  return isRecord(value) ? value : null;
}

function pathIssue(path: string, code: string): string {
  return `${path || "$"}:${code}`;
}

export function validateCryptoAppSchemaDefinition(schema: JsonSchema): string[] {
  const issues: string[] = [];
  inspectSchema(schema, "$", 0, issues);
  return [...new Set(issues)];
}

function inspectSchema(schema: JsonSchema, path: string, depth: number, issues: string[]): void {
  if (depth > MAX_SCHEMA_DEPTH) {
    issues.push(pathIssue(path, "schema_depth_exceeded"));
    return;
  }
  for (const key of Object.keys(schema)) {
    if (!SAFE_KEYS.has(key)) issues.push(pathIssue(path, `schema_keyword_unsupported_${key}`));
  }

  if (Array.isArray(schema.oneOf)) {
    if (schema.oneOf.length < 1 || schema.oneOf.length > 8) issues.push(pathIssue(path, "schema_one_of_invalid"));
    for (const [index, option] of schema.oneOf.entries()) {
      const nested = schemaAt(option);
      if (!nested) issues.push(pathIssue(`${path}.oneOf[${index}]`, "schema_not_object"));
      else inspectSchema(nested, `${path}.oneOf[${index}]`, depth + 1, issues);
    }
    return;
  }

  if (typeof schema.type !== "string" || !SAFE_TYPES.has(schema.type)) {
    issues.push(pathIssue(path, "schema_type_invalid"));
    return;
  }
  if (schema.description !== undefined && typeof schema.description !== "string") {
    issues.push(pathIssue(path, "schema_description_invalid"));
  }
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length < 1 || schema.enum.length > 100)) {
    issues.push(pathIssue(path, "schema_enum_invalid"));
  }

  if (schema.type === "object") {
    if (schema.additionalProperties !== false) issues.push(pathIssue(path, "schema_object_must_be_closed"));
    if (schema.properties !== undefined && !isRecord(schema.properties)) {
      issues.push(pathIssue(path, "schema_properties_invalid"));
      return;
    }
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const propertyKeys = Object.keys(properties);
    if (propertyKeys.length > 200) issues.push(pathIssue(path, "schema_properties_exceeded"));
    for (const key of propertyKeys) {
      if (UNSAFE_PROPERTY_KEYS.has(key)) issues.push(pathIssue(`${path}.${key}`, "schema_property_forbidden"));
      const nested = schemaAt(properties[key]);
      if (!nested) issues.push(pathIssue(`${path}.${key}`, "schema_not_object"));
      else inspectSchema(nested, `${path}.${key}`, depth + 1, issues);
    }
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required)
        || schema.required.some((key) => typeof key !== "string" || !propertyKeys.includes(key))
        || new Set(schema.required).size !== schema.required.length) {
        issues.push(pathIssue(path, "schema_required_invalid"));
      }
    }
  }
  if (schema.type === "array") {
    const items = schemaAt(schema.items);
    if (!items) issues.push(pathIssue(path, "schema_items_required"));
    else inspectSchema(items, `${path}[]`, depth + 1, issues);
    for (const key of ["minItems", "maxItems"] as const) {
      if (schema[key] !== undefined && (!Number.isInteger(schema[key]) || Number(schema[key]) < 0)) {
        issues.push(pathIssue(path, `schema_${key}_invalid`));
      }
    }
    if (typeof schema.maxItems === "number" && schema.maxItems > MAX_ARRAY_ITEMS) {
      issues.push(pathIssue(path, "schema_max_items_exceeded"));
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
  }
  if (schema.type === "number" || schema.type === "integer") {
    for (const key of ["minimum", "maximum"] as const) {
      if (schema[key] !== undefined && (typeof schema[key] !== "number" || !Number.isFinite(schema[key]))) {
        issues.push(pathIssue(path, `schema_${key}_invalid`));
      }
    }
  }
}

export function validateCryptoAppInput(schema: JsonSchema, value: unknown): CryptoAppSchemaResult {
  const definitionIssues = validateCryptoAppSchemaDefinition(schema);
  if (definitionIssues.length) return { ok: false, value: null, issues: definitionIssues };
  const issues: string[] = [];
  const projected = evaluate(schema, value, "$", 0, "input", issues);
  return { ok: issues.length === 0, value: issues.length === 0 ? projected : null, issues };
}

export function projectCryptoAppOutput(schema: JsonSchema, value: unknown): CryptoAppSchemaResult {
  const definitionIssues = validateCryptoAppSchemaDefinition(schema);
  if (definitionIssues.length) return { ok: false, value: null, issues: definitionIssues };
  const issues: string[] = [];
  const projected = evaluate(schema, value, "$", 0, "output", issues);
  return { ok: issues.length === 0, value: issues.length === 0 ? projected : null, issues };
}

function evaluate(
  schema: JsonSchema,
  value: unknown,
  path: string,
  depth: number,
  mode: "input" | "output",
  issues: string[],
): unknown {
  if (depth > MAX_SCHEMA_DEPTH) {
    issues.push(pathIssue(path, "value_depth_exceeded"));
    return null;
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.map((option) => {
      const nestedIssues: string[] = [];
      const projected = evaluate(option as JsonSchema, value, path, depth + 1, mode, nestedIssues);
      return { projected, issues: nestedIssues };
    }).filter((result) => result.issues.length === 0);
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
      return value.slice(0, maximum).map((item, index) => evaluate(
        schema.items as JsonSchema,
        item,
        `${path}[${index}]`,
        depth + 1,
        mode,
        issues,
      ));
    }
    case "object": {
      if (!isRecord(value)) {
        issues.push(pathIssue(path, "value_type_object_required"));
        return null;
      }
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
      const required = Array.isArray(schema.required) ? schema.required as string[] : [];
      for (const key of required) {
        if (!(key in value)) issues.push(pathIssue(`${path}.${key}`, "value_required"));
      }
      if (mode === "input") {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) issues.push(pathIssue(`${path}.${key}`, "value_unknown_property"));
        }
      }
      const output: Record<string, unknown> = {};
      for (const [key, nestedSchema] of Object.entries(properties)) {
        if (!(key in value)) continue;
        output[key] = evaluate(nestedSchema, value[key], `${path}.${key}`, depth + 1, mode, issues);
      }
      return output;
    }
    default:
      issues.push(pathIssue(path, "schema_type_invalid"));
      return null;
  }
}
