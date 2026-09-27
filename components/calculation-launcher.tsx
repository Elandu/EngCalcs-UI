"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type JsonSchema = {
  type?: string;
  title?: string;
  description?: string;
  unit?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  default?: unknown;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
};

type CalculationDefinition = {
  id: string;
  name: string;
  description: string;
  category: string;
  standard?: { name?: string; edition?: string } | null;
  input_schema?: JsonSchema;
  output_schema?: JsonSchema;
};

type SchemaRecord = Record<string, unknown>;

type LinkSourceRun = {
  calculationId: string;
  calculationDefinitionId: string;
  title: string;
  runId: string;
  runSequence: number;
  createdAt: string;
  result: unknown;
};

type LinkableOutput = {
  path: string;
  label: string;
  value: unknown;
  unit?: string;
};

type LinkableInput = {
  path: string;
  label: string;
  schema: JsonSchema;
  value: unknown;
};

type LinkedInputDraft = {
  sourceCalculationId: string;
  sourceTitle: string;
  sourceRunId: string;
  sourceRunSequence: number;
  sourceOutputPath: string;
  sourceOutputLabel: string;
  sourceUnit?: string;
  targetInputPath: string;
  targetInputLabel: string;
  targetUnit?: string;
  value: unknown;
  previousValue: unknown;
};

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function record(value: unknown): SchemaRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SchemaRecord)
    : {};
}

function isJsonObject(value: unknown): value is SchemaRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function displayLinkedValue(value: unknown) {
  if (Array.isArray(value)) return "Array · " + value.length + " items";
  if (isJsonObject(value)) return "Object · " + Object.keys(value).length + " fields";
  return String(value);
}

function enumValues(schema: JsonSchema): unknown[] | undefined {
  if (schema.enum) return schema.enum;
  if (schema.anyOf?.length && schema.anyOf.every((item) => "const" in item)) {
    return schema.anyOf.map((item) => item.const);
  }
  return undefined;
}

function initialValue(schema: JsonSchema, required = false): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.type === "boolean") return false;
  if (schema.type === "array") return [];
  if (schema.type === "object" && schema.properties) {
    const values: SchemaRecord = {};
    for (const [key, child] of Object.entries(schema.properties)) {
      if (schema.required?.includes(key) || child.default !== undefined) {
        values[key] = initialValue(child, schema.required?.includes(key));
      }
    }
    return values;
  }
  if (enumValues(schema)?.length) return "";
  return required ? "" : "";
}

function makeInputValues(schema?: JsonSchema): SchemaRecord {
  const values: SchemaRecord = {};
  for (const [key, property] of Object.entries(schema?.properties ?? {})) {
    values[key] = initialValue(property, schema?.required?.includes(key));
  }
  return values;
}

function escapePointerSegment(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function pointerPath(parent: string, segment: string | number) {
  return `${parent}/${escapePointerSegment(String(segment))}`;
}

function resultPayload(value: unknown): unknown {
  const envelope = record(value);
  const nested = record(envelope.result);
  return Object.keys(nested).length ? nested : envelope;
}

function quantityParts(value: unknown): { value: unknown; unit?: string } | null {
  const quantity = record(value);
  const unit = typeof quantity.unit === "string"
    ? quantity.unit
    : typeof quantity.units === "string"
      ? quantity.units
      : undefined;
  if (Object.hasOwn(quantity, "value") && unit) {
    return { value: quantity.value, unit };
  }
  return null;
}

function outputSchemaAtPointer(root: JsonSchema | undefined, path: string): JsonSchema | undefined {
  if (!root) return undefined;
  const parts = path.split("/").slice(1).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current: JsonSchema | undefined = root;
  for (const part of parts) {
    if (current?.type === "array") current = current.items;
    else current = current?.properties?.[part];
  }
  return current;
}

function pointerPathsOverlap(left: string, right: string) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function isPathWithinLinkedInput(path: string, linkedPaths: Set<string>) {
  return [...linkedPaths].some((linkedPath) =>
    path === linkedPath || path.startsWith(`${linkedPath}/`)
  );
}

function flattenOutputs(value: unknown, outputSchema?: JsonSchema): LinkableOutput[] {
  const outputs: LinkableOutput[] = [];
  const visit = (current: unknown, path: string, label: string, depth: number) => {
    if (depth > 12 || outputs.length >= 250 || current === null || current === undefined) return;
    const quantity = quantityParts(current);
    if (quantity) {
      if (["string", "number", "boolean"].includes(typeof quantity.value)) {
        outputs.push({
          path,
          label,
          value: quantity.value as string | number | boolean,
          unit: quantity.unit || outputSchemaAtPointer(outputSchema, path)?.unit,
        });
      }
      return;
    }
    if (["string", "number", "boolean"].includes(typeof current)) {
      outputs.push({ path, label, value: current as string | number | boolean, unit: outputSchemaAtPointer(outputSchema, path)?.unit });
      return;
    }
    if (Array.isArray(current)) {
      if (path && outputSchemaAtPointer(outputSchema, path)?.type === "array") {
        outputs.push({
          path,
          label,
          value: current,
          unit: outputSchemaAtPointer(outputSchema, path)?.unit,
        });
      }
      current.forEach((item, index) => visit(item, pointerPath(path, index), `${label} · ${index + 1}`, depth + 1));
      return;
    }
    const children = record(current);
    if (path && Object.keys(children).length && outputSchemaAtPointer(outputSchema, path)?.type === "object") {
      outputs.push({ path, label, value: current });
    }
    for (const [key, child] of Object.entries(children)) {
      if (key.startsWith("_")) continue;
      const nextPath = pointerPath(path, key);
      visit(child, nextPath, label ? `${label} · ${labelFor(key)}` : labelFor(key), depth + 1);
    }
  };
  const root = resultPayload(value);
  if (Array.isArray(root)) {
    root.forEach((item, index) => visit(item, pointerPath("", index), `Result · ${index + 1}`, 0));
  } else {
    for (const [key, child] of Object.entries(record(root))) {
      if (key.startsWith("_")) continue;
      visit(child, pointerPath("", key), labelFor(key), 0);
    }
  }
  return outputs;
}

function flattenInputs(schema: JsonSchema, values: unknown): LinkableInput[] {
  const inputs: LinkableInput[] = [];
  const visit = (currentSchema: JsonSchema, value: unknown, path: string, label: string, depth: number) => {
    if (depth > 12 || inputs.length >= 250) return;
    if (currentSchema.type === "object" && currentSchema.properties) {
      const objectValue = record(value);
      for (const [key, child] of Object.entries(currentSchema.properties)) {
        visit(child, objectValue[key], pointerPath(path, key), `${label} · ${child.title || labelFor(key)}`, depth + 1);
      }
      return;
    }
    if (currentSchema.type === "object") {
      inputs.push({ path, label, schema: currentSchema, value });
      return;
    }
    if (currentSchema.type === "array") {
      inputs.push({ path, label, schema: currentSchema, value });
      if (currentSchema.items && Array.isArray(value)) {
        value.forEach((item, index) => visit(currentSchema.items!, item, pointerPath(path, index), `${label} · ${index + 1}`, depth + 1));
      }
      return;
    }
    if (["string", "number", "integer", "boolean"].includes(currentSchema.type ?? "") || enumValues(currentSchema)?.length) {
      inputs.push({ path, label, schema: currentSchema, value });
    }
  };
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    visit(property, record(values)[key], pointerPath("", key), property.title || labelFor(key), 0);
  }
  return inputs;
}

function setPointerValue(source: unknown, path: string, value: unknown): SchemaRecord {
  const parts = path.split("/").slice(1).map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  const root = structuredClone(record(source));
  let current: Record<string, unknown> | unknown[] = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    if (Array.isArray(current)) {
      const rowIndex = Number(part);
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= current.length) throw new Error("The linked input row no longer exists.");
      if (!current[rowIndex] || typeof current[rowIndex] !== "object") current[rowIndex] = /^\d+$/.test(nextPart) ? [] : {};
      current = current[rowIndex] as Record<string, unknown> | unknown[];
    } else {
      if (!current[part] || typeof current[part] !== "object") current[part] = /^\d+$/.test(nextPart) ? [] : {};
      current = current[part] as Record<string, unknown> | unknown[];
    }
  }
  const last = parts.at(-1);
  if (last === undefined) throw new Error("Choose a specific input field to link.");
  if (Array.isArray(current)) {
    const rowIndex = Number(last);
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= current.length) throw new Error("The linked input row no longer exists.");
    current[rowIndex] = value;
  } else {
    current[last] = value;
  }
  return root;
}

function linkedValueError(output: LinkableOutput, input: LinkableInput): string | null {
  const targetType = input.schema.type;
  const outputType = Array.isArray(output.value) ? "array" : typeof output.value;
  if (
    (targetType === "number" || targetType === "integer") && outputType !== "number" ||
    targetType === "string" && outputType !== "string" ||
    targetType === "boolean" && outputType !== "boolean" ||
    targetType === "object" && !isJsonObject(output.value) ||
    targetType === "array" && !Array.isArray(output.value)
  ) {
    return `The source value type (${outputType}) does not match the target input type (${targetType}).`;
  }
  const sourceUnit = output.unit?.replace(/\s+/g, "").toLowerCase();
  const targetUnit = input.schema.unit?.replace(/\s+/g, "").toLowerCase();
  if (Boolean(sourceUnit) !== Boolean(targetUnit)) {
    return "The source output and target input must both declare units, or both be unitless.";
  }
  if (sourceUnit && targetUnit && sourceUnit !== targetUnit) return `Units do not match (${output.unit} → ${input.schema.unit}). Convert the value explicitly before linking.`;
  try {
    serializeField(output.value, input.schema, input.label);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "The source value does not match this input.";
  }
}

function requiredMissing(value: unknown) {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

function serializeField(value: unknown, schema: JsonSchema, path: string): unknown {
  const label = path.split(".").map(labelFor).join(" · ");
  const options = enumValues(schema);
  if (options && !options.some((option) => Object.is(option, value))) {
    throw new Error(`${label} must use one of the listed options.`);
  }

  if (schema.type === "number" || schema.type === "integer") {
    const numberValue = typeof value === "number" ? value : Number(String(value));
    if (!Number.isFinite(numberValue)) throw new Error(`${label} must be a number.`);
    if (schema.type === "integer" && !Number.isInteger(numberValue)) {
      throw new Error(`${label} must be a whole number.`);
    }
    if (schema.minimum !== undefined && numberValue < schema.minimum) {
      throw new Error(`${label} must be at least ${schema.minimum}.`);
    }
    if (schema.exclusiveMinimum !== undefined && numberValue <= schema.exclusiveMinimum) {
      throw new Error(`${label} must be greater than ${schema.exclusiveMinimum}.`);
    }
    if (schema.maximum !== undefined && numberValue > schema.maximum) {
      throw new Error(`${label} must be at most ${schema.maximum}.`);
    }
    if (schema.exclusiveMaximum !== undefined && numberValue >= schema.exclusiveMaximum) {
      throw new Error(`${label} must be less than ${schema.exclusiveMaximum}.`);
    }
    const alternatives = schema.anyOf;
    if (alternatives?.length) {
      const matches = alternatives.some((branch) => {
        if (branch.const !== undefined) return Object.is(numberValue, branch.const);
        return (branch.minimum === undefined || numberValue >= branch.minimum) &&
          (branch.maximum === undefined || numberValue <= branch.maximum) &&
          (branch.exclusiveMinimum === undefined || numberValue > branch.exclusiveMinimum) &&
          (branch.exclusiveMaximum === undefined || numberValue < branch.exclusiveMaximum);
      });
      if (!matches) throw new Error(`${label} does not meet the allowed alternatives.`);
    }
    return numberValue;
  }

  if (schema.type === "object") {
    if (!schema.properties) {
      let objectValue = value;
      if (typeof value === "string") {
        try { objectValue = JSON.parse(value); } catch { throw new Error(`${label} must be valid JSON.`); }
      }
      if (!isJsonObject(objectValue)) throw new Error(`${label} must be a JSON object.`);
      return objectValue;
    }
    const source = record(value);
    const output: SchemaRecord = {};
    for (const [key, child] of Object.entries(schema.properties)) {
      const childValue = source[key];
      const childRequired = schema.required?.includes(key) ?? false;
      if (requiredMissing(childValue)) {
        if (childRequired) throw new Error(`${labelFor(key)} is required.`);
        continue;
      }
      output[key] = serializeField(childValue, child, `${path}.${key}`);
    }
    return output;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${label} must be a list.`);
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      throw new Error(`${label} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}.`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      throw new Error(`${label} allows at most ${schema.maxItems} items.`);
    }
    return value.map((item, index) => serializeField(item, schema.items ?? {}, `${path}.${index + 1}`));
  }

  if (schema.type === "boolean") return Boolean(value);
  if (schema.const !== undefined && !Object.is(value, schema.const)) {
    throw new Error(`${label} must be ${String(schema.const)}.`);
  }
  return value;
}

function serializeInputs(schema: JsonSchema, values: SchemaRecord): SchemaRecord {
  const output: SchemaRecord = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const value = values[key];
    if (requiredMissing(value)) {
      if (schema.required?.includes(key)) throw new Error(`${labelFor(key)} is required.`);
      continue;
    }
    output[key] = serializeField(value, property, key);
  }
  return output;
}

function SchemaField({
  name,
  schema,
  value,
  required,
  path,
  linkedPaths,
  onChange,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  required: boolean;
  path: string;
  linkedPaths: Set<string>;
  onChange: (next: unknown) => void;
}) {
  const label = schema.title || labelFor(name);
  const options = enumValues(schema);
  const primitiveOptions = options?.filter((option) => ["string", "number", "boolean"].includes(typeof option));
  const unitLabel = schema.unit ? ` · ${schema.unit}` : "";
  const hasLinkedDescendant = [...linkedPaths].some((linkedPath) => linkedPath === path || linkedPath.startsWith(`${path}/`));
  const isLinkedInput = isPathWithinLinkedInput(path, linkedPaths);

  if (schema.type === "object" && schema.properties) {
    const nested = record(value);
    return (
      <fieldset className="schema-object-field" disabled={isLinkedInput}>
        <legend>{label}{required ? " *" : ""}</legend>
        {schema.description ? <p className="schema-field-description">{schema.description}</p> : null}
        <div className="schema-nested-grid">
          {Object.entries(schema.properties).map(([key, child]) => (
            <SchemaField
              key={key}
              name={key}
              schema={child}
              value={nested[key]}
              required={schema.required?.includes(key) ?? false}
              path={pointerPath(path, key)}
              linkedPaths={linkedPaths}
              onChange={(next) => onChange({ ...nested, [key]: next })}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (schema.type === "array") {
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    return (
      <fieldset className="schema-array-field" disabled={isLinkedInput}>
        <legend>{label}{required ? " *" : ""}{unitLabel}</legend>
        {schema.description ? <p className="schema-field-description">{schema.description}</p> : null}
        <div className="schema-array-rows">
          {items.map((item, index) => (
            <div className="schema-array-row" key={`${name}-${index}`}>
              {itemSchema.type === "object" && itemSchema.properties ? (
                <div className="schema-nested-grid">
                  {Object.entries(itemSchema.properties).map(([key, child]) => (
                    <SchemaField
                      key={key}
                      name={key}
                      schema={child}
                      value={record(item)[key]}
                      required={itemSchema.required?.includes(key) ?? false}
                      path={pointerPath(pointerPath(path, index), key)}
                      linkedPaths={linkedPaths}
                      onChange={(next) => onChange(items.map((current, row) => row === index ? { ...record(current), [key]: next } : current))}
                    />
                  ))}
                </div>
              ) : (
                <SchemaField
                  name={`${label} ${index + 1}`}
                  schema={itemSchema}
                  value={item}
                  required
                  path={pointerPath(path, index)}
                  linkedPaths={linkedPaths}
                  onChange={(next) => onChange(items.map((current, row) => row === index ? next : current))}
                />
              )}
              <button className="schema-remove-row" type="button" onClick={() => onChange(items.filter((_, row) => row !== index))} aria-label={`Remove ${label} ${index + 1}`} disabled={hasLinkedDescendant}>
                Remove
              </button>
            </div>
          ))}
        </div>
        <button className="schema-add-row" type="button" onClick={() => onChange([...items, initialValue(itemSchema, true)])} disabled={hasLinkedDescendant || (schema.maxItems !== undefined && items.length >= schema.maxItems)}>
          + Add {label.toLowerCase().replace(/s$/, "")}
        </button>
        {schema.minItems ? <small className="schema-hint">At least {schema.minItems} row{schema.minItems === 1 ? "" : "s"} required.</small> : null}
      </fieldset>
    );
  }

  if (schema.type === "object") {
    return (
      <label className="schema-opaque-object input-span-2">
        <span>{label}{required ? " *" : ""}</span>
        {schema.description ? <small className="schema-field-description">{schema.description}</small> : null}
        <textarea rows={5} value={typeof value === "string" ? value : value ? JSON.stringify(value, null, 2) : ""} onChange={(event) => onChange(event.target.value)} placeholder="Enter the classification result JSON" required={required} disabled={isLinkedInput} />
      </label>
    );
  }

  if (schema.type === "boolean") {
    return (
      <label className="checkbox-field schema-checkbox">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} disabled={isLinkedInput} />
        <span>{label}{unitLabel}{required ? " *" : ""}</span>
        {schema.description ? <small>{schema.description}</small> : null}
      </label>
    );
  }

  if (primitiveOptions?.length) {
    return (
      <label className="schema-scalar-field">
        <span>{label}{unitLabel}{required ? " *" : ""}</span>
        <select value={primitiveOptions.findIndex((option) => Object.is(option, value)) >= 0 ? String(value) : ""} onChange={(event) => onChange(primitiveOptions.find((option) => String(option) === event.target.value))} required={required} disabled={isLinkedInput}>
          <option value="">Select…</option>
          {primitiveOptions.map((option, index) => <option key={`${String(option)}-${index}`} value={String(option)}>{String(option)}</option>)}
        </select>
        {schema.description ? <small>{schema.description}</small> : null}
      </label>
    );
  }

  const numeric = schema.type === "number" || schema.type === "integer";
  const min = schema.minimum;
  const max = schema.maximum;
  const constraints = [
    schema.exclusiveMinimum !== undefined ? `greater than ${schema.exclusiveMinimum}` : min !== undefined ? `at least ${min}` : "",
    schema.exclusiveMaximum !== undefined ? `less than ${schema.exclusiveMaximum}` : max !== undefined ? `at most ${max}` : "",
  ].filter(Boolean).join("; ");
  const alternatives = schema.anyOf?.map((branch) => branch.const !== undefined ? String(branch.const) : branch.minimum !== undefined ? `≥ ${branch.minimum}` : "").filter(Boolean);
  return (
    <label className="schema-scalar-field">
      <span>{label}{unitLabel}{required ? " *" : ""}</span>
      <input
        type={numeric ? "number" : "text"}
        step={schema.type === "integer" ? "1" : numeric ? "any" : undefined}
        min={min}
        max={max}
        value={String(value ?? "")}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={isLinkedInput}
      />
      {schema.description || constraints || alternatives?.length ? (
        <small>{[schema.description, constraints && `Constraint: ${constraints}`, alternatives?.length && `Allowed alternatives: ${alternatives.join(" or ")}`].filter(Boolean).join(" · ")}</small>
      ) : null}
    </label>
  );
}

export function CalculationLauncher({
  projectId,
  initialCalculationId,
  sourceRuns,
}: {
  projectId: string;
  initialCalculationId?: string;
  sourceRuns: LinkSourceRun[];
}) {
  const router = useRouter();
  const [definitions, setDefinitions] = useState<CalculationDefinition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [values, setValues] = useState<SchemaRecord>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sourceRunId, setSourceRunId] = useState(sourceRuns[0]?.runId ?? "");
  const [sourceOutputPath, setSourceOutputPath] = useState("");
  const [targetInputPath, setTargetInputPath] = useState("");
  const [linkedInputs, setLinkedInputs] = useState<LinkedInputDraft[]>([]);

  useEffect(() => {
    let active = true;
    fetch("/api/calculations", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load calculation library.");
        return payload as CalculationDefinition[];
      })
      .then((items) => {
        if (!active) return;
        setDefinitions(items);
        const initial = items.find((item) => item.id === initialCalculationId) ?? items[0];
        if (initial) {
          setSelectedId(initial.id);
          setTitle(initial.name);
          setValues(makeInputValues(initial.input_schema));
        }
      })
      .catch((error: Error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialCalculationId]);

  const selected = useMemo(() => definitions.find((item) => item.id === selectedId), [definitions, selectedId]);
  const selectedSourceRun = sourceRuns.find((run) => run.runId === sourceRunId) ?? sourceRuns[0];
  const sourceOutputs = useMemo(
    () => selectedSourceRun
      ? flattenOutputs(
          selectedSourceRun.result,
          definitions.find((definition) => definition.id === selectedSourceRun.calculationDefinitionId)?.output_schema,
        )
      : [],
    [definitions, selectedSourceRun],
  );
  const targetInputs = useMemo(
    () => selected?.input_schema ? flattenInputs(selected.input_schema, values) : [],
    [selected, values],
  );
  const selectedOutput = sourceOutputs.find((output) => output.path === sourceOutputPath);
  const selectedTarget = targetInputs.find((input) => input.path === targetInputPath);
  const linkError = selectedOutput && selectedTarget
    ? linkedValueError(selectedOutput, selectedTarget)
    : null;
  const linkedPaths = useMemo(
    () => new Set(linkedInputs.map((link) => link.targetInputPath)),
    [linkedInputs],
  );

  function selectDefinition(nextId: string) {
    const next = definitions.find((item) => item.id === nextId);
    setSelectedId(nextId);
    setTitle(next?.name || "");
    setValues(makeInputValues(next?.input_schema));
    setLinkedInputs([]);
    setTargetInputPath("");
    setMessage("");
  }

  function addLinkedInput() {
    if (!selectedSourceRun || !selectedOutput || !selectedTarget) return;
    if (linkError) {
      setMessage(linkError);
      return;
    }
    if (linkedInputs.some((link) => pointerPathsOverlap(link.targetInputPath, selectedTarget.path))) {
      setMessage("This input overlaps an existing linked input. Remove the existing link first.");
      return;
    }
    try {
      const serializedValue = serializeField(selectedOutput.value, selectedTarget.schema, selectedTarget.label);
      const prior = record(values);
      const previousValue = selectedTarget.value;
      setValues(setPointerValue(prior, selectedTarget.path, serializedValue));
      setLinkedInputs((current) => [...current, {
        sourceCalculationId: selectedSourceRun.calculationId,
        sourceTitle: selectedSourceRun.title,
        sourceRunId: selectedSourceRun.runId,
        sourceRunSequence: selectedSourceRun.runSequence,
        sourceOutputPath: selectedOutput.path,
        sourceOutputLabel: selectedOutput.label,
        sourceUnit: selectedOutput.unit,
        targetInputPath: selectedTarget.path,
        targetInputLabel: selectedTarget.label,
        targetUnit: selectedTarget.schema.unit,
        value: selectedOutput.value,
        previousValue,
      }]);
      setTargetInputPath("");
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to link that value.");
    }
  }

  function removeLinkedInput(link: LinkedInputDraft) {
    setValues((current) => setPointerValue(current, link.targetInputPath, link.previousValue));
    setLinkedInputs((current) => current.filter((item) => item.targetInputPath !== link.targetInputPath));
  }

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.input_schema) return;

    let inputs: SchemaRecord;
    try {
      inputs = serializeInputs(selected.input_schema, values);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Check the calculation inputs.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/calculations/${encodeURIComponent(selected.id)}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title,
          inputs,
          linkedInputs: linkedInputs.map((link) => ({
            sourceCalculationId: link.sourceCalculationId,
            sourceRunId: link.sourceRunId,
            sourceOutputPath: link.sourceOutputPath,
            targetInputPath: link.targetInputPath,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Calculation failed.");
      setMessage(linkedInputs.length
        ? `Calculation run saved with ${linkedInputs.length} linked input${linkedInputs.length === 1 ? "" : "s"}.`
        : "Calculation run saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calculation failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="calculator-launcher">Loading calculation library…</div>;

  return (
    <section className="calculator-launcher" aria-labelledby="project-calculation-title">
      <div className="launcher-heading">
        <div>
          <p className="eyebrow">Add calculation</p>
          <h2 id="project-calculation-title">Project calculation</h2>
          <p>Enter structured inputs, then save a versioned run and its engineering output to this project.</p>
        </div>
      </div>

      {!definitions.length ? (
        <p className="form-message">{message || "No calculations are available."}</p>
      ) : (
        <form className="calculator-form" onSubmit={run}>
          <label>
            Calculation
            <select value={selectedId} onChange={(event) => selectDefinition(event.target.value)}>
              {definitions.map((definition) => <option key={definition.id} value={definition.id}>{definition.name}</option>)}
            </select>
          </label>

          {selected ? (
            <div className="definition-note">
              <strong>{selected.standard?.name || "Engineering calculation"}</strong>
              <span>{selected.standard?.edition ? ` · ${selected.standard.edition}` : ""}</span>
              <p>{selected.description}</p>
            </div>
          ) : null}

          <label>
            Calculation title
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required />
          </label>

          <div className="schema-input-grid">
            {Object.entries(selected?.input_schema?.properties ?? {}).map(([key, schema]) => (
              <SchemaField
                key={key}
                name={key}
                schema={schema}
                value={values[key]}
                required={selected?.input_schema?.required?.includes(key) ?? false}
                path={pointerPath("", key)}
                linkedPaths={linkedPaths}
                onChange={(value) => setValues((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>

          <section className="calculation-link-builder" aria-labelledby="calculation-link-title">
            <div className="calculation-link-builder-heading">
              <div>
                <p className="eyebrow">Project data</p>
                <h3 id="calculation-link-title">Link a saved result</h3>
                <p>Choose an exact source run and map one of its outputs into this calculation.</p>
              </div>
              <span>{linkedInputs.length} linked</span>
            </div>
            {sourceRuns.length ? (
              <div className="calculation-link-builder-controls">
                <label>
                  Source run
                  <select value={selectedSourceRun?.runId ?? ""} onChange={(event) => { setSourceRunId(event.target.value); setSourceOutputPath(""); }}>
                    {sourceRuns.map((run) => (
                      <option key={run.runId} value={run.runId}>
                        {run.title} · Run {run.runSequence} · {run.createdAt.slice(0, 10)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Source output
                  <select value={sourceOutputPath} onChange={(event) => setSourceOutputPath(event.target.value)}>
                    <option value="">Select an output…</option>
                    {sourceOutputs.map((output) => (
                      <option key={output.path} value={output.path}>
                        {output.label} = {displayLinkedValue(output.value)}{output.unit ? ` ${output.unit}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Target input
                  <select value={targetInputPath} onChange={(event) => setTargetInputPath(event.target.value)}>
                    <option value="">Select an input…</option>
                    {targetInputs.filter((input) => !linkedInputs.some((link) => pointerPathsOverlap(link.targetInputPath, input.path))).map((input) => (
                      <option key={input.path} value={input.path}>
                        {input.label}{input.schema.unit ? ` · ${input.schema.unit}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="button button-secondary" type="button" onClick={addLinkedInput} disabled={!selectedOutput || !selectedTarget || Boolean(linkError)}>
                  Link value
                </button>
                {linkError ? <p className="calculation-link-error" role="status">{linkError}</p> : null}
                {!sourceOutputs.length ? <p className="library-muted">This source run has no supported outputs to link.</p> : null}
                {!targetInputs.length ? <p className="library-muted">This calculation has no supported scalar, object, or array inputs to link.</p> : null}
              </div>
            ) : (
              <p className="calculation-links-empty">Run a project calculation first; its saved outputs will be available here as exact-run sources.</p>
            )}
            {linkedInputs.length ? (
              <ul className="calculation-link-draft-list">
                {linkedInputs.map((link) => (
                  <li key={`${link.sourceRunId}:${link.sourceOutputPath}:${link.targetInputPath}`}>
                    <div>
                      <strong>{link.sourceOutputLabel}</strong>
                      <small>{link.sourceTitle} · Run {link.sourceRunSequence} · {displayLinkedValue(link.value)}{link.sourceUnit ? ` ${link.sourceUnit}` : ""}</small>
                    </div>
                    <span aria-hidden="true">→</span>
                    <div>
                      <strong>{link.targetInputLabel}</strong>
                      <small>{link.targetUnit || "Unitless input"}</small>
                    </div>
                    <button type="button" className="schema-remove-row" onClick={() => removeLinkedInput(link)}>Remove link</button>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="calculation-link-note">The selected source run is immutable. The server resolves it again, validates structured values and units, and records the exact run provenance. No unit conversion is implicit.</p>
          </section>

          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={busy || !selected?.input_schema}>
              {busy ? "Running…" : "Run & save"}
            </button>
          </div>
          {message ? <p className="form-message" role="status" aria-live="polite">{message}</p> : null}
        </form>
      )}
    </section>
  );
}
