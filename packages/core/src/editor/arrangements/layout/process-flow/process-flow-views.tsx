import { NodeViewContent, useEditorState } from "@tiptap/react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import {
  LayoutAddGhost,
  SectionActionTrigger,
  SectionMovementHandle,
} from "../authoring/layout-chrome";
import type {
  LayoutComponentProps,
  SectionComponentProps,
  SectionFrameProps,
} from "../authoring/layout-view-definition";
import {
  ProcessFlowContent,
  ProcessFlowNumber,
  ProcessFlowTrack,
  readRequiredProcessFlowNodeId,
  readProcessFlowOptions,
  type ProcessFlowSectionPosition,
} from "./process-flow-components";

import "./process-flow.css";

export function ProcessFlowLayoutView(props: LayoutComponentProps) {
  const layoutId = readRequiredProcessFlowNodeId(props.node.attrs["id"], "layout");
  const addLabel = props.definition?.section?.addLabel ?? "Add step";
  const options = readProcessFlowOptions(props.node.attrs["options"]);

  return (
    <ProcessFlowTrack options={options}>
      <NodeViewContent />
      {props.editable && props.definition?.section ? (
        <LayoutAddGhost
          editor={props.editor}
          getPos={props.getPos}
          label={addLabel}
          layoutId={layoutId}
          presentation="flow-item"
          className="sc-process-flow__add"
        />
      ) : null}
    </ProcessFlowTrack>
  );
}

export function ProcessFlowSectionView(props: SectionComponentProps) {
  const sectionId = readRequiredProcessFlowNodeId(props.node.attrs["id"], "section");
  const layoutPos = resolveSectionLayoutPos(props);
  const { index: sectionIndex, isLast } = useEditorState({
    editor: props.editor,
    selector: () => resolveSectionPosition(props),
  });

  return (
    <>
      <ProcessFlowNumber value={sectionIndex + 1} />
      {props.editable && layoutPos !== null ? (
        <SectionMovementHandle
          editor={props.editor}
          layoutPos={layoutPos}
          sectionId={sectionId}
          sectionIndex={sectionIndex}
          className="sc-process-flow__movement"
        />
      ) : null}
      {props.editable && layoutPos !== null ? (
        <SectionActionTrigger
          blockDefinitions={props.blockDefinitions}
          editor={props.editor}
          layoutPos={layoutPos}
          sectionId={sectionId}
          sectionIndex={sectionIndex}
          className="sc-process-flow__action"
        />
      ) : null}
      <ProcessFlowContent editable={props.editable} isLast={isLast}>
        <NodeViewContent />
      </ProcessFlowContent>
    </>
  );
}

export function processFlowSectionFrame(_props: SectionComponentProps): SectionFrameProps {
  return {
    className: "sc-process-flow__box",
  };
}

function resolveSectionLayoutPos(props: SectionComponentProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    const $pos = props.editor.state.doc.resolve(pos);
    return $pos.before($pos.depth);
  } catch {
    return null;
  }
}

function resolveSectionPosition(props: SectionComponentProps): ProcessFlowSectionPosition {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return { index: 0, isLast: false };
    const $pos = props.editor.state.doc.resolve(pos);
    const parent = $pos.parent;
    const index = $pos.index();
    let sectionCount = 0;
    parent.forEach((child) => {
      if (child.type.name === "section") sectionCount += 1;
    });
    return { index, isLast: index === sectionCount - 1 };
  } catch {
    return { index: 0, isLast: false };
  }
}
