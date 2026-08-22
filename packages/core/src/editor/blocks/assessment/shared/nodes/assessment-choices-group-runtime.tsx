import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import {
  assessmentPromptDomId,
  findAncestorAssessmentBlockId,
} from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { describeMultiSelectLimitState } from "../runtime/assessment-interaction-runtime";
import "./assessment-choices-group.css";

export const AssessmentChoicesGroupRuntimeNode = Node.create({
  name: "assessment_choices_group",
  content: "selectable_choice+",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-choices-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-bounded-scroll-frame": "",
        "data-slot": "assessment-choices-group",
      }),
      ["div", { "data-bounded-scroll": "", class: "sc-course-assessment-choices-scroll" }, 0],
      ["div", { "data-bounded-scroll-hint": "", "aria-hidden": "true" }, "Scroll for more ↓"],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentChoicesGroupRuntimeNodeView);
  },
});

function AssessmentChoicesGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(
    props.editor,
    pos,
    isAssessmentQuestionNode,
  );
  const assessment = useAssessmentRuntimeById(authoredBlockId);
  const problem = assessment?.problem ?? null;
  const legend = problem?.state.legend.trim() ?? "";
  const promptId = assessmentPromptDomId(authoredBlockId);
  const multiselect =
    assessment?.interaction.kind === "multi-select" ? assessment.interaction : null;
  const selectionGuidance =
    multiselect?.maxSelections === null || multiselect?.maxSelections === undefined
      ? null
      : `Choose up to ${multiselect.maxSelections} answers.`;
  const limitStatus = multiselect
    ? describeMultiSelectLimitState({
        maxSelections: multiselect.maxSelections,
        selectedCount: multiselect.selectedCount,
      })
    : null;

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="assessment-choices-group"
      className="sc-course-assessment-choices-group"
    >
      <div data-bounded-scroll="" className="sc-course-assessment-choices-scroll">
        <fieldset
          className="sc-course-assessment-choices-fieldset"
          aria-labelledby={legend ? undefined : promptId}
        >
          {legend && <legend className="sc-course-assessment-choices-legend">{legend}</legend>}
          {selectionGuidance ? (
            <p className="sc-course-assessment-choices-guidance">{selectionGuidance}</p>
          ) : null}
          {limitStatus ? (
            <p
              className="sc-course-assessment-choices-limit-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {limitStatus}
            </p>
          ) : null}
          <div className="sc-course-assessment-choices-list">
            <NodeViewContent />
          </div>
        </fieldset>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}
