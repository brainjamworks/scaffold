import type {
  CourseThemeAuthorPalette,
  CourseThemeColorPalette,
  CourseThemeCssColor,
  CourseThemePaletteSlot,
} from "@scaffold/contracts";
import {
  clampGamut,
  converter,
  formatHex,
  formatHex8,
  interpolate,
  wcagContrast,
  type Oklch,
} from "culori";

const toOklch = converter("oklch");
const clampToRgb = clampGamut("rgb");

export interface DarkAuthorPalette {
  sourceBySlot: Readonly<Record<CourseThemePaletteSlot, "derived" | "custom">>;
  values: CourseThemeAuthorPalette;
}

export interface CourseThemePaletteRecipe {
  id: string;
  version: 1;
  defaults: {
    light: CourseThemeAuthorPalette;
    dark: CourseThemeAuthorPalette;
  };
  semanticBase: {
    light: CourseThemeColorPalette;
    dark: CourseThemeColorPalette;
  };
  data: {
    lightSupplemental: [CourseThemeCssColor, CourseThemeCssColor];
    darkSupplemental: [CourseThemeCssColor, CourseThemeCssColor];
  };
}

export interface MaterialisedCoursePalette {
  author: {
    light: CourseThemeAuthorPalette;
    dark: DarkAuthorPalette;
  };
  recipe: {
    id: string;
    version: 1;
  };
  resolved: {
    light: CourseThemeColorPalette;
    dark: CourseThemeColorPalette;
  };
}

export function materialiseCoursePalette(input: {
  recipe: CourseThemePaletteRecipe;
  light: CourseThemeAuthorPalette;
  dark: DarkAuthorPalette;
}): MaterialisedCoursePalette {
  const darkValues = deriveDarkAuthorPalette(input.recipe, input.light, input.dark);
  const dark = {
    sourceBySlot: { ...input.dark.sourceBySlot },
    values: darkValues,
  };

  return {
    author: {
      light: { ...input.light },
      dark,
    },
    recipe: {
      id: input.recipe.id,
      version: input.recipe.version,
    },
    resolved: {
      light: resolveMode(
        input.recipe.semanticBase.light,
        input.light,
        input.recipe.defaults.light,
        input.recipe.data.lightSupplemental,
      ),
      dark: resolveMode(
        input.recipe.semanticBase.dark,
        darkValues,
        input.recipe.defaults.dark,
        input.recipe.data.darkSupplemental,
      ),
    },
  };
}

function deriveDarkAuthorPalette(
  recipe: CourseThemePaletteRecipe,
  light: CourseThemeAuthorPalette,
  dark: DarkAuthorPalette,
): CourseThemeAuthorPalette {
  const values = { ...dark.values };
  for (const slot of Object.keys(light) as CourseThemePaletteSlot[]) {
    if (dark.sourceBySlot[slot] === "derived") {
      values[slot] = deriveDarkColor(
        light[slot],
        recipe.defaults.light[slot],
        recipe.defaults.dark[slot],
      );
    }
  }
  return values;
}

function deriveDarkColor(
  source: CourseThemeCssColor,
  defaultLight: CourseThemeCssColor,
  defaultDark: CourseThemeCssColor,
): CourseThemeCssColor {
  if (source === defaultLight) return defaultDark;
  const sourceColor = requireOklch(source);
  const lightReference = requireOklch(defaultLight);
  const darkReference = requireOklch(defaultDark);
  const referenceChroma = lightReference.c ?? 0;
  const chromaRatio = referenceChroma > 0.001 ? (darkReference.c ?? 0) / referenceChroma : 1;
  const derived: Oklch = {
    mode: "oklch",
    l: clamp(sourceColor.l + darkReference.l - lightReference.l, 0, 1),
    c: clamp((sourceColor.c ?? 0) * chromaRatio, 0, 0.4),
    ...(sourceColor.h === undefined ? {} : { h: sourceColor.h }),
    ...(sourceColor.alpha === undefined ? {} : { alpha: sourceColor.alpha }),
  };
  return formatMappedHex(derived);
}

function resolveMode(
  base: CourseThemeColorPalette,
  author: CourseThemeAuthorPalette,
  defaults: CourseThemeAuthorPalette,
  supplemental: readonly [CourseThemeCssColor, CourseThemeCssColor],
): CourseThemeColorPalette {
  const resolved = structuredClone(base);
  if (
    author.background !== defaults.background ||
    author.surface !== defaults.surface ||
    author.bodyText !== defaults.bodyText
  ) {
    Object.assign(resolved, {
      background: author.background,
      canvas: mixHex(author.background, author.surface, 0.35),
      surface: author.surface,
      surfaceMuted: mixHex(author.surface, author.background, 0.55),
      text: author.bodyText,
      textSecondary: mixHex(author.bodyText, author.background, 0.28),
      textMuted: mixHex(author.bodyText, author.background, 0.48),
      placeholder: mixHex(author.bodyText, author.background, 0.62),
      border: mixHex(author.bodyText, author.surface, 0.8),
      borderSubtle: mixHex(author.bodyText, author.surface, 0.9),
    });
  }
  if (author.headingText !== defaults.headingText) {
    resolved.heading = author.headingText;
  }
  if (author.link !== defaults.link) {
    resolved.link = author.link;
  }
  if (author.primary !== defaults.primary) {
    Object.assign(resolved, {
      primary: author.primary,
      onPrimary: readableForeground(author.primary),
      primaryMuted: mixHex(author.primary, author.surface, 0.82),
      focusOutline: author.primary,
      focusRing: withAlpha(author.primary, 0.35),
    });
  }
  if (author.secondary !== defaults.secondary) {
    resolved.secondary = author.secondary;
    resolved.onSecondary = readableForeground(author.secondary);
  }
  if (author.accent1 !== defaults.accent1) {
    resolved.accent = author.accent1;
    resolved.onAccent = readableForeground(author.accent1);
  }
  if (
    author.primary !== defaults.primary ||
    author.secondary !== defaults.secondary ||
    author.accent1 !== defaults.accent1 ||
    author.accent2 !== defaults.accent2 ||
    author.accent3 !== defaults.accent3 ||
    author.accent4 !== defaults.accent4
  ) {
    resolved.dataSeries = [
      author.primary,
      author.secondary,
      author.accent1,
      author.accent2,
      author.accent3,
      author.accent4,
      supplemental[0],
      supplemental[1],
    ];
  }
  return resolved;
}

function readableForeground(background: CourseThemeCssColor): CourseThemeCssColor {
  return wcagContrast(background, "#000000") >= wcagContrast(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

function mixHex(
  first: CourseThemeCssColor,
  second: CourseThemeCssColor,
  amount: number,
): CourseThemeCssColor {
  const mix = interpolate([first, second], "oklch");
  return formatMappedHex(mix(amount));
}

function withAlpha(color: CourseThemeCssColor, alpha: number): CourseThemeCssColor {
  const rgb = clampToRgb(color);
  if (!rgb) throw new Error(`Unable to map course theme colour: ${color}`);
  return formatHex8({ ...rgb, alpha });
}

function formatMappedHex(color: Parameters<typeof clampToRgb>[0]): CourseThemeCssColor {
  const mapped = clampToRgb(color);
  const formatted = formatHex(mapped);
  if (!formatted) throw new Error("Unable to format course theme colour");
  return formatted;
}

function requireOklch(color: CourseThemeCssColor): Oklch {
  const converted = toOklch(color);
  if (!converted) throw new Error(`Unable to convert course theme colour: ${color}`);
  return converted;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
