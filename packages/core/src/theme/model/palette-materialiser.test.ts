import type {
  CourseThemeAuthorPalette,
  CourseThemeColorPalette,
  CourseThemePaletteSlot,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_DEFAULT_PRESET } from "./built-in-presets";
import {
  materialiseCoursePalette,
  type CourseThemePaletteRecipe,
  type DarkAuthorPalette,
} from "./palette-materialiser";

const paletteSlots = [
  "background",
  "surface",
  "bodyText",
  "headingText",
  "primary",
  "secondary",
  "accent1",
  "accent2",
  "accent3",
  "accent4",
  "link",
] as const satisfies readonly CourseThemePaletteSlot[];

describe("course palette materialiser", () => {
  it("preserves exact author anchors and deterministically resolves a complete semantic snapshot", () => {
    const input = materialiserInput();
    input.light = {
      ...input.light,
      headingText: "#3b1d5a",
      primary: "#fff2a3",
      secondary: "#ff0000",
      accent1: "#071a52",
      accent2: "#c9b79c",
      accent3: "#00ba92",
      accent4: "#7c3aed",
      link: "#244aa0",
    };

    const first = materialiseCoursePalette(input);
    const second = materialiseCoursePalette(structuredClone(input));

    expect(first).toEqual(second);
    expect(first.author.light).toEqual(input.light);
    expect(first.resolved.light).toMatchObject({
      background: input.light.background,
      surface: input.light.surface,
      text: input.light.bodyText,
      heading: "#3b1d5a",
      link: "#244aa0",
      primary: "#fff2a3",
      secondary: "#ff0000",
      accent: "#071a52",
      dataSeries: [
        "#fff2a3",
        "#ff0000",
        "#071a52",
        "#c9b79c",
        "#00ba92",
        "#7c3aed",
        input.recipe.data.lightSupplemental[0],
        input.recipe.data.lightSupplemental[1],
      ],
    });
  });

  it("keeps preset status families independent from creative author colours", () => {
    const firstInput = materialiserInput();
    const secondInput = materialiserInput();
    secondInput.light = {
      ...secondInput.light,
      primary: "#ff0000",
      secondary: "#fff2a3",
      accent1: "#071a52",
      accent2: "#c9b79c",
      accent3: "#db2777",
      accent4: "#16a34a",
    };

    const first = materialiseCoursePalette(firstInput);
    const second = materialiseCoursePalette(secondInput);

    expect(pickStatuses(first.resolved.light)).toEqual(pickStatuses(second.resolved.light));
    expect(pickStatuses(first.resolved.dark)).toEqual(pickStatuses(second.resolved.dark));
  });

  it("derives only dark slots whose provenance remains derived", () => {
    const input = materialiserInput();
    input.light = {
      ...input.light,
      primary: "#fff2a3",
      secondary: "#ff0000",
    };
    input.dark = {
      ...input.dark,
      sourceBySlot: {
        ...input.dark.sourceBySlot,
        primary: "custom",
      },
      values: {
        ...input.dark.values,
        primary: "#071a52",
      },
    };

    const result = materialiseCoursePalette(input);

    expect(result.author.dark.values.primary).toBe("#071a52");
    expect(result.resolved.dark.primary).toBe("#071a52");
    expect(result.author.dark.values.secondary).not.toBe(input.dark.values.secondary);
    expect(result.author.dark.sourceBySlot).toEqual(input.dark.sourceBySlot);
  });

  it.each(["#fff2a3", "#ff0000", "#071a52", "#c9b79c"])(
    "gamut-maps dependent roles for awkward input %s",
    (primary) => {
      const input = materialiserInput();
      input.light = { ...input.light, primary };

      const result = materialiseCoursePalette(input);

      expect(result.resolved.light.primary).toBe(primary);
      expect(result.resolved.light.onPrimary).toMatch(/^#[\da-f]{6}$/i);
      expect(result.resolved.light.primaryMuted).toMatch(/^#[\da-f]{6}$/i);
      expect(result.author.dark.values.primary).toMatch(/^#[\da-f]{6}$/i);
    },
  );
});

function materialiserInput(): {
  recipe: CourseThemePaletteRecipe;
  light: CourseThemeAuthorPalette;
  dark: DarkAuthorPalette;
} {
  const light = SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.light;
  const dark = SCAFFOLD_DEFAULT_PRESET.values.colors.resolved.dark;
  const lightAuthor = authorFromPalette(light);
  const darkAuthor = authorFromPalette(dark);

  return {
    recipe: {
      id: "scaffold.default-palette",
      version: 1,
      defaults: {
        light: lightAuthor,
        dark: darkAuthor,
      },
      semanticBase: {
        light: structuredClone(light),
        dark: structuredClone(dark),
      },
      data: {
        lightSupplemental: [light.dataSeries[6], light.dataSeries[7]],
        darkSupplemental: [dark.dataSeries[6], dark.dataSeries[7]],
      },
    },
    light: lightAuthor,
    dark: {
      sourceBySlot: Object.fromEntries(
        paletteSlots.map((slot) => [slot, "derived"] as const),
      ) as DarkAuthorPalette["sourceBySlot"],
      values: darkAuthor,
    },
  };
}

function authorFromPalette(palette: CourseThemeColorPalette): CourseThemeAuthorPalette {
  return {
    background: palette.background,
    surface: palette.surface,
    bodyText: palette.text,
    headingText: palette.heading ?? palette.text,
    primary: palette.primary,
    secondary: palette.secondary,
    accent1: palette.accent,
    accent2: palette.dataSeries[3],
    accent3: palette.dataSeries[4],
    accent4: palette.dataSeries[5],
    link: palette.link ?? palette.primary,
  };
}

function pickStatuses(palette: CourseThemeColorPalette) {
  return {
    info: palette.info,
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
  };
}
