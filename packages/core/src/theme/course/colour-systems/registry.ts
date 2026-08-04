import type { CourseThemeRef } from "@scaffold/contracts";
import type { ThemeProps } from "@radix-ui/themes";

import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "./scaffold-indigo/v1";

export type RadixAccentColour = NonNullable<ThemeProps["accentColor"]>;
export type RadixGrayColour = NonNullable<ThemeProps["grayColor"]>;
export type RadixColourScaleName = RadixAccentColour;

export const COURSE_ASSIGNED_SEMANTIC_STATES = Object.freeze([
  "info",
  "warning",
  "success",
  "error",
  "correct",
  "incorrect",
  "completed",
] as const);
export type CourseAssignedSemanticState = (typeof COURSE_ASSIGNED_SEMANTIC_STATES)[number];
export type CourseSemanticScaleAssignments = Record<
  CourseAssignedSemanticState,
  RadixColourScaleName
>;
export type CourseDataSeriesPalette = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
export type CourseDataSeriesPalettes = Readonly<{
  light: CourseDataSeriesPalette;
  dark: CourseDataSeriesPalette;
}>;

export type CourseColourSystemRevision = {
  id: string;
  revision: string;
  label: string;
  description: string;
  radix: {
    accentColor: RadixAccentColour;
    grayColor: RadixGrayColour;
  };
  dataSeries: CourseDataSeriesPalettes;
  semantics: CourseSemanticScaleAssignments;
};

export type CourseColourSystemRegistry = Readonly<{
  definitions: readonly CourseColourSystemRevision[];
  get(reference: CourseThemeRef): CourseColourSystemRevision | undefined;
}>;

const SUPPORTED_ACCENT_COLOURS = new Set<RadixAccentColour>([
  "gray",
  "gold",
  "bronze",
  "brown",
  "yellow",
  "amber",
  "orange",
  "tomato",
  "red",
  "ruby",
  "crimson",
  "pink",
  "plum",
  "purple",
  "violet",
  "iris",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "jade",
  "green",
  "grass",
  "lime",
  "mint",
  "sky",
]);
const SUPPORTED_GRAY_COLOURS = new Set<RadixGrayColour>([
  "auto",
  "gray",
  "mauve",
  "slate",
  "sage",
  "olive",
  "sand",
]);

export function createCourseColourSystemRegistry(
  definitions: readonly CourseColourSystemRevision[],
): CourseColourSystemRegistry {
  const definitionsById = new Map<string, Map<string, CourseColourSystemRevision>>();

  for (const definition of definitions) {
    validateDefinition(definition);

    let revisions = definitionsById.get(definition.id);
    if (!revisions) {
      revisions = new Map();
      definitionsById.set(definition.id, revisions);
    }
    if (revisions.has(definition.revision)) {
      throw new Error(
        `Duplicate Course colour-system revision: ${definition.id}@${definition.revision}`,
      );
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

export const builtInCourseColourSystemRegistry = createCourseColourSystemRegistry([
  SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
]);

function validateDefinition(definition: CourseColourSystemRevision): void {
  if (!isNonEmpty(definition.id) || !isNonEmpty(definition.revision)) {
    throw new Error("Course colour-system id and revision must be non-empty");
  }
  if (!isNonEmpty(definition.label) || !isNonEmpty(definition.description)) {
    throw new Error("Course colour-system label and description must be non-empty");
  }
  if (!SUPPORTED_ACCENT_COLOURS.has(definition.radix.accentColor)) {
    throw new Error(`Unsupported Radix accent colour: ${definition.radix.accentColor}`);
  }
  if (!SUPPORTED_GRAY_COLOURS.has(definition.radix.grayColor)) {
    throw new Error(`Unsupported Radix gray colour: ${definition.radix.grayColor}`);
  }
  const dataSeriesKeys = Object.keys(definition.dataSeries);
  if (
    dataSeriesKeys.length !== 2 ||
    !dataSeriesKeys.includes("light") ||
    !dataSeriesKeys.includes("dark")
  ) {
    throw new Error("Course colour-system data-series palettes must define light and dark");
  }
  for (const appearance of ["light", "dark"] as const) {
    const palette = definition.dataSeries[appearance];
    if (palette.length !== 8 || palette.some((colour) => !isNonEmpty(colour))) {
      throw new Error(
        `Course colour-system ${appearance} data-series palette must contain eight colours`,
      );
    }
  }

  const semanticKeys = Object.keys(definition.semantics);
  if (
    semanticKeys.length !== COURSE_ASSIGNED_SEMANTIC_STATES.length ||
    COURSE_ASSIGNED_SEMANTIC_STATES.some((state) => !(state in definition.semantics))
  ) {
    throw new Error("Course colour-system semantic assignments must be complete and exact");
  }
  for (const state of COURSE_ASSIGNED_SEMANTIC_STATES) {
    const scale = definition.semantics[state];
    if (!SUPPORTED_ACCENT_COLOURS.has(scale)) {
      throw new Error(`Unsupported semantic scale for ${state}: ${scale}`);
    }
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
