import type { CourseDesignThemeRevision, CourseThemeAuthorValueMappings } from "../../registry";

export const SCAFFOLD_FLOW_AUTHOR_MAPPINGS_V1 = Object.freeze({
  typography: Object.freeze({
    courseTextSize: Object.freeze({ smaller: "0.9", standard: "1", larger: "1.1" }),
    bodyLineSpacing: Object.freeze({ tight: "1.4", standard: "1.5", relaxed: "1.7" }),
    headingLineSpacing: Object.freeze({ tight: "1.1", standard: "1.2", relaxed: "1.35" }),
    headingLetterSpacing: Object.freeze({
      tight: "-0.02em",
      standard: "0em",
      wide: "0.04em",
    }),
  }),
  design: Object.freeze({
    roundness: Object.freeze({
      square: "none",
      subtle: "small",
      rounded: "large",
      full: "full",
    }),
    stroke: Object.freeze({ light: "0.5px", standard: "1px", strong: "2px" }),
    shadow: Object.freeze({
      none: "none",
      soft: "0 1px 3px rgb(0 0 0 / 0.12)",
      defined: "0 4px 12px rgb(0 0 0 / 0.18)",
    }),
    density: Object.freeze({ compact: "0.875", comfortable: "1", spacious: "1.125" }),
  }),
} satisfies CourseThemeAuthorValueMappings);

export const SCAFFOLD_FLOW_DESIGN_V1 = Object.freeze({
  id: "scaffold-flow",
  revision: "1",
  label: "Scaffold Flow",
  description: "A clear, structured Course design built on Radix Themes.",
  defaultColourSystem: Object.freeze({ id: "scaffold-indigo", revision: "1" }),
  radix: Object.freeze({
    radius: "large",
    scaling: "100%",
    panelBackground: "solid",
  }),
  typography: Object.freeze({
    defaultFontId: "scaffold-satoshi",
    headingFontId: "scaffold-satoshi",
    codeFontId: "scaffold-jetbrains-mono",
  }),
  authorDefaults: Object.freeze({
    typography: Object.freeze({
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
    }),
    design: Object.freeze({
      roundness: "rounded",
      stroke: "standard",
      shadow: "none",
      density: "comfortable",
    }),
  }),
  authorMappings: SCAFFOLD_FLOW_AUTHOR_MAPPINGS_V1,
  rootClassName: "sc-course-theme-scaffold-flow-v1",
} satisfies CourseDesignThemeRevision);
