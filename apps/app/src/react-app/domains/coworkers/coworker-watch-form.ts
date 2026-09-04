import type {
  MatterhornCoworkerProfile,
  MatterhornCoworkerResourceScope,
  MatterhornCryptoAppCatalogDetail,
  MatterhornCryptoAppCatalogSummary,
  MatterhornCryptoAppConnectionView,
} from "@matterhorn-work/types/crypto-coworkers";

type Scalar = string | number | boolean;

export type CoworkerWatchSource = {
  id: string;
  connectionId: string;
  manifestRevision: string;
  appId: string;
  appName: string;
  actionId: string;
  actionName: string;
  actionDescription: string;
  network: string;
};

export type CoworkerWatchField = {
  name: string;
  label: string;
  kind: "string" | "number" | "integer" | "boolean" | "constant";
  required: boolean;
  constant?: Scalar;
  options?: Scalar[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
};

export type CoworkerWatchFieldResult =
  | { supported: true; fields: CoworkerWatchField[] }
  | { supported: false; fields: []; reason: string };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function scalar(value: unknown): value is Scalar {
  return typeof value === "string"
    || (typeof value === "number" && Number.isFinite(value))
    || typeof value === "boolean";
}

function labelFor(value: string): string {
  return value
    .replace(/^matterhorn[._-]?/i, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Returns only read/watch actions that are present in the coworker's current,
 * user-approved resource scope and still match the exact live connection and
 * certified manifest revision.
 */
export function resolveCoworkerWatchSources(input: {
  coworker: Pick<MatterhornCoworkerProfile, "allowedAppIds" | "allowedActionIds" | "allowedNetworks">;
  scope: Pick<MatterhornCoworkerResourceScope, "connections"> | null;
  apps: MatterhornCryptoAppCatalogSummary[];
  connections: MatterhornCryptoAppConnectionView[];
}): CoworkerWatchSource[] {
  if (!input.scope) return [];
  const sources: CoworkerWatchSource[] = [];
  for (const binding of input.scope.connections) {
    const connection = input.connections.find((candidate) => (
      candidate.id === binding.id
      && candidate.appId === binding.appId
      && candidate.manifestRevision === binding.manifestRevision
      && candidate.state === "active"
      && candidate.availability === "available"
    ));
    const app = input.apps.find((candidate) => (
      candidate.appId === binding.appId
      && candidate.manifestRevision === binding.manifestRevision
    ));
    if (!connection || !app || !input.coworker.allowedAppIds.includes(app.appId)) continue;
    for (const actionId of binding.actionIds) {
      const action = app.actions.find((candidate) => candidate.id === actionId);
      if (!action
        || (action.access !== "read" && action.access !== "watch")
        || !connection.grantedActionIds.includes(actionId)
        || !input.coworker.allowedActionIds.includes(actionId)) continue;
      for (const network of binding.networks) {
        if (!connection.grantedNetworks.includes(network)
          || !input.coworker.allowedNetworks.includes(network)
          || !app.networks.some((candidate) => candidate.chainId === network)) continue;
        sources.push({
          id: `${connection.id}:${binding.manifestRevision}:${action.id}:${network}`,
          connectionId: connection.id,
          manifestRevision: binding.manifestRevision,
          appId: app.appId,
          appName: app.displayName,
          actionId: action.id,
          actionName: action.title,
          actionDescription: action.description,
          network,
        });
      }
    }
  }
  return sources.sort((left, right) => (
    left.appName.localeCompare(right.appName)
    || left.actionName.localeCompare(right.actionName)
    || left.network.localeCompare(right.network)
  ));
}

/** Converts a certified closed scalar input schema into a small guided form. */
export function resolveCoworkerWatchFields(
  detail: MatterhornCryptoAppCatalogDetail | null,
  actionId: string,
): CoworkerWatchFieldResult {
  const schema = detail?.actionSchemas.find((candidate) => candidate.actionId === actionId)?.inputSchema;
  if (!schema
    || schema.type !== "object"
    || schema.additionalProperties !== false
    || (schema.properties !== undefined && !record(schema.properties))
    || (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((item) => typeof item !== "string")))) {
    return { supported: false, fields: [], reason: "This check needs a guided setup that is not available yet." };
  }
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const fields: CoworkerWatchField[] = [];
  for (const [name, rawDefinition] of Object.entries((schema.properties as Record<string, unknown> | undefined) ?? {})) {
    if (!record(rawDefinition)) {
      return { supported: false, fields: [], reason: "This check needs a guided setup that is not available yet." };
    }
    if (rawDefinition.const !== undefined) {
      if (!scalar(rawDefinition.const)) {
        return { supported: false, fields: [], reason: "This check needs a guided setup that is not available yet." };
      }
      fields.push({ name, label: labelFor(name), kind: "constant", required: true, constant: rawDefinition.const });
      continue;
    }
    const kind = rawDefinition.type;
    if (kind !== "string" && kind !== "number" && kind !== "integer" && kind !== "boolean") {
      return { supported: false, fields: [], reason: "This check needs a guided setup that is not available yet." };
    }
    const options = rawDefinition.enum;
    if (options !== undefined && (!Array.isArray(options) || options.length === 0 || options.some((item) => !scalar(item)))) {
      return { supported: false, fields: [], reason: "This check needs a guided setup that is not available yet." };
    }
    fields.push({
      name,
      label: labelFor(name),
      kind,
      required: required.has(name),
      ...(options ? { options: options as Scalar[] } : {}),
      ...(typeof rawDefinition.minimum === "number" ? { minimum: rawDefinition.minimum } : {}),
      ...(typeof rawDefinition.maximum === "number" ? { maximum: rawDefinition.maximum } : {}),
      ...(Number.isSafeInteger(rawDefinition.minLength) ? { minLength: Number(rawDefinition.minLength) } : {}),
      ...(Number.isSafeInteger(rawDefinition.maxLength) ? { maxLength: Number(rawDefinition.maxLength) } : {}),
    });
  }
  return { supported: true, fields };
}

export function parseCoworkerWatchParameters(
  fields: CoworkerWatchField[],
  values: Record<string, string | boolean>,
): { ok: true; parameters: Record<string, string | number | boolean | null> }
  | { ok: false; error: string } {
  const parameters: Record<string, string | number | boolean | null> = {};
  for (const field of fields) {
    if (field.kind === "constant") {
      if (field.constant !== undefined) parameters[field.name] = field.constant;
      continue;
    }
    const raw = values[field.name];
    if (field.kind === "boolean") {
      const value = raw === true;
      if (field.options && !field.options.includes(value)) return { ok: false, error: `Choose ${field.label.toLowerCase()}.` };
      parameters[field.name] = value;
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) {
      if (field.required) return { ok: false, error: `Enter ${field.label.toLowerCase()}.` };
      continue;
    }
    if (field.kind === "string") {
      if ((field.minLength !== undefined && text.length < field.minLength)
        || (field.maxLength !== undefined && text.length > field.maxLength)
        || (field.options && !field.options.includes(text))) {
        return { ok: false, error: `Check ${field.label.toLowerCase()}.` };
      }
      parameters[field.name] = text;
      continue;
    }
    const value = Number(text);
    if (!Number.isFinite(value)
      || (field.kind === "integer" && !Number.isSafeInteger(value))
      || (field.minimum !== undefined && value < field.minimum)
      || (field.maximum !== undefined && value > field.maximum)
      || (field.options && !field.options.includes(value))) {
      return { ok: false, error: `Check ${field.label.toLowerCase()}.` };
    }
    parameters[field.name] = value;
  }
  return { ok: true, parameters };
}
