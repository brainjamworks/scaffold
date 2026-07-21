import { InfoIcon as Info, TrashIcon as Trash } from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  CategorisePrivateAssessmentSchema,
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
  createCategoriseBinNode,
  createCategoriseBinTitleNode,
  createCategoriseBinsGroupNode,
  createCategoriseContentNode,
  createCategoriseItemBodyNode,
  createCategoriseItemNode,
  createCategoriseItemsGroupNode,
  fieldContent,
} from "./categorise-fields-shared";
import "./Categorise.css";

export {
  categoriseRevealFromAnswers,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
} from "./categorise-fields-shared";

export const CategoriseBinNode = createCategoriseBinNode({
  content: "categorise_bin_title categorise_items_group",
  addNodeView: () => ReactNodeViewRenderer(CategoriseBinNodeView),
});

function CategoriseBinNodeView(props: NodeViewProps) {
  const isEditable = useCategoriseEditorEditable(props.editor);
  const rawPos = safeGetPos(props.getPos);
  const pos = typeof rawPos === "number" ? rawPos : null;
  const binId = String(props.node.attrs["id"] ?? "");
  const binPosition = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_bin");
      return currentPos !== null
        ? readSiblingPosition(editor, currentPos, "categorise_bin")
        : { count: 1, index: 1 };
    },
  });
  const deleteBin = () => {
    if (!props.editor.isEditable) return;
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "categorise_bin");
    if (currentPos === null) return;
    deleteCategoriseBin(props.editor, currentPos, binId);
  };

  return (
    <NodeViewWrapper
      data-node="categorise-bin"
      data-bin-id={binId}
      role="group"
      aria-label={`Category ${binPosition.index}`}
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
      className="sc-categorise-bin"
    >
      <div className="sc-categorise-bin__header">
        {isEditable && (
          <ContainedMovementHandle
            getSourcePos={() => safeGetPos(props.getPos)}
            label={`category ${binPosition.index}`}
            sourceKey={binId}
            sourcePos={pos ?? undefined}
            className="sc-categorise-bin__move-handle"
          />
        )}
        <NodeViewContent className="sc-categorise-bin__content" />
        {isEditable && binPosition.count > 1 && (
          <button
            type="button"
            contentEditable={false}
            onClick={(event) => {
              event.stopPropagation();
              deleteBin();
            }}
            aria-label={`Delete category ${binPosition.index}`}
            data-no-select
            className={cn(
              CHOICE_TRAILING_BTN,
              "sc-choice-trailing-button--muted",
              "sc-choice-trailing-button--danger",
            )}
          >
            <Trash size={iconSm} />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CategoriseBinTitleNode = createCategoriseBinTitleNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseBinTitleNodeView),
});

function CategoriseBinTitleNodeView() {
  return (
    <NodeViewWrapper data-slot="categorise-bin-title" className="sc-categorise-bin__title">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const CategoriseBinsGroupNode = createCategoriseBinsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseBinsGroupNodeView),
});

function CategoriseBinsGroupNodeView(props: NodeViewProps) {
  const isEditable = useCategoriseEditorEditable(props.editor);
  const addBin = () => {
    if (!props.editor.isEditable) return;
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "categorise_bins_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    props.editor
      .chain()
      .focus()
      .insertContentAt(currentPos + currentNode.nodeSize - 1, {
        type: "categorise_bin",
        attrs: { id: createStableId() },
        content: [
          { type: "categorise_bin_title", content: fieldContent() },
          { type: "categorise_items_group" },
        ],
      })
      .run();
  };

  return (
    <NodeViewWrapper data-slot="categorise-bins-group" className="sc-categorise-bins-group">
      <NodeViewContent className="sc-categorise-bin-grid" />
      {isEditable && (
        <BlockAddGhost
          label="Add category"
          presentation="pill"
          contentEditable={false}
          onClick={addBin}
          className="sc-categorise-add"
        />
      )}
    </NodeViewWrapper>
  );
}

export const CategoriseItemBodyNode = createCategoriseItemBodyNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseItemBodyNodeView),
});

function CategoriseItemBodyNodeView() {
  return (
    <NodeViewWrapper data-slot="categorise-item-body" className="sc-categorise-item-body">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const CategoriseItemNode = createCategoriseItemNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseItemNodeView),
});

function CategoriseItemNodeView(props: NodeViewProps) {
  const isEditable = useCategoriseEditorEditable(props.editor);

  if (!isEditable) {
    return (
      <NodeViewWrapper
        data-node="categorise-item"
        data-item-id={String(props.node.attrs["id"] ?? "")}
        className="sc-categorise-item"
      >
        <NodeViewContent className="sc-categorise-item__content" />
      </NodeViewWrapper>
    );
  }

  return <CategoriseEditableItemNodeView {...props} />;
}

function CategoriseEditableItemNodeView(props: NodeViewProps) {
  const itemId = String(props.node.attrs["id"] ?? "");
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `categorise-item-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
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
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "categorise_item") : 1;
    },
  });
  const categoryIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null
        ? readAncestorSiblingIndex(editor, currentPos, "categorise_bin")
        : 1;
    },
  });
  const itemAssessment = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null
        ? readCategoriseItemAssessment(editor, currentPos, itemId)
        : { feedback: null };
    },
  });
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(itemAssessment.feedback?.document);
  const fieldKey = `categorise:${itemId}:feedback`;

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "categorise_item");
        return currentPos !== null
          ? toTiptapRichTextDocument(
              readCategoriseItemAssessment(latest.editor, currentPos, itemId).feedback?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "categorise_item");
        if (currentPos === null) return;
        setCategoriseItemFeedback(
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
    if (!props.editor.isEditable) return;
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "categorise_item");
    if (currentPos === null) return;
    deleteCategoriseItem(props.editor, currentPos, itemId);
  };

  return (
    <NodeViewWrapper
      data-node="categorise-item"
      data-item-id={itemId}
      className="sc-categorise-item sc-categorise-item--editable"
    >
      <div className="sc-categorise-item__row">
        <NodeViewContent className="sc-categorise-item__content" />
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
                syncKey: itemAssessment.feedback?.document,
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
          aria-label={`Delete item ${itemIndex} from category ${categoryIndex}`}
          data-no-select
          className={cn(
            CHOICE_TRAILING_BTN,
            "sc-choice-trailing-button--muted",
            "sc-choice-trailing-button--danger",
          )}
        >
          <Trash size={iconSm} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

export const CategoriseItemsGroupNode = createCategoriseItemsGroupNode({
  content: "categorise_item*",
  addNodeView: () => ReactNodeViewRenderer(CategoriseItemsGroupNodeView),
});

function CategoriseItemsGroupNodeView(props: NodeViewProps) {
  const isEditable = useCategoriseEditorEditable(props.editor);
  const categoryIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_items_group");
      return currentPos !== null
        ? readAncestorSiblingIndex(editor, currentPos, "categorise_bin")
        : 1;
    },
  });
  const addItem = () => {
    if (!props.editor.isEditable) return;
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "categorise_items_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    props.editor
      .chain()
      .focus()
      .insertContentAt(currentPos + currentNode.nodeSize - 1, {
        type: "categorise_item",
        attrs: { id: createStableId() },
        content: [{ type: "categorise_item_body", content: fieldContent() }],
      })
      .run();
  };

  return (
    <NodeViewWrapper data-slot="categorise-items-group" className="sc-categorise-items-group">
      <NodeViewContent className="sc-categorise-grid" />
      {isEditable && (
        <BlockAddGhost
          label={`Add item to category ${categoryIndex}`}
          presentation="pill"
          contentEditable={false}
          onClick={addItem}
          className="sc-categorise-add"
        />
      )}
    </NodeViewWrapper>
  );
}

export const CategoriseContentNode = createCategoriseContentNode({
  content: "categorise_bins_group",
  addNodeView: () => ReactNodeViewRenderer(CategoriseContentNodeView),
});

function CategoriseContentNodeView() {
  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="categorise-content"
      className="sc-categorise-content"
    >
      <div data-assessment-bounded-scroll="" className="sc-categorise-content-scroll">
        <NodeViewContent className="sc-categorise-content-flow" />
      </div>
      <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
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

function useCategoriseEditorEditable(editor: NodeViewProps["editor"]): boolean {
  const [isEditable, setIsEditable] = useState(editor.isEditable);

  useEffect(() => {
    const syncEditable = () => setIsEditable(editor.isEditable);
    editor.on("update", syncEditable);
    return () => {
      editor.off("update", syncEditable);
    };
  }, [editor]);

  return isEditable;
}

function readSiblingIndex(editor: NodeViewProps["editor"], pos: number, typeName: string): number {
  return readSiblingPosition(editor, pos, typeName).index;
}

function readAncestorSiblingIndex(
  editor: NodeViewProps["editor"],
  pos: number,
  ancestorTypeName: string,
): number {
  const $pos = editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name !== ancestorTypeName) continue;
    return readSiblingIndex(editor, $pos.before(depth), ancestorTypeName);
  }
  return 1;
}

function readCategoriseItemAssessment(
  editor: NodeViewProps["editor"],
  itemPos: number,
  itemId: string,
): {
  feedback: AssessmentFeedbackContent | null;
} {
  const parent = resolveAssessmentAttrParent(editor, itemPos, ["categorise"]);
  if (!parent || !itemId) return { feedback: null };
  const assessment = CategorisePrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return {
    feedback: assessment.feedbackByItemId[itemId] ?? null,
  };
}

function deleteCategoriseBin(editor: NodeViewProps["editor"], binPos: number, binId: string) {
  if (!editor.isEditable) return;
  const currentNode = editor.state.doc.nodeAt(binPos);
  if (!currentNode || currentNode.type.name !== "categorise_bin") return;
  if (editor.state.doc.resolve(binPos).parent.childCount <= 1) return;

  const parent = resolveAssessmentAttrParent(editor, binPos, ["categorise"]);
  let transaction = editor.state.tr;

  if (parent && binId) {
    const assessment = CategorisePrivateAssessmentSchema.parse(
      parent.node.attrs["assessment"] ?? {},
    );
    const feedbackByItemId = { ...assessment.feedbackByItemId };
    currentNode.descendants((node) => {
      if (node.type.name !== "categorise_item") return;
      const itemId = String(node.attrs["id"] ?? "");
      if (itemId) delete feedbackByItemId[itemId];
    });
    transaction = transaction.setNodeMarkup(parent.pos, null, {
      ...parent.node.attrs,
      assessment: {
        ...assessment,
        feedbackByItemId,
      },
    });
  }

  editor.view.focus();
  editor.view.dispatch(transaction.delete(binPos, binPos + currentNode.nodeSize));
}

function deleteCategoriseItem(editor: NodeViewProps["editor"], itemPos: number, itemId: string) {
  if (!editor.isEditable) return;
  const currentNode = editor.state.doc.nodeAt(itemPos);
  if (!currentNode || currentNode.type.name !== "categorise_item") return;

  const parent = resolveAssessmentAttrParent(editor, itemPos, ["categorise"]);
  let transaction = editor.state.tr;

  if (parent && itemId) {
    const assessment = CategorisePrivateAssessmentSchema.parse(
      parent.node.attrs["assessment"] ?? {},
    );
    const feedbackByItemId = { ...assessment.feedbackByItemId };
    delete feedbackByItemId[itemId];
    transaction = transaction.setNodeMarkup(parent.pos, null, {
      ...parent.node.attrs,
      assessment: {
        ...assessment,
        feedbackByItemId,
      },
    });
  }

  editor.view.focus();
  editor.view.dispatch(transaction.delete(itemPos, itemPos + currentNode.nodeSize));
}

function setCategoriseItemFeedback(
  editor: NodeViewProps["editor"],
  itemPos: number | null,
  itemId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  if (!editor.isEditable || itemPos === null || !itemId) return;
  const parent = resolveAssessmentAttrParent(editor, itemPos, ["categorise"]);
  if (!parent) return;
  const assessment = CategorisePrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByItemId: nextAssessmentFeedbackRecord(assessment.feedbackByItemId, itemId, feedback),
  });
}
