import type { ModelCompatConfig } from "../config/types.models.js";
import { stripUnsupportedSchemaKeywords } from "../plugin-sdk/provider-tools.js";
import { resolveUnsupportedToolSchemaKeywords } from "../plugins/provider-model-compat.js";
import { copyPluginToolMeta } from "../plugins/tools.js";
import { copyChannelAgentToolMeta } from "./channel-tools.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import { cleanSchemaForGemini } from "./schema/clean-for-gemini.js";

function extractEnumValues(schema: unknown): unknown[] | undefined {
  if (!schema || typeof schema !== "object") {
    return undefined;
  }
  const record = schema as Record<string, unknown>;
  if (Array.isArray(record.enum)) {
    return record.enum;
  }
  if ("const" in record) {
    return [record.const];
  }
  const variants = Array.isArray(record.anyOf)
    ? record.anyOf
    : Array.isArray(record.oneOf)
      ? record.oneOf
      : null;
  if (variants) {
    const values = variants.flatMap((variant) => {
      const extracted = extractEnumValues(variant);
      return extracted ?? [];
    });
    return values.length > 0 ? values : undefined;
  }
  return undefined;
}

function mergePropertySchemas(existing: unknown, incoming: unknown): unknown {
  if (!existing) {
    return incoming;
  }
  if (!incoming) {
    return existing;
  }

  const existingEnum = extractEnumValues(existing);
  const incomingEnum = extractEnumValues(incoming);
  if (existingEnum || incomingEnum) {
    const values = Array.from(new Set([...(existingEnum ?? []), ...(incomingEnum ?? [])]));
    const merged: Record<string, unknown> = {};
    for (const source of [existing, incoming]) {
      if (!source || typeof source !== "object") {
        continue;
      }
      const record = source as Record<string, unknown>;
      for (const key of ["title", "description", "default"]) {
        if (!(key in merged) && key in record) {
          merged[key] = record[key];
        }
      }
    }
    const types = new Set(values.map((value) => typeof value));
    if (types.size === 1) {
      merged.type = Array.from(types)[0];
    }
    merged.enum = values;
    return merged;
  }

  return existing;
}

// ////////// llamacpp-array-type-fix //////////
function flattenArrayTypeValues(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return schema;
  }
  const obj = schema as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "type" && Array.isArray(v) && v.every((e) => typeof e === "string")) {
      const nonNull = v.filter((e) => e !== "null");
      out[k] = nonNull.length <= 1 ? (nonNull[0] ?? "string") : nonNull[0];
    } else if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [
          pk,
          flattenArrayTypeValues(pv),
        ]),
      );
    } else if (
      (k === "items" || k === "anyOf" || k === "oneOf" || k === "allOf") &&
      Array.isArray(v)
    ) {
      out[k] = v.map(flattenArrayTypeValues);
    } else if (k === "items" && v && typeof v === "object") {
      out[k] = flattenArrayTypeValues(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
// ////////// /llamacpp-array-type-fix //////////

export function normalizeToolParameterSchema(
  schema: unknown,
  options?: { modelProvider?: string; modelId?: string; modelCompat?: ModelCompatConfig },
): unknown {
  const schemaRecord =
    schema && typeof schema === "object" ? (schema as Record<string, unknown>) : undefined;
  if (!schemaRecord) {
    return schema;
  }

  // Provider quirks:
  // - Gemini rejects several JSON Schema keywords, so we scrub those.
  // - OpenAI rejects function tool schemas unless the *top-level* is `type: "object"`.
  //   (TypeBox root unions compile to `{ anyOf: [...] }` without `type`).
  // - Anthropic expects full JSON Schema draft 2020-12 compliance.
  // - xAI rejects validation-constraint keywords (minLength, maxLength, etc.) outright.
  //
  // Normalize once here so callers can always pass `tools` through unchanged.
  const isGeminiProvider =
    options?.modelProvider?.toLowerCase().includes("google") ||
    options?.modelProvider?.toLowerCase().includes("gemini");
  const isAnthropicProvider = options?.modelProvider?.toLowerCase().includes("anthropic");
  const unsupportedToolSchemaKeywords = resolveUnsupportedToolSchemaKeywords(options?.modelCompat);

  function applyProviderCleaning(s: unknown): unknown {
    if (isGeminiProvider && !isAnthropicProvider) {
      return cleanSchemaForGemini(s);
    }
    // ////////// llamacpp-array-type-fix //////////
    // Local model servers (llama.cpp, vLLM) use Jinja templates that expect
    // `type` as a plain string; array forms like ["string","null"] crash them.
    const flat = flattenArrayTypeValues(s);
    // ////////// /llamacpp-array-type-fix //////////
    if (unsupportedToolSchemaKeywords.size > 0) {
      return stripUnsupportedSchemaKeywords(flat, unsupportedToolSchemaKeywords);
    }
    return flat;
  }

  if (
    "type" in schemaRecord &&
    "properties" in schemaRecord &&
    !Array.isArray(schemaRecord.anyOf)
  ) {
    return applyProviderCleaning(schemaRecord);
  }

  if (
    !("type" in schemaRecord) &&
    (typeof schemaRecord.properties === "object" || Array.isArray(schemaRecord.required)) &&
    !Array.isArray(schemaRecord.anyOf) &&
    !Array.isArray(schemaRecord.oneOf)
  ) {
    return applyProviderCleaning({ ...schemaRecord, type: "object" });
  }

  if (
    "type" in schemaRecord &&
    !("properties" in schemaRecord) &&
    !Array.isArray(schemaRecord.anyOf) &&
    !Array.isArray(schemaRecord.oneOf)
  ) {
    return applyProviderCleaning({ ...schemaRecord, properties: {} });
  }

  const variantKey = Array.isArray(schemaRecord.anyOf)
    ? "anyOf"
    : Array.isArray(schemaRecord.oneOf)
      ? "oneOf"
      : null;
  if (!variantKey) {
    return schema;
  }
  const variants = schemaRecord[variantKey] as unknown[];
  const mergedProperties: Record<string, unknown> = {};
  const requiredCounts = new Map<string, number>();
  let objectVariants = 0;

  for (const entry of variants) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const props = (entry as { properties?: unknown }).properties;
    if (!props || typeof props !== "object") {
      continue;
    }
    objectVariants += 1;
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (!(key in mergedProperties)) {
        mergedProperties[key] = value;
        continue;
      }
      mergedProperties[key] = mergePropertySchemas(mergedProperties[key], value);
    }
    const required = Array.isArray((entry as { required?: unknown }).required)
      ? (entry as { required: unknown[] }).required
      : [];
    for (const key of required) {
      if (typeof key !== "string") {
        continue;
      }
      requiredCounts.set(key, (requiredCounts.get(key) ?? 0) + 1);
    }
  }

  const baseRequired = Array.isArray(schemaRecord.required)
    ? schemaRecord.required.filter((key) => typeof key === "string")
    : undefined;
  const mergedRequired =
    baseRequired && baseRequired.length > 0
      ? baseRequired
      : objectVariants > 0
        ? Array.from(requiredCounts.entries())
            .filter(([, count]) => count === objectVariants)
            .map(([key]) => key)
        : undefined;

  const nextSchema: Record<string, unknown> = { ...schemaRecord };
  const flattenedSchema = {
    type: "object",
    ...(typeof nextSchema.title === "string" ? { title: nextSchema.title } : {}),
    ...(typeof nextSchema.description === "string" ? { description: nextSchema.description } : {}),
    properties:
      Object.keys(mergedProperties).length > 0 ? mergedProperties : (schemaRecord.properties ?? {}),
    ...(mergedRequired && mergedRequired.length > 0 ? { required: mergedRequired } : {}),
    additionalProperties:
      "additionalProperties" in schemaRecord ? schemaRecord.additionalProperties : true,
  };

  // Flatten union schemas into a single object schema:
  // - Gemini doesn't allow top-level `type` together with `anyOf`.
  // - OpenAI rejects schemas without top-level `type: "object"`.
  // - Anthropic accepts proper JSON Schema with constraints.
  // Merging properties preserves useful enums like `action` while keeping schemas portable.
  return applyProviderCleaning(flattenedSchema);
}

export function normalizeToolParameters(
  tool: AnyAgentTool,
  options?: { modelProvider?: string; modelId?: string; modelCompat?: ModelCompatConfig },
): AnyAgentTool {
  function preserveToolMeta(target: AnyAgentTool): AnyAgentTool {
    copyPluginToolMeta(tool, target);
    copyChannelAgentToolMeta(tool as never, target as never);
    return target;
  }
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;
  if (!schema) {
    return tool;
  }
  return preserveToolMeta({
    ...tool,
    parameters: normalizeToolParameterSchema(schema, options),
  });
}

/**
 * @deprecated Use normalizeToolParameters with modelProvider instead.
 * This function should only be used for Gemini providers.
 */
export function cleanToolSchemaForGemini(schema: Record<string, unknown>): unknown {
  return cleanSchemaForGemini(schema);
}
