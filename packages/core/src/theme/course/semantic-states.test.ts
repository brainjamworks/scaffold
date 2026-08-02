import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "./colour-systems/scaffold-indigo/v1";
import { COURSE_SEMANTIC_STATES, createCourseSemanticStateProperties } from "./semantic-states";

const EXPECTED_STATES = [
  "info",
  "warning",
  "error",
  "correct",
  "incorrect",
  "current",
  "completed",
  "available",
  "locked",
] as const;

describe("Course semantic states", () => {
  it("defines exactly the nine independent Course domain states", () => {
    expect(COURSE_SEMANTIC_STATES).toEqual(EXPECTED_STATES);
    expect(new Set(COURSE_SEMANTIC_STATES).size).toBe(9);
  });

  it("creates all four stable properties for every state", () => {
    const properties = createCourseSemanticStateProperties(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);

    expect(Object.keys(properties).sort()).toEqual(
      EXPECTED_STATES.flatMap((state) =>
        ["background", "border", "text", "indicator"].map(
          (role) => `--sc-course-state-${state}-${role}`,
        ),
      ).sort(),
    );
    expect(Object.keys(properties)).toHaveLength(36);
    expect(Object.isFrozen(properties)).toBe(true);
  });

  it("maps assigned, accent, and gray scales to consistent public Radix steps", () => {
    const properties = createCourseSemanticStateProperties(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    const scales = {
      info: "blue",
      warning: "amber",
      error: "ruby",
      correct: "green",
      incorrect: "ruby",
      current: "accent",
      completed: "green",
      available: "gray",
      locked: "gray",
    } as const;

    for (const state of EXPECTED_STATES) {
      const scale = scales[state];
      expect(properties[`--sc-course-state-${state}-background`]).toBe(`var(--${scale}-3)`);
      expect(properties[`--sc-course-state-${state}-border`]).toBe(`var(--${scale}-8)`);
      expect(properties[`--sc-course-state-${state}-text`]).toBe(`var(--${scale}-11)`);
      expect(properties[`--sc-course-state-${state}-indicator`]).toBe(`var(--${scale}-9)`);
    }
  });

  it("retains distinct property names when educational meanings share a scale", () => {
    const properties = createCourseSemanticStateProperties(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);

    expect(properties["--sc-course-state-correct-background"]).toBe(
      properties["--sc-course-state-completed-background"],
    );
    expect(properties).toHaveProperty("--sc-course-state-correct-background");
    expect(properties).toHaveProperty("--sc-course-state-completed-background");
    expect(properties).toHaveProperty("--sc-course-state-error-background");
    expect(properties).toHaveProperty("--sc-course-state-incorrect-background");
  });

  it("emits no raw CSS colour values", () => {
    const properties = createCourseSemanticStateProperties(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);

    expect(
      Object.values(properties).every((value) => /^var\(--[a-z]+-(?:3|8|9|11)\)$/.test(value)),
    ).toBe(true);
  });
});
