import { describe, expect, it } from "vite-plus/test";

import {
  builtInCourseColourSystemRegistry,
  createCourseColourSystemRegistry,
  type CourseColourSystemRevision,
} from "./registry";
import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "./scaffold-indigo/v1";

describe("Course colour-system registry", () => {
  it("registers the immutable Scaffold Indigo revision 1 definition", () => {
    expect(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1).toEqual({
      id: "scaffold-indigo",
      revision: "1",
      label: "Scaffold Indigo",
      description: expect.any(String),
      radix: { accentColor: "indigo", grayColor: "slate" },
      semantics: {
        info: "blue",
        warning: "amber",
        error: "ruby",
        correct: "green",
        incorrect: "ruby",
        completed: "green",
      },
    });
    expect(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.description.length).toBeGreaterThan(0);
    expect(Object.isFrozen(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.radix)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.semantics)).toBe(true);
  });

  it("looks up only an exact registered id and revision", () => {
    expect(Object.isFrozen(builtInCourseColourSystemRegistry)).toBe(true);
    expect(Object.isFrozen(builtInCourseColourSystemRegistry.definitions)).toBe(true);
    expect(builtInCourseColourSystemRegistry.get({ id: "scaffold-indigo", revision: "1" })).toBe(
      SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
    );
    expect(
      builtInCourseColourSystemRegistry.get({ id: "scaffold-indigo", revision: "2" }),
    ).toBeUndefined();
    expect(builtInCourseColourSystemRegistry.get({ id: "missing", revision: "1" })).toBeUndefined();
  });

  it("rejects duplicate id and revision pairs", () => {
    expect(() =>
      createCourseColourSystemRegistry([
        SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
        cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1),
      ]),
    ).toThrow(/duplicate/i);
  });

  it("rejects missing semantic assignments", () => {
    const definition = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    delete (definition.semantics as Partial<CourseColourSystemRevision["semantics"]>).warning;

    expect(() => createCourseColourSystemRegistry([definition])).toThrow(/semantic/i);
  });

  it("rejects unsupported Radix accent and gray names", () => {
    const invalidAccent = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    invalidAccent.radix.accentColor = "brand" as CourseColourSystemRevision["radix"]["accentColor"];
    const invalidGray = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    invalidGray.radix.grayColor = "cool-gray" as CourseColourSystemRevision["radix"]["grayColor"];

    expect(() => createCourseColourSystemRegistry([invalidAccent])).toThrow(/accent/i);
    expect(() => createCourseColourSystemRegistry([invalidGray])).toThrow(/gray/i);
  });

  it("rejects unsupported semantic scale names", () => {
    const definition = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    definition.semantics.correct = "success" as CourseColourSystemRevision["semantics"]["correct"];

    expect(() => createCourseColourSystemRegistry([definition])).toThrow(/semantic/i);
  });

  it("rejects raw CSS colours", () => {
    const definition = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    definition.semantics.error = "#cc0000" as CourseColourSystemRevision["semantics"]["error"];

    expect(() => createCourseColourSystemRegistry([definition])).toThrow(/semantic/i);
  });

  it("rejects malformed definitions", () => {
    const definition = cloneDefinition(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1);
    definition.id = "";

    expect(() => createCourseColourSystemRegistry([definition])).toThrow(/id and revision/i);
  });
});

function cloneDefinition(definition: CourseColourSystemRevision): CourseColourSystemRevision {
  return structuredClone(definition);
}
