import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { InfoIcon as Info } from "@phosphor-icons/react";
import { useEffect, useId, useMemo, useRef } from "react";

import { CHOICE_TRAILING_BTN, ChoiceAnswerItem } from "../chrome/ChoiceAnswerItem";
import { richTextDocumentToAssessmentFeedback } from "../model/private-assessment-attrs";
import { CONTAINED_MOVEMENT_TARGET_ATTR } from "@/editor/drag/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/drag/view/ContainedMovementHandle";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { cn } from "@/lib/cn";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { SelectableChoiceAttrsSchema, type SelectableChoiceAttrs } from "@/schemas/shared";
import { iconSm } from "@/ui/tokens/icon-sizes";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import {
  createSelectableChoiceNode,
  emptyPrivateChoiceState,
  readPrivateChoiceState,
  resolveChoiceAssessmentParent,
  setPrivateChoiceFeedback,
  toggleChoiceCorrect,
} from "./selectable-choice";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

export const SelectableChoiceAuthoringNode = createSelectableChoiceNode({
  addNodeView: () => ReactNodeViewRenderer(SelectableChoiceAuthoringNodeView),
});

function SelectableChoiceAuthoringNodeView(props: NodeViewProps) {
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
  const parentTypeName = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      if (currentPos === null) return null;
      return resolveChoiceAssessmentParent(editor, currentPos)?.typeName ?? null;
    },
  });
  const choiceIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentChoicePos(editor);
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "selectable_choice") : 1;
    },
  });
  const pos = safeGetPos(props.getPos);
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateChoiceState.feedback?.document);
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
    <NodeViewWrapper
      data-node="selectable-choice"
      data-choice-id={attrs.id}
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
    >
      <ChoiceAnswerItem
        id={attrs.id}
        inputType={parentTypeName === "multiselect" ? "checkbox" : "radio"}
        isCorrect={privateChoiceState.isCorrect}
        feedbackControl={feedbackControl}
        isEditable
        state={privateChoiceState.isCorrect ? "correct" : null}
        checked={privateChoiceState.isCorrect}
        submitted={false}
        disabled={false}
        onSelect={() => {}}
        onToggleCorrect={toggleCorrect}
        onDelete={deleteChoice}
        deleteLabel={`Delete choice ${choiceIndex}`}
        leading={
          <ContainedMovementHandle
            getSourcePos={() => safeGetPos(props.getPos)}
            label="choice"
            sourceKey={attrs.id}
            sourcePos={pos}
            className="sc-contained-movement-handle--row-offset"
          />
        }
      >
        <NodeViewContent />
      </ChoiceAnswerItem>
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
