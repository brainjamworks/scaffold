import { AssessmentResponseValueSchema, type AssessmentResponseValue } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { AssessmentCapabilityResponseDefinition, BlockDefinition } from "../block-definition";
import { categoriseBlockDefinition } from "./categorise/categorise-definition";
import { dropdownBlockDefinition } from "./dropdown/dropdown-definition";
import { fillBlanksBlockDefinition } from "./fill-blanks/fill-blanks-definition";
import { imageHotspotBlockDefinition } from "./image-hotspot/image-hotspot-definition";
import { matchingBlockDefinition } from "./matching/matching-definition";
import { mcqBlockDefinition } from "./mcq/mcq-definition";
import { multiselectBlockDefinition } from "./multiselect/multiselect-definition";
import { sequencingBlockDefinition } from "./sequencing/sequencing-definition";

interface CodecCase {
  name: string;
  codec: AssessmentCapabilityResponseDefinition;
  localResponses: readonly [unknown, unknown, unknown];
  wrongContractResponse: AssessmentResponseValue;
  duplicateLocalResponse?: unknown;
  duplicateContractResponse?: AssessmentResponseValue;
}

function responseCodec(definition: BlockDefinition): AssessmentCapabilityResponseDefinition {
  const codec = definition.capabilities?.assessment?.response;
  if (!codec) throw new Error(`Expected ${definition.nodeType} response codec`);
  return codec;
}

const codecCases: CodecCase[] = [
  {
    name: "mcq",
    codec: responseCodec(mcqBlockDefinition),
    localResponses: [{ choices: null }, {}, { choices: "option-b" }],
    wrongContractResponse: { kind: "multi-select", optionIds: ["option-b"] },
  },
  {
    name: "dropdown",
    codec: responseCodec(dropdownBlockDefinition),
    localResponses: [{ choices: null }, {}, { choices: "option-b" }],
    wrongContractResponse: { kind: "sequence", orderedItemIds: ["option-b"] },
  },
  {
    name: "multiselect",
    codec: responseCodec(multiselectBlockDefinition),
    localResponses: [
      { choices: [] },
      { choices: ["option-a"] },
      { choices: ["option-a", "option-c"] },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "option-a" },
    duplicateLocalResponse: { choices: ["option-a", "option-a"] },
    duplicateContractResponse: {
      kind: "multi-select",
      optionIds: ["option-a", "option-a"],
    },
  },
  {
    name: "sequencing",
    codec: responseCodec(sequencingBlockDefinition),
    localResponses: [{ order: [] }, { order: ["item-a"] }, { order: ["item-b", "item-a"] }],
    wrongContractResponse: { kind: "single-select", optionId: "item-a" },
    duplicateLocalResponse: { order: ["item-a", "item-a"] },
    duplicateContractResponse: {
      kind: "sequence",
      orderedItemIds: ["item-a", "item-a"],
    },
  },
  {
    name: "categorise",
    codec: responseCodec(categoriseBlockDefinition),
    localResponses: [
      { placements: {} },
      { placements: { "item-a": "category-a" } },
      { placements: { "item-a": "category-b", "item-b": "category-a" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "category-a" },
    duplicateContractResponse: {
      kind: "classify",
      placements: [
        { itemId: "item-a", categoryId: "category-a" },
        { itemId: "item-a", categoryId: "category-b" },
      ],
    },
  },
  {
    name: "matching",
    codec: responseCodec(matchingBlockDefinition),
    localResponses: [
      { matches: {} },
      { matches: { "item-a": "target-a" } },
      { matches: { "item-a": "target-b", "item-b": "target-a" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "target-a" },
    duplicateContractResponse: {
      kind: "match",
      pairs: [
        { itemId: "item-a", targetId: "target-a" },
        { itemId: "item-a", targetId: "target-b" },
      ],
    },
  },
  {
    name: "fill-blanks",
    codec: responseCodec(fillBlanksBlockDefinition),
    localResponses: [
      { blanks: {} },
      { blanks: { "blank-a": "" } },
      { blanks: { "blank-a": "Paris", "blank-b": "France" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "Paris" },
    duplicateContractResponse: {
      kind: "fill-blanks",
      blanks: [
        { blankId: "blank-a", value: "Paris" },
        { blankId: "blank-a", value: "Lyon" },
      ],
    },
  },
  {
    name: "image-hotspot",
    codec: responseCodec(imageHotspotBlockDefinition),
    localResponses: [
      { clicks: [] },
      { clicks: [{ id: "click-a", hotspotId: null, x: 0.1, y: 0.2 }] },
      {
        clicks: [
          { id: "click-a", hotspotId: "hotspot-a", x: 0.1, y: 0.2 },
          { id: "click-b", hotspotId: "hotspot-b", x: 0.7, y: 0.8 },
        ],
      },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "hotspot-a" },
    duplicateLocalResponse: {
      clicks: [
        { id: "click-a", hotspotId: null, x: 0.1, y: 0.2 },
        { id: "click-a", hotspotId: "hotspot-a", x: 0.7, y: 0.8 },
      ],
    },
    duplicateContractResponse: {
      kind: "spatial-hotspot",
      selections: [
        { hotspotId: "hotspot-a", x: 0.1, y: 0.2 },
        { hotspotId: "hotspot-a", x: 0.1, y: 0.2 },
      ],
    },
  },
];

describe("assessment response codecs", () => {
  it("requires Sequencing responses to be the exact current item permutation", () => {
    const codec = responseCodec(sequencingBlockDefinition);
    const interaction = {
      kind: "sequence" as const,
      items: [{ id: "item-b" }, { id: "item-a" }, { id: "item-c" }],
    };

    expect(codec.hasResponse({ order: [] }, interaction)).toBe(false);
    expect(codec.hasResponse({ order: ["item-b", "item-a"] }, interaction)).toBe(false);
    expect(codec.hasResponse({ order: ["item-b", "item-a", "stale"] }, interaction)).toBe(false);
    expect(codec.hasResponse({ order: ["item-b", "item-a", ""] }, interaction)).toBe(false);
    expect(() => codec.hasResponse({ order: ["item-b", "item-b", "item-c"] }, interaction)).toThrow(
      "Sequence response item ids must be unique",
    );
    expect(codec.hasResponse({ order: ["item-c", "item-b", "item-a"] }, interaction)).toBe(true);

    expect(
      codec.toContractResponse({ order: ["item-c", "item-b", "item-a"] }, interaction),
    ).toEqual({
      kind: "sequence",
      orderedItemIds: ["item-c", "item-b", "item-a"],
    });
    expect(codec.toContractResponse({ order: ["item-b", "stale"] }, interaction)).toEqual({
      kind: "sequence",
      orderedItemIds: [],
    });
    expect(
      codec.fromContractResponse(
        { kind: "sequence", orderedItemIds: ["stale", "item-a", "item-b"] },
        interaction,
      ),
    ).toEqual({ order: ["item-a", "item-b"] });
  });

  it("rejects ambiguous Sequencing interaction and response identities", () => {
    const codec = responseCodec(sequencingBlockDefinition);

    expect(() =>
      codec.hasResponse(
        { order: ["item-a", "item-a"] },
        { kind: "sequence", items: [{ id: "item-a" }, { id: "item-b" }] },
      ),
    ).toThrow("Sequence response item ids must be unique");
    expect(() =>
      codec.hasResponse(
        { order: ["item-a"] },
        { kind: "sequence", items: [{ id: "item-a" }, { id: "item-a" }] },
      ),
    ).toThrow("Sequence interaction item ids must be nonblank and unique");
    expect(() =>
      codec.hasResponse({ order: ["item-a"] }, { kind: "sequence", items: [{ id: " " }] }),
    ).toThrow("Sequence interaction item ids must be nonblank and unique");
  });

  it("filters Fill state to current projected blanks and requires every current blank", () => {
    const codec = responseCodec(fillBlanksBlockDefinition);
    const interaction = {
      kind: "fill-blanks" as const,
      blanks: [{ id: "blank-b" }, { id: "blank-a" }],
    };
    const local = {
      blanks: {
        stale: "must not count",
        "blank-a": " Paris ",
        "blank-b": "France",
      },
    };

    expect(codec.hasResponse({ blanks: { stale: "value" } }, interaction)).toBe(false);
    expect(codec.hasResponse({ blanks: { "blank-a": "Paris" } }, interaction)).toBe(false);
    expect(
      codec.hasResponse({ blanks: { "blank-a": " \t", "blank-b": "France" } }, interaction),
    ).toBe(false);
    expect(codec.hasResponse(local, interaction)).toBe(true);
    expect(codec.toContractResponse(local, interaction)).toEqual({
      kind: "fill-blanks",
      blanks: [
        { blankId: "blank-b", value: "France" },
        { blankId: "blank-a", value: " Paris " },
      ],
    });
    expect(
      codec.fromContractResponse(
        {
          kind: "fill-blanks",
          blanks: [
            { blankId: "stale", value: "discard me" },
            { blankId: "blank-a", value: "Paris" },
          ],
        },
        interaction,
      ),
    ).toEqual({ blanks: { "blank-a": "Paris" } });
  });

  it("requires Categorise responses to be the exact current mapping", () => {
    const codec = responseCodec(categoriseBlockDefinition);
    const interaction = {
      kind: "classify" as const,
      items: [{ id: "item-b" }, { id: "item-a" }],
      categories: [{ id: "category-a" }, { id: "category-b" }],
    };

    expect(codec.hasResponse({ placements: {} }, interaction)).toBe(false);
    expect(codec.hasResponse({ placements: { "item-a": "category-a" } }, interaction)).toBe(false);
    expect(
      codec.hasResponse(
        { placements: { "item-a": "category-a", stale: "category-b" } },
        interaction,
      ),
    ).toBe(false);
    expect(
      codec.hasResponse(
        { placements: { "item-a": "category-a", "item-b": "unknown" } },
        interaction,
      ),
    ).toBe(false);
    expect(
      codec.hasResponse(
        { placements: { "item-a": "category-a", "item-b": "category-b" } },
        interaction,
      ),
    ).toBe(true);

    expect(
      codec.toContractResponse(
        {
          placements: {
            "item-a": "category-a",
            "item-b": "category-b",
            stale: "category-a",
          },
        },
        interaction,
      ),
    ).toEqual({
      kind: "classify",
      placements: [
        { itemId: "item-b", categoryId: "category-b" },
        { itemId: "item-a", categoryId: "category-a" },
      ],
    });

    expect(
      codec.fromContractResponse(
        {
          kind: "classify",
          placements: [
            { itemId: "stale", categoryId: "category-a" },
            { itemId: "item-a", categoryId: "unknown" },
            { itemId: "item-b", categoryId: "category-b" },
          ],
        },
        interaction,
      ),
    ).toEqual({ placements: { "item-b": "category-b" } });
  });

  it("rejects ambiguous Categorise interaction and canonical response identities", () => {
    const codec = responseCodec(categoriseBlockDefinition);

    expect(() =>
      codec.hasResponse(
        { placements: { "item-a": "category-a" } },
        {
          kind: "classify",
          items: [{ id: "item-a" }, { id: "item-a" }],
          categories: [{ id: "category-a" }, { id: "category-b" }],
        },
      ),
    ).toThrow("Categorise interaction item ids must be nonblank and unique");
    expect(() =>
      codec.hasResponse(
        { placements: { "item-a": "category-a" } },
        {
          kind: "classify",
          items: [{ id: "item-a" }],
          categories: [{ id: "category-a" }, { id: " " }],
        },
      ),
    ).toThrow("Categorise interaction category ids must be nonblank and unique");
    expect(() =>
      codec.fromContractResponse(
        {
          kind: "classify",
          placements: [
            { itemId: "item-a", categoryId: "category-a" },
            { itemId: "item-a", categoryId: "category-b" },
          ],
        },
        {
          kind: "classify",
          items: [{ id: "item-a" }],
          categories: [{ id: "category-a" }, { id: "category-b" }],
        },
      ),
    ).toThrow("Categorise response item ids must be unique");
  });

  it("requires Matching responses to be the exact current one-to-one mapping", () => {
    const codec = responseCodec(matchingBlockDefinition);
    const interaction = {
      kind: "match" as const,
      items: [{ id: "item-b" }, { id: "item-a" }],
      targets: [{ id: "target-a" }, { id: "target-b" }],
    };

    expect(codec.hasResponse({ matches: {} }, interaction)).toBe(false);
    expect(codec.hasResponse({ matches: { "item-a": "target-a" } }, interaction)).toBe(false);
    expect(
      codec.hasResponse({ matches: { "item-a": "target-a", stale: "target-b" } }, interaction),
    ).toBe(false);
    expect(
      codec.hasResponse({ matches: { "item-a": "target-a", "item-b": "unknown" } }, interaction),
    ).toBe(false);
    expect(
      codec.hasResponse({ matches: { "item-a": "target-a", "item-b": "target-a" } }, interaction),
    ).toBe(false);
    expect(
      codec.hasResponse({ matches: { "item-a": "target-a", "item-b": "target-b" } }, interaction),
    ).toBe(true);

    expect(
      codec.toContractResponse(
        {
          matches: {
            "item-a": "target-a",
            "item-b": "target-b",
            stale: "target-a",
          },
        },
        interaction,
      ),
    ).toEqual({
      kind: "match",
      pairs: [
        { itemId: "item-b", targetId: "target-b" },
        { itemId: "item-a", targetId: "target-a" },
      ],
    });

    expect(
      codec.fromContractResponse(
        {
          kind: "match",
          pairs: [
            { itemId: "stale", targetId: "target-a" },
            { itemId: "item-a", targetId: "unknown" },
            { itemId: "item-b", targetId: "target-b" },
          ],
        },
        interaction,
      ),
    ).toEqual({ matches: { "item-b": "target-b" } });
  });

  it("rejects ambiguous Matching interaction and canonical response identities", () => {
    const codec = responseCodec(matchingBlockDefinition);

    expect(() =>
      codec.hasResponse(
        { matches: { "item-a": "target-a" } },
        {
          kind: "match",
          items: [{ id: "item-a" }, { id: "item-a" }],
          targets: [{ id: "target-a" }, { id: "target-b" }],
        },
      ),
    ).toThrow("Matching interaction item ids must be nonblank and unique");
    expect(() =>
      codec.hasResponse(
        { matches: { "item-a": "target-a" } },
        {
          kind: "match",
          items: [{ id: "item-a" }],
          targets: [{ id: "target-a" }, { id: " " }],
        },
      ),
    ).toThrow("Matching interaction target ids must be nonblank and unique");
    expect(() =>
      codec.fromContractResponse(
        {
          kind: "match",
          pairs: [
            { itemId: "item-a", targetId: "target-a" },
            { itemId: "item-a", targetId: "target-b" },
          ],
        },
        {
          kind: "match",
          items: [{ id: "item-a" }],
          targets: [{ id: "target-a" }, { id: "target-b" }],
        },
      ),
    ).toThrow("Matching response item ids must be unique");
  });

  it.each(codecCases)(
    "$name round-trips empty, partial, and complete local response state",
    ({ codec, localResponses }) => {
      for (const localResponse of localResponses) {
        const canonical = codec.toContractResponse(localResponse);
        expect(AssessmentResponseValueSchema.parse(canonical)).toEqual(canonical);

        const restored = codec.fromContractResponse(canonical);
        expect(codec.schema.parse(restored)).toEqual(restored);
        expect(codec.toContractResponse(restored)).toEqual(canonical);
      }
    },
  );

  it.each(codecCases)(
    "$name rejects malformed local state and the wrong canonical interaction",
    ({ codec, localResponses, wrongContractResponse }) => {
      expect(() =>
        codec.toContractResponse({ ...Object(localResponses[2]), unrelated: true }),
      ).toThrow();
      expect(() => codec.fromContractResponse(wrongContractResponse)).toThrow();
    },
  );

  it.each(codecCases.filter((entry) => entry.duplicateContractResponse))(
    "$name rejects duplicate canonical response identities",
    ({ codec, duplicateContractResponse }) => {
      if (!duplicateContractResponse) throw new Error("Expected duplicate response fixture");
      expect(() => codec.fromContractResponse(duplicateContractResponse)).toThrow();
    },
  );

  it.each(codecCases.filter((entry) => entry.duplicateLocalResponse))(
    "$name rejects duplicate local response identities",
    ({ codec, duplicateLocalResponse }) => {
      expect(() => codec.toContractResponse(duplicateLocalResponse)).toThrow();
    },
  );
});
