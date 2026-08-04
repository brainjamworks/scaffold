import {
  CourseThemeNonColourAuthorOverridesSchema,
  type CourseDensity,
  type CourseHeadingLetterSpacing,
  type CourseLineSpacing,
  type CourseRoundness,
  type CourseShadow,
  type CourseStroke,
  type CourseTextSize,
  type CourseThemeRef,
} from "@scaffold/contracts";
import type { ThemeProps } from "@radix-ui/themes";

import { builtInThemeFonts, type BuiltInThemeFontId } from "@/theme/model/built-in-fonts";

import { SCAFFOLD_FLOW_DESIGN_V1 } from "./scaffold-flow/v1/definition";

export type CourseDesignRadixConfig = Required<
  Pick<ThemeProps, "panelBackground" | "radius" | "scaling">
>;

export type CourseThemeNonColourAuthorValues = {
  typography: {
    defaultFontId: BuiltInThemeFontId;
    headingFontId: BuiltInThemeFontId;
    codeFontId: BuiltInThemeFontId;
    bodyWeight: 400 | 500 | 600;
    headingWeight: 400 | 500 | 600 | 700 | 800;
    courseTextSize: CourseTextSize;
    bodyLineSpacing: CourseLineSpacing;
    headingLineSpacing: CourseLineSpacing;
    headingLetterSpacing: CourseHeadingLetterSpacing;
    uppercaseHeadings: boolean;
  };
  design: {
    roundness: CourseRoundness;
    stroke: CourseStroke;
    shadow: CourseShadow;
    density: CourseDensity;
  };
};

export type CourseThemeAuthorValueMappings = {
  typography: {
    courseTextSize: Record<CourseTextSize, string>;
    bodyLineSpacing: Record<CourseLineSpacing, string>;
    headingLineSpacing: Record<CourseLineSpacing, string>;
    headingLetterSpacing: Record<CourseHeadingLetterSpacing, string>;
  };
  design: {
    roundness: Record<
      CourseRoundness,
      "none" | "small" | "medium" | "large" | "full"
    >;
    stroke: Record<CourseStroke, string>;
    shadow: Record<CourseShadow, string>;
    density: Record<CourseDensity, string>;
  };
};

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
  authorDefaults: CourseThemeNonColourAuthorValues;
  authorMappings: CourseThemeAuthorValueMappings;
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
const AUTHOR_DEFAULT_TYPOGRAPHY_FIELDS = {
  defaultFontId: true,
  headingFontId: true,
  codeFontId: true,
  bodyWeight: true,
  headingWeight: true,
  courseTextSize: true,
  bodyLineSpacing: true,
  headingLineSpacing: true,
  headingLetterSpacing: true,
  uppercaseHeadings: true,
} satisfies Record<keyof CourseThemeNonColourAuthorValues["typography"], true>;
const AUTHOR_DEFAULT_DESIGN_FIELDS = {
  roundness: true,
  stroke: true,
  shadow: true,
  density: true,
} satisfies Record<keyof CourseThemeNonColourAuthorValues["design"], true>;
const AUTHOR_MAPPING_FIELDS = {
  typography: {
    courseTextSize: { smaller: true, standard: true, larger: true },
    bodyLineSpacing: { tight: true, standard: true, relaxed: true },
    headingLineSpacing: { tight: true, standard: true, relaxed: true },
    headingLetterSpacing: { tight: true, standard: true, wide: true },
  },
  design: {
    roundness: { square: true, subtle: true, rounded: true, full: true },
    stroke: { light: true, standard: true, strong: true },
    shadow: { none: true, soft: true, defined: true },
    density: { compact: true, comfortable: true, spacious: true },
  },
} satisfies {
  [Section in keyof CourseThemeAuthorValueMappings]: {
    [Field in keyof CourseThemeAuthorValueMappings[Section]]: Record<
      keyof CourseThemeAuthorValueMappings[Section][Field],
      true
    >;
  };
};
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
  validateAuthorDefaults(definition.authorDefaults);
  validateAuthorMappings(definition.authorMappings);
  if (!ROOT_CLASS_PATTERN.test(definition.rootClassName)) {
    throw new Error("Course design root class must use the sc-course-theme-* namespace");
  }
}

function validateAuthorDefaults(authorDefaults: CourseThemeNonColourAuthorValues): void {
  const result = CourseThemeNonColourAuthorOverridesSchema.safeParse(authorDefaults);
  if (!result.success) {
    throw new Error("Course design contains invalid author defaults");
  }

  const { typography, design } = result.data;
  if (
    !typography ||
    !design ||
    Object.keys(typography).length !== Object.keys(AUTHOR_DEFAULT_TYPOGRAPHY_FIELDS).length ||
    Object.keys(design).length !== Object.keys(AUTHOR_DEFAULT_DESIGN_FIELDS).length ||
    Object.values(typography).some((value) => value === undefined) ||
    Object.values(design).some((value) => value === undefined)
  ) {
    throw new Error("Course design must provide complete author defaults");
  }

  const defaultFont = getBuiltInThemeFont(authorDefaults.typography.defaultFontId);
  const headingFont = getBuiltInThemeFont(authorDefaults.typography.headingFontId);
  const codeFont = getBuiltInThemeFont(authorDefaults.typography.codeFontId);

  if (
    defaultFont.category === "mono" ||
    headingFont.category === "mono" ||
    codeFont.category !== "mono"
  ) {
    throw new Error("Course design author defaults contain a font role category mismatch");
  }

  if (
    !fontSupportsWeight(defaultFont, authorDefaults.typography.bodyWeight) ||
    !fontSupportsWeight(headingFont, authorDefaults.typography.headingWeight)
  ) {
    throw new Error("Course design author defaults contain an unsupported default weight");
  }
}

function getBuiltInThemeFont(fontId: string): (typeof builtInThemeFonts)[number] {
  const font = builtInThemeFonts.find((candidate) => candidate.id === fontId);
  if (!font) {
    throw new Error(`Unknown built-in Course theme font: ${fontId}`);
  }
  return font;
}

function fontSupportsWeight(
  font: (typeof builtInThemeFonts)[number],
  weight: number,
): boolean {
  return font.weights.some((supportedWeight) => supportedWeight === weight);
}

function validateAuthorMappings(authorMappings: CourseThemeAuthorValueMappings): void {
  if (
    !hasExactKeys(authorMappings, AUTHOR_MAPPING_FIELDS) ||
    !hasExactKeys(authorMappings.typography, AUTHOR_MAPPING_FIELDS.typography) ||
    !hasExactKeys(authorMappings.design, AUTHOR_MAPPING_FIELDS.design) ||
    !hasExactNonEmptyStringValues(
      authorMappings.typography.courseTextSize,
      AUTHOR_MAPPING_FIELDS.typography.courseTextSize,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.typography.bodyLineSpacing,
      AUTHOR_MAPPING_FIELDS.typography.bodyLineSpacing,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.typography.headingLineSpacing,
      AUTHOR_MAPPING_FIELDS.typography.headingLineSpacing,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.typography.headingLetterSpacing,
      AUTHOR_MAPPING_FIELDS.typography.headingLetterSpacing,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.design.roundness,
      AUTHOR_MAPPING_FIELDS.design.roundness,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.design.stroke,
      AUTHOR_MAPPING_FIELDS.design.stroke,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.design.shadow,
      AUTHOR_MAPPING_FIELDS.design.shadow,
    ) ||
    !hasExactNonEmptyStringValues(
      authorMappings.design.density,
      AUTHOR_MAPPING_FIELDS.design.density,
    )
  ) {
    throw new Error("Course design contains invalid author mappings");
  }

  if (
    Object.values(authorMappings.design.roundness).some(
      (radius) => !SUPPORTED_RADII.has(radius),
    )
  ) {
    throw new Error("Course design author mappings contain unsupported Radix radius values");
  }
}

function hasExactKeys(value: unknown, requiredFields: object): value is object {
  if (typeof value !== "object" || value === null) return false;

  const keys = Object.keys(value);
  const requiredKeys = Object.keys(requiredFields);
  return (
    keys.length === requiredKeys.length &&
    requiredKeys.every((key) => Object.hasOwn(value, key))
  );
}

function hasExactNonEmptyStringValues(value: unknown, requiredFields: object): boolean {
  return (
    hasExactKeys(value, requiredFields) &&
    Object.values(value).every(
      (mapping) => typeof mapping === "string" && mapping.trim().length > 0,
    )
  );
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
