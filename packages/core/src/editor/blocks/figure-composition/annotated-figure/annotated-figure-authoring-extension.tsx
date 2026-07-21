import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import {
  AnnotatedFigureAuthoringView,
  createAnnotatedFigureAnnotationAuthoringNode,
  createAnnotatedFigureCanvasAuthoringNode,
} from "./AnnotatedFigure";
import { annotatedFigureDefinition } from "./annotated-figure-definition";
import { createAnnotatedFigureNode } from "./node";
import { AnnotatedFigureLegendNode } from "./slots";

import "./AnnotatedFigure.css";

const AnnotatedFigureAuthoringRootNode = createAnnotatedFigureNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-annotated-figure",
      definition: annotatedFigureDefinition,
      view: { component: AnnotatedFigureAuthoringView },
    }),
});

export const AnnotatedFigureAuthoringExtension = Extension.create({
  name: "annotated_figure_authoring_bundle",

  addExtensions() {
    return [
      createAnnotatedFigureCanvasAuthoringNode(),
      createAnnotatedFigureAnnotationAuthoringNode(),
      AnnotatedFigureLegendNode,
      AnnotatedFigureAuthoringRootNode,
    ];
  },
});
