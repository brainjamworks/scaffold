export {
  SCAFFOLD_DEFAULT_LIGHT_PALETTE,
  SCAFFOLD_DEFAULT_PRESET,
  SCAFFOLD_EDITORIAL_PRESET,
  SCAFFOLD_MINIMAL_PRESET,
  builtInThemePresets,
  createScaffoldDefaultTheme,
  type BuiltInCourseThemePreset,
} from "./built-in-presets";
export { builtInThemeFonts } from "./built-in-fonts";
export {
  resolveCourseThemePreset,
  type CourseColorMode,
  type CourseThemeAuthorColorAnchors,
  type CourseThemeAuthorDefaults,
  type CourseThemePresetRevision,
  type ResolvedCourseThemePreset,
} from "./course-theme-preset";
export type {
  CourseComponentTokenAliases,
  CourseFunctionalTokenPath,
  CourseFunctionalTokens,
  ResolvedCourseComponentTokens,
  ResolvedCourseUiTokens,
  ScCourseCssProperties,
  ScCourseCssProperty,
} from "./course-ui-tokens";
export { projectCourseThemeCss } from "./project-course-theme-css";
export {
  SCAFFOLD_FLOW_V1,
  builtInCourseThemeRegistry,
  createBuiltInCourseThemeRegistry,
  type BuiltInCourseThemeRegistry,
} from "./presets";
export {
  materialiseCoursePalette,
  type CourseThemePaletteRecipe,
  type DarkAuthorPalette,
  type MaterialisedCoursePalette,
} from "./palette-materialiser";
export { projectChartTokens, type ChartTokens } from "./chart-tokens";
export {
  resolveCourseTheme,
  type ResolveCourseThemeInput,
  type ResolvedCourseTheme,
  type ScaffoldColorMode,
} from "./resolve-course-theme";
export {
  COURSE_THEME_CSS_PROPERTIES,
  projectCourseThemeCssTokens,
  resolveCourseThemeFontStack,
  type CourseThemeCssProperty,
  type CourseThemeCssTokens,
} from "./theme-token-projection";
export {
  createThemeCatalogue,
  type ThemeCatalogue,
  type ThemeCatalogueIssue,
  type ThemeCatalogueIssueCode,
} from "./theme-catalogue";
export {
  CourseThemeFontDefinitionSchema,
  CourseThemeFontWeightSchema,
  CourseThemePresetDefinitionSchema,
  ScaffoldThemeExtensionSchema,
  type CourseThemeFontDefinition,
  type CourseThemeFontWeight,
  type CourseThemePresetDefinition,
  type ScaffoldThemeExtension,
} from "./theme-extension-schema";
