import type { CourseThemeColorPalette, CourseThemeValues } from "@/schemas/course-document";

import type { ThemeCatalogue } from "./theme-catalogue";
import { resolveCourseThemeFontStack } from "./theme-token-projection";

export interface ChartTokens {
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderSubtle: string;
  primary: string;
  primaryMuted: string;
  accent: string;
  headingFont: string;
  bodyFont: string;
  codeFont: string;
  headingWeight: CourseThemeValues["typography"]["headingWeight"];
  bodyWeight: CourseThemeValues["typography"]["bodyWeight"];
  dataSeries: CourseThemeColorPalette["dataSeries"];
  roundness: number;
  stroke: number;
  shadow: CourseThemeValues["design"]["shadow"];
  density: CourseThemeValues["design"]["density"];
}

export function projectChartTokens(input: {
  values: CourseThemeValues;
  palette: CourseThemeColorPalette;
  catalogue: ThemeCatalogue;
}): ChartTokens {
  const { values, palette, catalogue } = input;
  return deepFreeze({
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
    headingFont: resolveCourseThemeFontStack(values.typography.headingFontId, catalogue),
    bodyFont: resolveCourseThemeFontStack(values.typography.bodyFontId, catalogue),
    codeFont: resolveCourseThemeFontStack(values.typography.codeFontId, catalogue),
    headingWeight: values.typography.headingWeight,
    bodyWeight: values.typography.bodyWeight,
    dataSeries: structuredClone(palette.dataSeries),
    roundness: values.design.roundness,
    stroke: values.design.stroke,
    shadow: values.design.shadow,
    density: values.design.density,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
