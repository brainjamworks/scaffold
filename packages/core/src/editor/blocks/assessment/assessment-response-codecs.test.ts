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
    localResponses: [{ choices: null }, {}, { choices: "choice_00002" }],
    wrongContractResponse: { kind: "multi-select", optionIds: ["choice_00002"] },
  },
  {
    name: "dropdown",
    codec: responseCodec(dropdownBlockDefinition),
    localResponses: [{ choices: null }, {}, { choices: "choice_00002" }],
    wrongContractResponse: { kind: "sequence", orderedItemIds: ["choice_00002"] },
  },
  {
    name: "multiselect",
    codec: responseCodec(multiselectBlockDefinition),
    localResponses: [
      { choices: [] },
      { choices: ["choice_00001"] },
      { choices: ["choice_00001", "choice_00003"] },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "choice_00001" },
    duplicateLocalResponse: { choices: ["choice_00001", "choice_00001"] },
    duplicateContractResponse: {
      kind: "multi-select",
      optionIds: ["choice_00001", "choice_00001"],
    },
  },
  {
    name: "sequencing",
    codec: responseCodec(sequencingBlockDefinition),
    localResponses: [
      { order: [] },
      { order: ["seqitm_00001"] },
      { order: ["seqitm_00002", "seqitm_00001"] },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "seqitm_00001" },
    duplicateLocalResponse: { order: ["seqitm_00001", "seqitm_00001"] },
    duplicateContractResponse: {
      kind: "sequence",
      orderedItemIds: ["seqitm_00001", "seqitm_00001"],
    },
  },
  {
    name: "categorise",
    codec: responseCodec(categoriseBlockDefinition),
    localResponses: [
      { placements: {} },
      { placements: { seqitm_00001: "catgry_00001" } },
      { placements: { seqitm_00001: "catgry_00002", seqitm_00002: "catgry_00001" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "catgry_00001" },
    duplicateContractResponse: {
      kind: "classify",
      placements: [
        { itemId: "seqitm_00001", categoryId: "catgry_00001" },
        { itemId: "seqitm_00001", categoryId: "catgry_00002" },
      ],
    },
  },
  {
    name: "matching",
    codec: responseCodec(matchingBlockDefinition),
    localResponses: [
      { matches: {} },
      { matches: { seqitm_00001: "target_00001" } },
      { matches: { seqitm_00001: "target_00002", seqitm_00002: "target_00001" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "target_00001" },
    duplicateContractResponse: {
      kind: "match",
      pairs: [
        { itemId: "seqitm_00001", targetId: "target_00001" },
        { itemId: "seqitm_00001", targetId: "target_00002" },
      ],
    },
  },
  {
    name: "fill-blanks",
    codec: responseCodec(fillBlanksBlockDefinition),
    localResponses: [
      { blanks: {} },
      { blanks: { blank_000001: "" } },
      { blanks: { blank_000001: "Paris", blank_000002: "France" } },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "Paris" },
    duplicateContractResponse: {
      kind: "fill-blanks",
      blanks: [
        { blankId: "blank_000001", value: "Paris" },
        { blankId: "blank_000001", value: "Lyon" },
      ],
    },
  },
  {
    name: "image-hotspot",
    codec: responseCodec(imageHotspotBlockDefinition),
    localResponses: [
      { clicks: [] },
      { clicks: [{ id: "click_000001", hotspotId: null, x: 0.1, y: 0.2 }] },
      {
        clicks: [
          { id: "click_000001", hotspotId: "hotsp_000001", x: 0.1, y: 0.2 },
          { id: "click_000002", hotspotId: "hotsp_000002", x: 0.7, y: 0.8 },
        ],
      },
    ],
    wrongContractResponse: { kind: "single-select", optionId: "hotsp_000001" },
    duplicateLocalResponse: {
      clicks: [
        { id: "click_000001", hotspotId: null, x: 0.1, y: 0.2 },
        { id: "click_000001", hotspotId: "hotsp_000001", x: 0.7, y: 0.8 },
      ],
    },
    duplicateContractResponse: {
      kind: "spatial-hotspot",
      selections: [
        { hotspotId: "hotsp_000001", x: 0.1, y: 0.2 },
        { hotspotId: "hotsp_000001", x: 0.1, y: 0.2 },
      ],
    },
  },
];

describe("assessment response codecs", () => {
  it("requires Data-family identities for image-hotspot click owners and references", () => {
    const codec = responseCodec(imageHotspotBlockDefinition);

    expect(() =>
      codec.toContractResponse({
        clicks: [{ id: "click-1", hotspotId: null, x: 0.1, y: 0.2 }],
      }),
    ).toThrow();
    expect(() =>
      codec.toContractResponse({
        clicks: [{ id: "click_000001", hotspotId: "h1", x: 0.1, y: 0.2 }],
      }),
    ).toThrow();
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
