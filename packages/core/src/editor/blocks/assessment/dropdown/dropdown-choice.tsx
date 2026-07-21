import type { Editor } from "@tiptap/core";
import { InfoIcon as Info } from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useId, useMemo, useRef } from "react";
import {
  DropdownPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import {
  CHOICE_TRAILING_BTN,
  ChoiceAnswerItem,
} from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import {
  nextAssessmentFeedbackRecord,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { createStableId } from "@/document/model/identity/stable-ids";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { cn } from "@/lib/cn";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import {
  createDropdownChoiceLabelNode,
  createDropdownChoiceNode,
  createDropdownChoicesGroupNode,
  dropdownChoiceLabelContent,
  type DropdownChoiceAttrs,
} from "./dropdown-choice-shared";

import "./Dropdown.css";

export {
  describeDropdownAccessibilityState,
  dropdownChoiceLabelContent,
} from "./dropdown-choice-shared";

function dropdownChoiceAttrsFromNode(attrs: NodeViewProps["node"]["attrs"]): DropdownChoiceAttrs {
  return {
    id: String(attrs["id"] ?? ""),
  };
}

function toggleDropdownChoiceCorrect(editor: Editor, choicePos: number): boolean {
  if (!isValidEditorDocPos(editor, choicePos)) return false;
  const node = editor.state.doc.nodeAt(choicePos);
  if (!node || node.type.name !== "dropdown_choice") return false;
  const choiceId = String(node.attrs["id"] ?? "");
  if (!choiceId) return false;
  const parent = resolveAssessmentAttrParent(editor, choicePos, ["dropdown"]);
  if (!parent) return false;
  const assessment = DropdownPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});

  if (assessment.correctOptionId === choiceId) return false;
  setAssessmentAttr(editor, parent, {
    ...assessment,
    correctOptionId: choiceId,
  });
  return true;
}

function readDropdownChoiceState(
  editor: Editor,
  choicePos: number,
  choiceId: string,
): { isCorrect: boolean; feedback: AssessmentFeedbackContent | null } {
  if (!choiceId) return { isCorrect: false, feedback: null };
  const parent = resolveAssessmentAttrParent(editor, choicePos, ["dropdown"]);
  if (!parent) return { isCorrect: false, feedback: null };
  const assessment = DropdownPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return {
    isCorrect: assessment.correctOptionId === choiceId,
    feedback: assessment.feedbackByOptionId[choiceId] ?? null,
  };
}

function setDropdownChoiceFeedback(
  editor: Editor,
  choicePos: number,
  choiceId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  if (!choiceId) return;
  const parent = resolveAssessmentAttrParent(editor, choicePos, ["dropdown"]);
  if (!parent) return;
  const assessment = DropdownPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByOptionId: nextAssessmentFeedbackRecord(
      assessment.feedbackByOptionId,
      choiceId,
      feedback,
    ),
  });
}

export const DropdownChoiceLabelNode = createDropdownChoiceLabelNode({
  addNodeView: () => ReactNodeViewRenderer(DropdownChoiceLabelNodeView),
});

function DropdownChoiceLabelNodeView() {
  return (
    <NodeViewWrapper data-slot="dropdown-choice-label">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const DropdownChoiceNode = createDropdownChoiceNode({
  addNodeView: () => ReactNodeViewRenderer(DropdownChoiceNodeView),
});

export const DropdownChoicesGroupNode = createDropdownChoicesGroupNode({
  addNodeView: () => ReactNodeViewRenderer(DropdownChoicesGroupNodeView),
});

function DropdownChoiceNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  const attrs = dropdownChoiceAttrsFromNode(props.node.attrs);
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `dropdown-choice-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
    [popoverId],
  );
  const extensions = useMemo(
    () => [
      ...createFieldContentEditorExtensions(),
      Placeholder.configure({
        includeChildren: false,
        placeholder: "Feedback for this choice",
        showOnlyCurrent: false,
        showOnlyWhenEditable: true,
      }),
    ],
    [],
  );
  const latestTargetContext = useRef({ editor: props.editor, getPos: props.getPos });

  const currentChoicePos = (editor = props.editor) => {
    return resolveDropdownChoicePos(editor, props.getPos);
  };

  const privateChoiceState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos !== null
        ? readDropdownChoiceState(editor, currentPos, attrs.id)
        : { isCorrect: false, feedback: null };
    },
  });
  const choiceIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "dropdown_choice") : 1;
    },
  });
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateChoiceState.feedback?.document);
  const fieldKey = `dropdown:${attrs.id}:feedback`;

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = resolveDropdownChoicePos(latest.editor, latest.getPos);
        return currentPos !== null
          ? toTiptapRichTextDocument(
              readDropdownChoiceState(latest.editor, currentPos, attrs.id).feedback?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = resolveDropdownChoicePos(latest.editor, latest.getPos);
        if (currentPos === null) return;
        setDropdownChoiceFeedback(
          latest.editor,
          currentPos,
          attrs.id,
          richTextDocumentToAssessmentFeedback(nextDocument),
        );
      },
    }),
    [attrs.id],
  );

  const toggleCorrect = () => {
    const currentPos = currentChoicePos();
    if (currentPos === null) return;
    toggleDropdownChoiceCorrect(props.editor, currentPos);
  };

  const deleteChoice = () => {
    const currentPos = currentChoicePos();
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: currentPos, to: currentPos + currentNode.nodeSize })
      .run();
  };

  const feedbackControl = (
    <EditableOverlayPopover.Root>
      <EditableOverlayPopover.Trigger asChild>
        <button
          type="button"
          aria-label={hasFeedback ? "Edit feedback" : "Add feedback"}
          onClick={(event) => event.stopPropagation()}
          data-no-select
          className={cn(
            CHOICE_TRAILING_BTN,
            hasFeedback && "sc-assessment-feedback-trigger--visible",
          )}
        >
          <Info size={iconSm} weight={hasFeedback ? "fill" : "regular"} />
        </button>
      </EditableOverlayPopover.Trigger>
      <EditableOverlayPopover.Portal>
        <EditableOverlayPopover.Content
          align="start"
          description="Shown to learners after they answer."
          icon={<Info size={iconSm} weight="fill" />}
          side="bottom"
          title="Feedback"
          tone="feedback"
          editor={{
            ariaLabel: "Feedback editor",
            bubbleMenuPluginKey: richTextPluginKey,
            className: "sc-assessment-feedback-editor-field sc-assessment-feedback-rich-text",
            extensions,
            fieldKey,
            outerEditor: props.editor,
            placeholder: "Feedback for this choice",
            syncKey: privateChoiceState.feedback?.document,
            target: feedbackTarget,
          }}
        />
      </EditableOverlayPopover.Portal>
    </EditableOverlayPopover.Root>
  );

  return (
    <NodeViewWrapper data-node="dropdown-choice" data-choice-id={attrs.id}>
      <ChoiceAnswerItem
        id={attrs.id}
        inputType="radio"
        isCorrect={privateChoiceState.isCorrect}
        feedbackControl={feedbackControl}
        isEditable={isEditable}
        state={isEditable && privateChoiceState.isCorrect ? "correct" : null}
        checked={privateChoiceState.isCorrect}
        disabled={!isEditable}
        onSelect={() => undefined}
        onToggleCorrect={toggleCorrect}
        onDelete={deleteChoice}
        deleteLabel={`Delete choice ${choiceIndex}`}
      >
        <NodeViewContent />
      </ChoiceAnswerItem>
    </NodeViewWrapper>
  );
}

function resolveDropdownChoicePos(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
): number | null {
  const currentPos = safeGetPos(getPos);
  if (!isValidEditorDocPos(editor, currentPos)) return null;
  const currentNode = editor.state.doc.nodeAt(currentPos);
  return currentNode?.type.name === "dropdown_choice" ? currentPos : null;
}

function readSiblingIndex(editor: NodeViewProps["editor"], pos: number, typeName: string): number {
  const $pos = editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let count = 0;
  let index = 1;

  parent.forEach((child, offset) => {
    if (child.type.name !== typeName) return;
    count += 1;
    if (parentStart + offset <= pos) {
      index = count;
    }
  });

  return index;
}

function DropdownChoicesGroupNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  const addChoice = () => {
    const currentPos = safeGetPos(props.getPos);
    if (!isValidEditorDocPos(props.editor, currentPos)) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode || currentNode.type.name !== "dropdown_choices_group") return;
    const insertAt = currentPos + currentNode.nodeSize - 1;
    props.editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: "dropdown_choice",
        attrs: { id: createStableId() },
        content: [
          {
            type: "dropdown_choice_label",
            content: dropdownChoiceLabelContent(),
          },
        ],
      })
      .run();
  };

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="dropdown-choices-group"
      className="sc-dropdown-choices-group"
    >
      <div data-assessment-bounded-scroll="" className="sc-dropdown-choices-scroll">
        <NodeViewContent />
        {isEditable && (
          <BlockAddGhost
            label="Add choice"
            presentation="pill"
            contentEditable={false}
            onClick={addChoice}
            className="sc-dropdown-add-choice"
          />
        )}
      </div>
      <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}
