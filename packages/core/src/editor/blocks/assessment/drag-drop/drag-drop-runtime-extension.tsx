import { Extension } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { DragDropCanvasDataSchema, DragDropSettingsSchema } from "@scaffold/contracts";

import { getScaffoldCapabilitiesForEditor } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-placement";
import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

import { createDragDropCanvasNode } from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { createDragDropCourseContent } from "@/editor/assessment/drag-drop/drag-drop-course-content";
import { DragDropInlineCourseWorkspace } from "@/editor/assessment/drag-drop/drag-drop-course-interaction";
import { dragDropBlockDefinition } from "./drag-drop-definition";
import { createDragDropNode } from "./node";
import {
  isDragDropOwnerNodeType,
  SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
} from "@/editor/assessment/drag-drop/node-codecs";

function DragDropRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-course-drag-drop"
      definition={dragDropBlockDefinition}
      props={props}
    />
  );
}

function DragDropCanvasRuntimeView(props: NodeViewProps) {
  const canvasPos = safeGetPos(props.getPos);
  const owner =
    typeof canvasPos === "number" ? findOwner(props.editor.state.doc.resolve(canvasPos)) : null;
  if (!owner) throw new Error("Drag and Drop canvas is missing its assessment owner.");
  if (owner.node.type.name === SURFACE_DRAG_DROP_QUESTION_NODE_TYPE) {
    return (
      <NodeViewWrapper
        data-node="drag-drop-canvas"
        data-surface-owned-drag-drop-canvas=""
        contentEditable={false}
      />
    );
  }
  const ownerId = String(owner.node.attrs["id"] ?? "");
  const data = DragDropCanvasDataSchema.parse(props.node.attrs["data"]);
  const settings = DragDropSettingsSchema.parse(owner.node.attrs["settings"]);
  const content = createDragDropCourseContent(data, settings.legend ?? undefined);
  const boundedFillActive = isDragDropBoundedFillActive(props.editor, owner.pos);

  return (
    <NodeViewWrapper data-node="drag-drop-canvas" contentEditable={false}>
      <DragDropInlineCourseWorkspace
        assessmentTargetId={ownerId}
        content={content}
        fitStrategy={boundedFillActive ? "contain" : "width"}
      />
    </NodeViewWrapper>
  );
}

const DragDropRuntimeNode = createDragDropNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: dragDropBlockDefinition,
      view: { component: DragDropRuntimeView },
    }),
});

const DragDropCanvasRuntimeNode = createDragDropCanvasNode({
  addNodeView: () => ReactNodeViewRenderer(DragDropCanvasRuntimeView),
});

export const DragDropRuntimeExtension = Extension.create({
  name: "drag_drop_runtime_bundle",
  addExtensions() {
    return [DragDropCanvasRuntimeNode, DragDropRuntimeNode];
  },
});

function findOwner($pos: ReturnType<NodeViewProps["editor"]["state"]["doc"]["resolve"]>) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (isDragDropOwnerNodeType(node.type.name)) return { node, pos: $pos.before(depth) };
  }
  return null;
}

function isDragDropBoundedFillActive(editor: NodeViewProps["editor"], ownerPos: number): boolean {
  const capabilities = getScaffoldCapabilitiesForEditor(editor);
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions: capabilities.blocks.registry,
      capability: "fill",
      doc: editor.state.doc,
      layoutDefinitions: capabilities.layouts.registry,
      pos: ownerPos,
    }) === "fill"
  );
}
