import { describe, expect, it } from "vite-plus/test";

import {
  isRegisteredSlideCompositionSurfaceDefinition,
  SlideCompositionKindSchema,
  type SlideCompositionKind,
} from "../model/slide-composition-definition";
import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { expandSlideCompositionCases } from "./slide-composition-cases";

const EXPECTED_CASES: Readonly<
  Record<
    SlideCompositionKind,
    {
      readonly count: number;
      readonly regions: readonly string[];
      readonly images: readonly string[];
    }
  >
> = {
  content: { count: 2, regions: ["main"], images: [] },
  "two-columns": { count: 12, regions: ["primary", "secondary"], images: [] },
  "three-columns": {
    count: 2,
    regions: ["primary", "secondary", "tertiary"],
    images: [],
  },
  "two-stacked": { count: 12, regions: ["primary", "secondary"], images: [] },
  "side-title": { count: 2, regions: ["main"], images: [] },
  "centred-stage": { count: 2, regions: ["main"], images: [] },
  editorial: {
    count: 4,
    regions: ["primary", "secondary", "tertiary"],
    images: [],
  },
  "image-content-split": { count: 12, regions: ["main"], images: ["primary"] },
  "image-content-stacked": { count: 12, regions: ["main"], images: ["primary"] },
  "full-bleed-image": { count: 2, regions: [], images: [] },
  "image-backdrop-panel": { count: 12, regions: ["main"], images: [] },
  diptych: { count: 2, regions: [], images: ["primary", "secondary"] },
  triptych: { count: 2, regions: [], images: ["primary", "secondary", "tertiary"] },
};

describe("slide composition state cases", () => {
  it("expands every registered composition into exactly 78 supported states", () => {
    const cases = expandSlideCompositionCases();
    const definitions = builtInSurfaceVariantRegistry.definitions.filter(
      isRegisteredSlideCompositionSurfaceDefinition,
    );
    const registeredCompositions = definitions.map((definition) => definition.slideComposition.id);

    expect(new Set(registeredCompositions)).toEqual(new Set(SlideCompositionKindSchema.options));
    expect(cases).toHaveLength(78);
    expect(new Set(cases.map((state) => state.composition))).toEqual(
      new Set(SlideCompositionKindSchema.options),
    );
  });

  it.each(SlideCompositionKindSchema.options)(
    "derives the complete $composition capability product and stable roles",
    (composition) => {
      const states = expandSlideCompositionCases().filter(
        (state) => state.composition === composition,
      );
      const expected = EXPECTED_CASES[composition];
      const definition = builtInSurfaceVariantRegistry.definitions
        .filter(isRegisteredSlideCompositionSurfaceDefinition)
        .find((candidate) => candidate.slideComposition.id === composition);

      expect(definition).toBeDefined();
      expect(states).toHaveLength(expected.count);
      expect(new Set(states.map((state) => state.variant))).toEqual(new Set([definition?.id]));
      expect(new Set(states.map((state) => state.title))).toEqual(
        new Set(
          definition?.slideComposition.title === "required" ? ["required"] : ["visible", "hidden"],
        ),
      );
      expect(new Set(states.map((state) => state.orientation))).toEqual(
        new Set(definition?.slideComposition.orientation?.options ?? [undefined]),
      );
      expect(new Set(states.map((state) => state.proportion))).toEqual(
        new Set(definition?.slideComposition.proportion?.options ?? [undefined]),
      );
      for (const state of states) {
        expect(state.regions).toEqual(expected.regions);
        expect(state.images).toEqual(expected.images);
      }
    },
  );

  it("returns settings-schema-valid cases with no duplicate state identity", () => {
    const cases = expandSlideCompositionCases();
    const identities = cases.map((state) =>
      [state.variant, state.title, state.orientation ?? "none", state.proportion ?? "none"].join(
        ":",
      ),
    );

    expect(new Set(identities).size).toBe(cases.length);
  });
});
