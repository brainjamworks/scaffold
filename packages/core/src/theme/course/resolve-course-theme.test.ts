import { describe, expect, it } from "vite-plus/test";

import type { PersistedCourseTheme } from "@scaffold/contracts";

import {
  COURSE_SEMANTIC_STATES,
  builtInCourseColourSystemRegistry,
  builtInCourseDesignThemeRegistry,
  createCourseColourSystemRegistry,
  createDefaultPersistedCourseTheme,
  resolveCourseTheme,
  type CourseColourSystemRevision,
} from ".";
import { SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 } from "./colour-systems/scaffold-indigo/v1";

const COURSE_AUTHOR_STYLE_PROPERTIES = [
  "--sc-course-author-body-weight",
  "--sc-course-author-heading-weight",
  "--sc-course-author-text-scale",
  "--sc-course-author-body-line-height",
  "--sc-course-author-heading-line-height",
  "--sc-course-author-heading-letter-spacing",
  "--sc-course-author-heading-text-transform",
  "--sc-course-author-stroke-width",
  "--sc-course-author-shadow",
  "--sc-course-author-density",
] as const;
const COURSE_DATA_SERIES_PROPERTIES = [
  "--sc-course-data-series-1",
  "--sc-course-data-series-2",
  "--sc-course-data-series-3",
  "--sc-course-data-series-4",
  "--sc-course-data-series-5",
  "--sc-course-data-series-6",
  "--sc-course-data-series-7",
  "--sc-course-data-series-8",
] as const;

describe("Course theme resolution", () => {
  it.each(["light", "dark"] as const)(
    "resolves Pocket Atlas into its isolated %s Course theme scope",
    (appearance) => {
      const result = resolveCourseTheme({
        theme: {
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        },
        appearance,
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      });

      expect(result).toMatchObject({
        status: "ready",
        radixThemeProps: {
          appearance,
          radius: "none",
          accentColor: "violet",
          grayColor: "sand",
        },
        rootClassNames: ["sc-course", "sc-course-theme-pocket-atlas-v1"],
        rootStyle: {
          "--default-font-family": '"Atkinson Hyperlegible", sans-serif',
          "--heading-font-family": '"Silkscreen", sans-serif',
          "--code-font-family": '"JetBrains Mono Variable", monospace',
          "--sc-course-author-stroke-width": "2px",
          "--sc-course-author-shadow": "4px 4px 0 rgb(25 18 67 / 0.28)",
        },
      });
    },
  );

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
        "--sc-course-author-body-weight": "400",
        "--sc-course-author-heading-weight": "600",
        "--sc-course-author-text-scale": "1",
        "--sc-course-author-body-line-height": "1.5",
        "--sc-course-author-heading-line-height": "1.2",
        "--sc-course-author-heading-letter-spacing": "0em",
        "--sc-course-author-heading-text-transform": "none",
        "--sc-course-author-stroke-width": "1px",
        "--sc-course-author-shadow": "none",
        "--sc-course-author-density": "1",
        "--sc-course-data-series-1": SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.dataSeries[appearance][0],
        "--sc-course-data-series-8": SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.dataSeries[appearance][7],
      });
      expect(Object.keys(result.rootStyle)).toHaveLength(61);
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.design)).toBe(true);
      expect(Object.isFrozen(result.colourSystem)).toBe(true);
      expect(Object.isFrozen(result.radixThemeProps)).toBe(true);
      expect(Object.isFrozen(result.rootClassNames)).toBe(true);
      expect(Object.isFrozen(result.rootStyle)).toBe(true);
    },
  );

  it("replaces only the inherited value targeted by a sparse override", () => {
    const inherited = resolveCourseTheme({
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems: builtInCourseColourSystemRegistry,
    });
    const overridden = resolveCourseTheme({
      theme: withOverrides({ typography: { headingWeight: 800 } }),
      appearance: "light",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems: builtInCourseColourSystemRegistry,
    });

    expect(inherited.status).toBe("ready");
    expect(overridden.status).toBe("ready");
    if (inherited.status !== "ready" || overridden.status !== "ready") {
      throw new Error("Expected ready Course themes");
    }
    expect(overridden.rootStyle).toEqual({
      ...inherited.rootStyle,
      "--sc-course-author-heading-weight": "800",
    });
    expect(overridden.radixThemeProps).toEqual(inherited.radixThemeProps);
  });

  it("projects a complete combined override through fonts, mappings, and Radix roundness", () => {
    const result = resolveCourseTheme({
      theme: withOverrides({
        typography: {
          defaultFontId: "scaffold-poppins",
          headingFontId: "scaffold-source-serif-4",
          codeFontId: "scaffold-jetbrains-mono",
          bodyWeight: 500,
          headingWeight: 800,
          courseTextSize: "larger",
          bodyLineSpacing: "relaxed",
          headingLineSpacing: "tight",
          headingLetterSpacing: "wide",
          uppercaseHeadings: true,
        },
        design: {
          roundness: "full",
          stroke: "strong",
          shadow: "defined",
          density: "spacious",
        },
      }),
      appearance: "dark",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems: builtInCourseColourSystemRegistry,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready Course theme");
    expect(result.radixThemeProps).toMatchObject({ appearance: "dark", radius: "full" });
    expect(result.rootStyle).toMatchObject({
      "--default-font-family": '"Poppins", sans-serif',
      "--heading-font-family": '"Source Serif 4", serif',
      "--code-font-family": '"JetBrains Mono Variable", monospace',
      "--sc-course-author-body-weight": "500",
      "--sc-course-author-heading-weight": "800",
      "--sc-course-author-text-scale": "1.1",
      "--sc-course-author-body-line-height": "1.7",
      "--sc-course-author-heading-line-height": "1.1",
      "--sc-course-author-heading-letter-spacing": "0.04em",
      "--sc-course-author-heading-text-transform": "uppercase",
      "--sc-course-author-stroke-width": "2px",
      "--sc-course-author-shadow": "0 4px 12px rgb(0 0 0 / 0.18)",
      "--sc-course-author-density": "1.125",
    });
  });

  it("does not mutate mutable persisted theme input while composing overrides", () => {
    const theme = withOverrides({
      typography: { defaultFontId: "scaffold-inter", bodyWeight: 500 },
      design: { roundness: "subtle", density: "compact" },
    });
    const originalTheme = structuredClone(theme);

    resolveCourseTheme({
      theme,
      appearance: "light",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems: builtInCourseColourSystemRegistry,
    });

    expect(theme).toEqual(originalTheme);
    expect(Object.isFrozen(theme)).toBe(false);
    expect(Object.isFrozen(theme.overrides)).toBe(false);
    expect(Object.isFrozen(theme.overrides.typography)).toBe(false);
    expect(Object.isFrozen(theme.overrides.design)).toBe(false);
  });

  it("rejects malformed runtime semantic and boolean overrides before projection", () => {
    const invalidRoundness = withOverrides({ design: { roundness: "rounded" } });
    Reflect.set(invalidRoundness.overrides.design!, "roundness", "pill");
    const invalidTextSize = withOverrides({ typography: { courseTextSize: "standard" } });
    Reflect.set(invalidTextSize.overrides.typography!, "courseTextSize", "giant");
    const invalidUppercase = withOverrides({ typography: { uppercaseHeadings: false } });
    Reflect.set(invalidUppercase.overrides.typography!, "uppercaseHeadings", "yes");

    for (const theme of [invalidRoundness, invalidTextSize, invalidUppercase]) {
      expect(() =>
        resolveCourseTheme({
          theme,
          appearance: "light",
          designs: builtInCourseDesignThemeRegistry,
          colourSystems: builtInCourseColourSystemRegistry,
        }),
      ).toThrow(/invalid|boolean/i);
    }
  });

  it("rejects unknown or role-incompatible effective fonts", () => {
    const invalidThemes = [
      withOverrides({ typography: { defaultFontId: "missing-font" } }),
      withOverrides({ typography: { defaultFontId: "scaffold-jetbrains-mono" } }),
      withOverrides({ typography: { headingFontId: "scaffold-jetbrains-mono" } }),
      withOverrides({ typography: { codeFontId: "scaffold-satoshi" } }),
    ];

    for (const theme of invalidThemes) {
      expect(() =>
        resolveCourseTheme({
          theme,
          appearance: "light",
          designs: builtInCourseDesignThemeRegistry,
          colourSystems: builtInCourseColourSystemRegistry,
        }),
      ).toThrow(/font/i);
    }
  });

  it("rejects an out-of-contract effective weight before resolution", () => {
    const theme = withOverrides({ typography: { headingWeight: 800 } });
    Reflect.set(theme.overrides.typography!, "headingWeight", 900);

    expect(() =>
      resolveCourseTheme({
        theme,
        appearance: "light",
        designs: builtInCourseDesignThemeRegistry,
        colourSystems: builtInCourseColourSystemRegistry,
      }),
    ).toThrow(/invalid/i);
  });

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
          COURSE_AUTHOR_STYLE_PROPERTIES.includes(
            key as (typeof COURSE_AUTHOR_STYLE_PROPERTIES)[number],
          ) ||
          COURSE_DATA_SERIES_PROPERTIES.includes(
            key as (typeof COURSE_DATA_SERIES_PROPERTIES)[number],
          ) ||
          key.startsWith("--sc-course-state-"),
      ),
    ).toBe(true);
  });

  it("projects the selected colour system's data-series palette", () => {
    const alternate: CourseColourSystemRevision = {
      ...structuredClone(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1),
      id: "alternate-chart-colours",
      dataSeries: {
        ...structuredClone(SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1.dataSeries),
        light: [
          "#101010",
          "#202020",
          "#303030",
          "#404040",
          "#505050",
          "#606060",
          "#707070",
          "#808080",
        ],
      },
    };
    const colourSystems = createCourseColourSystemRegistry([
      SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1,
      alternate,
    ]);
    const result = resolveCourseTheme({
      theme: withReferences(undefined, { id: alternate.id, revision: alternate.revision }),
      appearance: "light",
      designs: builtInCourseDesignThemeRegistry,
      colourSystems,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected a ready Course theme");
    expect(COURSE_DATA_SERIES_PROPERTIES.map((property) => result.rootStyle[property])).toEqual(
      alternate.dataSeries.light,
    );
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

function withOverrides(overrides: PersistedCourseTheme["overrides"]): PersistedCourseTheme {
  return {
    schemaVersion: 1,
    design: { id: "scaffold-flow", revision: "1" },
    colourSystem: { id: "scaffold-indigo", revision: "1" },
    overrides,
  };
}
