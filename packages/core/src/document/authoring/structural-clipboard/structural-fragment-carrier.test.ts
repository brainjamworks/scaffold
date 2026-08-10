// @vitest-environment happy-dom

import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MIME,
  decodeStructuralFragment,
  encodeStructuralFragment,
  type StructuralFragmentDecodeLimits,
} from "./structural-fragment-codec";
import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE,
  SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE,
  SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE,
  readStructuralFragmentClipboard,
  writeStructuralFragmentClipboard,
  type StructuralFragmentCarrierLimits,
} from "./structural-fragment-carrier";

const FRAGMENT_LIMITS: StructuralFragmentDecodeLimits = {
  maxEncodedBytes: 1_000_000,
  maxNestingDepth: 1_000,
  maxVisitedValues: 100_000,
  maxArrayLength: 100_000,
  maxObjectPropertyCount: 100_000,
  maxStringBytes: 100_000,
};

const CARRIER_LIMITS: StructuralFragmentCarrierLimits = {
  maxCarrierBytes: 2_000_000,
  fragmentDecodeLimits: FRAGMENT_LIMITS,
};

describe("structural fragment clipboard carrier", () => {
  it("writes custom MIME, one inert HTML marker and readable plain text", () => {
    const clipboard = new MemoryDataTransfer();
    const encodedFragment = validEncodedFragment();
    const readableText = "Quiz: Capital cities";

    writeStructuralFragmentClipboard(clipboard, { encodedFragment, readableText }, CARRIER_LIMITS);

    expect(clipboard.getData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME)).toBe(encodedFragment);
    expect(clipboard.getData("text/plain")).toBe(readableText);
    expect(clipboard.getData("text/plain")).not.toContain(encodedFragment);

    const html = clipboard.getData("text/html");
    expect(html).not.toContain(encodedFragment);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const markers = parsed.querySelectorAll(`[${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE}]`);
    expect(markers).toHaveLength(1);
    expect(markers[0]?.tagName).toBe("TEMPLATE");
    expect(markers[0]?.getAttribute(SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE)).toBe(
      SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE,
    );
    expect(markers[0]?.getAttribute(SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE)).toBeTruthy();
    expect(parsed.body.textContent).toBe(readableText);

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual(
      decodeStructuralFragment(encodedFragment, FRAGMENT_LIMITS),
    );
  });

  it("keeps HTML and plain fallbacks when the browser refuses the custom MIME type", () => {
    const clipboard = new MemoryDataTransfer([SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]);
    const encodedFragment = validEncodedFragment();

    writeStructuralFragmentClipboard(
      clipboard,
      {
        encodedFragment,
        readableText: "Layout: Comparison",
      },
      CARRIER_LIMITS,
    );

    expect(clipboard.types).toEqual(["text/plain", "text/html"]);
    expect(clipboard.getData("text/plain")).toBe("Layout: Comparison");
    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toMatchObject({
      status: "ok",
    });
  });

  it("round-trips through the mandatory HTML marker after custom MIME is stripped", () => {
    const clipboard = writtenClipboard();
    clipboard.deleteData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toMatchObject({
      status: "ok",
      fragment: { rootKind: "block", content: { type: "quiz" } },
    });
  });

  it("returns absent when neither custom MIME nor an exact HTML marker exists", () => {
    const clipboard = new MemoryDataTransfer();
    clipboard.setData("text/html", '<p>{"protocol":"scaffold.structural-fragment"}</p>');
    clipboard.setData("text/plain", "ordinary rich text");

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "absent",
    });
  });

  it("does not fall through when invalid custom MIME accompanies a valid HTML marker", () => {
    const clipboard = writtenClipboard();
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, "{not-json");

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "malformed_json",
    });
  });

  it("treats an empty custom MIME value as a recognized invalid carrier", () => {
    const clipboard = writtenClipboard();
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, "");

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "malformed_json",
    });
  });

  it("rejects duplicate structural markers", () => {
    const clipboard = writtenHtmlClipboard();
    const html = clipboard.getData("text/html");
    clipboard.setData("text/html", `${html}${html}`);

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "duplicate_html_marker",
    });
  });

  it("rejects a structurally malformed or non-exact marker", () => {
    const clipboard = writtenHtmlClipboard();
    const html = clipboard
      .getData("text/html")
      .replace("<template ", '<template aria-hidden="true" ');
    clipboard.setData("text/html", html);

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "invalid_html_marker",
    });
  });

  it("rejects an HTML marker that is no longer inert and empty", () => {
    const clipboard = writtenHtmlClipboard();
    const html = clipboard
      .getData("text/html")
      .replace("</template>", "<span>unexpected marker content</span></template>");
    clipboard.setData("text/html", html);

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "invalid_html_marker",
    });
  });

  it("rejects malformed and non-canonical Base64 payloads", () => {
    for (const payload of ["%%%", "ZE=="]) {
      const clipboard = new MemoryDataTransfer();
      clipboard.setData("text/html", markerHtml(payload));

      expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
        status: "invalid",
        reason: "malformed_base64",
      });
    }
  });

  it("rejects a Base64 marker payload that is not valid UTF-8", () => {
    const clipboard = new MemoryDataTransfer();
    clipboard.setData("text/html", markerHtml("/w=="));

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "invalid_payload_utf8",
    });
  });

  it("applies the carrier byte boundary before decoding custom MIME", () => {
    const clipboard = writtenClipboard();
    const encodedBytes = utf8Bytes(clipboard.getData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME));

    expect(
      readStructuralFragmentClipboard(clipboard, carrierLimits({ maxCarrierBytes: encodedBytes })),
    ).toMatchObject({ status: "ok" });
    expect(
      readStructuralFragmentClipboard(
        clipboard,
        carrierLimits({ maxCarrierBytes: encodedBytes - 1 }),
      ),
    ).toEqual({ status: "invalid", reason: "carrier_bytes_exceeded" });
  });

  it("applies the carrier byte boundary before parsing HTML", () => {
    const clipboard = writtenHtmlClipboard("Surface: 😀");
    const htmlBytes = utf8Bytes(clipboard.getData("text/html"));

    expect(
      readStructuralFragmentClipboard(clipboard, carrierLimits({ maxCarrierBytes: htmlBytes })),
    ).toMatchObject({ status: "ok" });
    expect(
      readStructuralFragmentClipboard(clipboard, carrierLimits({ maxCarrierBytes: htmlBytes - 1 })),
    ).toEqual({ status: "invalid", reason: "carrier_bytes_exceeded" });
  });

  it("escapes hostile readable text without exposing JSON as visible fallback content", () => {
    const clipboard = new MemoryDataTransfer();
    const encodedFragment = encodeStructuralFragment({
      rootKind: "block",
      content: { type: "quiz", attrs: { correctAnswer: "private-answer" } },
    });
    const readableText = 'Quiz <img src=x onerror="attack()"> & "review"';

    writeStructuralFragmentClipboard(clipboard, { encodedFragment, readableText }, CARRIER_LIMITS);

    const html = clipboard.getData("text/html");
    const parsed = new DOMParser().parseFromString(html, "text/html");
    expect(parsed.body.querySelector("img, script")).toBeNull();
    expect(parsed.body.textContent).toBe(readableText);
    expect(parsed.body.textContent).not.toContain("private-answer");
    expect(clipboard.getData("text/plain")).toBe(readableText);
    expect(clipboard.getData("text/plain")).not.toContain("private-answer");
  });

  it("treats recognized carrier payloads as transport claims, not authentication", () => {
    const clipboard = new MemoryDataTransfer();
    clipboard.setData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME, '{"source":"claimed-scaffold"}');

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "not_structural_payload",
    });
  });

  it("propagates strict codec failures from an extracted marker payload", () => {
    const clipboard = new MemoryDataTransfer();
    const encodedFragment = JSON.stringify({
      protocol: "scaffold.structural-fragment",
      version: 1,
      documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      rootKind: "block",
      content: { type: "quiz" },
    });
    clipboard.setData("text/html", markerHtml(btoa(encodedFragment)));

    expect(readStructuralFragmentClipboard(clipboard, CARRIER_LIMITS)).toEqual({
      status: "invalid",
      reason: "unsupported_document_format_version",
    });
  });

  it("rejects invalid caller carrier limits", () => {
    expect(
      readStructuralFragmentClipboard(writtenClipboard(), carrierLimits({ maxCarrierBytes: -1 })),
    ).toEqual({ status: "invalid", reason: "invalid_carrier_limits" });
  });

  it("preflights the complete outbound carrier at the exact byte boundary", () => {
    const encodedFragment = validEncodedFragment();
    const readableText = "Surface: 😀";
    const probe = new MemoryDataTransfer();
    writeStructuralFragmentClipboard(probe, { encodedFragment, readableText }, CARRIER_LIMITS);
    const requiredBytes = Math.max(
      utf8Bytes(probe.getData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME)),
      utf8Bytes(probe.getData("text/html")),
      utf8Bytes(probe.getData("text/plain")),
    );

    const exact = new MemoryDataTransfer();
    expect(
      writeStructuralFragmentClipboard(
        exact,
        { encodedFragment, readableText },
        carrierLimits({ maxCarrierBytes: requiredBytes }),
      ),
    ).toEqual({ status: "ok" });

    const refused = new MemoryDataTransfer();
    refused.setData("text/plain", "existing clipboard data");
    expect(
      writeStructuralFragmentClipboard(
        refused,
        { encodedFragment, readableText },
        carrierLimits({ maxCarrierBytes: requiredBytes - 1 }),
      ),
    ).toEqual({ status: "invalid", reason: "carrier_bytes_exceeded" });
    expect(refused.types).toEqual(["text/plain"]);
    expect(refused.getData("text/plain")).toBe("existing clipboard data");
  });

  it("applies caller-owned decoded resource bounds before clearing clipboard data", () => {
    const clipboard = new MemoryDataTransfer();
    clipboard.setData("text/plain", "existing clipboard data");

    expect(
      writeStructuralFragmentClipboard(
        clipboard,
        { encodedFragment: validEncodedFragment(), readableText: "Block: Quiz" },
        {
          ...CARRIER_LIMITS,
          fragmentDecodeLimits: { ...FRAGMENT_LIMITS, maxStringBytes: 3 },
        },
      ),
    ).toEqual({ status: "invalid", reason: "string_bytes_exceeded" });
    expect(clipboard.types).toEqual(["text/plain"]);
    expect(clipboard.getData("text/plain")).toBe("existing clipboard data");
  });
});

class MemoryDataTransfer {
  readonly #data = new Map<string, string>();
  readonly #rejectedTypes: ReadonlySet<string>;

  constructor(rejectedTypes: readonly string[] = []) {
    this.#rejectedTypes = new Set(rejectedTypes);
  }

  get types(): readonly string[] {
    return [...this.#data.keys()];
  }

  getData(format: string): string {
    return this.#data.get(format) ?? "";
  }

  setData(format: string, data: string): void {
    if (this.#rejectedTypes.has(format)) throw new DOMException("Unsupported clipboard type");
    this.#data.set(format, data);
  }

  clearData(format?: string): void {
    if (format) this.#data.delete(format);
    else this.#data.clear();
  }

  deleteData(format: string): void {
    this.#data.delete(format);
  }
}

function validEncodedFragment(): string {
  return encodeStructuralFragment({
    rootKind: "block",
    content: { type: "quiz", attrs: { id: "quiz-source", title: "Capitales 😀" } },
  });
}

function writtenClipboard(readableText = "Quiz: Capital cities"): MemoryDataTransfer {
  const clipboard = new MemoryDataTransfer();
  writeStructuralFragmentClipboard(
    clipboard,
    {
      encodedFragment: validEncodedFragment(),
      readableText,
    },
    CARRIER_LIMITS,
  );
  return clipboard;
}

function writtenHtmlClipboard(readableText?: string): MemoryDataTransfer {
  const clipboard = writtenClipboard(readableText);
  clipboard.deleteData(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME);
  return clipboard;
}

function markerHtml(payload: string): string {
  return `<template ${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_ATTRIBUTE}="${SCAFFOLD_STRUCTURAL_FRAGMENT_MARKER_VALUE}" ${SCAFFOLD_STRUCTURAL_FRAGMENT_PAYLOAD_ATTRIBUTE}="${payload}"></template><p>Readable fallback</p>`;
}

function carrierLimits(
  overrides: Partial<StructuralFragmentCarrierLimits>,
): StructuralFragmentCarrierLimits {
  return { ...CARRIER_LIMITS, ...overrides };
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}
