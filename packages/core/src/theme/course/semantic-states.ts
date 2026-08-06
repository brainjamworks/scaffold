import type { CourseColourSystemRevision, RadixColourScaleName } from "./colour-systems/registry";

export const COURSE_SEMANTIC_STATES = Object.freeze([
  "info",
  "warning",
  "success",
  "error",
  "correct",
  "incorrect",
  "current",
  "completed",
  "available",
  "locked",
] as const);
export type CourseSemanticState = (typeof COURSE_SEMANTIC_STATES)[number];

export const COURSE_SEMANTIC_STATE_ROLES = Object.freeze([
  "background",
  "border",
  "text",
  "indicator",
] as const);
export type CourseSemanticStateRole = (typeof COURSE_SEMANTIC_STATE_ROLES)[number];
export type CourseSemanticStateCssProperty =
  `--sc-course-state-${CourseSemanticState}-${CourseSemanticStateRole}`;
export type CourseSemanticStateProperties = Readonly<
  Record<CourseSemanticStateCssProperty, string>
>;

const COURSE_SEMANTIC_STATE_ROLE_STEPS = Object.freeze({
  background: 3,
  border: 8,
  text: 11,
  indicator: 9,
} as const satisfies Record<CourseSemanticStateRole, number>);

type SemanticScaleReference = RadixColourScaleName | "accent" | "gray";

export function createCourseSemanticStateProperties(
  colourSystem: CourseColourSystemRevision,
): CourseSemanticStateProperties {
  const properties: Partial<Record<CourseSemanticStateCssProperty, string>> = {};

  for (const state of COURSE_SEMANTIC_STATES) {
    const scale = scaleForState(colourSystem, state);
    for (const role of COURSE_SEMANTIC_STATE_ROLES) {
      properties[`--sc-course-state-${state}-${role}`] =
        `var(--${scale}-${COURSE_SEMANTIC_STATE_ROLE_STEPS[role]})`;
    }
  }

  return Object.freeze(properties) as CourseSemanticStateProperties;
}

function scaleForState(
  colourSystem: CourseColourSystemRevision,
  state: CourseSemanticState,
): SemanticScaleReference {
  if (state === "current") return "accent";
  if (state === "available" || state === "locked") return "gray";
  return colourSystem.semantics[state];
}
