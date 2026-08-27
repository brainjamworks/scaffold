import { DOMSerializer } from "@tiptap/pm/model";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useMemo } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";

import {
  createDropdownChoiceLabelNode,
  createDropdownChoiceNode,
  createDropdownChoicesGroupNode,
} from "./dropdown-choice-shared";
import { dropdownCourseContentFromProseMirror } from "./dropdown-course-content";
import { DropdownCourseInteraction } from "./dropdown-course-interaction";

import "./Dropdown.css";

export function DropdownChoicesRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const surfaceTargetId = findAncestorAssessmentBlockId(props.editor, pos, [
    "surface_dropdown_question",
  ]);
  if (surfaceTargetId) {
    return (
      <NodeViewWrapper
        data-assessment-interaction-content=""
        data-surface-assessment-interaction-content=""
        hidden
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return <InlineDropdownChoicesRuntime {...props} pos={pos} />;
}

function InlineDropdownChoicesRuntime(props: NodeViewProps & { pos: number }) {
  const assessmentTargetId = findAncestorAssessmentBlockId(props.editor, props.pos, ["dropdown"]);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const content = useMemo(
    () => dropdownCourseContentFromProseMirror(props.node, serializer),
    [props.node, serializer],
  );

  return (
    <NodeViewWrapper data-slot="dropdown-choices-group">
      <DropdownCourseInteraction
        assessmentTargetId={assessmentTargetId}
        content={content}
        presentation="inline"
        promptHasText={assessmentPromptText(props).length > 0}
      />
    </NodeViewWrapper>
  );
}

function assessmentPromptText(props: NodeViewProps): string {
  const pos = safeGetPos(props.getPos);
  if (pos < 0 || pos > props.editor.state.doc.content.size) return "";

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const ancestor = $pos.node(depth);
    if (ancestor.type.name !== "dropdown") continue;

    let prompt = "";
    ancestor.forEach((child) => {
      if (child.type.name === "assessment_prompt") prompt = child.textContent.trim();
    });
    return prompt;
  }

  return "";
}

function safeGetPos(getPos: NodeViewProps["getPos"]): number {
  try {
    const pos = getPos();
    return typeof pos === "number" ? pos : -1;
  } catch {
    return -1;
  }
}

export const DropdownChoiceLabelRuntimeNode = createDropdownChoiceLabelNode();
export const DropdownChoiceRuntimeNode = createDropdownChoiceNode();
export const DropdownChoicesGroupRuntimeNode = createDropdownChoicesGroupNode({
  addNodeView: () => ReactNodeViewRenderer(DropdownChoicesRuntimeNodeView),
});
