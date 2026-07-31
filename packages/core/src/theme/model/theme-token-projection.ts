import type { CourseThemeColorPalette, CourseThemeValues } from "@/schemas/course-document";

import type { CourseThemeFontDefinition } from "./theme-extension-schema";
import type { ThemeCatalogue } from "./theme-catalogue";

export const COURSE_THEME_CSS_PROPERTIES = [
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

export type CourseThemeCssProperty = (typeof COURSE_THEME_CSS_PROPERTIES)[number];
export type CourseThemeCssTokens = Readonly<Record<CourseThemeCssProperty, string>>;

export function projectCourseThemeCssTokens(input: {
  values: CourseThemeValues;
  palette: CourseThemeColorPalette;
  catalogue: ThemeCatalogue;
}): CourseThemeCssTokens {
  const { values, palette, catalogue } = input;
  const tokens = {
    "--sc-course-color-background": palette.background,
    "--sc-course-color-canvas": palette.canvas,
    "--sc-course-color-surface": palette.surface,
    "--sc-course-color-surface-muted": palette.surfaceMuted,
    "--sc-course-color-text": palette.text,
    "--sc-course-color-heading": palette.heading ?? palette.text,
    "--sc-course-color-link": palette.link ?? palette.primary,
    "--sc-course-color-text-secondary": palette.textSecondary,
    "--sc-course-color-text-muted": palette.textMuted,
    "--sc-course-color-placeholder": palette.placeholder,
    "--sc-course-color-border": palette.border,
    "--sc-course-color-border-subtle": palette.borderSubtle,
    "--sc-course-color-primary": palette.primary,
    "--sc-course-color-on-primary": palette.onPrimary,
    "--sc-course-color-primary-muted": palette.primaryMuted,
    "--sc-course-color-secondary": palette.secondary,
    "--sc-course-color-on-secondary": palette.onSecondary,
    "--sc-course-color-accent": palette.accent,
    "--sc-course-color-on-accent": palette.onAccent,
    "--sc-course-color-info": palette.info.base,
    "--sc-course-color-info-foreground": palette.info.onBase,
    "--sc-course-color-info-background": palette.info.background,
    "--sc-course-color-info-text": palette.info.text,
    "--sc-course-color-success": palette.success.base,
    "--sc-course-color-success-foreground": palette.success.onBase,
    "--sc-course-color-success-background": palette.success.background,
    "--sc-course-color-success-text": palette.success.text,
    "--sc-course-color-warning": palette.warning.base,
    "--sc-course-color-warning-foreground": palette.warning.onBase,
    "--sc-course-color-warning-background": palette.warning.background,
    "--sc-course-color-warning-text": palette.warning.text,
    "--sc-course-color-error": palette.error.base,
    "--sc-course-color-error-foreground": palette.error.onBase,
    "--sc-course-color-error-background": palette.error.background,
    "--sc-course-color-error-text": palette.error.text,
    "--sc-course-color-focus-outline": palette.focusOutline,
    "--sc-course-color-focus-ring": palette.focusRing,
    "--sc-course-color-overlay-backdrop": palette.overlayBackdrop,
    "--sc-course-color-overlay-control": palette.overlayControl,
    "--sc-course-color-overlay-control-hover": palette.overlayControlHover,
    "--sc-course-color-overlay-pill": palette.overlayPill,
    "--sc-course-font-heading": resolveCourseThemeFontStack(
      values.typography.headingFontId,
      catalogue,
    ),
    "--sc-course-font-body": resolveCourseThemeFontStack(values.typography.bodyFontId, catalogue),
    "--sc-course-font-code": resolveCourseThemeFontStack(values.typography.codeFontId, catalogue),
    "--sc-course-font-heading-weight": String(values.typography.headingWeight),
    "--sc-course-font-body-weight": String(values.typography.bodyWeight),
    "--sc-course-type-scale": String(values.typography.typeScale),
    "--sc-course-line-height-body": String(values.typography.bodyLineHeight),
    "--sc-course-line-height-heading": String(values.typography.headingLineHeight),
    "--sc-course-letter-spacing-heading": `${values.typography.headingLetterSpacing}em`,
    "--sc-course-text-transform-heading": values.typography.uppercaseHeadings
      ? "uppercase"
      : "none",
    "--sc-course-roundness": String(values.design.roundness),
    "--sc-course-stroke": `${values.design.stroke}px`,
    "--sc-course-shadow": projectShadow(values.design.shadow),
    "--sc-course-density": projectDensity(values.design.density),
    "--sc-course-data-series-1": palette.dataSeries[0],
    "--sc-course-data-series-2": palette.dataSeries[1],
    "--sc-course-data-series-3": palette.dataSeries[2],
    "--sc-course-data-series-4": palette.dataSeries[3],
    "--sc-course-data-series-5": palette.dataSeries[4],
    "--sc-course-data-series-6": palette.dataSeries[5],
    "--sc-course-data-series-7": palette.dataSeries[6],
    "--sc-course-data-series-8": palette.dataSeries[7],
  } satisfies Record<CourseThemeCssProperty, string>;

  return Object.freeze(tokens);
}

export function resolveCourseThemeFontStack(fontId: string, catalogue: ThemeCatalogue): string {
  const font = catalogue.getFont(fontId);
  if (!font) throw new Error(`Resolved course font "${fontId}" is unavailable`);
  return `${quoteFontFamily(font.family)}, ${genericFontFamily(font)}`;
}

function quoteFontFamily(family: string): string {
  return `"${family.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function genericFontFamily(font: CourseThemeFontDefinition): string {
  if (font.category === "serif") return "serif";
  if (font.category === "mono") return "monospace";
  return "sans-serif";
}

function projectShadow(shadow: CourseThemeValues["design"]["shadow"]): string {
  if (shadow === "none") return "none";
  if (shadow === "defined") return "0 1px 2px #00000024, 0 8px 0 #0000001f";
  return "0 8px 24px -4px #0000001f, 0 2px 6px -2px #00000014";
}

function projectDensity(density: CourseThemeValues["design"]["density"]): string {
  if (density === "compact") return "0.875";
  if (density === "spacious") return "1.125";
  return "1";
}
