import { describe, expect, it } from "vite-plus/test";

import { CourseThemeValuesSchema } from "@/schemas/course-document";

import {
  SCAFFOLD_DEFAULT_LIGHT_PALETTE,
  SCAFFOLD_DEFAULT_PRESET,
  builtInThemePresets,
  createScaffoldDefaultTheme,
} from "./built-in-presets";
import { createThemeCatalogue } from "./theme-catalogue";
import { materialiseCoursePalette } from "./palette-materialiser";

describe("Scaffold Default preset", () => {
  it("matches the established light token baseline", () => {
    expect(SCAFFOLD_DEFAULT_LIGHT_PALETTE).toMatchObject({
      background: "#ffffff",
      canvas: "#fafafa",
      surface: "#ffffff",
      surfaceMuted: "#f4f4f5",
      text: "#18181b",
      textSecondary: "#52525b",
      textMuted: "#71717a",
      placeholder: "#a1a1aa",
      border: "#e4e4e7",
      borderSubtle: "#f4f4f5",
      primary: "oklch(0.3 0.15 270)",
      secondary: "oklch(0.64 0.22 18)",
      accent: "oklch(0.68 0.18 175)",
    });
  });

  it("contains complete values and a versioned derived dark palette", () => {
    expect(SCAFFOLD_DEFAULT_PRESET).toMatchObject({
      id: "scaffold-default",
      revision: "1",
      label: "Scaffold Default",
    });
    expect(CourseThemeValuesSchema.safeParse(SCAFFOLD_DEFAULT_PRESET.values).success).toBe(true);
    expect(SCAFFOLD_DEFAULT_PRESET.values.colors).toMatchObject({
      author: {
        light: {
          background: "#ffffff",
          primary: "oklch(0.3 0.15 270)",
          link: "oklch(0.3 0.15 270)",
        },
      },
      recipe: {
        id: "scaffold.default-palette",
        version: 1,
      },
      resolved: {
        light: SCAFFOLD_DEFAULT_LIGHT_PALETTE,
        dark: {
          background: "oklch(0.12 0 89.8756)",
          primary: "oklch(0.68 0.15 270)",
        },
      },
    });
    expect(SCAFFOLD_DEFAULT_PRESET.values.typography).toMatchObject({
      headingFontId: "scaffold-poppins",
      bodyFontId: "scaffold-poppins",
      codeFontId: "scaffold-jetbrains-mono",
    });
  });

  it("returns an independent persisted snapshot on every materialisation", () => {
    const first = createScaffoldDefaultTheme();
    const second = createScaffoldDefaultTheme();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.values).not.toBe(second.values);
    expect(first.values?.colors.resolved.light).not.toBe(second.values?.colors.resolved.light);
  });
});

describe("built-in course presets", () => {
  it("defines three complete revision 1 presets with both colour palettes", () => {
    expect(builtInThemePresets.map(({ id }) => id)).toEqual([
      "scaffold-default",
      "scaffold-editorial",
      "scaffold-minimal",
    ]);

    for (const preset of builtInThemePresets) {
      expect(preset.revision).toBe("1");
      expect(CourseThemeValuesSchema.safeParse(preset.values).success).toBe(true);
      expect(preset.recipe.version).toBe(1);
      expect(
        materialiseCoursePalette({
          recipe: preset.recipe,
          light: preset.values.colors.author.light,
          dark: preset.values.colors.author.dark,
        }).resolved,
      ).toEqual(preset.values.colors.resolved);
    }
  });

  it("gives Editorial a warm typographic identity rather than a recolour", () => {
    const editorial = builtInThemePresets[1]!;

    expect(editorial).toMatchObject({
      id: "scaffold-editorial",
      label: "Editorial",
      values: {
        typography: {
          headingFontId: "scaffold-source-serif-4",
          bodyFontId: "scaffold-poppins",
          codeFontId: "scaffold-jetbrains-mono",
          typeScale: 1.08,
          bodyLineHeight: 1.65,
        },
        design: {
          roundness: 0.2,
          density: "spacious",
        },
      },
    });
    expect(editorial.values.colors.resolved.light.canvas).not.toBe(
      SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light.canvas,
    );
  });

  it("gives Minimal a compact Inter-led identity rather than a recolour", () => {
    const minimal = builtInThemePresets[2]!;

    expect(minimal).toMatchObject({
      id: "scaffold-minimal",
      label: "Minimal",
      values: {
        typography: {
          headingFontId: "scaffold-inter",
          bodyFontId: "scaffold-inter",
          codeFontId: "scaffold-jetbrains-mono",
          typeScale: 0.94,
          headingLetterSpacing: -0.025,
        },
        design: {
          roundness: 0.1,
          stroke: 0.5,
          shadow: "none",
          density: "compact",
        },
      },
    });
    expect(minimal.values.typography).not.toEqual(SCAFFOLD_DEFAULT_PRESET.values.typography);
  });

  it("includes all presets and curated fonts in immutable catalogue copies", () => {
    const first = createThemeCatalogue();
    const second = createThemeCatalogue();

    expect(first.presets.map(({ id }) => id)).toEqual(builtInThemePresets.map(({ id }) => id));
    expect(first.fonts.map(({ id }) => id)).toEqual([
      "scaffold-poppins",
      "scaffold-source-serif-4",
      "scaffold-inter",
      "scaffold-jetbrains-mono",
    ]);
    expect(first.getFont("scaffold-jetbrains-mono")?.family).toBe("JetBrains Mono Variable");
    expect(first.presets).not.toBe(second.presets);
    expect(first.presets[1]).not.toBe(second.presets[1]);
  });

  it("allows every curated font to fill every semantic typography role", () => {
    for (const fontId of createThemeCatalogue().fonts.map(({ id }) => id)) {
      const preset = structuredClone(SCAFFOLD_DEFAULT_PRESET);
      preset.id = `example.${fontId}`;
      preset.values.typography.headingFontId = fontId;
      preset.values.typography.bodyFontId = fontId;
      preset.values.typography.codeFontId = fontId;
      preset.values.typography.headingWeight = 700;
      preset.values.typography.bodyWeight = 400;

      expect(createThemeCatalogue({ presets: [preset] }).hasPreset(preset.id)).toBe(true);
    }
  });
});
