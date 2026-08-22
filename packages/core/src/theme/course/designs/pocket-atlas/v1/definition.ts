import type { CourseDesignThemeRevision, CourseThemeAuthorValueMappings } from "../../registry";

export const POCKET_ATLAS_AUTHOR_MAPPINGS_V1 = Object.freeze({
  typography: Object.freeze({
    courseTextSize: Object.freeze({ smaller: "0.92", standard: "1", larger: "1.1" }),
    bodyLineSpacing: Object.freeze({ tight: "1.45", standard: "1.6", relaxed: "1.75" }),
    headingLineSpacing: Object.freeze({ tight: "1.1", standard: "1.25", relaxed: "1.4" }),
    headingLetterSpacing: Object.freeze({
      tight: "0em",
      standard: "0.025em",
      wide: "0.08em",
    }),
  }),
  design: Object.freeze({
    roundness: Object.freeze({
      square: "none",
      subtle: "small",
      rounded: "medium",
      full: "large",
    }),
    stroke: Object.freeze({ light: "1px", standard: "2px", strong: "3px" }),
    shadow: Object.freeze({
      none: "none",
      soft: "2px 3px 0 rgb(25 18 67 / 0.2)",
      defined: "4px 4px 0 rgb(25 18 67 / 0.28)",
    }),
    density: Object.freeze({ compact: "0.875", comfortable: "1", spacious: "1.15" }),
  }),
} satisfies CourseThemeAuthorValueMappings);

export const POCKET_ATLAS_DESIGN_V1 = Object.freeze({
  id: "pocket-atlas",
  revision: "1",
  label: "Pocket Atlas",
  description: "A crisp pixel-art field guide with vivid cartridge colours and tactile states.",
  defaultColourSystem: Object.freeze({ id: "pocket-atlas", revision: "1" }),
  radix: Object.freeze({
    radius: "none",
    scaling: "100%",
    panelBackground: "solid",
  }),
  typography: Object.freeze({
    defaultFontId: "scaffold-atkinson-hyperlegible",
    headingFontId: "scaffold-silkscreen",
    codeFontId: "scaffold-jetbrains-mono",
  }),
  authorDefaults: Object.freeze({
    typography: Object.freeze({
      defaultFontId: "scaffold-atkinson-hyperlegible",
      headingFontId: "scaffold-silkscreen",
      codeFontId: "scaffold-jetbrains-mono",
      bodyWeight: 400,
      headingWeight: 700,
      courseTextSize: "standard",
      bodyLineSpacing: "standard",
      headingLineSpacing: "standard",
      headingLetterSpacing: "standard",
      uppercaseHeadings: false,
    }),
    design: Object.freeze({
      roundness: "square",
      stroke: "standard",
      shadow: "defined",
      density: "comfortable",
    }),
  }),
  authorMappings: POCKET_ATLAS_AUTHOR_MAPPINGS_V1,
  rootClassName: "sc-course-theme-pocket-atlas-v1",
} satisfies CourseDesignThemeRevision);
