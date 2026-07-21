import { describe, expect, it } from "vite-plus/test";

import { SlideCompositionKindSchema } from "../model/slide-composition-definition";
import {
  COMPOSITION_GEOMETRY_ORACLE,
  type CompositionParticipantKey,
} from "./slide-composition-geometry-oracle";

describe("slide composition geometry oracle", () => {
  it("is exhaustive over the registered composition vocabulary", () => {
    expect(Object.keys(COMPOSITION_GEOMETRY_ORACLE)).toEqual(SlideCompositionKindSchema.options);
  });

  it.each(SlideCompositionKindSchema.options)(
    "declares independent presence, topology, spacing, and containment for $composition",
    (composition) => {
      const relationships = COMPOSITION_GEOMETRY_ORACLE[composition];
      const kinds = new Set(relationships.map((relationship) => relationship.kind));

      expect(kinds).toEqual(
        expect.objectContaining(new Set(["presence", "topology", "spacing", "containment"])),
      );
    },
  );

  it("captures reversal, logical weights, spanning, reclamation, and centring explicitly", () => {
    expect(COMPOSITION_GEOMETRY_ORACLE["two-columns"]).toContainEqual(
      expect.objectContaining({
        kind: "order",
        default: ["region:primary", "region:secondary"],
        reversed: ["region:secondary", "region:primary"],
      }),
    );
    expect(COMPOSITION_GEOMETRY_ORACLE["image-content-split"]).toContainEqual(
      expect.objectContaining({
        kind: "track-weights",
        participants: ["image:primary", "content-host"],
        weights: "proportion",
        travelsWithRoles: true,
      }),
    );
    expect(COMPOSITION_GEOMETRY_ORACLE.editorial).toContainEqual(
      expect.objectContaining({ kind: "spanning", participant: "region:primary" }),
    );
    expect(COMPOSITION_GEOMETRY_ORACLE.content).toContainEqual(
      expect.objectContaining({
        kind: "reclamation",
        when: "title-hidden",
        participants: ["region:main"],
      }),
    );
    expect(COMPOSITION_GEOMETRY_ORACLE["centred-stage"]).toContainEqual(
      expect.objectContaining({
        kind: "centring",
        participant: "region:main",
        axis: "inline",
        bounded: true,
      }),
    );
  });

  it("uses only stable semantic participant keys", () => {
    const allowed = new Set<CompositionParticipantKey>([
      "surface",
      "content-host",
      "title",
      "region:main",
      "region:primary",
      "region:secondary",
      "region:tertiary",
      "image:primary",
      "image:secondary",
      "image:tertiary",
    ]);

    for (const relationships of Object.values(COMPOSITION_GEOMETRY_ORACLE)) {
      for (const relationship of relationships) {
        for (const participant of relationship.participants) {
          expect(allowed.has(participant)).toBe(true);
        }
      }
    }
  });
});
