import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_FLOW_DESIGN_V1 } from "./scaffold-flow/v1/definition";
import {
  builtInCourseDesignThemeRegistry,
  createCourseDesignThemeRegistry,
  type CourseDesignThemeRevision,
  type CourseThemeNonColourAuthorValues,
} from "./registry";

const EXPECTED_SCAFFOLD_FLOW_AUTHOR_MAPPINGS_V1 = {
  typography: {
    courseTextSize: { smaller: "0.9", standard: "1", larger: "1.1" },
    bodyLineSpacing: { tight: "1.4", standard: "1.5", relaxed: "1.7" },
    headingLineSpacing: { tight: "1.1", standard: "1.2", relaxed: "1.35" },
    headingLetterSpacing: { tight: "-0.02em", standard: "0em", wide: "0.04em" },
  },
  design: {
    roundness: { square: "none", subtle: "small", rounded: "large", full: "full" },
    stroke: { light: "0.5px", standard: "1px", strong: "2px" },
    shadow: {
      none: "none",
      soft: "0 1px 3px rgb(0 0 0 / 0.12)",
      defined: "0 4px 12px rgb(0 0 0 / 0.18)",
    },
    density: { compact: "0.875", comfortable: "1", spacious: "1.125" },
  },
} as const;

describe("Course design theme registry", () => {
  it("registers Pocket Atlas as a complete second built-in Course design", () => {
    const design = builtInCourseDesignThemeRegistry.get({
      id: "pocket-atlas",
      revision: "1",
    });

    expect(design).toMatchObject({
      id: "pocket-atlas",
      revision: "1",
      label: "Pocket Atlas",
      defaultColourSystem: { id: "pocket-atlas", revision: "1" },
      radix: {
        radius: "none",
        scaling: "100%",
        panelBackground: "solid",
      },
      authorDefaults: {
        typography: {
          defaultFontId: "scaffold-atkinson-hyperlegible",
          headingFontId: "scaffold-silkscreen",
          codeFontId: "scaffold-jetbrains-mono",
        },
        design: {
          roundness: "square",
          stroke: "standard",
          shadow: "defined",
          density: "comfortable",
        },
      },
      rootClassName: "sc-course-theme-pocket-atlas-v1",
    });
    expect(Object.isFrozen(design)).toBe(true);
  });

  it("registers the immutable Scaffold Flow revision 1 definition", () => {
    expect(SCAFFOLD_FLOW_DESIGN_V1).toEqual({
      id: "scaffold-flow",
      revision: "1",
      label: "Scaffold Flow",
      description: expect.any(String),
      defaultColourSystem: { id: "scaffold-indigo", revision: "1" },
      radix: {
        radius: "large",
        scaling: "100%",
        panelBackground: "solid",
      },
      typography: {
        defaultFontId: "scaffold-satoshi",
        headingFontId: "scaffold-satoshi",
        codeFontId: "scaffold-jetbrains-mono",
      },
      authorDefaults: {
        typography: {
          defaultFontId: "scaffold-satoshi",
          headingFontId: "scaffold-satoshi",
          codeFontId: "scaffold-jetbrains-mono",
          bodyWeight: 400,
          headingWeight: 600,
          courseTextSize: "standard",
          bodyLineSpacing: "standard",
          headingLineSpacing: "standard",
          headingLetterSpacing: "standard",
          uppercaseHeadings: false,
        },
        design: {
          roundness: "rounded",
          stroke: "standard",
          shadow: "none",
          density: "comfortable",
        },
      },
      authorMappings: EXPECTED_SCAFFOLD_FLOW_AUTHOR_MAPPINGS_V1,
      rootClassName: "sc-course-theme-scaffold-flow-v1",
    });
    expect(SCAFFOLD_FLOW_DESIGN_V1.description.length).toBeGreaterThan(0);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.radix)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.typography)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.authorDefaults)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.authorDefaults.typography)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.authorDefaults.design)).toBe(true);
  });

  it("defines the complete immutable Scaffold Flow author mappings", () => {
    const authorMappings = Reflect.get(SCAFFOLD_FLOW_DESIGN_V1, "authorMappings");

    expect(authorMappings).toEqual(EXPECTED_SCAFFOLD_FLOW_AUTHOR_MAPPINGS_V1);
    expect(Object.isFrozen(authorMappings)).toBe(true);
    for (const section of Object.values(authorMappings)) {
      expect(Object.isFrozen(section)).toBe(true);
      for (const mapping of Object.values(section)) {
        expect(Object.isFrozen(mapping)).toBe(true);
      }
    }
  });

  it("deep-freezes mutable author mappings beneath a frozen outer container", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Object.freeze(definition.authorMappings);

    expect(Object.isFrozen(definition.authorMappings.typography)).toBe(false);
    expect(Object.isFrozen(definition.authorMappings.typography.courseTextSize)).toBe(false);
    expect(Object.isFrozen(definition.authorMappings.design)).toBe(false);
    expect(Object.isFrozen(definition.authorMappings.design.roundness)).toBe(false);

    const registry = createCourseDesignThemeRegistry([definition]);
    const registered = registry.get({ id: definition.id, revision: definition.revision });

    expect(Object.isFrozen(registered)).toBe(true);
    expect(Object.isFrozen(registered?.authorMappings)).toBe(true);
    expect(Object.isFrozen(registered?.authorMappings.typography)).toBe(true);
    expect(Object.isFrozen(registered?.authorMappings.typography.courseTextSize)).toBe(true);
    expect(Object.isFrozen(registered?.authorMappings.design)).toBe(true);
    expect(Object.isFrozen(registered?.authorMappings.design.roundness)).toBe(true);
  });

  it("looks up only an exact registered id and revision", () => {
    expect(Object.isFrozen(builtInCourseDesignThemeRegistry)).toBe(true);
    expect(Object.isFrozen(builtInCourseDesignThemeRegistry.definitions)).toBe(true);
    expect(builtInCourseDesignThemeRegistry.get({ id: "scaffold-flow", revision: "1" })).toBe(
      SCAFFOLD_FLOW_DESIGN_V1,
    );
    expect(
      builtInCourseDesignThemeRegistry.get({ id: "scaffold-flow", revision: "2" }),
    ).toBeUndefined();
    expect(builtInCourseDesignThemeRegistry.get({ id: "missing", revision: "1" })).toBeUndefined();
  });

  it("rejects duplicate id and revision pairs", () => {
    expect(() =>
      createCourseDesignThemeRegistry([
        SCAFFOLD_FLOW_DESIGN_V1,
        cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1),
      ]),
    ).toThrow(/duplicate/i);
  });

  it("rejects unknown font ids", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    definition.typography.defaultFontId =
      "host-font" as CourseDesignThemeRevision["typography"]["defaultFontId"];

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/font/i);
  });

  it("rejects root classes outside the Course theme namespace", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    definition.rootClassName =
      "host-theme-scaffold-flow-r1" as CourseDesignThemeRevision["rootClassName"];

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/root class/i);
  });

  it("rejects unsupported Radix configuration", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    definition.radix.radius = "enormous" as CourseDesignThemeRevision["radix"]["radius"];

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/radix/i);
  });

  it("rejects malformed default colour-system references", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    definition.defaultColourSystem.revision = "";

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/colour system/i);
  });

  it("rejects missing author-default sections", () => {
    for (const sectionName of ["typography", "design"] as const) {
      const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
      Reflect.deleteProperty(definition.authorDefaults, sectionName);

      expect(() => createCourseDesignThemeRegistry([definition])).toThrow(
        /complete author defaults/i,
      );
    }
  });

  it("rejects every missing typography and design default", () => {
    for (const sectionName of ["typography", "design"] as const) {
      for (const fieldName of Object.keys(SCAFFOLD_FLOW_DESIGN_V1.authorDefaults[sectionName])) {
        const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
        Reflect.deleteProperty(definition.authorDefaults[sectionName], fieldName);

        expect(() => createCourseDesignThemeRegistry([definition])).toThrow(
          /complete author defaults/i,
        );
      }
    }
  });

  it("rejects invalid and unknown author default values", () => {
    const invalidTypography = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    invalidTypography.authorDefaults.typography.courseTextSize =
      "extra-large" as CourseThemeNonColourAuthorValues["typography"]["courseTextSize"];

    const invalidDesign = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    invalidDesign.authorDefaults.design.shadow =
      "hard" as CourseThemeNonColourAuthorValues["design"]["shadow"];

    const unknownRootKey = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Object.assign(unknownRootKey.authorDefaults, { colors: {} });

    const unknownNestedKey = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Object.assign(unknownNestedKey.authorDefaults.design, { radius: "large" });

    for (const definition of [invalidTypography, invalidDesign, unknownRootKey, unknownNestedKey]) {
      expect(() => createCourseDesignThemeRegistry([definition])).toThrow(
        /invalid author defaults/i,
      );
    }
  });

  it("rejects unknown author-default fonts", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    definition.authorDefaults.typography.defaultFontId =
      "host-font" as CourseThemeNonColourAuthorValues["typography"]["defaultFontId"];

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/unknown.*font/i);
  });

  it("rejects font-role category mismatches", () => {
    const monoBody = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    monoBody.authorDefaults.typography.defaultFontId = "scaffold-jetbrains-mono";

    const monoHeading = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    monoHeading.authorDefaults.typography.headingFontId = "scaffold-jetbrains-mono";

    const textCode = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    textCode.authorDefaults.typography.codeFontId = "scaffold-satoshi";

    for (const definition of [monoBody, monoHeading, textCode]) {
      expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/font role/i);
    }
  });

  it("rejects out-of-range default weights", () => {
    const outOfRangeBodyWeight = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    outOfRangeBodyWeight.authorDefaults.typography.bodyWeight =
      700 as CourseThemeNonColourAuthorValues["typography"]["bodyWeight"];

    const outOfRangeHeadingWeight = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    outOfRangeHeadingWeight.authorDefaults.typography.headingWeight =
      900 as CourseThemeNonColourAuthorValues["typography"]["headingWeight"];

    for (const definition of [outOfRangeBodyWeight, outOfRangeHeadingWeight]) {
      expect(() => createCourseDesignThemeRegistry([definition])).toThrow(
        /invalid author defaults/i,
      );
    }
  });

  it("rejects a missing author mapping", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Reflect.deleteProperty(definition.authorMappings.typography.courseTextSize, "larger");

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/author mappings/i);
  });

  it("rejects an extra author mapping", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Object.assign(definition.authorMappings.design.stroke, { heavy: "3px" });

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/author mappings/i);
  });

  it("rejects an empty author mapping output", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Reflect.set(definition.authorMappings.typography.bodyLineSpacing, "relaxed", " ");

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/author mappings/i);
  });

  it("rejects an invalid mapped Radix radius", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    Reflect.set(definition.authorMappings.design.roundness, "rounded", "enormous");

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/author mappings/i);
  });
});

function cloneDefinition(definition: CourseDesignThemeRevision): CourseDesignThemeRevision {
  return structuredClone(definition);
}
