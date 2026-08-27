import { Extension } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { AnnotatedFigureDataSchema } from "@scaffold/contracts";

import { AnnotatedFigureRuntimeCanvasNode } from "./annotated-figure-canvas-runtime";
import {
  resolveAnnotatedFigureModel,
  resolveAnnotatedFigureOwnerAtPosition,
} from "./annotated-figure-document-model";
import { annotatedFigureDefinition } from "./annotated-figure-definition";
import { AnnotatedFigureRuntimeCaptionList } from "./AnnotatedFigureRuntimeCaptionList";
import { createAnnotatedFigureNode } from "./node";
import { AnnotatedFigureLegendNode, createAnnotatedFigureAnnotationNode } from "./slots";
import { emptyAnnotatedFigureData } from "./content";

import "./AnnotatedFigure.css";

function AnnotatedFigureRuntimeView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const parsedData = AnnotatedFigureDataSchema.safeParse(props.node.attrs["data"]);
  const data = parsedData.success ? parsedData.data : emptyAnnotatedFigureData();
  const ownerPos = safeGetPos(props.getPos);
  const model =
    ownerPos === undefined
      ? null
      : resolveAnnotatedFigureModel({ node: props.node, pos: ownerPos });

  return (
    <NodeViewContent
      className="sc-course-annotated-figure__content"
      data-caption-display={data.captionDisplay}
      data-has-annotations={model && model.annotations.length > 0 ? "true" : "false"}
    />
  );
}

function AnnotatedFigureRuntimeLegendView(props: NodeViewProps) {
  useEditorState({
    editor: props.editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });
  const owner = resolveAnnotatedFigureOwnerAtPosition(
    props.editor.state.doc,
    safeGetPos(props.getPos),
  );
  const model = owner ? resolveAnnotatedFigureModel(owner) : null;
  const data = model?.data ?? emptyAnnotatedFigureData();
  const annotations = model?.annotations ?? [];

  return (
    <NodeViewWrapper
      className="sc-course-annotated-figure__runtime-caption-host"
      data-caption-display={data.captionDisplay}
      data-has-annotations={annotations.length > 0 ? "true" : "false"}
      data-slot="annotated-figure-legend"
    >
      <AnnotatedFigureRuntimeCaptionList
        annotations={annotations}
        visuallyHidden={data.captionDisplay === "popover"}
      />
    </NodeViewWrapper>
  );
}

const AnnotatedFigureRuntimeLegendNode = AnnotatedFigureLegendNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(AnnotatedFigureRuntimeLegendView);
  },
});

const AnnotatedFigureRuntimeRootNode = createAnnotatedFigureNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-course-annotated-figure",
      definition: annotatedFigureDefinition,
      view: { component: AnnotatedFigureRuntimeView },
    }),
});

export const AnnotatedFigureRuntimeExtension = Extension.create({
  name: "annotated_figure_runtime_bundle",

  addExtensions() {
    return [
      AnnotatedFigureRuntimeCanvasNode,
      createAnnotatedFigureAnnotationNode(),
      AnnotatedFigureRuntimeLegendNode,
      AnnotatedFigureRuntimeRootNode,
    ];
  },
});
