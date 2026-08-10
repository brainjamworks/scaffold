import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MIME,
  SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL,
  SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION,
  decodeStructuralFragment,
  encodeStructuralFragment,
  type StructuralFragmentDecodeLimits,
  type StructuralFragmentRootKind,
} from "./structural-fragment-codec";

const GENEROUS_LIMITS: StructuralFragmentDecodeLimits = {
  maxEncodedBytes: 1_000_000,
  maxNestingDepth: 100_000,
  maxVisitedValues: 100_000,
  maxArrayLength: 100_000,
  maxObjectPropertyCount: 100_000,
  maxStringBytes: 100_000,
};

describe("structural fragment codec", () => {
  it("exports the v1 MIME type and encodes only the current protocol and document format", () => {
    expect(SCAFFOLD_STRUCTURAL_FRAGMENT_MIME).toBe(
      "application/x-scaffold-structural-fragment+json",
    );

    expect(
      JSON.parse(
        encodeStructuralFragment({
          rootKind: "block",
          content: {
            type: "quiz",
            attrs: { id: "quiz-source" },
            content: [{ type: "paragraph", attrs: { id: "paragraph-source" } }],
          },
        }),
      ),
    ).toEqual({
      protocol: "scaffold.structural-fragment",
      version: 1,
      documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      rootKind: "block",
      content: {
        type: "quiz",
        attrs: { id: "quiz-source" },
        content: [{ type: "paragraph", attrs: { id: "paragraph-source" } }],
      },
    });
  });

  it.each<StructuralFragmentRootKind>(["block", "layout", "surface"])(
    "decodes one closed %s root into newly owned JSON",
    (rootKind) => {
      const source = validEnvelope({ rootKind });
      const encoded = JSON.stringify(source);

      const result = decodeStructuralFragment(encoded, GENEROUS_LIMITS);

      expect(result).toEqual({ status: "ok", fragment: source });
      if (result.status !== "ok") throw new Error("Expected a decoded structural fragment");
      expect(result.fragment).not.toBe(source);
      expect(result.fragment.content).not.toBe(source["content"]);

      (source["content"] as { type: string }).type = "changed-after-decode";
      expect(result.fragment.content.type).toBe("example_block");
    },
  );

  it("classifies absent and unsupported protocols as non-structural content", () => {
    expect(decodeJson({ type: "paragraph" })).toEqual({ status: "not-structural" });
    expect(
      decodeJson({
        ...validEnvelope(),
        protocol: "another-application.structural-fragment",
      }),
    ).toEqual({ status: "not-structural" });
    expect(decodeStructuralFragment("null", GENEROUS_LIMITS)).toEqual({
      status: "not-structural",
    });
  });

  it("rejects an unsupported protocol version after the Scaffold protocol is claimed", () => {
    expect(
      decodeJson({
        ...validEnvelope(),
        version: SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION + 1,
      }),
    ).toEqual({ status: "invalid", reason: "unsupported_protocol_version" });
  });

  it("rejects an unsupported Scaffold document format", () => {
    expect(
      decodeJson({
        ...validEnvelope(),
        documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION + 1,
      }),
    ).toEqual({ status: "invalid", reason: "unsupported_document_format_version" });
  });

  it("rejects malformed JSON and trailing non-whitespace content", () => {
    expect(decodeStructuralFragment("{not-json", GENEROUS_LIMITS)).toEqual({
      status: "invalid",
      reason: "malformed_json",
    });
    expect(
      decodeStructuralFragment(`${JSON.stringify(validEnvelope())} trailing`, GENEROUS_LIMITS),
    ).toEqual({ status: "invalid", reason: "malformed_json" });
  });

  it("requires exactly the five v1 envelope keys", () => {
    const missingVersion = validEnvelope();
    delete missingVersion["version"];

    expect(decodeJson(missingVersion)).toEqual({
      status: "invalid",
      reason: "invalid_envelope",
    });
    expect(decodeJson({ ...validEnvelope(), extra: true })).toEqual({
      status: "invalid",
      reason: "invalid_envelope",
    });
  });

  it("strictly validates every envelope field after recognizing the protocol", () => {
    expect(decodeJson({ ...validEnvelope(), version: "1" })).toEqual({
      status: "invalid",
      reason: "invalid_envelope",
    });
    expect(decodeJson({ ...validEnvelope(), documentFormatVersion: "4" })).toEqual({
      status: "invalid",
      reason: "invalid_envelope",
    });
    expect(decodeJson({ ...validEnvelope(), rootKind: "section" })).toEqual({
      status: "invalid",
      reason: "invalid_root_kind",
    });
    expect(decodeJson({ ...validEnvelope(), content: [] })).toEqual({
      status: "invalid",
      reason: "invalid_content",
    });
    expect(decodeJson({ ...validEnvelope(), content: null })).toEqual({
      status: "invalid",
      reason: "invalid_content",
    });
    expect(decodeJson({ ...validEnvelope(), content: { type: "" } })).toEqual({
      status: "invalid",
      reason: "invalid_content",
    });
    expect(decodeJson({ ...validEnvelope(), content: { attrs: {} } })).toEqual({
      status: "invalid",
      reason: "invalid_content",
    });
  });

  it("rejects UTF-8 bytes before parsing and accepts the exact byte boundary", () => {
    const encoded = JSON.stringify(
      validEnvelope({ content: { type: `example_${"😀".repeat(8)}` } }),
    );
    const encodedBytes = new TextEncoder().encode(encoded).byteLength;

    expect(
      decodeStructuralFragment(encoded, limits({ maxEncodedBytes: encodedBytes })),
    ).toMatchObject({ status: "ok" });
    expect(
      decodeStructuralFragment(encoded, limits({ maxEncodedBytes: encodedBytes - 1 })),
    ).toEqual({ status: "invalid", reason: "encoded_bytes_exceeded" });

    const oversizedMalformed = `"${"😀".repeat(20)}`;
    expect(decodeStructuralFragment(oversizedMalformed, limits({ maxEncodedBytes: 8 }))).toEqual({
      status: "invalid",
      reason: "encoded_bytes_exceeded",
    });
  });

  it("accepts the exact nesting-depth boundary and rejects one level over", () => {
    const encoded = JSON.stringify(
      validEnvelope({
        content: { type: "example_block", attrs: { nested: { value: "leaf" } } },
      }),
    );

    expect(decodeStructuralFragment(encoded, limits({ maxNestingDepth: 4 }))).toMatchObject({
      status: "ok",
    });
    expect(decodeStructuralFragment(encoded, limits({ maxNestingDepth: 3 }))).toEqual({
      status: "invalid",
      reason: "nesting_depth_exceeded",
    });
  });

  it("accepts the exact visited-value boundary and rejects one value over", () => {
    const encoded = JSON.stringify(validEnvelope());

    expect(decodeStructuralFragment(encoded, limits({ maxVisitedValues: 7 }))).toMatchObject({
      status: "ok",
    });
    expect(decodeStructuralFragment(encoded, limits({ maxVisitedValues: 6 }))).toEqual({
      status: "invalid",
      reason: "visited_values_exceeded",
    });
  });

  it("accepts the exact array-length boundary and rejects one element over", () => {
    const encoded = JSON.stringify(
      validEnvelope({ content: { type: "example_block", content: [null, null] } }),
    );

    expect(decodeStructuralFragment(encoded, limits({ maxArrayLength: 2 }))).toMatchObject({
      status: "ok",
    });
    expect(decodeStructuralFragment(encoded, limits({ maxArrayLength: 1 }))).toEqual({
      status: "invalid",
      reason: "array_length_exceeded",
    });
  });

  it("accepts the exact object-property boundary and rejects one property over", () => {
    const encoded = JSON.stringify(
      validEnvelope({
        content: { type: "example_block", a: null, b: null, c: null, d: null, e: null },
      }),
    );

    expect(decodeStructuralFragment(encoded, limits({ maxObjectPropertyCount: 6 }))).toMatchObject({
      status: "ok",
    });
    expect(decodeStructuralFragment(encoded, limits({ maxObjectPropertyCount: 5 }))).toEqual({
      status: "invalid",
      reason: "object_property_count_exceeded",
    });
  });

  it("bounds UTF-8 bytes in both string values and object property names", () => {
    const longType = "😀".repeat(20);
    const encodedValue = JSON.stringify(validEnvelope({ content: { type: longType } }));

    expect(decodeStructuralFragment(encodedValue, limits({ maxStringBytes: 80 }))).toMatchObject({
      status: "ok",
    });
    expect(decodeStructuralFragment(encodedValue, limits({ maxStringBytes: 79 }))).toEqual({
      status: "invalid",
      reason: "string_bytes_exceeded",
    });

    const longPropertyName = "é".repeat(30);
    const encodedProperty = JSON.stringify(
      validEnvelope({ content: { type: "example_block", [longPropertyName]: null } }),
    );
    expect(decodeStructuralFragment(encodedProperty, limits({ maxStringBytes: 59 }))).toEqual({
      status: "invalid",
      reason: "string_bytes_exceeded",
    });
  });

  it.each(["1e400", "-1e400"])(
    "rejects the non-finite number produced by parsing %s",
    (overflowNumber) => {
      const encoded = rawEnvelope(`{"type":"example_block","value":${overflowNumber}}`);

      expect(decodeStructuralFragment(encoded, GENEROUS_LIMITS)).toEqual({
        status: "invalid",
        reason: "non_finite_number",
      });
    },
  );

  it.each(["\\ud800", "\\udfff"])(
    "rejects an unpaired UTF-16 surrogate in a string value (%s)",
    (surrogate) => {
      const encoded = rawEnvelope(`{"type":"example_block","value":"${surrogate}"}`);

      expect(decodeStructuralFragment(encoded, GENEROUS_LIMITS)).toEqual({
        status: "invalid",
        reason: "invalid_unicode",
      });
    },
  );

  it.each(["\\ud800", "\\udfff"])(
    "rejects an unpaired UTF-16 surrogate in an object property name (%s)",
    (surrogate) => {
      const encoded = rawEnvelope(`{"type":"example_block","${surrogate}":true}`);

      expect(decodeStructuralFragment(encoded, GENEROUS_LIMITS)).toEqual({
        status: "invalid",
        reason: "invalid_unicode",
      });
    },
  );

  it("accepts valid surrogate pairs in string values and object property names", () => {
    const encoded = rawEnvelope('{"type":"example_\\ud83d\\ude00","property_\\ud83d\\ude00":true}');

    expect(decodeStructuralFragment(encoded, GENEROUS_LIMITS)).toMatchObject({ status: "ok" });
  });

  it("handles deeply nested attacker-controlled JSON without recursive traversal", () => {
    const depth = 20_000;
    const encoded = `${JSON.stringify({
      protocol: SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL,
      version: SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION,
      documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
      rootKind: "block",
    }).slice(
      0,
      -1,
    )},"content":{"type":"example_block","nested":${'{"nested":'.repeat(depth)}"leaf"${"}".repeat(depth)}}}`;

    expect(decodeStructuralFragment(encoded, limits({ maxNestingDepth: 100 }))).toEqual({
      status: "invalid",
      reason: "nesting_depth_exceeded",
    });
  });

  it("rejects adversarially wide arrays before traversing their elements", () => {
    const encoded = JSON.stringify(
      validEnvelope({
        content: { type: "example_block", content: new Array(20_000).fill(null) },
      }),
    );

    expect(decodeStructuralFragment(encoded, limits({ maxArrayLength: 100 }))).toEqual({
      status: "invalid",
      reason: "array_length_exceeded",
    });
  });

  it("rejects invalid caller limit configuration instead of silently disabling a bound", () => {
    expect(
      decodeStructuralFragment(JSON.stringify(validEnvelope()), limits({ maxVisitedValues: -1 })),
    ).toEqual({ status: "invalid", reason: "invalid_limits" });
    expect(
      decodeStructuralFragment(
        JSON.stringify(validEnvelope()),
        limits({ maxEncodedBytes: Number.NaN }),
      ),
    ).toEqual({ status: "invalid", reason: "invalid_limits" });
  });
});

function validEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    protocol: SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL,
    version: SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION,
    documentFormatVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
    rootKind: "block",
    content: { type: "example_block" },
    ...overrides,
  };
}

function decodeJson(value: unknown) {
  return decodeStructuralFragment(JSON.stringify(value), GENEROUS_LIMITS);
}

function limits(
  overrides: Partial<StructuralFragmentDecodeLimits>,
): StructuralFragmentDecodeLimits {
  return { ...GENEROUS_LIMITS, ...overrides };
}

function rawEnvelope(content: string): string {
  return `{"protocol":"${SCAFFOLD_STRUCTURAL_FRAGMENT_PROTOCOL}","version":${SCAFFOLD_STRUCTURAL_FRAGMENT_VERSION},"documentFormatVersion":${SCAFFOLD_DOCUMENT_FORMAT_VERSION},"rootKind":"block","content":${content}}`;
}
