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

import { deleteAssessmentChoice } from "@/editor/blocks/assessment/shared/model/delete-assessment-choice";
import {
  nextAssessmentFeedbackRecord,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";
import {
  AssessmentChoiceAddButton,
  AssessmentChoiceAuthoringAction,
  AssessmentChoiceAuthoringRow,
} from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import { authoringMovementSnapshotChromeAttributes } from "@/editor/movement/view/authoring-movement-presentation";

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
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () =>
      createAuthoringContainedReorderProjection({
        axis: "vertical",
        getSiblingElements: (sourceElement) =>
          resolveAuthoringNodeViewSiblingElements(
            sourceElement,
            (element) => element.getAttribute("data-node") === "dropdown-choice",
          ),
        getSourceElement: () => presentationRef.current,
      }),
    [],
  );
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
  const choicePosition = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos !== null
        ? readSiblingPosition(editor, currentPos, "dropdown_choice")
        : { count: 1, index: 1 };
    },
  });
  const pos = safeGetPos(props.getPos);
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateChoiceState.feedback?.document);
  const choiceLabel = props.node.textContent.trim() || `choice ${choicePosition.index}`;
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
    deleteAssessmentChoice(props.editor, currentPos);
  };

  const feedbackControl = (
    <EditableOverlayPopover.Root>
      <EditableOverlayPopover.Trigger asChild>
        <AssessmentChoiceAuthoringAction
          {...authoringMovementSnapshotChromeAttributes()}
          active={hasFeedback}
          intent="feedback"
          label={hasFeedback ? "Edit feedback" : "Add feedback"}
          owner="app"
        >
          <Info size={iconSm} weight={hasFeedback ? "fill" : "regular"} />
        </AssessmentChoiceAuthoringAction>
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
            className:
              "sc-course-assessment-feedback-editor-field sc-course-assessment-feedback-rich-text",
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
    <NodeViewWrapper
      ref={presentationRef}
      {...props.HTMLAttributes}
      data-node="dropdown-choice"
      data-choice-id={attrs.id}
      {...containedMovementTargetAttributes()}
    >
      <AssessmentChoiceAuthoringRow
        correct={privateChoiceState.isCorrect}
        correctnessLabel={`Toggle whether ${choiceLabel} is correct`}
        feedbackControl={feedbackControl}
        onToggleCorrect={toggleCorrect}
        deleteAction={{
          label: `Delete choice ${choicePosition.index}`,
          onAction: deleteChoice,
          ...(choicePosition.count <= 1
            ? { unavailableReason: "An assessment must contain at least one choice." }
            : {}),
        }}
        movementControl={
          <ContainedMovementHandle
            getPresentationElement={() => presentationRef.current}
            getSourcePos={() => safeGetPos(props.getPos)}
            label="choice"
            projection={reorderProjection}
            sourceKey={attrs.id}
            sourcePos={pos}
            className="sc-app-contained-movement-handle--row-offset"
          />
        }
      >
        <NodeViewContent />
      </AssessmentChoiceAuthoringRow>
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

function readSiblingPosition(
  editor: NodeViewProps["editor"],
  pos: number,
  typeName: string,
): { count: number; index: number } {
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

  return { count, index };
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
        attrs: { id: createEmbeddedNodeId() },
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
      data-bounded-scroll-frame=""
      data-slot="dropdown-choices-group"
      className="sc-course-assessment-choices-group sc-course-dropdown-choices-group"
    >
      <div
        data-bounded-scroll=""
        className="sc-course-assessment-choices-scroll sc-course-dropdown-choices-scroll sc-app-assessment-choices-scroll--authoring"
      >
        <NodeViewContent />
        {isEditable && (
          <AssessmentChoiceAddButton
            label="Add choice"
            contentEditable={false}
            onClick={addChoice}
          />
        )}
      </div>
      <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}
