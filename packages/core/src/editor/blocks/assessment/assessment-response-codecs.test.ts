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
