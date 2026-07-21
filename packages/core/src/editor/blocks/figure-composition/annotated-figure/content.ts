import { AnnotatedFigureDataSchema, type AnnotatedFigureData } from "@scaffold/contracts";

export const ANNOTATED_FIGURE_NODE = "annotated_figure";
export const ANNOTATED_FIGURE_CANVAS_NODE = "annotated_figure_canvas";
export const ANNOTATED_FIGURE_LEGEND_NODE = "annotated_figure_legend";
export const ANNOTATED_FIGURE_ANNOTATION_NODE = "annotated_figure_annotation";

export function emptyAnnotatedFigureData(
  overrides: Partial<AnnotatedFigureData> = {},
): AnnotatedFigureData {
  return AnnotatedFigureDataSchema.parse(overrides);
}
