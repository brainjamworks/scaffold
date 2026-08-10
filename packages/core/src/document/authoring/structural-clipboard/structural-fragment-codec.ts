import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@scaffold/contracts";

export const SCAFFOLD_STRUCTURAL_FRAGMENT_MIME = "application/x-scaffold-structural-fragment+json";
export const SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL = "scaffold.structural-fragment";
export const SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION = 1;

export type StructuralFragmentRootKind = "block" | "layout" | "surface";

export type StructuralFragmentJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly StructuralFragmentJsonValue[]
  | StructuralFragmentJsonObject;

export interface StructuralFragmentJsonObject {
  readonly [key: string]: StructuralFragmentJsonValue;
}

export interface StructuralFragmentContent extends StructuralFragmentJsonObject {
  readonly type: string;
}

export interface StructuralFragmentV1Envelope {
  readonly protocol: typeof SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL;
  readonly version: typeof SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION;
  readonly documentFormatVersion: typeof SCAFFOLD_DOCUMENT_FORMAT_VERSION;
  readonly rootKind: StructuralFragmentRootKind;
  readonly content: StructuralFragmentContent;
}

export interface StructuralFragmentEncodeInput {
  readonly rootKind: StructuralFragmentRootKind;
  readonly content: StructuralFragmentContent;
}

export interface StructuralFragmentDecodeLimits {
  readonly maxEncodedBytes: number;
  /** The decoded envelope is depth zero; each object property or array element adds one. */
  readonly maxNestingDepth: number;
  /** Counts the root and every object-property or array-element value, but not object keys. */
  readonly maxVisitedValues: number;
  readonly maxArrayLength: number;
  readonly maxObjectPropertyCount: number;
  /** Applies to both string values and object property names. */
  readonly maxStringBytes: number;
}

export type StructuralFragmentDecodeInvalidReason =
  | "invalid_limits"
  | "encoded_bytes_exceeded"
  | "malformed_json"
  | "nesting_depth_exceeded"
  | "visited_values_exceeded"
  | "array_length_exceeded"
  | "object_property_count_exceeded"
  | "string_bytes_exceeded"
  | "non_finite_number"
  | "invalid_unicode"
  | "invalid_envelope"
  | "unsupported_protocol_version"
  | "unsupported_document_format_version"
  | "invalid_root_kind"
  | "invalid_content";

export type StructuralFragmentDecodeResult =
  | { readonly status: "ok"; readonly fragment: StructuralFragmentV1Envelope }
  | { readonly status: "not-structural" }
  | { readonly status: "invalid"; readonly reason: StructuralFragmentDecodeInvalidReason };

export function encodeStructuralFragment(input: StructuralFragmentEncodeInput): string {
  return JSON.stringify({
    protocol: SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL,
    version: SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION,
    documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    rootKind: input.rootKind,
    content: input.content,
  } satisfies StructuralFragmentV1Envelope);
}

export function decodeStructuralFragment(
  encoded: string,
  limits: StructuralFragmentDecodeLimits,
): StructuralFragmentDecodeResult {
  if (!hasValidLimits(limits)) return invalid("invalid_limits");
  if (!isUtf8ByteLengthWithin(encoded, limits.maxEncodedBytes)) {
    return invalid("encoded_bytes_exceeded");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return invalid("malformed_json");
  }

  const boundFailure = findBoundFailure(parsed, limits);
  if (boundFailure) return invalid(boundFailure);

  if (!isJsonObject(parsed)) return { status: "not-structural" };
  if (parsed["protocol"] !== SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL) {
    return { status: "not-structural" };
  }

  const envelopeKeys = Object.keys(parsed);
  if (
    envelopeKeys.length !== STRUCTURAL_FRAGMENT_ENVELOPE_KEYS.length ||
    !STRUCTURAL_FRAGMENT_ENVELOPE_KEYS.every((key) =>
      Object.prototype.hasOwnProperty.call(parsed, key),
    )
  ) {
    return invalid("invalid_envelope");
  }

  const protocolVersion = parsed["version"];
  if (typeof protocolVersion !== "number") return invalid("invalid_envelope");
  if (protocolVersion !== SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION) {
    return invalid("unsupported_protocol_version");
  }

  const documentFormatVersion = parsed["documentFormatVersion"];
  if (typeof documentFormatVersion !== "number") return invalid("invalid_envelope");
  if (documentFormatVersion !== SCAFFOLD_DOCUMENT_FORMAT_VERSION) {
    return invalid("unsupported_document_format_version");
  }

  if (!isRootKind(parsed["rootKind"])) return invalid("invalid_root_kind");

  const content = parsed["content"];
  if (
    !isJsonObject(content) ||
    typeof content["type"] !== "string" ||
    content["type"].length === 0
  ) {
    return invalid("invalid_content");
  }

  return { status: "ok", fragment: parsed as unknown as StructuralFragmentV1Envelope };
}

const STRUCTURAL_FRAGMENT_ENVELOPE_KEYS = [
  "protocol",
  "version",
  "documentFormatVersion",
  "rootKind",
  "content",
] as const;

interface PendingValue {
  readonly value: unknown;
  readonly depth: number;
}

function findBoundFailure(
  root: unknown,
  limits: StructuralFragmentDecodeLimits,
): StructuralFragmentDecodeInvalidReason | null {
  const pending: PendingValue[] = [{ value: root, depth: 0 }];
  let visitedValues = 0;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;

    visitedValues += 1;
    if (visitedValues > limits.maxVisitedValues) return "visited_values_exceeded";
    if (current.depth > limits.maxNestingDepth) return "nesting_depth_exceeded";

    if (typeof current.value === "string") {
      const stringFailure = findDecodedStringFailure(current.value, limits.maxStringBytes);
      if (stringFailure) return stringFailure;
      continue;
    }

    if (typeof current.value === "number" && !Number.isFinite(current.value)) {
      return "non_finite_number";
    }

    if (current.value === null || typeof current.value !== "object") continue;

    if (Array.isArray(current.value)) {
      if (current.value.length > limits.maxArrayLength) return "array_length_exceeded";
      for (let index = current.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: current.value[index], depth: current.depth + 1 });
      }
      continue;
    }

    const keys = Object.keys(current.value);
    if (keys.length > limits.maxObjectPropertyCount) {
      return "object_property_count_exceeded";
    }

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      const keyFailure = findDecodedStringFailure(key, limits.maxStringBytes);
      if (keyFailure) return keyFailure;
      pending.push({
        value: (current.value as Record<string, unknown>)[key],
        depth: current.depth + 1,
      });
    }
  }

  return null;
}

function findDecodedStringFailure(
  value: string,
  maximumBytes: number,
): "invalid_unicode" | "string_bytes_exceeded" | null {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) return "invalid_unicode";
      bytes += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return "invalid_unicode";
    } else {
      bytes += 3;
    }

    if (bytes > maximumBytes) return "string_bytes_exceeded";
  }

  return null;
}

function hasValidLimits(limits: StructuralFragmentDecodeLimits): boolean {
  return [
    limits.maxEncodedBytes,
    limits.maxNestingDepth,
    limits.maxVisitedValues,
    limits.maxArrayLength,
    limits.maxObjectPropertyCount,
    limits.maxStringBytes,
  ].every((limit) => Number.isSafeInteger(limit) && limit >= 0);
}

function isUtf8ByteLengthWithin(value: string, maximumBytes: number): boolean {
  let bytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) {
      bytes += 1;
    } else if (codeUnit <= 0x7ff) {
      bytes += 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }

    if (bytes > maximumBytes) return false;
  }

  return true;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRootKind(value: unknown): value is StructuralFragmentRootKind {
  return value === "block" || value === "layout" || value === "surface";
}

function invalid(reason: StructuralFragmentDecodeInvalidReason): StructuralFragmentDecodeResult {
  return { status: "invalid", reason };
}
