import { describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_FLOW_DESIGN_V1 } from "./scaffold-flow/v1/definition";
import {
  builtInCourseDesignThemeRegistry,
  createCourseDesignThemeRegistry,
  type CourseDesignThemeRevision,
} from "./registry";

describe("Course design theme registry", () => {
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
      authorDefaults: {},
      rootClassName: "sc-course-theme-scaffold-flow-v1",
    });
    expect(SCAFFOLD_FLOW_DESIGN_V1.description.length).toBeGreaterThan(0);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.radix)).toBe(true);
    expect(Object.isFrozen(SCAFFOLD_FLOW_DESIGN_V1.typography)).toBe(true);
  });

  it("looks up only an exact registered id and revision", () => {
    expect(Object.isFrozen(builtInCourseDesignThemeRegistry)).toBe(true);
    expect(Object.isFrozen(builtInCourseDesignThemeRegistry.definitions)).toBe(true);
    expect(
      builtInCourseDesignThemeRegistry.get({ id: "scaffold-flow", revision: "1" }),
    ).toBe(SCAFFOLD_FLOW_DESIGN_V1);
    expect(
      builtInCourseDesignThemeRegistry.get({ id: "scaffold-flow", revision: "2" }),
    ).toBeUndefined();
    expect(
      builtInCourseDesignThemeRegistry.get({ id: "missing", revision: "1" }),
    ).toBeUndefined();
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

  it("rejects author defaults before non-colour controls are approved", () => {
    const definition = cloneDefinition(SCAFFOLD_FLOW_DESIGN_V1);
    (definition.authorDefaults as Record<string, unknown>).density = "compact";

    expect(() => createCourseDesignThemeRegistry([definition])).toThrow(/author defaults/i);
  });
});

function cloneDefinition(definition: CourseDesignThemeRevision): CourseDesignThemeRevision {
  return structuredClone(definition);
}
