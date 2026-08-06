import {
  CourseThemeNonColourAuthorOverridesSchema,
  type CourseThemeRef,
  type PersistedCourseTheme,
} from "@scaffold/contracts";

import { builtInThemeFonts } from "@/theme/model/built-in-fonts";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";

import type {
  CourseColourSystemRegistry,
  CourseColourSystemRevision,
} from "./colour-systems/registry";
import type { CourseDesignRadixConfig, CourseDesignThemeRegistry } from "./designs/registry";
import {
  createCourseSemanticStateProperties,
  type CourseSemanticStateCssProperty,
} from "./semantic-states";

export type CourseApprovedAuthorOverrideProperty =
  | "--sc-course-author-body-weight"
  | "--sc-course-author-heading-weight"
  | "--sc-course-author-text-scale"
  | "--sc-course-author-body-line-height"
  | "--sc-course-author-heading-line-height"
  | "--sc-course-author-heading-letter-spacing"
  | "--sc-course-author-heading-text-transform"
  | "--sc-course-author-stroke-width"
  | "--sc-course-author-shadow"
  | "--sc-course-author-density";
export type CourseThemeFontCssProperty =
  | "--default-font-family"
  | "--heading-font-family"
  | "--code-font-family";
export type CourseDataSeriesCssProperty =
  `--sc-course-data-series-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type CourseThemeCssProperty =
  | CourseThemeFontCssProperty
  | CourseDataSeriesCssProperty
  | CourseSemanticStateCssProperty
  | CourseApprovedAuthorOverrideProperty;
export type CourseThemeRootStyle = Readonly<Record<CourseThemeCssProperty, string>>;

export type ResolvedCourseRadixThemeProps = Readonly<
  { appearance: ScaffoldColorMode } & CourseDesignRadixConfig & CourseColourSystemRevision["radix"]
>;

export type ResolvedCourseTheme = Readonly<{
  status: "ready";
  design: Readonly<CourseThemeRef>;
  colourSystem: Readonly<CourseThemeRef>;
  appearance: ScaffoldColorMode;
  radixThemeProps: ResolvedCourseRadixThemeProps;
  rootClassNames: readonly ["sc-course", `sc-course-theme-${string}`];
  rootStyle: CourseThemeRootStyle;
}>;

export type UnavailableCourseTheme = Readonly<{
  status: "unavailable";
  missing: "design" | "colourSystem";
  reference: Readonly<CourseThemeRef>;
}>;

export type ResolveCourseThemeResult = ResolvedCourseTheme | UnavailableCourseTheme;

export type ResolveCourseThemeInput = Readonly<{
  theme: PersistedCourseTheme;
  appearance: ScaffoldColorMode;
  designs: CourseDesignThemeRegistry;
  colourSystems: CourseColourSystemRegistry;
}>;

export function resolveCourseTheme(input: ResolveCourseThemeInput): ResolveCourseThemeResult {
  const design = input.designs.get(input.theme.design);
  if (!design) return unavailable("design", input.theme.design);

  const colourSystem = input.colourSystems.get(input.theme.colourSystem);
  if (!colourSystem) return unavailable("colourSystem", input.theme.colourSystem);

  const overrides = CourseThemeNonColourAuthorOverridesSchema.parse(input.theme.overrides);
  const typographyDefaults = design.authorDefaults.typography;
  const typographyOverrides = overrides.typography;
  const typography = {
    defaultFontId: typographyOverrides?.defaultFontId ?? typographyDefaults.defaultFontId,
    headingFontId: typographyOverrides?.headingFontId ?? typographyDefaults.headingFontId,
    codeFontId: typographyOverrides?.codeFontId ?? typographyDefaults.codeFontId,
    bodyWeight: typographyOverrides?.bodyWeight ?? typographyDefaults.bodyWeight,
    headingWeight: typographyOverrides?.headingWeight ?? typographyDefaults.headingWeight,
    courseTextSize: typographyOverrides?.courseTextSize ?? typographyDefaults.courseTextSize,
    bodyLineSpacing: typographyOverrides?.bodyLineSpacing ?? typographyDefaults.bodyLineSpacing,
    headingLineSpacing:
      typographyOverrides?.headingLineSpacing ?? typographyDefaults.headingLineSpacing,
    headingLetterSpacing:
      typographyOverrides?.headingLetterSpacing ?? typographyDefaults.headingLetterSpacing,
    uppercaseHeadings:
      typographyOverrides?.uppercaseHeadings ?? typographyDefaults.uppercaseHeadings,
  };
  const designDefaults = design.authorDefaults.design;
  const designOverrides = overrides.design;
  const authorDesign = {
    roundness: designOverrides?.roundness ?? designDefaults.roundness,
    stroke: designOverrides?.stroke ?? designDefaults.stroke,
    shadow: designOverrides?.shadow ?? designDefaults.shadow,
    density: designOverrides?.density ?? designDefaults.density,
  };
  const defaultFont = resolveFont(typography.defaultFontId, "body");
  const headingFont = resolveFont(typography.headingFontId, "heading");
  const codeFont = resolveFont(typography.codeFontId, "code");
  assertFontSupportsWeight(defaultFont, typography.bodyWeight, "body");
  assertFontSupportsWeight(headingFont, typography.headingWeight, "heading");

  const designReference = freezeReference(input.theme.design);
  const colourSystemReference = freezeReference(input.theme.colourSystem);
  const radixThemeProps = Object.freeze({
    appearance: input.appearance,
    ...design.radix,
    ...colourSystem.radix,
    radius: design.authorMappings.design.roundness[authorDesign.roundness],
  });
  const rootClassNames = Object.freeze([
    "sc-course",
    design.rootClassName,
  ]) as ResolvedCourseTheme["rootClassNames"];
  const rootStyle = Object.freeze({
    "--default-font-family": fontFamily(defaultFont),
    "--heading-font-family": fontFamily(headingFont),
    "--code-font-family": fontFamily(codeFont),
    "--sc-course-author-body-weight": String(typography.bodyWeight),
    "--sc-course-author-heading-weight": String(typography.headingWeight),
    "--sc-course-author-text-scale":
      design.authorMappings.typography.courseTextSize[typography.courseTextSize],
    "--sc-course-author-body-line-height":
      design.authorMappings.typography.bodyLineSpacing[typography.bodyLineSpacing],
    "--sc-course-author-heading-line-height":
      design.authorMappings.typography.headingLineSpacing[typography.headingLineSpacing],
    "--sc-course-author-heading-letter-spacing":
      design.authorMappings.typography.headingLetterSpacing[typography.headingLetterSpacing],
    "--sc-course-author-heading-text-transform": typography.uppercaseHeadings
      ? "uppercase"
      : "none",
    "--sc-course-author-stroke-width": design.authorMappings.design.stroke[authorDesign.stroke],
    "--sc-course-author-shadow": design.authorMappings.design.shadow[authorDesign.shadow],
    "--sc-course-author-density": design.authorMappings.design.density[authorDesign.density],
    ...createCourseDataSeriesProperties(colourSystem, input.appearance),
    ...createCourseSemanticStateProperties(colourSystem),
  }) satisfies CourseThemeRootStyle;

  return Object.freeze({
    status: "ready",
    design: designReference,
    colourSystem: colourSystemReference,
    appearance: input.appearance,
    radixThemeProps,
    rootClassNames,
    rootStyle,
  });
}

function createCourseDataSeriesProperties(
  colourSystem: CourseColourSystemRevision,
  appearance: ScaffoldColorMode,
): Readonly<Record<CourseDataSeriesCssProperty, string>> {
  const palette = colourSystem.dataSeries[appearance];
  return Object.freeze({
    "--sc-course-data-series-1": palette[0],
    "--sc-course-data-series-2": palette[1],
    "--sc-course-data-series-3": palette[2],
    "--sc-course-data-series-4": palette[3],
    "--sc-course-data-series-5": palette[4],
    "--sc-course-data-series-6": palette[5],
    "--sc-course-data-series-7": palette[6],
    "--sc-course-data-series-8": palette[7],
  });
}

function unavailable(
  missing: UnavailableCourseTheme["missing"],
  reference: CourseThemeRef,
): UnavailableCourseTheme {
  return Object.freeze({
    status: "unavailable",
    missing,
    reference: freezeReference(reference),
  });
}

function freezeReference(reference: CourseThemeRef): Readonly<CourseThemeRef> {
  return Object.freeze({ id: reference.id, revision: reference.revision });
}

type BuiltInThemeFont = (typeof builtInThemeFonts)[number];
type CourseThemeFontRole = "body" | "heading" | "code";

function resolveFont(fontId: string, role: CourseThemeFontRole): BuiltInThemeFont {
  const font = builtInThemeFonts.find((candidate) => candidate.id === fontId);
  if (!font) throw new Error(`Unknown built-in Course theme font: ${fontId}`);

  const roleMatches =
    role === "code"
      ? font.category === "mono"
      : font.category === "sans" || font.category === "serif";
  if (!roleMatches) {
    throw new Error(`Course theme ${role} font has an incompatible font role: ${fontId}`);
  }
  return font;
}

function assertFontSupportsWeight(
  font: BuiltInThemeFont,
  weight: number,
  role: "body" | "heading",
): void {
  if (!font.weights.some((supportedWeight) => supportedWeight === weight)) {
    throw new Error(`Course theme ${role} font ${font.id} does not support weight ${weight}`);
  }
}

function fontFamily(font: BuiltInThemeFont): string {
  return `"${font.family}", ${font.fallback}`;
}
