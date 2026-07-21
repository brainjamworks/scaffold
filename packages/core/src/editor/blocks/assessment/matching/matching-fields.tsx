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
  MatchingPrivateAssessmentSchema,
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
  createMatchingItemNode,
  createMatchingPairNode,
  createMatchingPairsGroupNode,
  createMatchingTargetNode,
  matchingPairContent,
} from "./matching-fields-shared";
import "./Matching.css";

export {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorPath,
  matchingFieldContent,
  matchingPairContent,
} from "./matching-fields-shared";

export const MatchingItemNode = createMatchingItemNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingItemNodeView),
});

function MatchingItemNodeView() {
  return (
    <NodeViewWrapper
      data-slot="matching-item"
      className="sc-matching-field sc-matching-field--item"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const MatchingTargetNode = createMatchingTargetNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingTargetNodeView),
});

function MatchingTargetNodeView() {
  return (
    <NodeViewWrapper
      data-slot="matching-target"
      className="sc-matching-field sc-matching-field--target"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const MatchingPairNode = createMatchingPairNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairNodeView),
});

function MatchingPairNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const itemId = String(props.node.attrs["itemId"] ?? "");
  const targetId = String(props.node.attrs["targetId"] ?? "");
  const popoverId = useId();
  const richTextPluginKey = useMemo(
    () => `matching-item-feedback-rich-text-${popoverId.replace(/[^A-Za-z0-9_-]/g, "")}`,
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
  const pairIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "matching_pair");
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "matching_pair") : 1;
    },
  });
  const privateFeedback = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "matching_pair");
      return currentPos !== null ? readMatchingPairFeedback(editor, currentPos, itemId) : null;
    },
  });
  const hasFeedback = !isScaffoldRichTextDocumentEmpty(privateFeedback?.document);
  const fieldKey = `matching:${itemId}:feedback`;

  useEffect(() => {
    latestTargetContext.current = { editor: props.editor, getPos: props.getPos };
  }, [props.editor, props.getPos]);

  const feedbackTarget = useMemo(
    () => ({
      kind: "attr" as const,
      read: () => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "matching_pair");
        return currentPos !== null
          ? toTiptapRichTextDocument(
              readMatchingPairFeedback(latest.editor, currentPos, itemId)?.document,
            )
          : null;
      },
      write: (nextDocument: ScaffoldRichTextDocument) => {
        const latest = latestTargetContext.current;
        const currentPos = currentNodeViewPos(latest.editor, latest.getPos, "matching_pair");
        if (currentPos === null) return;
        setMatchingPairFeedback(
          latest.editor,
          currentPos,
          itemId,
          richTextDocumentToAssessmentFeedback(nextDocument),
        );
      },
    }),
    [itemId],
  );
  const deletePair = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "matching_pair");
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
      data-node="matching-pair"
      data-item-id={itemId}
      data-target-id={targetId}
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
      className="sc-matching-pair"
    >
      <div className="sc-matching-pair__grid">
        <div className="sc-matching-pair__move-cell">
          <ContainedMovementHandle
            getSourcePos={() => safeGetPos(props.getPos)}
            label="matching pair"
            sourceKey={`${itemId}:${targetId}`}
            sourcePos={pos}
            className="sc-matching-pair__move-handle"
          />
        </div>
        <NodeViewContent className="sc-matching-pair__content" />
        <div className="sc-matching-pair__actions">
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
              deletePair();
            }}
            aria-label={`Delete matching pair ${pairIndex}`}
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
      </div>
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

export const MatchingPairsGroupNode = createMatchingPairsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairsGroupNodeView),
});

function MatchingPairsGroupNodeView(props: NodeViewProps) {
  const correctPairs = useMemo(() => {
    const pairs: Array<{ itemId: string; targetId: string }> = [];
    props.node.forEach((pair) => {
      if (pair.type.name !== "matching_pair") return;
      const itemId = String(pair.attrs["itemId"] ?? "");
      const targetId = String(pair.attrs["targetId"] ?? "");
      if (itemId && targetId) pairs.push({ itemId, targetId });
    });
    return pairs;
  }, [props.node]);

  const addPair = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "matching_pairs_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    const targetId = createStableId();
    props.editor
      .chain()
      .focus()
      .insertContentAt(currentPos + currentNode.nodeSize - 1, {
        type: "matching_pair",
        attrs: {
          itemId: createStableId(),
          targetId,
        },
        content: matchingPairContent(),
      })
      .run();
  };

  useEffect(() => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "matching_pairs_group");
    if (currentPos === null) return;
    syncMatchingCorrectPairs(props.editor, currentPos, correctPairs);
  }, [correctPairs, props.editor, props.getPos]);

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-matching-pairs-group"
    >
      <div data-assessment-bounded-scroll="" className="sc-matching-pairs-scroll">
        <div className="sc-matching-pairs-header">
          <span aria-hidden />
          <span>Items</span>
          <span>Matches</span>
          <span aria-hidden />
        </div>
        <NodeViewContent className="sc-matching-pairs-list" />
        <BlockAddGhost
          label="Add pair"
          presentation="pill"
          contentEditable={false}
          onClick={addPair}
          className="sc-matching-add"
        />
      </div>
      <MatchingBoundedScrollHint />
    </NodeViewWrapper>
  );
}

function MatchingBoundedScrollHint() {
  return (
    <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
      Scroll for more ↓
    </div>
  );
}

function readMatchingPairFeedback(
  editor: NodeViewProps["editor"],
  pairPos: number,
  itemId: string,
): AssessmentFeedbackContent | null {
  const parent = resolveAssessmentAttrParent(editor, pairPos, ["matching"]);
  if (!parent || !itemId) return null;
  const assessment = MatchingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return assessment.feedbackByItemId[itemId] ?? null;
}

function setMatchingPairFeedback(
  editor: NodeViewProps["editor"],
  pairPos: number,
  itemId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  const parent = resolveAssessmentAttrParent(editor, pairPos, ["matching"]);
  if (!parent || !itemId) return;
  const assessment = MatchingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByItemId: nextAssessmentFeedbackRecord(assessment.feedbackByItemId, itemId, feedback),
  });
}

function syncMatchingCorrectPairs(
  editor: NodeViewProps["editor"],
  groupPos: number,
  correctPairs: Array<{ itemId: string; targetId: string }>,
) {
  const parent = resolveAssessmentAttrParent(editor, groupPos, ["matching"]);
  if (!parent) return;
  const assessment = MatchingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  const same =
    assessment.correctPairs.length === correctPairs.length &&
    correctPairs.every((pair, index) => {
      const existing = assessment.correctPairs[index];
      return existing?.itemId === pair.itemId && existing.targetId === pair.targetId;
    });
  if (same) return;
  setAssessmentAttr(editor, parent, {
    ...assessment,
    correctPairs,
  });
}
