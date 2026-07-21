import { NodeViewContent, useEditorState } from "@tiptap/react";

import { resolveSectionPosition } from "../runtime/layout-view-helpers";
import type {
  LayoutRuntimeViewProps,
  SectionRuntimeFrameOptions,
  SectionRuntimeViewProps,
} from "../runtime/layout-view-definition";
import {
  ProcessFlowContent,
  ProcessFlowNumber,
  ProcessFlowTrack,
  readRequiredProcessFlowNodeId,
  readProcessFlowOptions,
} from "./process-flow-components";

import "./process-flow.css";

export function ProcessFlowLayoutRuntimeView(props: LayoutRuntimeViewProps) {
  const options = readProcessFlowOptions(props.node.attrs["options"]);

  return (
    <ProcessFlowTrack options={options}>
      <NodeViewContent />
    </ProcessFlowTrack>
  );
}

export function ProcessFlowSectionRuntimeView(props: SectionRuntimeViewProps) {
  const { index: sectionIndex, isLast } = useEditorState({
    editor: props.editor,
    selector: () => resolveSectionPosition(props),
  });

  return (
    <>
      <ProcessFlowNumber value={sectionIndex + 1} />
      <ProcessFlowContent isLast={isLast}>
        <NodeViewContent />
      </ProcessFlowContent>
    </>
  );
}

export function processFlowRuntimeSectionFrame(
  props: SectionRuntimeViewProps,
): SectionRuntimeFrameOptions {
  readRequiredProcessFlowNodeId(props.node.attrs["id"], "section");

  return {
    className: "sc-process-flow__box",
  };
}
