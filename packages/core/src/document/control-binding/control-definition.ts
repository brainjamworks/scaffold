export type ControlEventType = string;
export type ControlStateKey = string;
export type ControlCommandType = string;

export interface ControlEventDefinition {
  readonly type: ControlEventType;
  readonly label: string;
}

export interface ControlValueOption {
  readonly value: string;
  readonly label: string;
}

export type ControlValueTypeDefinition =
  | {
      readonly kind: "boolean";
    }
  | {
      readonly kind: "enum";
      readonly options: readonly [ControlValueOption, ControlValueOption, ...ControlValueOption[]];
    }
  | {
      readonly kind: "number";
      readonly min: number;
      readonly max: number;
      readonly unitLabel: string;
      readonly step?: number;
    };

export type ControlValue = boolean | string | number;

export interface ControlRuntimeBoundedNumberDefinition {
  readonly kind: "runtime-bounded-number";
  readonly min: number;
  readonly unitLabel: string;
  readonly step?: number;
}

export type ControlStateValueTypeDefinition =
  | ControlValueTypeDefinition
  | ControlRuntimeBoundedNumberDefinition;

export type ControlCommandInputDefinition =
  | ControlValueTypeDefinition
  | ControlRuntimeBoundedNumberDefinition;

export interface ControlStateDefinition {
  readonly key: ControlStateKey;
  readonly label: string;
  readonly valueType: ControlStateValueTypeDefinition;
}

export interface ControlCommandDefinition {
  readonly type: ControlCommandType;
  readonly label: string;
  readonly input?: ControlCommandInputDefinition;
}

export interface ControlCapabilitySetDefinition {
  readonly events?: readonly [ControlEventDefinition, ...ControlEventDefinition[]];
  readonly states?: readonly [ControlStateDefinition, ...ControlStateDefinition[]];
  readonly commands?: readonly [ControlCommandDefinition, ...ControlCommandDefinition[]];
}

export interface ControlDefinition {
  readonly owner?: ControlCapabilitySetDefinition;
  readonly semanticChildren?: Readonly<Record<string, ControlCapabilitySetDefinition>>;
}

export function normalizeControlDefinition(
  definition: ControlDefinition | undefined,
): ControlDefinition | undefined {
  if (definition === undefined) return undefined;

  if (!isRecord(definition) || !hasOnlyKeys(definition, ["owner", "semanticChildren"])) {
    throw new Error("Control definition has an invalid shape.");
  }

  const owner =
    definition["owner"] === undefined
      ? undefined
      : normalizeCapabilitySet(definition["owner"], "owner");
  const semanticChildren = normalizeSemanticChildren(definition["semanticChildren"]);

  if (owner === undefined && semanticChildren === undefined) {
    throw new Error(
      "Control definition must declare at least one non-empty owner or semantic-child capability set.",
    );
  }

  return Object.freeze({
    ...(owner ? { owner } : {}),
    ...(semanticChildren ? { semanticChildren } : {}),
  });
}

function normalizeCapabilitySet(
  capabilities: unknown,
  path: string,
): ControlCapabilitySetDefinition {
  if (!isRecord(capabilities) || !hasOnlyKeys(capabilities, ["events", "states", "commands"])) {
    throw new Error(`Control capability set "${path}" has an invalid shape.`);
  }

  const events = normalizeEvents(capabilities["events"], path);
  const states = normalizeStates(capabilities["states"], path);
  const commands = normalizeCommands(capabilities["commands"], path);

  if (events === undefined && states === undefined && commands === undefined) {
    throw new Error(`Control capability set "${path}" must declare at least one capability.`);
  }

  return Object.freeze({
    ...(events ? { events } : {}),
    ...(states ? { states } : {}),
    ...(commands ? { commands } : {}),
  });
}

function normalizeSemanticChildren(
  semanticChildren: unknown,
): Readonly<Record<string, ControlCapabilitySetDefinition>> | undefined {
  if (semanticChildren === undefined) return undefined;
  if (!isRecord(semanticChildren)) {
    throw new Error("Control definition semanticChildren must be a record.");
  }

  const entries = Object.entries(semanticChildren);
  if (entries.length === 0) return undefined;

  return Object.freeze(
    Object.fromEntries(
      entries.map(([nodeType, capabilities]) => {
        if (nodeType.length === 0) {
          throw new Error("Control definition semanticChildren keys must be non-empty node types.");
        }
        return [nodeType, normalizeCapabilitySet(capabilities, `semanticChildren.${nodeType}`)];
      }),
    ),
  );
}

function normalizeEvents(
  events: unknown,
  path: string,
): readonly [ControlEventDefinition, ...ControlEventDefinition[]] | undefined {
  if (events === undefined) return undefined;
  assertNonEmptyArray(events, `Control capability set "${path}" events must be non-empty.`);

  const seen = new Set<string>();
  return freezeNonEmptyArray(events, (event) => {
    if (
      !isRecord(event) ||
      !hasOnlyKeys(event, ["type", "label"]) ||
      typeof event["type"] !== "string" ||
      typeof event["label"] !== "string"
    ) {
      throw new Error(`Control capability set "${path}" has an invalid event definition.`);
    }
    if (seen.has(event["type"])) {
      throw new Error(
        `Control capability set "${path}" contains duplicate event type "${event["type"]}".`,
      );
    }
    seen.add(event["type"]);
    return Object.freeze({ type: event["type"], label: event["label"] });
  });
}

function normalizeStates(
  states: unknown,
  path: string,
): readonly [ControlStateDefinition, ...ControlStateDefinition[]] | undefined {
  if (states === undefined) return undefined;
  assertNonEmptyArray(states, `Control capability set "${path}" states must be non-empty.`);

  const seen = new Set<string>();
  return freezeNonEmptyArray(states, (state) => {
    if (
      !isRecord(state) ||
      !hasOnlyKeys(state, ["key", "label", "valueType"]) ||
      typeof state["key"] !== "string" ||
      typeof state["label"] !== "string"
    ) {
      throw new Error(`Control capability set "${path}" has an invalid state definition.`);
    }
    if (seen.has(state["key"])) {
      throw new Error(
        `Control capability set "${path}" contains duplicate state key "${state["key"]}".`,
      );
    }
    seen.add(state["key"]);
    return Object.freeze({
      key: state["key"],
      label: state["label"],
      valueType: normalizeStateValueType(
        state["valueType"],
        `${path}.states.${state["key"]}.valueType`,
      ),
    });
  });
}

function normalizeCommands(
  commands: unknown,
  path: string,
): readonly [ControlCommandDefinition, ...ControlCommandDefinition[]] | undefined {
  if (commands === undefined) return undefined;
  assertNonEmptyArray(commands, `Control capability set "${path}" commands must be non-empty.`);

  const seen = new Set<string>();
  return freezeNonEmptyArray(commands, (command) => {
    if (
      !isRecord(command) ||
      !hasOnlyKeys(command, ["type", "label", "input"]) ||
      typeof command["type"] !== "string" ||
      typeof command["label"] !== "string"
    ) {
      throw new Error(`Control capability set "${path}" has an invalid command definition.`);
    }
    if (seen.has(command["type"])) {
      throw new Error(
        `Control capability set "${path}" contains duplicate command type "${command["type"]}".`,
      );
    }
    seen.add(command["type"]);
    const input =
      command["input"] === undefined
        ? undefined
        : normalizeCommandInput(command["input"], `${path}.commands.${command["type"]}.input`);
    return Object.freeze({
      type: command["type"],
      label: command["label"],
      ...(input ? { input } : {}),
    });
  });
}

function normalizeCommandInput(valueType: unknown, path: string): ControlCommandInputDefinition {
  if (isRuntimeBoundedNumber(valueType)) return normalizeRuntimeBoundedNumber(valueType, path);
  return normalizeValueType(valueType, path);
}

function normalizeStateValueType(
  valueType: unknown,
  path: string,
): ControlStateValueTypeDefinition {
  if (isRuntimeBoundedNumber(valueType)) return normalizeRuntimeBoundedNumber(valueType, path);
  return normalizeValueType(valueType, path);
}

function isRuntimeBoundedNumber(valueType: unknown): valueType is Record<string, unknown> {
  return isRecord(valueType) && valueType["kind"] === "runtime-bounded-number";
}

function normalizeRuntimeBoundedNumber(
  valueType: Record<string, unknown>,
  path: string,
): ControlRuntimeBoundedNumberDefinition {
  if (
    !hasOnlyKeys(valueType, ["kind", "min", "unitLabel", "step"]) ||
    typeof valueType["min"] !== "number" ||
    typeof valueType["unitLabel"] !== "string"
  ) {
    throw new Error(`Control runtime number "${path}" has an invalid shape.`);
  }
  if (!Number.isFinite(valueType["min"])) {
    throw new Error(`Control runtime number "${path}" minimum must be finite.`);
  }
  const step = valueType["step"];
  if (step !== undefined && (typeof step !== "number" || !Number.isFinite(step) || step <= 0)) {
    throw new Error(`Control runtime number "${path}" step must be finite and positive.`);
  }
  return Object.freeze({
    kind: "runtime-bounded-number",
    min: valueType["min"],
    unitLabel: valueType["unitLabel"],
    ...(step === undefined ? {} : { step }),
  });
}

function normalizeValueType(valueType: unknown, path: string): ControlValueTypeDefinition {
  if (!isRecord(valueType) || typeof valueType["kind"] !== "string") {
    throw new Error(`Control value type "${path}" has an invalid shape.`);
  }

  if (valueType["kind"] === "boolean") {
    if (!hasOnlyKeys(valueType, ["kind"])) {
      throw new Error(`Control value type "${path}" has an invalid boolean shape.`);
    }
    return Object.freeze({ kind: "boolean" });
  }

  if (valueType["kind"] === "enum") {
    if (!hasOnlyKeys(valueType, ["kind", "options"]) || !Array.isArray(valueType["options"])) {
      throw new Error(`Control value type "${path}" has an invalid enum shape.`);
    }
    if (valueType["options"].length < 2) {
      throw new Error(`Control value type "${path}" enum must declare at least two options.`);
    }

    const seen = new Set<string>();
    return Object.freeze({
      kind: "enum",
      options: Object.freeze(
        valueType["options"].map((option) => {
          if (
            !isRecord(option) ||
            !hasOnlyKeys(option, ["value", "label"]) ||
            typeof option["value"] !== "string" ||
            typeof option["label"] !== "string"
          ) {
            throw new Error(`Control value type "${path}" has an invalid enum option.`);
          }
          if (seen.has(option["value"])) {
            throw new Error(
              `Control value type "${path}" enum contains duplicate option value "${option["value"]}".`,
            );
          }
          seen.add(option["value"]);
          return Object.freeze({ value: option["value"], label: option["label"] });
        }),
      ) as [ControlValueOption, ControlValueOption, ...ControlValueOption[]],
    });
  }

  if (valueType["kind"] === "number") {
    if (
      !hasOnlyKeys(valueType, ["kind", "min", "max", "unitLabel", "step"]) ||
      typeof valueType["min"] !== "number" ||
      typeof valueType["max"] !== "number" ||
      typeof valueType["unitLabel"] !== "string"
    ) {
      throw new Error(`Control value type "${path}" has an invalid number shape.`);
    }
    if (!Number.isFinite(valueType["min"]) || !Number.isFinite(valueType["max"])) {
      throw new Error(`Control value type "${path}" number bounds must be finite.`);
    }
    if (valueType["max"] <= valueType["min"]) {
      throw new Error(
        `Control value type "${path}" number maximum must be greater than its minimum.`,
      );
    }

    const step = valueType["step"];
    if (step !== undefined) {
      if (typeof step !== "number" || !Number.isFinite(step) || step <= 0) {
        throw new Error(`Control value type "${path}" number step must be finite and positive.`);
      }
      if (!dividesRange(valueType["max"] - valueType["min"], step)) {
        throw new Error(`Control value type "${path}" number step must divide the declared range.`);
      }
    }

    return Object.freeze({
      kind: "number",
      min: valueType["min"],
      max: valueType["max"],
      unitLabel: valueType["unitLabel"],
      ...(step === undefined ? {} : { step }),
    });
  }

  throw new Error(`Control value type "${path}" has unsupported kind "${valueType["kind"]}".`);
}

function freezeNonEmptyArray<Input, Output>(
  values: readonly [Input, ...Input[]],
  project: (value: Input) => Output,
): readonly [Output, ...Output[]] {
  return Object.freeze(values.map(project)) as [Output, ...Output[]];
}

function assertNonEmptyArray(
  value: unknown,
  emptyMessage: string,
): asserts value is [unknown, ...unknown[]] {
  if (!Array.isArray(value) || value.length === 0) throw new Error(emptyMessage);
}

function dividesRange(range: number, step: number): boolean {
  const quotient = range / step;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
  return Math.abs(quotient - Math.round(quotient)) <= tolerance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}
