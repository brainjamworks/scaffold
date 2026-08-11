import type { DocumentEstablishmentIssue } from "./document-establishment";

export interface DocumentBounds {
  readonly maxNodeCount: number;
  readonly maxNestingDepth: number;
}

export const DEFAULT_DOCUMENT_BOUNDS: DocumentBounds = Object.freeze({
  maxNodeCount: 100_000,
  maxNestingDepth: 256,
});

export type BoundedJsonInspection =
  | {
      readonly ok: true;
      readonly ownedValue: unknown;
      readonly nodeCount: number;
      readonly nestingDepth: number;
    }
  | { readonly ok: false; readonly issue: DocumentEstablishmentIssue };

type JsonContainer = unknown[] | Record<string, unknown>;
type StackEntry =
  | {
      readonly phase: "enter";
      readonly value: unknown;
      readonly path: readonly (string | number)[];
      readonly depth: number;
      readonly target: JsonContainer | null;
      readonly key: string | number | null;
    }
  | { readonly phase: "leave"; readonly value: JsonContainer };

export function inspectBoundedJson(
  value: unknown,
  bounds: DocumentBounds = DEFAULT_DOCUMENT_BOUNDS,
): BoundedJsonInspection {
  const active = new WeakSet<object>();
  const stack: StackEntry[] = [
    { phase: "enter", value, path: [], depth: 0, target: null, key: null },
  ];
  let ownedValue: unknown;
  let nodeCount = 0;
  let nestingDepth = 0;

  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.phase === "leave") {
      active.delete(entry.value);
      continue;
    }

    if (isJsonPrimitive(entry.value)) {
      if (entry.target === null) ownedValue = entry.value;
      else defineOwnedValue(entry.target, entry.key!, entry.value);
      continue;
    }

    if (!isJsonContainer(entry.value)) {
      return invalidJson("invalid_json_value", "Document contains a non-JSON value.", entry.path);
    }

    let array: boolean;
    let descriptors: PropertyDescriptorMap;
    let prototype: object | null;
    try {
      array = Array.isArray(entry.value);
      descriptors = Object.getOwnPropertyDescriptors(entry.value) as PropertyDescriptorMap;
      prototype = Object.getPrototypeOf(entry.value);
    } catch {
      return invalidJson(
        "invalid_json_value",
        "Document contains an unreadable JSON value.",
        entry.path,
      );
    }

    const descriptorKeys = Reflect.ownKeys(descriptors);
    if (descriptorKeys.some((key) => typeof key === "symbol")) {
      return invalidJson("invalid_json_value", "Document contains a non-JSON value.", entry.path);
    }
    const keys = descriptorKeys as string[];
    const ownedContainer: JsonContainer = array
      ? []
      : (Object.create(null) as Record<string, unknown>);
    if (entry.target === null) ownedValue = ownedContainer;
    else defineOwnedValue(entry.target, entry.key!, ownedContainer);

    const depth = entry.depth + 1;
    nestingDepth = Math.max(nestingDepth, depth);
    if (depth > bounds.maxNestingDepth) {
      return invalidJson(
        "document_depth_exceeded",
        `Document nesting depth exceeds ${bounds.maxNestingDepth}.`,
        entry.path,
      );
    }
    if (active.has(entry.value)) {
      return invalidJson("cyclic_json", "Document JSON must not contain cycles.", entry.path);
    }
    active.add(entry.value);
    stack.push({ phase: "leave", value: entry.value });

    if (array) {
      const elementKeys = keys.filter((key) => key !== "length");
      if (
        prototype !== Array.prototype ||
        elementKeys.some((key) => !descriptors[key]!.enumerable) ||
        elementKeys.length !== descriptors["length"]?.value ||
        elementKeys.some(
          (key, index) =>
            key !== String(index) ||
            descriptors[key]?.get !== undefined ||
            descriptors[key]?.set !== undefined,
        )
      ) {
        return invalidJson("invalid_json_value", "Document contains a non-JSON array.", entry.path);
      }
      for (let index = elementKeys.length - 1; index >= 0; index -= 1) {
        stack.push({
          phase: "enter",
          value: descriptors[String(index)]!.value,
          path: [...entry.path, index],
          depth,
          target: ownedContainer,
          key: index,
        });
      }
      continue;
    }

    if (
      (prototype !== Object.prototype && prototype !== null) ||
      Object.values(descriptors).some(
        (descriptor) =>
          !descriptor.enumerable || descriptor.get !== undefined || descriptor.set !== undefined,
      )
    ) {
      return invalidJson("invalid_json_value", "Document contains a non-JSON object.", entry.path);
    }

    if (typeof descriptors["type"]?.value === "string") {
      nodeCount += 1;
      if (nodeCount > bounds.maxNodeCount) {
        return invalidJson(
          "document_nodes_exceeded",
          `Document node count exceeds ${bounds.maxNodeCount}.`,
          entry.path,
        );
      }
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      stack.push({
        phase: "enter",
        value: descriptors[key]!.value,
        path: [...entry.path, key],
        depth,
        target: ownedContainer,
        key,
      });
    }
  }

  return { ok: true, ownedValue, nodeCount, nestingDepth };
}

export function cloneBoundedJson<T>(value: T): T {
  const inspected = inspectBoundedJson(value);
  if (!inspected.ok) throw new TypeError(inspected.issue.message);
  return inspected.ownedValue as T;
}

function isJsonPrimitive(value: unknown): value is null | string | boolean | number {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isJsonContainer(value: unknown): value is JsonContainer {
  return value !== null && typeof value === "object";
}

function defineOwnedValue(target: JsonContainer, key: string | number, value: unknown): void {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

function invalidJson(
  code: string,
  message: string,
  path: readonly (string | number)[],
): BoundedJsonInspection {
  return { ok: false, issue: { code, message, path } };
}
