import type { Editor } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import {
  CaretDownIcon as CaretDown,
  CheckCircleIcon as CheckCircle,
  CheckIcon as Check,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { useMemo } from "react";

import * as Select from "@/ui/components/Select/SelectMenu";
import * as VisuallyHidden from "@/ui/components/VisuallyHidden/VisuallyHidden";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import type { SingleSelectInteractionRuntime } from "@/editor/blocks/assessment/shared/runtime/assessment-interaction-runtime";
import {
  useAssessmentRuntimeById,
  type AssessmentRuntimeController,
} from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { cn } from "@/lib/cn";
import { zIndex } from "@/ui/overlays/z-index";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconMd, iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import {
  createDropdownChoiceLabelNode,
  createDropdownChoiceNode,
  createDropdownChoicesGroupNode,
  describeDropdownAccessibilityState,
} from "./dropdown-choice-shared";

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
  const problemId = findAncestorAssessmentId(props.editor, safeGetPos(props.getPos), ["dropdown"]);
  const assessment = useAssessmentRuntimeById(problemId, "single-select");
  const dropdown = assessment?.interaction ?? null;

  return (
    <DropdownChoicesRuntime
      node={props.node}
      editor={props.editor}
      problemId={problemId}
      assessment={assessment}
      dropdown={dropdown}
      label={assessment?.problem?.state.legend ?? ""}
    />
  );
}

interface DropdownChoicesRuntimeProps {
  node: NodeViewProps["node"];
  editor: Editor;
  problemId: string | null;
  assessment: AssessmentRuntimeController<"single-select"> | null;
  dropdown: SingleSelectInteractionRuntime | null;
  label: string;
}

function DropdownChoicesRuntime({
  node,
  editor,
  problemId,
  assessment,
  dropdown,
  label,
}: DropdownChoicesRuntimeProps) {
  const serializer = useMemo(() => DOMSerializer.fromSchema(editor.schema), [editor.schema]);
  const options = useMemo(() => dropdownOptionsFromNode(node, serializer), [node, serializer]);
  const selectedId = dropdown?.selectedIds[0] ?? "";
  const problem = assessment?.problem ?? null;
  const answerKeyVisible = problem?.answerKeyVisible ?? false;
  const hasRevealPayload = (problem?.state.revealedAnswer ?? null) !== null;
  const displayId = answerKeyVisible ? (dropdown?.revealedSelectedId ?? selectedId) : selectedId;
  const displayOption = options.find((option) => option.id === displayId) ?? null;
  const state = displayOption && dropdown ? dropdown.stateFor(displayOption.id) : null;
  const locked = Boolean(problem?.state.submitted || hasRevealPayload || problem?.exhausted);
  const placeholder = problem?.state.placeholder || "Select...";
  const labelId = problemId ? `${problemId}-dropdown-label` : undefined;
  const showFeedback = Boolean(
    displayOption &&
    dropdown &&
    (problem?.state.submitted ||
      answerKeyVisible ||
      (problem?.state.feedbackMode === "immediate" && problem.feedbackResult)),
  );
  const runtimeFeedback = AssessmentFeedbackContentSchema.safeParse(
    displayOption ? assessment?.feedback.items?.[displayOption.id]?.feedback : null,
  );
  const accessibilityDescription = describeDropdownAccessibilityState({
    hasFeedback: showFeedback && runtimeFeedback.success,
    selected: displayOption ? selectedId === displayOption.id : false,
    state,
    submitted: problem?.state.submitted ?? false,
  });
  const descriptionId =
    problemId && accessibilityDescription ? `${problemId}-dropdown-state-description` : undefined;
  const sideIconBoxClass = "sc-dropdown-runtime__side-icon";
  const renderOptionContent = (option: DropdownChoiceOption) =>
    option.html ? (
      <span
        className="sc-dropdown-runtime__option-html"
        dangerouslySetInnerHTML={{ __html: option.html }}
      />
    ) : (
      option.text
    );

  const stateIcon =
    state === "correct" || state === "missed" ? (
      <span className={sideIconBoxClass}>
        <CheckCircle
          size={iconMd}
          weight="fill"
          className="sc-dropdown-runtime__state-icon sc-dropdown-runtime__state-icon--correct"
          aria-hidden
        />
      </span>
    ) : state === "incorrect" ? (
      <span className={sideIconBoxClass}>
        <XCircle
          size={iconMd}
          weight="fill"
          className="sc-dropdown-runtime__state-icon sc-dropdown-runtime__state-icon--incorrect"
          aria-hidden
        />
      </span>
    ) : null;

  return (
    <NodeViewWrapper data-slot="dropdown-choices-group">
      <div className="sc-dropdown-runtime">
        {label && (
          <div id={labelId} className="sc-dropdown-runtime__label">
            {label}
          </div>
        )}
        <div className="sc-dropdown-runtime__row">
          <Select.Root
            required
            value={displayId}
            onValueChange={(next) => dropdown?.select(next)}
            disabled={locked}
            {...(problem?.state.groupName ? { name: problem.state.groupName } : {})}
          >
            <Select.Trigger
              aria-labelledby={label ? labelId : undefined}
              aria-describedby={descriptionId}
              className={cn(
                "sc-dropdown-runtime__trigger",
                state === null && "sc-dropdown-runtime__trigger--idle",
                locked && state === null && "sc-dropdown-runtime__trigger--locked",
                (state === "correct" || state === "missed") &&
                  "sc-dropdown-runtime__trigger--correct",
                state === "incorrect" && "sc-dropdown-runtime__trigger--incorrect",
              )}
            >
              <Select.Value placeholder={placeholder} className="sc-dropdown-runtime__value">
                {displayOption ? renderOptionContent(displayOption) : undefined}
              </Select.Value>
              <Select.Icon className="sc-dropdown-runtime__caret">
                <CaretDown size={iconXs} aria-hidden />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="sc-dropdown-runtime__content"
                style={{ zIndex: zIndex.popover }}
              >
                <Select.Viewport className="sc-dropdown-runtime__viewport">
                  {options.map((option) => (
                    <Select.Item
                      key={option.id}
                      value={option.id}
                      textValue={option.text}
                      className="sc-dropdown-runtime__item"
                    >
                      <Select.ItemText>{renderOptionContent(option)}</Select.ItemText>
                      <Select.ItemIndicator className="sc-dropdown-runtime__item-indicator">
                        <Check size={iconSm} aria-hidden />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          {stateIcon}
          {showFeedback && displayOption && runtimeFeedback.success && (
            <span className={cn(sideIconBoxClass, "sc-dropdown-runtime__feedback-anchor")}>
              <RichFeedbackRuntimePopover feedback={runtimeFeedback.data} />
            </span>
          )}
          {accessibilityDescription && (
            <VisuallyHidden.Root id={descriptionId}>{accessibilityDescription}</VisuallyHidden.Root>
          )}
        </div>
      </div>
    </NodeViewWrapper>
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
