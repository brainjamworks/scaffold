import type { CourseDesignThemeRevision } from "../../registry";

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
  authorDefaults: Object.freeze({}),
  rootClassName: "sc-course-theme-scaffold-flow-v1",
} satisfies CourseDesignThemeRevision);
