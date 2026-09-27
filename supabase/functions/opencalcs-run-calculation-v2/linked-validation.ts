export type JsonSchema = Record<string, unknown>;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isSupportedLinkValue(value: unknown): boolean {
  return value !== null && value !== undefined && (
    ["string", "number", "boolean"].includes(typeof value) ||
    isObject(value) || Array.isArray(value)
  );
}

export function pointerPathsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function scalarMatchesSchema(value: unknown, schema: JsonSchema): boolean {
  if (Object.hasOwn(schema, "const") && !Object.is(value, schema.const)) {
    return false;
  }
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((option) => Object.is(option, value))
  ) return false;
  if (schema.type === "number" || schema.type === "integer") {
    if (typeof value !== "number" || !Number.isFinite(value)) return false;
    if (schema.type === "integer" && !Number.isInteger(value)) return false;
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      return false;
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      return false;
    }
    if (
      typeof schema.exclusiveMinimum === "number" &&
      value <= schema.exclusiveMinimum
    ) return false;
    if (
      typeof schema.exclusiveMaximum === "number" &&
      value >= schema.exclusiveMaximum
    ) return false;
    return true;
  }
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  return false;
}

function matchesSchemaAt(value: unknown, schema: JsonSchema, depth: number): boolean {
  if (depth > 32) return false;
  if (Array.isArray(schema.anyOf) && schema.anyOf.length) {
    return schema.anyOf.some((branch) =>
      isObject(branch) && matchesSchemaAt(value, branch, depth + 1)
    );
  }

  if (schema.type === "object") {
    if (!isObject(value)) return false;
    const properties = isObject(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === "string")
      : [];
    if (required.some((key) => !Object.hasOwn(value, key))) return false;

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!Object.hasOwn(value, key)) continue;
      if (!isObject(propertySchema) || !matchesSchemaAt(value[key], propertySchema, depth + 1)) {
        return false;
      }
    }

    const additionalProperties = schema.additionalProperties;
    const additionalKeys = Object.keys(value).filter((key) => !Object.hasOwn(properties, key));
    if (additionalProperties === false && additionalKeys.length) return false;
    if (isObject(additionalProperties) && additionalKeys.some((key) =>
      !matchesSchemaAt(value[key], additionalProperties, depth + 1)
    )) return false;
    return true;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) return false;
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      return false;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return false;
    }
    if (isObject(schema.items)) {
      return value.every((item) => matchesSchemaAt(item, schema.items as JsonSchema, depth + 1));
    }
    return true;
  }

  return scalarMatchesSchema(value, schema);
}

export function matchesSchema(value: unknown, schema: JsonSchema): boolean {
  return matchesSchemaAt(value, schema, 0);
}
