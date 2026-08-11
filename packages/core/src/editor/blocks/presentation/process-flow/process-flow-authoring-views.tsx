import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useId, useMemo, useRef } from "react";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import {
  authoringMovementSilhouetteSurfaceAttributes,
  authoringMovementSnapshotChromeAttributes,
} from "@/editor/movement/view/authoring-movement-presentation";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { PROCESS_FLOW_NODE, PROCESS_FLOW_STEP_NODE, createProcessFlowStep } from "./content";
import { ProcessFlowStepCard, ProcessFlowView } from "./ProcessFlow";
import { createProcessFlowAuthoringReorderProjection } from "./process-flow-authoring-reorder-projection";
import {
  readProcessFlowNodePos,
  readProcessFlowStepPosition,
  readRequiredProcessFlowStepId,
  resolveProcessFlowData,
} from "./process-flow-view-helpers";

export function ProcessFlowAuthoringView(props: NodeViewProps) {
  const addStep = () => {
    const pos = readProcessFlowNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== PROCESS_FLOW_NODE) return;

    props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        ...createProcessFlowStep(node.childCount),
        attrs: { id: createEmbeddedNodeId() },
      })
      .run();
  };

  const footer = (
    <button
      type="button"
      contentEditable={false}
      aria-label="Add step"
      onMouseDown={(event) => event.preventDefault()}
      onClick={addStep}
      className="sc-course-process-flow__add"
    >
      <span aria-hidden className="sc-course-process-flow__add-icon">
        <Plus size={16} weight="bold" />
      </span>
      <span>Add step</span>
    </button>
  );

  return <ProcessFlowView props={props} footer={footer} />;
}

export function ProcessFlowStepAuthoringView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLElement | null>(null);
  const { count, index } = useEditorState({
    editor: props.editor,
    selector: () => readProcessFlowStepPosition(props),
  });
  const data = useEditorState({
    editor: props.editor,
    selector: () => resolveProcessFlowData(props),
  });
  const reorderProjection = useMemo(
    () =>
      createProcessFlowAuthoringReorderProjection(() => presentationRef.current, data.orientation),
    [data.orientation],
  );
  const stepId = readRequiredProcessFlowStepId(props.node.attrs["id"]);
  const stepPos = readProcessFlowNodePos(props);
  const sourcePos = typeof stepPos === "number" && Number.isInteger(stepPos) ? stepPos : null;
  const canDelete = count > 1;
  const deleteExplanationId = useId();

  const deleteStep = () => {
    const pos = readProcessFlowNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== PROCESS_FLOW_STEP_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  const chrome = (
    <div className="sc-course-process-flow__controls">
      <ContainedMovementHandle
        axis={data.orientation}
        className="sc-course-process-flow__move"
        getPresentationElement={() => presentationRef.current}
        getSourcePos={() => readProcessFlowNodePos(props) ?? null}
        label="process flow step"
        projection={reorderProjection}
        sourceKey={stepId}
        sourcePos={sourcePos}
      />
      <button
        {...authoringMovementSnapshotChromeAttributes()}
        type="button"
        contentEditable={false}
        aria-disabled={!canDelete || undefined}
        aria-describedby={!canDelete ? deleteExplanationId : undefined}
        aria-label={`Delete process flow step ${index}`}
        onClick={deleteStep}
        className="sc-course-process-flow__delete"
      >
        <Trash size={15} aria-hidden />
        {!canDelete ? (
          <span id={deleteExplanationId} className="sc-course-process-flow__control-explanation">
            A process flow must contain at least one step.
          </span>
        ) : null}
      </button>
    </div>
  );

  return (
    <NodeViewWrapper
      as="li"
      ref={presentationRef}
      data-node="process-flow-step"
      {...containedMovementTargetAttributes(data.orientation)}
      className="sc-course-process-flow__step"
    >
      <ProcessFlowStepCard
        chrome={chrome}
        number={data.showNumbers ? index : null}
        surfaceProps={authoringMovementSilhouetteSurfaceAttributes()}
      >
        <NodeViewContent />
      </ProcessFlowStepCard>
    </NodeViewWrapper>
  );
}
