import { describe, expect, it } from "vite-plus/test";

import type { PersistedCourseTheme } from "@/schemas/course-document";

import {
  SCAFFOLD_DEFAULT_PRESET,
  SCAFFOLD_EDITORIAL_PRESET,
  SCAFFOLD_MINIMAL_PRESET,
} from "./built-in-presets";
import { createThemeCatalogue } from "./theme-catalogue";
import { resolveCourseTheme } from "./resolve-course-theme";

describe("course theme resolution", () => {
  it.each(["light", "dark"] as const)(
    "uses available saved values in %s mode instead of current preset defaults",
    (mode) => {
      const theme = materialise(SCAFFOLD_EDITORIAL_PRESET);
      const savedPrimary = mode === "light" ? "#123456" : "#abcdef";
      theme.values!.colors.resolved.light.primary = "#123456";
      theme.values!.colors.resolved.dark.primary = "#abcdef";
      const before = structuredClone(theme);

      const resolved = resolveCourseTheme({
        theme,
        catalogue: createThemeCatalogue(),
        mode,
      });

      expect(resolved).toMatchObject({
        requestedPresetId: "scaffold-editorial",
        effectivePresetId: "scaffold-editorial",
        available: true,
        mode,
      });
      expect(resolved.palette.primary).toBe(savedPrimary);
      expect(resolved.values.colors.resolved.dark.primary).toBe("#abcdef");
      expect(theme).toEqual(before);
    },
  );

  it("falls back completely when the requested host preset is unavailable", () => {
    const theme = materialise(SCAFFOLD_EDITORIAL_PRESET);
    theme.preset = { id: "uk.ac.example.unavailable", revision: "7" };
    theme.values!.colors.resolved.light.primary = "#123456";
    const before = structuredClone(theme);

    const resolved = resolveCourseTheme({
      theme,
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    expect(resolved).toMatchObject({
      requestedPresetId: "uk.ac.example.unavailable",
      effectivePresetId: "scaffold-default",
      available: false,
      values: SCAFFOLD_DEFAULT_PRESET.values,
      palette: SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light,
    });
    expect(theme).toEqual(before);
  });

  it("resolves a legacy null snapshot from an available matching preset", () => {
    const theme: PersistedCourseTheme = {
      schemaVersion: 1,
      preset: { id: "scaffold-minimal", revision: null },
      values: null,
    };

    const resolved = resolveCourseTheme({
      theme,
      catalogue: createThemeCatalogue(),
      mode: "dark",
    });

    expect(resolved).toMatchObject({
      requestedPresetId: "scaffold-minimal",
      effectivePresetId: "scaffold-minimal",
      available: true,
      values: SCAFFOLD_MINIMAL_PRESET.values,
      palette: SCAFFOLD_MINIMAL_PRESET.values.colors.resolved.dark,
    });
  });

  it("falls back for a legacy null snapshot whose preset is unavailable", () => {
    const resolved = resolveCourseTheme({
      theme: {
        schemaVersion: 1,
        preset: { id: "uk.ac.example.legacy", revision: null },
        values: null,
      },
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    expect(resolved).toMatchObject({
      requestedPresetId: "uk.ac.example.legacy",
      effectivePresetId: "scaffold-default",
      available: false,
      values: SCAFFOLD_DEFAULT_PRESET.values,
    });
  });

  it("preserves available fonts in every semantic role regardless of category", () => {
    const theme = materialise(SCAFFOLD_DEFAULT_PRESET);
    theme.values!.typography.headingFontId = "scaffold-jetbrains-mono";
    theme.values!.typography.bodyFontId = "scaffold-source-serif-4";
    theme.values!.typography.codeFontId = "scaffold-inter";

    const resolved = resolveCourseTheme({
      theme,
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    expect(resolved.values.typography).toMatchObject({
      headingFontId: "scaffold-jetbrains-mono",
      bodyFontId: "scaffold-source-serif-4",
      codeFontId: "scaffold-inter",
    });
  });

  it("replaces missing fonts with deterministic semantic-role fallbacks", () => {
    const theme = materialise(SCAFFOLD_DEFAULT_PRESET);
    theme.values!.typography.headingFontId = "uk.ac.example.missing-heading";
    theme.values!.typography.bodyFontId = "uk.ac.example.missing-body";
    theme.values!.typography.codeFontId = "uk.ac.example.missing-code";

    const resolved = resolveCourseTheme({
      theme,
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    expect(resolved.values.typography).toMatchObject({
      headingFontId: "scaffold-poppins",
      bodyFontId: "scaffold-poppins",
      codeFontId: "scaffold-jetbrains-mono",
    });
  });
});

function materialise(
  preset:
    | typeof SCAFFOLD_DEFAULT_PRESET
    | typeof SCAFFOLD_EDITORIAL_PRESET
    | typeof SCAFFOLD_MINIMAL_PRESET,
): PersistedCourseTheme {
  return structuredClone({
    schemaVersion: 1,
    preset: { id: preset.id, revision: preset.revision },
    values: preset.values,
  });
}
