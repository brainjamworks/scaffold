import { describe, expect, it } from "vite-plus/test";

import type { PersistedCourseTheme } from "@scaffold/contracts";

import {
  COURSE_SEMANTIC_STATES,
  builtInCourseColourSystemRegistry,
  builtInCourseDesignThemeRegistry,
  createDefaultPersistedCourseTheme,
  resolveCourseTheme,
} from ".";

describe("Course theme resolution", () => {
  it("creates the application-owned exact default references", () => {
    const theme = createDefaultPersistedCourseTheme();

    expect(theme).toEqual({
      schemaVersion: 1,
      design: { id: "scaffold-flow", revision: "1" },
      colourSystem: { id: "scaffold-indigo", revision: "1" },
      overrides: {},
    });
    expect(Object.isFrozen(theme)).toBe(true);
    expect(Object.isFrozen(theme.design)).toBe(true);
    expect(Object.isFrozen(theme.colourSystem)).toBe(true);
    expect(Object.isFrozen(theme.overrides)).toBe(true);
  });

  it.each(["light", "dark"] as const)(
    "resolves exact definitions into an immutable %s runtime result",
    (appearance) => {
      const result = resolveCourseTheme({
        theme: createDefaultPersistedCourseTheme(),
        appearance,
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      });

      expect(result).toMatchObject({
        status: "ready",
        design: { id: "scaffold-flow", revision: "1" },
        colourSystem: { id: "scaffold-indigo", revision: "1" },
        appearance,
        radixThemeProps: {
          appearance,
          radius: "large",
          scaling: "100%",
          panelBackground: "solid",
          accentColor: "indigo",
          grayColor: "slate",
        },
        rootClassNames: ["sc-course", "sc-course-theme-scaffold-flow-v1"],
      });
      expect(result.status).toBe("ready");
      if (result.status !== "ready") throw new Error("Expected a ready Course theme");
      expect(result.rootStyle).toMatchObject({
        "--default-font-family": '"Satoshi", sans-serif',
        "--heading-font-family": '"Satoshi", sans-serif',
        "--code-font-family": '"JetBrains Mono Variable", monospace',
      });
      expect(Object.keys(result.rootStyle)).toHaveLength(43);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.design)).toBe(true);
      expect(Object.isFrozen(result.colourSystem)).toBe(true);
      expect(Object.isFrozen(result.radixThemeProps)).toBe(true);
      expect(Object.isFrozen(result.rootClassNames)).toBe(true);
      expect(Object.isFrozen(result.rootStyle)).toBe(true);
    },
  );

  it("includes all 40 Course semantic-state properties and no broad token projection", () => {
    const result = resolveCourseTheme({
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems: builtInCourseColourSystemRegistry,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready Course theme");
    const semanticKeys = Object.keys(result.rootStyle).filter((key) =>
      key.startsWith("--sc-course-state-"),
    );
    expect(semanticKeys).toHaveLength(40);
    for (const state of COURSE_SEMANTIC_STATES) {
      for (const role of ["background", "border", "text", "indicator"] as const) {
        expect(result.rootStyle).toHaveProperty(`--sc-course-state-${state}-${role}`);
      }
    }
    expect(
      Object.keys(result.rootStyle).every(
        (key) =>
          key === "--default-font-family" ||
          key === "--heading-font-family" ||
          key === "--code-font-family" ||
          key.startsWith("--sc-course-state-"),
      ),
    ).toBe(true);
  });

  it("returns the exact missing design reference without fallback", () => {
    const theme = withReferences({ id: "scaffold-flow", revision: "missing" });

    expect(
      resolveCourseTheme({
        theme,
        appearance: "light",
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      }),
    ).toEqual({
      status: "unavailable",
      missing: "design",
      reference: { id: "scaffold-flow", revision: "missing" },
    });
  });

  it("returns the exact missing colour-system reference without fallback", () => {
    const theme = withReferences(undefined, { id: "scaffold-indigo", revision: "missing" });

    expect(
      resolveCourseTheme({
        theme,
        appearance: "dark",
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      }),
    ).toEqual({
      status: "unavailable",
      missing: "colourSystem",
      reference: { id: "scaffold-indigo", revision: "missing" },
    });
  });

  it("checks the design reference before the colour-system reference", () => {
    const theme = withReferences(
      { id: "missing-design", revision: "1" },
      { id: "missing-colour", revision: "1" },
    );

    expect(
      resolveCourseTheme({
        theme,
        appearance: "light",
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      }),
    ).toEqual({
      status: "unavailable",
      missing: "design",
      reference: { id: "missing-design", revision: "1" },
    });
  });
});

function withReferences(
  design: PersistedCourseTheme["design"] = { id: "scaffold-flow", revision: "1" },
  colourSystem: PersistedCourseTheme["colourSystem"] = {
    id: "scaffold-indigo",
    revision: "1",
  },
): PersistedCourseTheme {
  return { schemaVersion: 1, design, colourSystem, overrides: {} };
}
