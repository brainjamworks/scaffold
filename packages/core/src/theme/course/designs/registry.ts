import type { CourseThemeNonColourAuthorOverrides, CourseThemeRef } from "@scaffold/contracts";
import type { ThemeProps } from "@radix-ui/themes";

import { builtInThemeFonts, type BuiltInThemeFontId } from "@/theme/model/built-in-fonts";

import { SCAFFOLD_FLOW_DESIGN_V1 } from "./scaffold-flow/v1/definition";

export type CourseDesignRadixConfig = Required<
  Pick<ThemeProps, "panelBackground" | "radius" | "scaling">
>;

export type CourseDesignThemeRevision = {
  id: string;
  revision: string;
  label: string;
  description: string;
  defaultColourSystem: CourseThemeRef;
  radix: CourseDesignRadixConfig;
  typography: {
    defaultFontId: BuiltInThemeFontId;
    headingFontId: BuiltInThemeFontId;
    codeFontId: BuiltInThemeFontId;
  };
  authorDefaults: CourseThemeNonColourAuthorOverrides;
  rootClassName: `sc-course-theme-${string}`;
};

export type CourseDesignThemeRegistry = Readonly<{
  definitions: readonly CourseDesignThemeRevision[];
  get(reference: CourseThemeRef): CourseDesignThemeRevision | undefined;
}>;

const SUPPORTED_RADII = new Set<CourseDesignRadixConfig["radius"]>([
  "none",
  "small",
  "medium",
  "large",
  "full",
]);
const SUPPORTED_SCALING = new Set<CourseDesignRadixConfig["scaling"]>([
  "90%",
  "95%",
  "100%",
  "105%",
  "110%",
]);
const SUPPORTED_PANEL_BACKGROUNDS = new Set<CourseDesignRadixConfig["panelBackground"]>([
  "solid",
  "translucent",
]);
const BUILT_IN_FONT_IDS = new Set<string>(builtInThemeFonts.map((font) => font.id));
const ROOT_CLASS_PATTERN = /^sc-course-theme-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function createCourseDesignThemeRegistry(
  definitions: readonly CourseDesignThemeRevision[],
): CourseDesignThemeRegistry {
  const definitionsById = new Map<string, Map<string, CourseDesignThemeRevision>>();

  for (const definition of definitions) {
    validateDefinition(definition);

    let revisions = definitionsById.get(definition.id);
    if (!revisions) {
      revisions = new Map();
      definitionsById.set(definition.id, revisions);
    }
    if (revisions.has(definition.revision)) {
      throw new Error(`Duplicate Course design revision: ${definition.id}@${definition.revision}`);
    }

    revisions.set(definition.revision, deepFreeze(definition));
  }

  const immutableDefinitions = Object.freeze([...definitions]);
  return Object.freeze({
    definitions: immutableDefinitions,
    get(reference: CourseThemeRef) {
      return definitionsById.get(reference.id)?.get(reference.revision);
    },
  });
}

export const builtInCourseDesignThemeRegistry = createCourseDesignThemeRegistry([
  SCAFFOLD_FLOW_DESIGN_V1,
]);

function validateDefinition(definition: CourseDesignThemeRevision): void {
  if (!isNonEmpty(definition.id) || !isNonEmpty(definition.revision)) {
    throw new Error("Course design id and revision must be non-empty");
  }
  if (!isNonEmpty(definition.label) || !isNonEmpty(definition.description)) {
    throw new Error("Course design label and description must be non-empty");
  }
  if (
    !isNonEmpty(definition.defaultColourSystem.id) ||
    !isNonEmpty(definition.defaultColourSystem.revision)
  ) {
    throw new Error("Course design default colour system must be an exact reference");
  }
  if (
    !SUPPORTED_RADII.has(definition.radix.radius) ||
    !SUPPORTED_SCALING.has(definition.radix.scaling) ||
    !SUPPORTED_PANEL_BACKGROUNDS.has(definition.radix.panelBackground)
  ) {
    throw new Error("Course design contains unsupported Radix configuration");
  }
  for (const fontId of Object.values(definition.typography)) {
    if (!BUILT_IN_FONT_IDS.has(fontId)) {
      throw new Error(`Unknown built-in Course theme font: ${fontId}`);
    }
  }
  if (Object.keys(definition.authorDefaults).length > 0) {
    throw new Error("Course design author defaults must remain empty in Phase 1");
  }
  if (!ROOT_CLASS_PATTERN.test(definition.rootClassName)) {
    throw new Error("Course design root class must use the sc-course-theme-* namespace");
  }
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
