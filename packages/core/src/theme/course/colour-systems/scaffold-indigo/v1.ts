import type { CourseColourSystemRevision } from "../registry";

export const SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 = Object.freeze({
  id: "scaffold-indigo",
  revision: "1",
  label: "Scaffold Indigo",
  description: "An indigo-led Course colour system with clear educational state scales.",
  radix: Object.freeze({
    accentColor: "indigo",
    grayColor: "slate",
  }),
  semantics: Object.freeze({
    info: "blue",
    warning: "amber",
    error: "ruby",
    correct: "green",
    incorrect: "ruby",
    completed: "green",
  }),
} satisfies CourseColourSystemRevision);
