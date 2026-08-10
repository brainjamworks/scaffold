import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MIME,
  decodeStructuralFragment,
  type StructuralFragmentDecodeInvalidReason,
  type StructuralFragmentDecodeLimits,
  type StructuralFragmentV1Envelope,
} from "./structural-fragment-codec";

export const SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE = "data-scaffold-structural-fragment";
export const SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE = "v1";
export const SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE =
  "data-scaffold-structural-fragment-payload";

export type StructuralFragmentClipboardDataTransfer = Pick<DataTransfer, "types" | "getData">;

export type StructuralFragmentClipboardWritableDataTransfer =
  StructuralFragmentClipboardDataTransfer & Pick<DataTransfer, "clearData" | "setData">;

export interface StructuralFragmentClipboardWriteInput {
  readonly encodedFragment: string;
  readonly readableText: string;
}

export interface StructuralFragmentCarrierLimits {
  readonly maxCarrierBytes: number;
  readonly fragmentDecodeLimits: StructuralFragmentDecodeLimits;
}

export type StructuralFragmentCarrierInvalidReason =
  | StructuralFragmentDecodeInvalidReason
  | "invalid_carrier_limits"
  | "carrier_bytes_exceeded"
  | "unreadable_carrier"
  | "duplicate_html_marker"
  | "invalid_html_marker"
  | "malformed_base64"
  | "invalid_payload_utf8"
  | "not_structural_payload";

export type StructuralFragmentCarrierReadResult =
  | { readonly status: "absent" }
  | { readonly status: "ok"; readonly fragment: StructuralFragmentV1Envelope }
  | { readonly status: "invalid"; readonly reason: StructuralFragmentCarrierInvalidReason };

export type StructuralFragmentCarrierWriteResult =
  | { readonly status: "ok" }
  | { readonly status: "invalid"; readonly reason: StructuralFragmentCarrierInvalidReason };

export function writeStructuralFragmentClipboard(
  dataTransfer: StructuralFragmentClipboardWritableDataTransfer,
  input: StructuralFragmentClipboardWriteInput,
  limits: StructuralFragmentCarrierLimits,
): StructuralFragmentCarrierWriteResult {
  if (!Number.isSafeInteger(limits.maxCarrierBytes) || limits.maxCarrierBytes < 0) {
    return invalidWrite("invalid_carrier_limits");
  }
  if (!isUtf8ByteLengthWithin(input.encodedFragment, limits.maxCarrierBytes)) {
    return invalidWrite("carrier_bytes_exceeded");
  }

  const decoded = decodeStructuralFragment(input.encodedFragment, limits.fragmentDecodeLimits);
  if (decoded.status === "not-structural") return invalidWrite("not_structural_payload");
  if (decoded.status === "invalid") return invalidWrite(decoded.reason);

  const payload = encodeUtf8Base64(input.encodedFragment);
  const readableHtml = escapeHtml(input.readableText);
  const html = `<template ${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE}="${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE}" ${SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE}="${payload}"></template><p>${readableHtml}</p>`;
  if (
    !isUtf8ByteLengthWithin(input.readableText, limits.maxCarrierBytes) ||
    !isUtf8ByteLengthWithin(html, limits.maxCarrierBytes)
  ) {
    return invalidWrite("carrier_bytes_exceeded");
  }

  dataTransfer.clearData();
  dataTransfer.setData("text/plain", input.readableText);
  dataTransfer.setData("text/html", html);

  try {
    dataTransfer.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, input.encodedFragment);
  } catch {
    // Custom formats are an optimization; the mandatory HTML carrier remains authoritative.
  }
  return { status: "ok" };
}

export function readStructuralFragmentClipboard(
  dataTransfer: StructuralFragmentClipboardDataTransfer,
  limits: StructuralFragmentCarrierLimits,
): StructuralFragmentCarrierReadResult {
  if (!Number.isSafeInteger(limits.maxCarrierBytes) || limits.maxCarrierBytes < 0) {
    return invalid("invalid_carrier_limits");
  }

  const types = Array.from(dataTransfer.types);
  if (types.includes(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME)) {
    const encodedFragment = readData(dataTransfer, SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);
    if (encodedFragment === null) return invalid("unreadable_carrier");
    if (!isUtf8ByteLengthWithin(encodedFragment, limits.maxCarrierBytes)) {
      return invalid("carrier_bytes_exceeded");
    }
    return decodeRecognizedPayload(encodedFragment, limits.fragmentDecodeLimits);
  }

  if (!types.includes("text/html")) return { status: "absent" };

  const html = readData(dataTransfer, "text/html");
  if (html === null) return invalid("unreadable_carrier");
  if (!isUtf8ByteLengthWithin(html, limits.maxCarrierBytes)) {
    return invalid("carrier_bytes_exceeded");
  }

  let parsed: Document;
  try {
    parsed = new DOMParser().parseFromString(html, "text/html");
  } catch {
    return invalid("invalid_html_marker");
  }

  const markers = parsed.querySelectorAll(`[${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE}]`);
  if (markers.length === 0) return { status: "absent" };
  if (markers.length !== 1) return invalid("duplicate_html_marker");

  const marker = markers.item(0);
  if (!isExactMarker(marker)) return invalid("invalid_html_marker");

  const payload = marker.getAttribute(SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE);
  if (!payload) return invalid("invalid_html_marker");

  const decodedPayload = decodeUtf8Base64(payload);
  if (decodedPayload.status === "invalid") return decodedPayload;
  return decodeRecognizedPayload(decodedPayload.value, limits.fragmentDecodeLimits);
}

function decodeRecognizedPayload(
  encodedFragment: string,
  limits: StructuralFragmentDecodeLimits,
): StructuralFragmentCarrierReadResult {
  const decoded = decodeStructuralFragment(encodedFragment, limits);
  if (decoded.status === "not-structural") return invalid("not_structural_payload");
  return decoded;
}

function readData(
  dataTransfer: StructuralFragmentClipboardDataTransfer,
  format: string,
): string | null {
  try {
    return dataTransfer.getData(format);
  } catch {
    return null;
  }
}

function isExactMarker(marker: Element): marker is HTMLTemplateElement {
  if (marker.tagName !== "TEMPLATE") return false;
  if (marker.attributes.length !== 2) return false;
  if (
    marker.getAttribute(SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE) !==
    SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE
  ) {
    return false;
  }
  if (!marker.hasAttribute(SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE)) return false;

  return (marker as HTMLTemplateElement).content.childNodes.length === 0;
}

function encodeUtf8Base64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

type Base64DecodeResult =
  | { readonly status: "ok"; readonly value: string }
  | {
      readonly status: "invalid";
      readonly reason: "malformed_base64" | "invalid_payload_utf8";
    };

function decodeUtf8Base64(payload: string): Base64DecodeResult {
  if (!isCanonicalBase64Shape(payload)) {
    return { status: "invalid", reason: "malformed_base64" };
  }

  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    return { status: "invalid", reason: "malformed_base64" };
  }

  if (btoa(binary) !== payload) return { status: "invalid", reason: "malformed_base64" };

  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  try {
    return { status: "ok", value: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { status: "invalid", reason: "invalid_payload_utf8" };
  }
}

function isCanonicalBase64Shape(value: string): boolean {
  return (
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function invalid(
  reason: StructuralFragmentCarrierInvalidReason,
): StructuralFragmentCarrierReadResult {
  return { status: "invalid", reason };
}

function invalidWrite(
  reason: StructuralFragmentCarrierInvalidReason,
): StructuralFragmentCarrierWriteResult {
  return { status: "invalid", reason };
}
