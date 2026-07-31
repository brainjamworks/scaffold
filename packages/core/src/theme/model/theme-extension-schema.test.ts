import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DEFAULT_PRESET } from "./built-in-presets";
import {
  CourseThemeFontDefinitionSchema,
  CourseThemePresetDefinitionSchema,
  ScaffoldThemeExtensionSchema,
} from "./theme-extension-schema";

describe("theme extension schemas", () => {
  it("accepts complete host preset and font definitions", () => {
    expect(
      ScaffoldThemeExtensionSchema.safeParse({
        presets: [
          {
            id: "uk.ac.example.editorial",
            revision: "2026-07",
            label: "Example Editorial",
            description: "An example host preset.",
            recipe: SCAFFOLD_DEFAULT_PRESET.recipe,
            values: SCAFFOLD_DEFAULT_PRESET.values,
          },
        ],
        fonts: [
          {
            id: "uk.ac.example.font.brand",
            label: "Example Brand",
            category: "sans",
            family: "Example Brand",
            fallback: "sans-serif",
            weights: [400, 700],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects incomplete preset values and unknown definition fields", () => {
    expect(
      CourseThemePresetDefinitionSchema.safeParse({
        id: "uk.ac.example.incomplete",
        revision: "1",
        label: "Incomplete",
        description: "Missing complete values.",
        values: {},
      }).success,
    ).toBe(false);
    expect(
      CourseThemeFontDefinitionSchema.safeParse({
        id: "uk.ac.example.font.remote",
        label: "Remote",
        category: "sans",
        family: "Remote",
        fallback: "sans-serif",
        weights: [400],
        url: "https://example.com/font.woff2",
        load: () => undefined,
      }).success,
    ).toBe(false);
  });

  it("accepts only closed version 1 host palette recipes", () => {
    const valid = structuredClone(SCAFFOLD_DEFAULT_PRESET);
    valid.id = "uk.ac.example.valid-recipe";
    expect(CourseThemePresetDefinitionSchema.safeParse(valid).success).toBe(true);

    const unsupported = structuredClone(valid);
    (unsupported.recipe as { version: number }).version = 2;
    expect(CourseThemePresetDefinitionSchema.safeParse(unsupported).success).toBe(false);

    expect(
      CourseThemePresetDefinitionSchema.safeParse({
        ...valid,
        recipe: {
          ...valid.recipe,
          generate: () => valid.values.colors.resolved,
        },
      }).success,
    ).toBe(false);

    const mismatched = structuredClone(valid);
    mismatched.values.colors.recipe.id = "uk.ac.example.other-recipe";
    expect(CourseThemePresetDefinitionSchema.safeParse(mismatched).success).toBe(false);
  });
});
