import type { CourseColourSystemRevision, CourseDataSeriesPalette } from "../registry";

export const POCKET_ATLAS_COLOUR_SYSTEM_V1 = Object.freeze({
  id: "pocket-atlas",
  revision: "1",
  label: "Pocket Atlas",
  description: "A vivid handheld field-guide palette with accessible educational states.",
  radix: Object.freeze({
    accentColor: "violet",
    grayColor: "sand",
  }),
  dataSeries: Object.freeze({
    light: freezeDataSeriesPalette([
      "#5b3fd6",
      "#007ea7",
      "#00896f",
      "#6a8f00",
      "#cf7200",
      "#e1495f",
      "#b82e8a",
      "#3449b8",
    ]),
    dark: freezeDataSeriesPalette([
      "#a996ff",
      "#64d8ff",
      "#52e6bc",
      "#c4ec62",
      "#ffbf69",
      "#ff8294",
      "#f88bd2",
      "#8ba0ff",
    ]),
  }),
  semantics: Object.freeze({
    info: "cyan",
    warning: "orange",
    success: "mint",
    error: "tomato",
    correct: "mint",
    incorrect: "tomato",
    completed: "violet",
  }),
} satisfies CourseColourSystemRevision);

function freezeDataSeriesPalette(palette: CourseDataSeriesPalette): CourseDataSeriesPalette {
  return Object.freeze(palette);
}
