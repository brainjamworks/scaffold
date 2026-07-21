import { InfoIcon as Info, TrashIcon as Trash } from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useId, useMemo, useRef } from "react";
import {
  SequencingPrivateAssessmentSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import { CHOICE_TRAILING_BTN } from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import {
  nextAssessmentFeedbackRecord,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { CONTAINED_MOVEMENT_TARGET_ATTR } from "@/editor/drag/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/drag/view/ContainedMovementHandle";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { currentNodeViewPos, safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { createStableId } from "@/document/model/identity/stable-ids";
import { cn } from "@/lib/cn";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import {
  createSequencingItemNode,
  createSequencingItemsGroupNode,
  itemContent,
} from "./sequencing-fields-shared";
import "./Sequencing.css";

export {
  describeSequencingItemAccessibilityState,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  revealedSequenceAssessment,
  revealedSequenceOrder,
} from "./sequencing-fields-shared";

export const SequencingItemNode = createSequencingItemNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemNodeView),
});

function SequencingItemNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const itemId = String(props.node.attrs["id"] ?? "");
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `sequencing-item-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
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
  const itemIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "sequencing_item");
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "sequencing_item") : 1;
    },
  });
  const privateFeedback = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "sequencing_item");
      return currentPos !== null ? readSequencingItemFeedback(editor, currentPos, itemId) : null;
    },
  });
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateFeedback?.document);
  const fieldKey = `sequencing:${itemId}:feedback`;

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "sequencing_item");
        return currentPos !== null
          ? toTiptapRichTextDocument(
              readSequencingItemFeedback(latest.editor, currentPos, itemId)?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "sequencing_item");
        if (currentPos === null) return;
        setSequencingItemFeedback(
          latest.editor,
          currentPos,
          itemId,
          richTextDocumentToAssessmentFeedback(nextDocument),
        );
      },
    }),
    [itemId],
  );
  const deleteItem = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "sequencing_item");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: currentPos, to: currentPos + currentNode.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      data-node="sequencing-item"
      data-item-id={itemId}
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
      className="sc-sequencing-item"
    >
      <ContainedMovementHandle
        getSourcePos={() => safeGetPos(props.getPos)}
        label="sequencing item"
        sourceKey={itemId}
        sourcePos={pos}
        className="sc-contained-movement-handle--row-offset"
      />
      <div className="sc-sequencing-item__content">
        <NodeViewContent />
      </div>
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
              syncKey: privateFeedback?.document,
              target: feedbackTarget,
            }}
          />
        </EditableOverlayPopover.Portal>
      </EditableOverlayPopover.Root>
      <button
        type="button"
        contentEditable={false}
        onClick={(e) => {
          e.stopPropagation();
          deleteItem();
        }}
        aria-label={`Delete sequencing item ${itemIndex}`}
        data-no-select
        className={cn(CHOICE_TRAILING_BTN, "sc-choice-trailing-button--danger")}
      >
        <Trash size={iconSm} />
      </button>
    </NodeViewWrapper>
  );
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

export const SequencingItemsGroupNode = createSequencingItemsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemsGroupNodeView),
});

function SequencingItemsGroupNodeView(props: NodeViewProps) {
  const docOrderIds = useMemo(() => {
    const ids: string[] = [];
    props.node.forEach((child) => {
      if (child.type.name !== "sequencing_item") return;
      const id = String(child.attrs["id"] ?? "");
      if (id) ids.push(id);
    });
    return ids;
  }, [props.node]);

  useEffect(() => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "sequencing_items_group");
    if (currentPos === null) return;
    syncSequencingCorrectOrder(props.editor, currentPos, docOrderIds);
  }, [docOrderIds, props.editor, props.getPos]);

  const addItem = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "sequencing_items_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    props.editor
      .chain()
      .focus()
      .insertContentAt(currentPos + currentNode.nodeSize - 1, {
        type: "sequencing_item",
        attrs: { id: createStableId() },
        content: itemContent(),
      })
      .run();
  };

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="sequencing-items-group"
      className="sc-sequencing-items-group"
    >
      <div data-assessment-bounded-scroll="" className="sc-sequencing-items-scroll">
        <NodeViewContent className="sc-sequencing-items-content" />
        <BlockAddGhost
          label="Add item"
          presentation="pill"
          contentEditable={false}
          onClick={addItem}
          className="sc-sequencing-add"
        />
      </div>
      <SequencingBoundedScrollHint />
    </NodeViewWrapper>
  );
}

function SequencingBoundedScrollHint() {
  return (
    <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
      Scroll for more ↓
    </div>
  );
}

function readSequencingItemFeedback(
  editor: NodeViewProps["editor"],
  itemPos: number,
  itemId: string,
): AssessmentFeedbackContent | null {
  const parent = resolveAssessmentAttrParent(editor, itemPos, ["sequencing"]);
  if (!parent || !itemId) return null;
  const assessment = SequencingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return assessment.feedbackByItemId[itemId] ?? null;
}

function setSequencingItemFeedback(
  editor: NodeViewProps["editor"],
  itemPos: number,
  itemId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  const parent = resolveAssessmentAttrParent(editor, itemPos, ["sequencing"]);
  if (!parent || !itemId) return;
  const assessment = SequencingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByItemId: nextAssessmentFeedbackRecord(assessment.feedbackByItemId, itemId, feedback),
  });
}

function syncSequencingCorrectOrder(
  editor: NodeViewProps["editor"],
  groupPos: number,
  itemIds: readonly string[],
) {
  const parent = resolveAssessmentAttrParent(editor, groupPos, ["sequencing"]);
  if (!parent) return;
  const assessment = SequencingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  const same =
    assessment.correctOrder.length === itemIds.length &&
    itemIds.every((id, index) => assessment.correctOrder[index] === id);
  if (same) return;
  setAssessmentAttr(editor, parent, {
    ...assessment,
    correctOrder: [...itemIds],
  });
}
