import { describe, expect, it } from "vite-plus/test";

import {
  expectCompositionGeometry,
  type CompositionGeometrySample,
} from "./slide-composition-browser-harness";
import {
  COMPOSITION_GEOMETRY_ORACLE,
  type CompositionGeometryRelationship,
} from "./slide-composition-geometry-oracle";

const TWO_COLUMN_SAMPLE: CompositionGeometrySample = {
  state: {
    variant: "slide-two-columns",
    composition: "two-columns",
    title: "visible",
    orientation: "default",
    proportion: "equal",
    regions: ["primary", "secondary"],
    images: [],
  },
  renderer: "runtime",
  surface: { x: 0, y: 0, width: 1024, height: 576 },
  participants: {
    surface: { x: 0, y: 0, width: 1024, height: 576 },
    "content-host": { x: 32, y: 32, width: 960, height: 512 },
    title: { x: 32, y: 32, width: 960, height: 40 },
    "region:primary": { x: 32, y: 88, width: 472, height: 456 },
    "region:secondary": { x: 520, y: 88, width: 472, height: 456 },
  },
  rawParticipants: {},
};

describe("executable composition geometry oracle", () => {
  it("rejects samples that violate every applicable relationship kind", () => {
    const relationships = COMPOSITION_GEOMETRY_ORACLE["two-columns"];
    expect(() => expectCompositionGeometry(TWO_COLUMN_SAMPLE, relationships)).not.toThrow();

    for (const kind of [
      "presence",
      "topology",
      "order",
      "spanning",
      "track-weights",
      "spacing",
      "containment",
    ] as const) {
      expect(
        () => expectCompositionGeometry(TWO_COLUMN_SAMPLE, mutateRelationship(relationships, kind)),
        kind,
      ).toThrow();
    }
  });

  it("executes hidden-title reclamation and centring relationships", () => {
    const { title: _visibleTitle, ...titleFreeParticipants } = TWO_COLUMN_SAMPLE.participants;
    const hiddenSample: CompositionGeometrySample = {
      ...TWO_COLUMN_SAMPLE,
      state: { ...TWO_COLUMN_SAMPLE.state, title: "hidden" },
      participants: {
        ...titleFreeParticipants,
        "region:primary": { x: 32, y: 32, width: 472, height: 512 },
        "region:secondary": { x: 520, y: 32, width: 472, height: 512 },
      },
      rawParticipants: {
        title: {
          rect: { x: 0, y: 0, width: 0, height: 0 },
          display: "none",
          visibility: "visible",
          hasLayoutBox: false,
        },
      },
    };
    const twoColumnRelationships = COMPOSITION_GEOMETRY_ORACLE["two-columns"];
    expect(() => expectCompositionGeometry(hiddenSample, twoColumnRelationships)).not.toThrow();
    expect(() =>
      expectCompositionGeometry(
        hiddenSample,
        mutateRelationship(twoColumnRelationships, "reclamation"),
      ),
    ).toThrow();

    const centredSample: CompositionGeometrySample = {
      state: {
        variant: "slide-centred-stage",
        composition: "centred-stage",
        title: "visible",
        regions: ["main"],
        images: [],
      },
      renderer: "runtime",
      surface: { x: 0, y: 0, width: 1024, height: 576 },
      participants: {
        surface: { x: 0, y: 0, width: 1024, height: 576 },
        "content-host": { x: 32, y: 32, width: 960, height: 512 },
        title: { x: 32, y: 32, width: 960, height: 40 },
        "region:main": { x: 166.4, y: 88, width: 691.2, height: 456 },
      },
      rawParticipants: {},
    };
    expect(() =>
      expectCompositionGeometry(centredSample, COMPOSITION_GEOMETRY_ORACLE["centred-stage"]),
    ).not.toThrow();
    expect(() =>
      expectCompositionGeometry(
        centredSample,
        mutateRelationship(COMPOSITION_GEOMETRY_ORACLE["centred-stage"], "centring"),
      ),
    ).toThrow();
  });
});

function mutateRelationship(
  relationships: readonly CompositionGeometryRelationship[],
  kind: CompositionGeometryRelationship["kind"],
): readonly CompositionGeometryRelationship[] {
  return relationships.map((relationship) => {
    if (relationship.kind !== kind) return relationship;
    switch (relationship.kind) {
      case "presence":
        return { ...relationship, participants: [...relationship.participants, "image:primary"] };
      case "topology":
        return { ...relationship, topology: "rows" };
      case "order":
        return { ...relationship, default: [...relationship.default].reverse() };
      case "spanning":
        return { ...relationship, participant: "region:primary", across: ["title"] };
      case "track-weights":
        return { ...relationship, weights: "dominant-supporting" };
      case "spacing":
        return { ...relationship, inset: 0 };
      case "reclamation":
        return { ...relationship, participants: ["title"] };
      case "centring":
        return { ...relationship, participant: "title" };
      case "containment":
        return { ...relationship, container: "region:primary", participants: ["region:secondary"] };
    }
  });
}
