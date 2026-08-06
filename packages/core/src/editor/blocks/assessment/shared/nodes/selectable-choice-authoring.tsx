import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { InfoIcon as Info } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef } from "react";

import { richTextDocumentToAssessmentFeedback } from "../model/private-assessment-attrs";
import { deleteAssessmentChoice } from "../model/delete-assessment-choice";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import { authoringMovementSnapshotChromeAttributes } from "@/editor/movement/view/authoring-movement-presentation";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { SelectableChoiceAttrsSchema, type SelectableChoiceAttrs } from "@/schemas/shared";
import { iconSm } from "@/ui/tokens/icon-sizes";
import {
  AssessmentChoiceAuthoringAction,
  AssessmentChoiceAuthoringRow,
} from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import {
  createSelectableChoiceNode,
  choiceCorrectnessUnavailableReason,
  emptyPrivateChoiceState,
  readPrivateChoiceState,
  setPrivateChoiceFeedback,
  toggleChoiceCorrect,
} from "./selectable-choice";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

export const SelectableChoiceAuthoringNode = createSelectableChoiceNode({
  addNodeView: () => ReactNodeViewRenderer(SelectableChoiceAuthoringNodeView),
});

function SelectableChoiceAuthoringNodeView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const parsed = SelectableChoiceAttrsSchema.safeParse(props.node.attrs);
  const attrs: SelectableChoiceAttrs = parsed.success ? parsed.data : { id: "" };
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `assessment-choice-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
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
    return resolveSelectableChoicePos(editor, props.getPos);
  };

  const privateChoiceState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos();
      return currentPos !== null
        ? readPrivateChoiceState(editor, currentPos, attrs.id)
        : emptyPrivateChoiceState;
    },
  });
  const choicePosition = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos !== null
        ? readSiblingPosition(editor, currentPos, "selectable_choice")
        : { count: 1, index: 1 };
    },
  });
  const correctnessUnavailableReason = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos === null
        ? undefined
        : choiceCorrectnessUnavailableReason(editor, currentPos);
    },
  });
  const pos = safeGetPos(props.getPos);
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateChoiceState.feedback?.document);
  const choiceLabel = props.node.textContent.trim() || `choice ${choicePosition.index}`;
  const fieldKey = `assessment:${attrs.id}:feedback`;

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = resolveSelectableChoicePos(latest.editor, latest.getPos);
        return currentPos !== null
          ? toTiptapRichTextDocument(
              readPrivateChoiceState(latest.editor, currentPos, attrs.id).feedback?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = resolveSelectableChoicePos(latest.editor, latest.getPos);
        if (currentPos === null) return;
        setPrivateChoiceFeedback(
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
    toggleChoiceCorrect(props.editor, currentPos);
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
      data-node="selectable-choice"
      data-choice-id={attrs.id}
      {...containedMovementTargetAttributes()}
    >
      <AssessmentChoiceAuthoringRow
        correct={privateChoiceState.isCorrect}
        correctnessLabel={`Toggle whether ${choiceLabel} is correct`}
        {...(correctnessUnavailableReason ? { correctnessUnavailableReason } : {})}
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

function resolveSelectableChoicePos(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
): number | null {
  const currentPos = safeGetPos(getPos);
  if (!isValidEditorDocPos(editor, currentPos)) return null;
  const currentNode = editor.state.doc.nodeAt(currentPos);
  return currentNode?.type.name === "selectable_choice" ? currentPos : null;
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
