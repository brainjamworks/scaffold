import type { CourseThemeAuthorPalette, CourseThemePaletteSlot } from "@scaffold/contracts";

import type {
  CourseThemeColorPalette,
  CourseThemeValues,
  PersistedCourseTheme,
} from "@/schemas/course-document";

import {
  materialiseCoursePalette,
  type CourseThemePaletteRecipe,
  type DarkAuthorPalette,
} from "./palette-materialiser";

export interface BuiltInCourseThemePreset {
  id: string;
  revision: string;
  label: string;
  description: string;
  recipe: CourseThemePaletteRecipe;
  values: CourseThemeValues;
}

const INFO_STATE = {
  base: "#2196f3",
  onBase: "#ffffff",
  background: "#e3f2fd",
  text: "#0d47a1",
} as const;

const DARK_OVERLAY = {
  overlayBackdrop: "#000000a3",
  overlayControl: "#ffffff26",
  overlayControlHover: "#ffffff40",
  overlayPill: "#000000c2",
} as const;

const DARK_INFO_STATE = {
  base: "oklch(0.7 0.169 248.8135)",
  onBase: "oklch(0.04 0 89.8756)",
  background: "oklch(0.2 0.0218 239.4275)",
  text: "oklch(0.86 0.1569 259.9133)",
} as const;

export const SCAFFOLD_DEFAULT_LIGHT_PALETTE = deepFreeze({
  background: "#ffffff",
  canvas: "#fafafa",
  surface: "#ffffff",
  surfaceMuted: "#f4f4f5",
  text: "#18181b",
  heading: "#18181b",
  link: "oklch(0.3 0.15 270)",
  textSecondary: "#52525b",
  textMuted: "#71717a",
  placeholder: "#a1a1aa",
  border: "#e4e4e7",
  borderSubtle: "#f4f4f5",
  primary: "oklch(0.3 0.15 270)",
  onPrimary: "#ffffff",
  primaryMuted: "oklch(0.95 0.025 270)",
  secondary: "oklch(0.64 0.22 18)",
  onSecondary: "#ffffff",
  accent: "oklch(0.68 0.18 175)",
  onAccent: "#ffffff",
  info: INFO_STATE,
  success: {
    base: "oklch(0.68 0.18 175)",
    onBase: "#ffffff",
    background: "#d4f4dd",
    text: "#0d5c2f",
  },
  warning: {
    base: "#ffd100",
    onBase: "#000000",
    background: "#fff4cc",
    text: "#8b5a00",
  },
  error: {
    base: "oklch(0.64 0.22 18)",
    onBase: "#ffffff",
    background: "#ffdede",
    text: "#a11f1f",
  },
  focusOutline: "oklch(0.3 0.15 270)",
  focusRing: "#161d7759",
  overlayBackdrop: "#00000066",
  overlayControl: "#ffffff26",
  overlayControlHover: "#ffffff40",
  overlayPill: "#00000099",
  dataSeries: [
    "#161d77",
    "#f43a57",
    "#00ba92",
    "#5b6790",
    "#f47398",
    "#33bda5",
    "#52525b",
    "#a1a1aa",
  ],
} satisfies CourseThemeColorPalette);

const SCAFFOLD_DEFAULT_DARK_PALETTE = {
  background: "oklch(0.12 0 89.8756)",
  canvas: "oklch(0.08 0 89.8756)",
  surface: "oklch(0.18 0 89.8756)",
  surfaceMuted: "oklch(0.24 0.0013 286.3752)",
  text: "oklch(0.96 0.0059 285.8852)",
  heading: "oklch(0.96 0.0059 285.8852)",
  link: "oklch(0.68 0.15 270)",
  textSecondary: "oklch(0.76 0.0146 285.7864)",
  textMuted: "oklch(0.64 0.0138 285.9385)",
  placeholder: "oklch(0.52 0.0129 286.0665)",
  border: "oklch(0.34 0.004 286.3202)",
  borderSubtle: "oklch(0.26 0.0013 286.3752)",
  primary: "oklch(0.68 0.15 270)",
  onPrimary: "#09090b",
  primaryMuted: "oklch(0.24 0.08 270)",
  secondary: "oklch(0.7 0.22 18)",
  onSecondary: "#09090b",
  accent: "oklch(0.72 0.18 175)",
  onAccent: "#09090b",
  info: DARK_INFO_STATE,
  success: {
    base: "oklch(0.72 0.18 175)",
    onBase: "oklch(0.04 0 89.8756)",
    background: "oklch(0.2 0.04 154.1906)",
    text: "oklch(0.86 0.1032 152.2144)",
  },
  warning: {
    base: "oklch(0.78 0.1791 92.6798)",
    onBase: "oklch(0.08 0 0)",
    background: "oklch(0.22 0.04 94.4258)",
    text: "oklch(0.9 0.1086 72.6715)",
  },
  error: {
    base: "oklch(0.7 0.2 18)",
    onBase: "oklch(0.04 0 89.8756)",
    background: "oklch(0.2 0.0366 17.831)",
    text: "oklch(0.86 0.16 26.6779)",
  },
  focusOutline: "oklch(0.76 0.15 270)",
  focusRing: "oklch(0.68 0.1495 270.1101)",
  ...DARK_OVERLAY,
  dataSeries: [
    "oklch(0.72 0.1495 270.1101)",
    "oklch(0.7 0.2196 17.9796)",
    "oklch(0.74 0.1386 170.2026)",
    "oklch(0.68 0.0667 271.3934)",
    "oklch(0.76 0.1618 3.9751)",
    "oklch(0.72 0.1201 178.1951)",
    "oklch(0.7 0.0146 285.7864)",
    "oklch(0.78 0.0129 286.0665)",
  ],
} satisfies CourseThemeColorPalette;
const SCAFFOLD_DEFAULT_RECIPE = createPaletteRecipe(
  "scaffold.default-palette",
  SCAFFOLD_DEFAULT_LIGHT_PALETTE,
  SCAFFOLD_DEFAULT_DARK_PALETTE,
);
const SCAFFOLD_DEFAULT_MATERIALISED = materialiseDefaults(SCAFFOLD_DEFAULT_RECIPE);

export const SCAFFOLD_DEFAULT_PRESET = deepFreeze({
  id: "scaffold-default",
  revision: "1",
  label: "Scaffold Default",
  description: "Scaffold's clear, confident course presentation.",
  recipe: SCAFFOLD_DEFAULT_RECIPE,
  values: {
    colors: {
      ...SCAFFOLD_DEFAULT_MATERIALISED,
    },
    typography: {
      headingFontId: "scaffold-poppins",
      bodyFontId: "scaffold-poppins",
      codeFontId: "scaffold-jetbrains-mono",
      headingWeight: 700,
      bodyWeight: 400,
      typeScale: 1,
      bodyLineHeight: 1.5,
      headingLineHeight: 1.2,
      headingLetterSpacing: 0,
      uppercaseHeadings: false,
    },
    design: {
      roundness: 0.5,
      stroke: 1,
      shadow: "soft",
      density: "comfortable",
    },
  },
} satisfies BuiltInCourseThemePreset);

const EDITORIAL_LIGHT_PALETTE = {
  background: "#fffdf8",
  canvas: "#f5f0e6",
  surface: "#fffaf0",
  surfaceMuted: "#f1e8da",
  text: "#2b241f",
  heading: "#2b241f",
  link: "oklch(0.38 0.1 35)",
  textSecondary: "#62564b",
  textMuted: "#857669",
  placeholder: "#a99b8d",
  border: "#d8cbbb",
  borderSubtle: "#ece4d9",
  primary: "oklch(0.38 0.1 35)",
  onPrimary: "#ffffff",
  primaryMuted: "oklch(0.94 0.035 55)",
  secondary: "oklch(0.58 0.13 55)",
  onSecondary: "#ffffff",
  accent: "oklch(0.55 0.11 155)",
  onAccent: "#ffffff",
  info: INFO_STATE,
  success: {
    base: "oklch(0.55 0.11 155)",
    onBase: "#ffffff",
    background: "#e2efe4",
    text: "#315c3d",
  },
  warning: {
    base: "oklch(0.72 0.13 75)",
    onBase: "#2b241f",
    background: "#faedca",
    text: "#735414",
  },
  error: {
    base: "oklch(0.56 0.16 28)",
    onBase: "#ffffff",
    background: "#f6dfda",
    text: "#81382f",
  },
  focusOutline: "oklch(0.38 0.1 35)",
  focusRing: "#7d443559",
  overlayBackdrop: "#241b1666",
  overlayControl: "#ffffff26",
  overlayControlHover: "#ffffff40",
  overlayPill: "#241b1699",
  dataSeries: [
    "#7d4435",
    "#b07635",
    "#477557",
    "#5f6d8a",
    "#a15f69",
    "#79936a",
    "#6f5b4b",
    "#b6a28e",
  ],
} satisfies CourseThemeColorPalette;

const EDITORIAL_DARK_PALETTE = {
  background: "oklch(0.12 0.0069 88.6411)",
  canvas: "oklch(0.08 0.0143 84.5834)",
  surface: "oklch(0.18 0.0142 84.5826)",
  surfaceMuted: "oklch(0.24 0.0211 79.092)",
  text: "oklch(0.96 0.014 57.6234)",
  heading: "oklch(0.96 0.014 57.6234)",
  link: "oklch(0.68 0.1 35)",
  textSecondary: "oklch(0.76 0.0235 64.7222)",
  textMuted: "oklch(0.64 0.027 63.1847)",
  placeholder: "oklch(0.52 0.0259 67.3811)",
  border: "oklch(0.34 0.0262 73.1458)",
  borderSubtle: "oklch(0.26 0.0171 76.1068)",
  primary: "oklch(0.68 0.1 35)",
  onPrimary: "#09090b",
  primaryMuted: "oklch(0.24 0.08 35)",
  secondary: "oklch(0.7 0.13 55)",
  onSecondary: "#09090b",
  accent: "oklch(0.72 0.11 155)",
  onAccent: "#09090b",
  info: DARK_INFO_STATE,
  success: {
    base: "oklch(0.72 0.11 155)",
    onBase: "oklch(0.04 0 89.8756)",
    background: "oklch(0.2 0.0201 150.093)",
    text: "oklch(0.86 0.0705 151.5188)",
  },
  warning: {
    base: "oklch(0.78 0.13 75)",
    onBase: "oklch(0.08 0.014 57.6234)",
    background: "oklch(0.22 0.04 90.0583)",
    text: "oklch(0.9 0.0874 80.8067)",
  },
  error: {
    base: "oklch(0.7 0.16 28)",
    onBase: "oklch(0.04 0 89.8756)",
    background: "oklch(0.2 0.0264 32.2383)",
    text: "oklch(0.86 0.103 29.0502)",
  },
  focusOutline: "oklch(0.76 0.1 35)",
  focusRing: "oklch(0.68 0.0826 35.6584)",
  ...DARK_OVERLAY,
  dataSeries: [
    "oklch(0.72 0.0826 35.6584)",
    "oklch(0.7 0.1085 66.2015)",
    "oklch(0.74 0.0697 154.6388)",
    "oklch(0.68 0.0488 264.6542)",
    "oklch(0.76 0.0866 10.4532)",
    "oklch(0.72 0.0664 134.3524)",
    "oklch(0.7 0.036 60.4659)",
    "oklch(0.78 0.0366 67.1937)",
  ],
} satisfies CourseThemeColorPalette;
const EDITORIAL_RECIPE = createPaletteRecipe(
  "scaffold.editorial-palette",
  EDITORIAL_LIGHT_PALETTE,
  EDITORIAL_DARK_PALETTE,
);
const EDITORIAL_MATERIALISED = materialiseDefaults(EDITORIAL_RECIPE);

export const SCAFFOLD_EDITORIAL_PRESET = deepFreeze({
  id: "scaffold-editorial",
  revision: "1",
  label: "Editorial",
  description: "A warm, spacious course presentation with a literary voice.",
  recipe: EDITORIAL_RECIPE,
  values: {
    colors: {
      ...EDITORIAL_MATERIALISED,
    },
    typography: {
      headingFontId: "scaffold-source-serif-4",
      bodyFontId: "scaffold-poppins",
      codeFontId: "scaffold-jetbrains-mono",
      headingWeight: 700,
      bodyWeight: 400,
      typeScale: 1.08,
      bodyLineHeight: 1.65,
      headingLineHeight: 1.12,
      headingLetterSpacing: -0.015,
      uppercaseHeadings: false,
    },
    design: {
      roundness: 0.2,
      stroke: 1,
      shadow: "soft",
      density: "spacious",
    },
  },
} satisfies BuiltInCourseThemePreset);

const MINIMAL_LIGHT_PALETTE = {
  background: "#ffffff",
  canvas: "#f1f5f9",
  surface: "#ffffff",
  surfaceMuted: "#eef2f6",
  text: "#0f172a",
  heading: "#0f172a",
  link: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  placeholder: "#94a3b8",
  border: "#cbd5e1",
  borderSubtle: "#e2e8f0",
  primary: "#0f172a",
  onPrimary: "#ffffff",
  primaryMuted: "#e2e8f0",
  secondary: "oklch(0.58 0.12 250)",
  onSecondary: "#ffffff",
  accent: "oklch(0.62 0.13 190)",
  onAccent: "#082f36",
  info: INFO_STATE,
  success: {
    base: "oklch(0.62 0.13 155)",
    onBase: "#052e1b",
    background: "#dcfce7",
    text: "#166534",
  },
  warning: {
    base: "oklch(0.76 0.14 80)",
    onBase: "#1c1917",
    background: "#fef3c7",
    text: "#854d0e",
  },
  error: {
    base: "oklch(0.62 0.2 25)",
    onBase: "#ffffff",
    background: "#fee2e2",
    text: "#991b1b",
  },
  focusOutline: "oklch(0.58 0.12 250)",
  focusRing: "#2563eb4d",
  overlayBackdrop: "#02061766",
  overlayControl: "#ffffff26",
  overlayControlHover: "#ffffff40",
  overlayPill: "#02061799",
  dataSeries: [
    "#0f172a",
    "#2563eb",
    "#0891b2",
    "#7c3aed",
    "#db2777",
    "#16a34a",
    "#ea580c",
    "#64748b",
  ],
} satisfies CourseThemeColorPalette;

const MINIMAL_DARK_PALETTE = {
  background: "oklch(0.12 0 89.8756)",
  canvas: "oklch(0.08 0.0069 247.8956)",
  surface: "oklch(0.18 0 89.8756)",
  surfaceMuted: "oklch(0.24 0.0069 247.8964)",
  text: "oklch(0.96 0.025 265.7549)",
  heading: "oklch(0.96 0.025 265.7549)",
  link: "oklch(0.68 0.0398 265.7549)",
  textSecondary: "oklch(0.76 0.0374 257.2808)",
  textMuted: "oklch(0.64 0.04 257.4166)",
  placeholder: "oklch(0.52 0.0351 256.7878)",
  border: "oklch(0.34 0.0198 252.8943)",
  borderSubtle: "oklch(0.26 0.0126 255.5078)",
  primary: "oklch(0.68 0.0398 265.7549)",
  onPrimary: "#09090b",
  primaryMuted: "oklch(0.24 0.0398 265.7549)",
  secondary: "oklch(0.7 0.12 250)",
  onSecondary: "#09090b",
  accent: "oklch(0.72 0.13 190)",
  onAccent: "#09090b",
  info: DARK_INFO_STATE,
  success: {
    base: "oklch(0.72 0.13 155)",
    onBase: "oklch(0.04 0.02 158.3324)",
    background: "oklch(0.2 0.04 156.7426)",
    text: "oklch(0.86 0.1083 151.3277)",
  },
  warning: {
    base: "oklch(0.78 0.14 80)",
    onBase: "oklch(0.08 0.0061 56.0434)",
    background: "oklch(0.22 0.04 95.6174)",
    text: "oklch(0.9 0.1034 61.9071)",
  },
  error: {
    base: "oklch(0.7 0.2 25)",
    onBase: "oklch(0.04 0 89.8756)",
    background: "oklch(0.2 0.0309 17.7172)",
    text: "oklch(0.86 0.16 26.8994)",
  },
  focusOutline: "oklch(0.76 0.12 250)",
  focusRing: "oklch(0.68 0.18 262.8809)",
  ...DARK_OVERLAY,
  dataSeries: [
    "oklch(0.72 0.0398 265.7549)",
    "oklch(0.7 0.2152 262.8809)",
    "oklch(0.74 0.1109 221.7231)",
    "oklch(0.68 0.22 293.009)",
    "oklch(0.76 0.218 0.5844)",
    "oklch(0.72 0.1699 149.2138)",
    "oklch(0.7 0.1943 41.1158)",
    "oklch(0.78 0.0407 257.4166)",
  ],
} satisfies CourseThemeColorPalette;
const MINIMAL_RECIPE = createPaletteRecipe(
  "scaffold.minimal-palette",
  MINIMAL_LIGHT_PALETTE,
  MINIMAL_DARK_PALETTE,
);
const MINIMAL_MATERIALISED = materialiseDefaults(MINIMAL_RECIPE);

export const SCAFFOLD_MINIMAL_PRESET = deepFreeze({
  id: "scaffold-minimal",
  revision: "1",
  label: "Minimal",
  description: "A compact, precise course presentation with restrained decoration.",
  recipe: MINIMAL_RECIPE,
  values: {
    colors: {
      ...MINIMAL_MATERIALISED,
    },
    typography: {
      headingFontId: "scaffold-inter",
      bodyFontId: "scaffold-inter",
      codeFontId: "scaffold-jetbrains-mono",
      headingWeight: 700,
      bodyWeight: 400,
      typeScale: 0.94,
      bodyLineHeight: 1.45,
      headingLineHeight: 1.1,
      headingLetterSpacing: -0.025,
      uppercaseHeadings: false,
    },
    design: {
      roundness: 0.1,
      stroke: 0.5,
      shadow: "none",
      density: "compact",
    },
  },
} satisfies BuiltInCourseThemePreset);

export const builtInThemePresets = deepFreeze([
  SCAFFOLD_DEFAULT_PRESET,
  SCAFFOLD_EDITORIAL_PRESET,
  SCAFFOLD_MINIMAL_PRESET,
]);

export function createScaffoldDefaultTheme(): PersistedCourseTheme {
  return structuredClone({
    schemaVersion: 1,
    preset: {
      id: SCAFFOLD_DEFAULT_PRESET.id,
      revision: SCAFFOLD_DEFAULT_PRESET.revision,
    },
    values: SCAFFOLD_DEFAULT_PRESET.values,
  });
}

function createPaletteRecipe(
  id: string,
  light: CourseThemeColorPalette,
  dark: CourseThemeColorPalette,
): CourseThemePaletteRecipe {
  return {
    id,
    version: 1,
    defaults: {
      light: authorFromPalette(light),
      dark: authorFromPalette(dark),
    },
    semanticBase: {
      light,
      dark,
    },
    data: {
      lightSupplemental: [light.dataSeries[6], light.dataSeries[7]],
      darkSupplemental: [dark.dataSeries[6], dark.dataSeries[7]],
    },
  };
}

function materialiseDefaults(recipe: CourseThemePaletteRecipe) {
  return materialiseCoursePalette({
    recipe,
    light: recipe.defaults.light,
    dark: {
      sourceBySlot: Object.fromEntries(
        (Object.keys(recipe.defaults.dark) as CourseThemePaletteSlot[]).map((slot) => [
          slot,
          "derived",
        ]),
      ) as DarkAuthorPalette["sourceBySlot"],
      values: recipe.defaults.dark,
    },
  });
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

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
