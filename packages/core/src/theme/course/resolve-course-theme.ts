import type { CourseThemeRef, PersistedCourseTheme } from "@scaffold/contracts";

import { builtInThemeFonts, type BuiltInThemeFontId } from "@/theme/model/built-in-fonts";
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

export type CourseApprovedAuthorOverrideProperty = never;
export type CourseThemeFontCssProperty =
  | "--default-font-family"
  | "--heading-font-family"
  | "--code-font-family";
export type CourseDataSeriesCssProperty =
  `--sc-course-data-series-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`;
export type CourseThemeCssProperty =
  | CourseThemeFontCssProperty
  | CourseDataSeriesCssProperty
  | CourseSemanticStateCssProperty;
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

  const designReference = freezeReference(input.theme.design);
  const colourSystemReference = freezeReference(input.theme.colourSystem);
  const radixThemeProps = Object.freeze({
    appearance: input.appearance,
    ...design.radix,
    ...colourSystem.radix,
  });
  const rootClassNames = Object.freeze([
    "sc-course",
    design.rootClassName,
  ]) as ResolvedCourseTheme["rootClassNames"];
  const rootStyle = Object.freeze({
    "--default-font-family": fontFamily(design.typography.defaultFontId),
    "--heading-font-family": fontFamily(design.typography.headingFontId),
    "--code-font-family": fontFamily(design.typography.codeFontId),
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

function fontFamily(fontId: BuiltInThemeFontId): string {
  const font = builtInThemeFonts.find((candidate) => candidate.id === fontId);
  if (!font) throw new Error(`Unknown built-in Course theme font: ${fontId}`);
  return `"${font.family}", ${font.fallback}`;
}
