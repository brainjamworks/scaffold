import type {
  CourseComponentTokenAliases,
  CourseFunctionalTokens,
  ResolvedCourseComponentTokens,
  ResolvedCourseUiTokens,
} from "./course-ui-tokens";

export type CourseColorMode = "light" | "dark";

export interface CourseThemeAuthorDefaults {
  colors: Readonly<Record<CourseColorMode, CourseThemeAuthorColorAnchors>>;
  typography: {
    headingFontId: string;
    bodyFontId: string;
    codeFontId: string;
    headingWeight: 400 | 500 | 600 | 700 | 800;
    bodyWeight: 400 | 500 | 600 | 700;
    typeScale: number;
    bodyLineHeight: number;
    headingLineHeight: number;
    headingLetterSpacing: number;
    uppercaseHeadings: boolean;
  };
  design: {
    roundness: number;
    stroke: number;
    shadow: "none" | "soft" | "defined";
    density: "compact" | "comfortable" | "spacious";
  };
}

export interface CourseThemeAuthorColorAnchors {
  background: string;
  surface: string;
  bodyText: string;
  headingText: string;
  primary: string;
  secondary: string;
  accent1: string;
  accent2: string;
  accent3: string;
  accent4: string;
  link: string;
}

export interface CourseThemePresetRevision {
  id: string;
  revision: string;
  label: string;
  description: string;
  authorDefaults: CourseThemeAuthorDefaults;
  functional: Readonly<Record<CourseColorMode, CourseFunctionalTokens>>;
  componentAliases: CourseComponentTokenAliases;
}

export interface ResolvedCourseThemePreset {
  preset: { id: string; revision: string };
  mode: CourseColorMode;
  functional: CourseFunctionalTokens;
  component: ResolvedCourseComponentTokens;
  courseTokens: ResolvedCourseUiTokens;
}

export function resolveCourseThemePreset(
  preset: CourseThemePresetRevision,
  mode: CourseColorMode,
): ResolvedCourseThemePreset {
  const functional = preset.functional[mode];
  const component = mapTokenLeaves(preset.componentAliases, (path) => {
    const value = readTokenPath(functional, path);
    if (value === undefined) throw new Error(`Unresolved Course token alias "${path}"`);
    return value;
  }) as ResolvedCourseComponentTokens;
  const courseTokens = { functional, component };

  return deepFreeze({
    preset: { id: preset.id, revision: preset.revision },
    mode,
    functional,
    component,
    courseTokens,
  });
}

export function visitTokenLeaves(
  value: object,
  path: string[],
  visit: (path: string[], value: string) => void,
): void {
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = [...path, key];
    if (typeof nested === "string") visit(nestedPath, nested);
    else visitTokenLeaves(nested as object, nestedPath, visit);
  }
}

function readTokenPath(value: object, path: string): unknown {
  let current: unknown = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function mapTokenLeaves(value: object, map: (value: string) => unknown): object {
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      typeof nested === "string" ? map(nested) : mapTokenLeaves(nested as object, map),
    ]),
  );
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
