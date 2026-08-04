import type { CourseColourSystemRevision, CourseDataSeriesPalette } from "../registry";

export const SCAFFOLD_INDIGO_COLOUR_SYSTEM_V1 = Object.freeze({
  id: "scaffold-indigo",
  revision: "1",
  label: "Scaffold Indigo",
  description: "An indigo-led Course colour system with clear educational state scales.",
  radix: Object.freeze({
    accentColor: "indigo",
    grayColor: "slate",
  }),
  dataSeries: Object.freeze({
    light: freezeDataSeriesPalette([
      "#4f46e5",
      "#0369a1",
      "#0f766e",
      "#3f7d20",
      "#b45309",
      "#c2410c",
      "#be123c",
      "#7c3aed",
    ]),
    dark: freezeDataSeriesPalette([
      "#818cf8",
      "#38bdf8",
      "#2dd4bf",
      "#86efac",
      "#fbbf24",
      "#fb923c",
      "#fb7185",
      "#c4b5fd",
    ]),
  }),
  semantics: Object.freeze({
    info: "blue",
    warning: "amber",
    success: "green",
    error: "ruby",
    correct: "green",
    incorrect: "ruby",
    completed: "green",
  }),
} satisfies CourseColourSystemRevision);

function freezeDataSeriesPalette(palette: CourseDataSeriesPalette): CourseDataSeriesPalette {
  return Object.freeze(palette);
}
