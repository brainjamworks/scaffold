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
