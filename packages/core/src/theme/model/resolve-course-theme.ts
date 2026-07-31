import type {
  CourseThemeColorPalette,
  CourseThemeValues,
  PersistedCourseTheme,
} from "@/schemas/course-document";

import type { ThemeCatalogue } from "./theme-catalogue";
import { projectChartTokens, type ChartTokens } from "./chart-tokens";
import { projectCourseThemeCssTokens, type CourseThemeCssTokens } from "./theme-token-projection";

export type ScaffoldColorMode = "light" | "dark";

export interface ResolvedCourseTheme {
  requestedPresetId: string;
  effectivePresetId: string;
  available: boolean;
  mode: ScaffoldColorMode;
  values: CourseThemeValues;
  palette: CourseThemeColorPalette;
  cssTokens: CourseThemeCssTokens;
  chartTokens: ChartTokens;
}

export interface ResolveCourseThemeInput {
  theme: PersistedCourseTheme;
  catalogue: ThemeCatalogue;
  mode: ScaffoldColorMode;
}

export function resolveCourseTheme(input: ResolveCourseThemeInput): ResolvedCourseTheme {
  const requestedPreset = input.catalogue.getPreset(input.theme.preset.id);
  const available = requestedPreset !== null;
  const effectivePreset = requestedPreset ?? input.catalogue.defaultPreset;
  const sourceValues =
    available && input.theme.values !== null ? input.theme.values : effectivePreset.values;
  const values = resolveFonts(structuredClone(sourceValues), input.catalogue);
  const palette = values.colors.resolved[input.mode];
  const projectionInput = { values, palette, catalogue: input.catalogue };

  return deepFreeze({
    requestedPresetId: input.theme.preset.id,
    effectivePresetId: effectivePreset.id,
    available,
    mode: input.mode,
    values,
    palette,
    cssTokens: projectCourseThemeCssTokens(projectionInput),
    chartTokens: projectChartTokens(projectionInput),
  });
}

function resolveFonts(values: CourseThemeValues, catalogue: ThemeCatalogue): CourseThemeValues {
  const defaultTypography = catalogue.defaultPreset.values.typography;
  const typography = values.typography;

  typography.headingFontId = resolveFontId(
    typography.headingFontId,
    defaultTypography.headingFontId,
    catalogue,
  );
  typography.bodyFontId = resolveFontId(
    typography.bodyFontId,
    defaultTypography.bodyFontId,
    catalogue,
  );
  typography.codeFontId = resolveFontId(
    typography.codeFontId,
    defaultTypography.codeFontId,
    catalogue,
  );
  return values;
}

function resolveFontId(requestedId: string, fallbackId: string, catalogue: ThemeCatalogue): string {
  return catalogue.getFont(requestedId)?.id ?? catalogue.getFont(fallbackId)?.id ?? fallbackId;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
