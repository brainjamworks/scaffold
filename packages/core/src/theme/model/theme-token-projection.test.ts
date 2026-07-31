import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DEFAULT_PRESET, SCAFFOLD_EDITORIAL_PRESET } from "./built-in-presets";
import { createThemeCatalogue } from "./theme-catalogue";
import { resolveCourseTheme } from "./resolve-course-theme";
import { COURSE_THEME_CSS_PROPERTIES, projectCourseThemeCssTokens } from "./theme-token-projection";

const EXPECTED_CSS_PROPERTIES = [
  "--sc-course-color-background",
  "--sc-course-color-canvas",
  "--sc-course-color-surface",
  "--sc-course-color-surface-muted",
  "--sc-course-color-text",
  "--sc-course-color-heading",
  "--sc-course-color-link",
  "--sc-course-color-text-secondary",
  "--sc-course-color-text-muted",
  "--sc-course-color-placeholder",
  "--sc-course-color-border",
  "--sc-course-color-border-subtle",
  "--sc-course-color-primary",
  "--sc-course-color-on-primary",
  "--sc-course-color-primary-muted",
  "--sc-course-color-secondary",
  "--sc-course-color-on-secondary",
  "--sc-course-color-accent",
  "--sc-course-color-on-accent",
  "--sc-course-color-info",
  "--sc-course-color-info-foreground",
  "--sc-course-color-info-background",
  "--sc-course-color-info-text",
  "--sc-course-color-success",
  "--sc-course-color-success-foreground",
  "--sc-course-color-success-background",
  "--sc-course-color-success-text",
  "--sc-course-color-warning",
  "--sc-course-color-warning-foreground",
  "--sc-course-color-warning-background",
  "--sc-course-color-warning-text",
  "--sc-course-color-error",
  "--sc-course-color-error-foreground",
  "--sc-course-color-error-background",
  "--sc-course-color-error-text",
  "--sc-course-color-focus-outline",
  "--sc-course-color-focus-ring",
  "--sc-course-color-overlay-backdrop",
  "--sc-course-color-overlay-control",
  "--sc-course-color-overlay-control-hover",
  "--sc-course-color-overlay-pill",
  "--sc-course-font-heading",
  "--sc-course-font-body",
  "--sc-course-font-code",
  "--sc-course-font-heading-weight",
  "--sc-course-font-body-weight",
  "--sc-course-type-scale",
  "--sc-course-line-height-body",
  "--sc-course-line-height-heading",
  "--sc-course-letter-spacing-heading",
  "--sc-course-text-transform-heading",
  "--sc-course-roundness",
  "--sc-course-stroke",
  "--sc-course-shadow",
  "--sc-course-density",
  "--sc-course-data-series-1",
  "--sc-course-data-series-2",
  "--sc-course-data-series-3",
  "--sc-course-data-series-4",
  "--sc-course-data-series-5",
  "--sc-course-data-series-6",
  "--sc-course-data-series-7",
  "--sc-course-data-series-8",
] as const;

describe("course theme token projection", () => {
  it("keeps the stable CSS property contract exhaustive and ordered", () => {
    expect(COURSE_THEME_CSS_PROPERTIES).toEqual(EXPECTED_CSS_PROPERTIES);
  });

  it.each(["light", "dark"] as const)("projects every token in %s mode", (mode) => {
    const resolved = resolveCourseTheme({
      theme: materialiseEditorial(),
      catalogue: createThemeCatalogue(),
      mode,
    });
    const palette =
      mode === "light"
        ? SCAFFOLD_EDITORIAL_PRESET.values.colors.resolved.light
        : SCAFFOLD_EDITORIAL_PRESET.values.colors.resolved.dark;

    expect(Object.keys(resolved.cssTokens)).toEqual(EXPECTED_CSS_PROPERTIES);
    expect(resolved.cssTokens).toMatchObject({
      "--sc-course-color-background": palette.background,
      "--sc-course-color-heading": palette.heading,
      "--sc-course-color-link": palette.link,
      "--sc-course-color-primary": palette.primary,
      "--sc-course-color-info-background": palette.info.background,
      "--sc-course-color-error-text": palette.error.text,
      "--sc-course-font-heading": '"Source Serif 4", serif',
      "--sc-course-font-body": '"Poppins", sans-serif',
      "--sc-course-font-code": '"JetBrains Mono Variable", monospace',
      "--sc-course-font-heading-weight": "700",
      "--sc-course-font-body-weight": "400",
      "--sc-course-type-scale": "1.08",
      "--sc-course-line-height-body": "1.65",
      "--sc-course-line-height-heading": "1.12",
      "--sc-course-letter-spacing-heading": "-0.015em",
      "--sc-course-text-transform-heading": "none",
      "--sc-course-roundness": "0.2",
      "--sc-course-stroke": "1px",
      "--sc-course-shadow": "0 8px 24px -4px #0000001f, 0 2px 6px -2px #00000014",
      "--sc-course-density": "1.125",
      "--sc-course-data-series-1": palette.dataSeries[0],
      "--sc-course-data-series-8": palette.dataSeries[7],
    });
    expect(Object.isFrozen(resolved.cssTokens)).toBe(true);
  });

  it("projects renderer-neutral chart tokens from the same resolved mode and fonts", () => {
    const resolved = resolveCourseTheme({
      theme: materialiseEditorial(),
      catalogue: createThemeCatalogue(),
      mode: "dark",
    });
    const palette = SCAFFOLD_EDITORIAL_PRESET.values.colors.resolved.dark;

    expect(resolved.chartTokens).toEqual({
      background: palette.background,
      surface: palette.surface,
      text: palette.text,
      textSecondary: palette.textSecondary,
      textMuted: palette.textMuted,
      border: palette.border,
      borderSubtle: palette.borderSubtle,
      primary: palette.primary,
      primaryMuted: palette.primaryMuted,
      accent: palette.accent,
      headingFont: '"Source Serif 4", serif',
      bodyFont: '"Poppins", sans-serif',
      codeFont: '"JetBrains Mono Variable", monospace',
      headingWeight: 700,
      bodyWeight: 400,
      dataSeries: palette.dataSeries,
      roundness: 0.2,
      stroke: 1,
      shadow: "soft",
      density: "spacious",
    });
    expect(Object.isFrozen(resolved.chartTokens)).toBe(true);
    expect(Object.isFrozen(resolved.chartTokens.dataSeries)).toBe(true);
  });

  it("returns complete Scaffold Default projections on unavailable-theme fallback", () => {
    const resolved = resolveCourseTheme({
      theme: {
        schemaVersion: 1,
        preset: { id: "uk.ac.example.unavailable", revision: "1" },
        values: structuredClone(SCAFFOLD_EDITORIAL_PRESET.values),
      },
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    expect(resolved.available).toBe(false);
    expect(Object.keys(resolved.cssTokens)).toHaveLength(EXPECTED_CSS_PROPERTIES.length);
    expect(resolved.cssTokens["--sc-course-color-primary"]).toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.primary,
    );
    expect(resolved.chartTokens.dataSeries).toEqual(
      SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.dataSeries,
    );
  });

  it("projects compatible heading and link fallbacks for previously saved palettes", () => {
    const palette = structuredClone(SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light);
    delete palette.heading;
    delete palette.link;

    const tokens = projectCourseThemeCssTokens({
      values: SCAFFOLD_DEFAULT_PRESET.values,
      palette,
      catalogue: createThemeCatalogue(),
    });

    expect(tokens["--sc-course-color-heading"]).toBe(palette.text);
    expect(tokens["--sc-course-color-link"]).toBe(palette.primary);
  });
});

function materialiseEditorial() {
  return structuredClone({
    schemaVersion: 1 as const,
    preset: {
      id: SCAFFOLD_EDITORIAL_PRESET.id,
      revision: SCAFFOLD_EDITORIAL_PRESET.revision,
    },
    values: SCAFFOLD_EDITORIAL_PRESET.values,
  });
}
