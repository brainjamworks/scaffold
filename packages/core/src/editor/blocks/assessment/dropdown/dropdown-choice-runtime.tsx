import type { Editor } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useMemo } from "react";

import {
  assessmentPromptDomId,
  findAncestorAssessmentBlockId,
} from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import type { SingleSelectInteractionRuntime } from "@/editor/blocks/assessment/shared/runtime/assessment-interaction-runtime";
import {
  useAssessmentRuntimeById,
  type AssessmentRuntimeController,
} from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";

import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import {
  createDropdownChoiceLabelNode,
  createDropdownChoiceNode,
  createDropdownChoicesGroupNode,
  describeDropdownAccessibilityState,
} from "./dropdown-choice-shared";
import { DropdownCourseSelect, type DropdownCourseOption } from "./DropdownCourseSelect";

import "./Dropdown.css";

interface DropdownChoiceOption {
  id: string;
  text: string;
  html: string;
}

function serializeDropdownChoiceHtml(serializer: DOMSerializer, node: PMNode | null): string {
  if (!node) return "";
  const inlineParts: string[] = [];

  node.forEach((child) => {
    if (child.isTextblock) {
      const html = serializeStaticRichTextHtml(serializer, child.content).trim();
      if (html) inlineParts.push(html);
      return;
    }

    const text = child.textContent.trim();
    if (text) inlineParts.push(escapeHtmlText(text));
  });

  return inlineParts.join(" ");
}

function escapeHtmlText(text: string): string {
  const element = document.createElement("span");
  element.textContent = text;
  return element.innerHTML;
}

function dropdownChoiceLabelNode(node: PMNode): PMNode | null {
  return childByType(node, "dropdown_choice_label");
}

function childByType(node: PMNode, typeName: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === typeName) found = child;
  });
  return found;
}

function dropdownOptionsFromNode(
  node: NodeViewProps["node"],
  serializer: DOMSerializer,
): DropdownChoiceOption[] {
  const options: DropdownChoiceOption[] = [];
  node.forEach((child, _offset, index) => {
    if (child.type.name !== "dropdown_choice") return;
    const id = String(child.attrs["id"] ?? "");
    if (!id) return;
    const label = dropdownChoiceLabelNode(child);
    const text = label?.textContent.trim() || `Choice ${index + 1}`;
    options.push({
      id,
      text,
      html: serializeDropdownChoiceHtml(serializer, label),
    });
  });
  return options;
}

export function DropdownChoicesRuntimeNodeView(props: NodeViewProps) {
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, safeGetPos(props.getPos), [
    "dropdown",
  ]);
  const assessment = useAssessmentRuntimeById(authoredBlockId, "single-select");
  const dropdown = assessment?.interaction ?? null;
  const promptHasText = assessmentPromptText(props.editor, props.getPos).length > 0;

  return (
    <DropdownChoicesRuntime
      node={props.node}
      editor={props.editor}
      assessment={assessment}
      dropdown={dropdown}
      label={assessment?.problem?.state.legend ?? ""}
      promptHasText={promptHasText}
      authoredBlockId={authoredBlockId}
    />
  );
}

interface DropdownChoicesRuntimeProps {
  authoredBlockId: string | null;
  node: NodeViewProps["node"];
  editor: Editor;
  assessment: AssessmentRuntimeController<"single-select"> | null;
  dropdown: SingleSelectInteractionRuntime | null;
  label: string;
  promptHasText: boolean;
}

function DropdownChoicesRuntime({
  authoredBlockId,
  node,
  editor,
  assessment,
  dropdown,
  label,
  promptHasText,
}: DropdownChoicesRuntimeProps) {
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const options = useMemo(() => dropdownOptionsFromNode(node, serializer), [node, serializer]);
  const selectedId = dropdown?.selectedIds[0] ?? "";
  const problem = assessment?.problem ?? null;
  const answerKeyVisible = problem?.answerKeyVisible ?? false;
  const selectedOption = options.find((option) => option.id === selectedId) ?? null;
  const state = selectedOption && dropdown ? dropdown.stateFor(selectedOption.id) : null;
  const locked = problem?.interactionLocked ?? false;
  const placeholder = problem?.state.placeholder || "Select...";
  const trimmedLabel = label.trim();
  const promptId = assessmentPromptDomId(authoredBlockId);
  const showFeedback = Boolean(
    selectedOption &&
    dropdown &&
    (problem?.state.submitted ||
      answerKeyVisible ||
      (problem?.state.feedbackMode === "immediate" && problem.feedbackResult)),
  );
  const selectedFeedback = AssessmentFeedbackContentSchema.safeParse(
    selectedOption ? assessment?.feedback.items?.[selectedOption.id]?.feedback : null,
  );
  const accessibilityDescription = describeDropdownAccessibilityState({
    hasFeedback: showFeedback && selectedFeedback.success,
    selected: selectedOption !== null,
    state,
    submitted: problem?.state.submitted ?? false,
  });
  const correctOptionId = answerKeyVisible
    ? (dropdown?.revealedSelectedId ??
      options.find((option) => dropdown?.stateFor(option.id) === "missed")?.id ??
      (state === "correct" ? selectedId : null))
    : null;
  const correctOption = options.find((option) => option.id === correctOptionId) ?? null;
  const correctFeedback = AssessmentFeedbackContentSchema.safeParse(
    correctOption ? assessment?.feedback.items?.[correctOption.id]?.feedback : null,
  );
  const immediateResult =
    problem?.state.feedbackMode === "immediate" ? (problem.feedbackResult ?? null) : null;
  const immediateAnnouncement = immediateResult
    ? `Answer checked. ${immediateResult.isCorrect ? "Correct." : "Incorrect."}${
        selectedFeedback.success ? " Feedback available." : ""
      }`
    : null;
  const courseOptions: DropdownCourseOption[] = options.map((option) => ({
    id: option.id,
    text: option.text,
    content: renderOptionContent(option),
  }));

  return (
    <NodeViewWrapper data-slot="dropdown-choices-group">
      <DropdownCourseSelect
        accessibilityDescription={accessibilityDescription}
        correctAnswer={
          correctOption
            ? {
                content: renderOptionContent(correctOption),
                ...(correctOption.id !== selectedOption?.id && correctFeedback.success
                  ? {
                      feedbackControl: (
                        <RichFeedbackRuntimePopover feedback={correctFeedback.data} />
                      ),
                    }
                  : {}),
              }
            : null
        }
        disabled={locked}
        feedbackControl={
          showFeedback && selectedFeedback.success ? (
            <RichFeedbackRuntimePopover feedback={selectedFeedback.data} />
          ) : null
        }
        immediateAnnouncement={immediateAnnouncement}
        label={trimmedLabel}
        name={problem?.state.responseName}
        onValueChange={(next) => dropdown?.select(next)}
        options={courseOptions}
        placeholder={placeholder}
        promptHasText={promptHasText}
        promptId={promptId}
        state={state}
        value={selectedId}
      />
    </NodeViewWrapper>
  );
}

function assessmentPromptText(editor: Editor, getPos: NodeViewProps["getPos"]): string {
  const pos = safeGetPos(getPos);
  if (pos < 0 || pos > editor.state.doc.content.size) return "";

  const $pos = editor.state.doc.resolve(pos);
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

function renderOptionContent(option: DropdownChoiceOption) {
  return option.html ? (
    <span
      className="sc-course-dropdown-select__option-content"
      dangerouslySetInnerHTML={{ __html: option.html }}
    />
  ) : (
    option.text
  );
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
