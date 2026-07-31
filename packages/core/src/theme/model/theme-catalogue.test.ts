import { describe, expect, it } from "vite-plus/test";

import type { CourseThemeValues } from "@/schemas/course-document";

import { SCAFFOLD_DEFAULT_PRESET } from "./built-in-presets";
import { createThemeCatalogue } from "./theme-catalogue";

describe("theme catalogue", () => {
  it("always exposes immutable Scaffold built-ins and Scaffold Default", () => {
    const catalogue = createThemeCatalogue();

    expect(catalogue.presets.map(({ id }) => id)).toEqual([
      "scaffold-default",
      "scaffold-editorial",
      "scaffold-minimal",
    ]);
    expect(catalogue.fonts.map(({ id }) => id)).toEqual([
      "scaffold-poppins",
      "scaffold-source-serif-4",
      "scaffold-inter",
      "scaffold-jetbrains-mono",
    ]);
    expect(catalogue.defaultPreset.id).toBe("scaffold-default");
    expect(catalogue.getPreset("scaffold-default")).toBe(catalogue.defaultPreset);
    expect(catalogue.hasPreset("scaffold-default")).toBe(true);
    expect(catalogue.getFont("scaffold-poppins")?.family).toBe("Poppins");
    expect(Object.isFrozen(catalogue)).toBe(true);
    expect(Object.isFrozen(catalogue.presets)).toBe(true);
    expect(Object.isFrozen(catalogue.presets[0]?.values.colors.resolved.light)).toBe(true);
  });

  it("adds valid host definitions without mutating extension input", () => {
    const extension = {
      fonts: [hostFont("uk.ac.example.font.brand", [400, 700])],
      presets: [hostPreset("uk.ac.example.course-theme", "uk.ac.example.font.brand", 700, 400)],
    };
    const before = structuredClone(extension);

    const first = createThemeCatalogue(extension);
    const second = createThemeCatalogue(extension);

    expect(extension).toEqual(before);
    expect(first).not.toBe(second);
    expect(first.presets).not.toBe(second.presets);
    expect(first.getPreset("uk.ac.example.course-theme")).toMatchObject({
      id: "uk.ac.example.course-theme",
      revision: "1",
    });
    expect(first.getFont("uk.ac.example.font.brand")?.category).toBe("sans");
    expect(first.issues).toEqual([]);
  });

  it("excludes malformed entries individually while retaining valid entries and built-ins", () => {
    const catalogue = createThemeCatalogue({
      fonts: [
        hostFont("uk.ac.example.font.valid", [400, 700]),
        { id: "uk.ac.example.font.invalid", label: "Invalid" },
      ],
      presets: [
        hostPreset("uk.ac.example.valid", "uk.ac.example.font.valid", 700, 400),
        { id: "uk.ac.example.invalid", revision: "1" },
      ],
    });

    expect(catalogue.hasPreset("scaffold-default")).toBe(true);
    expect(catalogue.hasPreset("uk.ac.example.valid")).toBe(true);
    expect(catalogue.getPreset("uk.ac.example.invalid")).toBeNull();
    expect(catalogue.getFont("uk.ac.example.font.invalid")).toBeNull();
    expect(catalogue.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "invalid-font", id: "uk.ac.example.font.invalid" }),
        expect.objectContaining({ code: "invalid-preset", id: "uk.ac.example.invalid" }),
      ]),
    );
  });

  it("rejects reserved and duplicate IDs without replacing accepted definitions", () => {
    const catalogue = createThemeCatalogue({
      fonts: [
        hostFont("scaffold-poppins", [400]),
        hostFont("uk.ac.example.font.brand", [400, 700]),
        hostFont("uk.ac.example.font.brand", [400, 700]),
      ],
      presets: [
        hostPreset("scaffold-default", "scaffold-poppins", 700, 400),
        hostPreset("uk.ac.example.course-theme", "uk.ac.example.font.brand", 700, 400),
        hostPreset("uk.ac.example.course-theme", "uk.ac.example.font.brand", 700, 400),
      ],
    });

    expect(catalogue.getFont("scaffold-poppins")?.family).toBe("Poppins");
    expect(catalogue.getPreset("scaffold-default")?.label).toBe(SCAFFOLD_DEFAULT_PRESET.label);
    expect(catalogue.presets.filter(({ id }) => id === "uk.ac.example.course-theme")).toHaveLength(
      1,
    );
    expect(catalogue.fonts.filter(({ id }) => id === "uk.ac.example.font.brand")).toHaveLength(1);
    expect(catalogue.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "reserved-id", id: "scaffold-poppins" }),
        expect.objectContaining({ code: "reserved-id", id: "scaffold-default" }),
        expect.objectContaining({
          code: "duplicate-font-id",
          id: "uk.ac.example.font.brand",
        }),
        expect.objectContaining({
          code: "duplicate-preset-id",
          id: "uk.ac.example.course-theme",
        }),
      ]),
    );
  });

  it("excludes presets that reference missing fonts", () => {
    const catalogue = createThemeCatalogue({
      presets: [hostPreset("uk.ac.example.missing-font", "uk.ac.example.font.missing", 700, 400)],
    });

    expect(catalogue.getPreset("uk.ac.example.missing-font")).toBeNull();
    expect(catalogue.issues).toContainEqual(
      expect.objectContaining({
        code: "missing-font",
        id: "uk.ac.example.missing-font",
      }),
    );
  });

  it("excludes presets that request unsupported heading or body weights", () => {
    const catalogue = createThemeCatalogue({
      fonts: [hostFont("uk.ac.example.font.limited", [400])],
      presets: [
        hostPreset("uk.ac.example.unsupported-weight", "uk.ac.example.font.limited", 700, 400),
      ],
    });

    expect(catalogue.getPreset("uk.ac.example.unsupported-weight")).toBeNull();
    expect(catalogue.issues).toContainEqual(
      expect.objectContaining({
        code: "unsupported-font-weight",
        id: "uk.ac.example.unsupported-weight",
      }),
    );
  });
});

function hostFont(id: string, weights: number[]) {
  return {
    id,
    label: "Host Brand",
    category: "sans" as const,
    family: "Host Brand",
    fallback: "sans-serif",
    weights,
  };
}

function hostPreset(
  id: string,
  fontId: string,
  headingWeight: 400 | 500 | 600 | 700 | 800,
  bodyWeight: 400 | 500 | 600 | 700,
) {
  const values: CourseThemeValues = structuredClone(SCAFFOLD_DEFAULT_PRESET.values);
  values.typography.headingFontId = fontId;
  values.typography.bodyFontId = fontId;
  values.typography.headingWeight = headingWeight;
  values.typography.bodyWeight = bodyWeight;

  return {
    id,
    revision: "1",
    label: "Host Course Theme",
    description: "A host-provided course preset.",
    recipe: structuredClone(SCAFFOLD_DEFAULT_PRESET.recipe),
    values,
  };
}
