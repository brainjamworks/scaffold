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

import {
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import {
  AssessmentChoiceAddButton,
  AssessmentChoiceAuthoringAction,
} from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import { authoringMovementSilhouetteSurfaceAttributes } from "@/editor/movement/view/authoring-movement-presentation";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { currentNodeViewPos, safeGetPos } from "@/editor/prosemirror/position/node-view-position";
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
} from "./matching-fields-shared";
import {
  addMatchingPair,
  canDeleteMatchingPair,
  deleteMatchingPair,
  setMatchingPairFeedback,
} from "./commands";
import "./Matching.css";

export {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorCoordinates,
  getMatchingConnectorPath,
  matchingFieldContent,
  matchingPairContent,
  reconcileMatchingMatches,
  resolveAuthorizedMatchingReveal,
} from "./matching-fields-shared";

export const MatchingItemNode = createMatchingItemNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingItemNodeView),
});

function MatchingItemNodeView() {
  return (
    <NodeViewWrapper
      data-slot="matching-item"
      className="sc-course-matching__field sc-course-matching__field--item"
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
      className="sc-course-matching__field sc-course-matching__field--target"
    >
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

export const MatchingPairNode = createMatchingPairNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairNodeView),
});

function MatchingPairNodeView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () =>
      createAuthoringContainedReorderProjection({
        axis: "vertical",
        getSiblingElements: (sourceElement) =>
          resolveAuthoringNodeViewSiblingElements(
            sourceElement,
            (element) => element.getAttribute("data-node") === "matching-pair",
          ),
        getSourceElement: () => presentationRef.current,
      }),
    [],
  );
  const pos = safeGetPos(props.getPos);
  const itemId = String(props.node.firstChild?.attrs["id"] ?? "");
  const targetId = String(props.node.lastChild?.attrs["id"] ?? "");
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
        placeholder: "Feedback for this item",
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
  const itemLabel = props.node.firstChild?.textContent.trim() || `Item ${pairIndex}`;
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
    deleteMatchingPair(props.editor, currentPos);
  };
  const deleteUnavailable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "matching_pair");
      return currentPos === null || !canDeleteMatchingPair(editor, currentPos);
    },
  });

  return (
    <NodeViewWrapper
      ref={presentationRef}
      data-node="matching-pair"
      data-item-id={itemId}
      data-target-id={targetId}
      {...containedMovementTargetAttributes()}
      role="group"
      aria-label={`Matching pair ${pairIndex}, ${itemLabel}`}
      className="sc-course-matching__pair"
    >
      <div
        {...authoringMovementSilhouetteSurfaceAttributes()}
        className="sc-course-matching__pair-grid"
      >
        <div className="sc-course-matching__move-cell">
          <ContainedMovementHandle
            getPresentationElement={() => presentationRef.current}
            getSourcePos={() => safeGetPos(props.getPos)}
            label={`Move matching pair ${pairIndex}, ${itemLabel}`}
            projection={reorderProjection}
            sourceKey={`${itemId}:${targetId}`}
            sourcePos={pos}
            className="sc-course-matching__move-action"
          />
        </div>
        <NodeViewContent className="sc-course-matching__pair-content" />
        <div className="sc-course-matching__pair-actions">
          <EditableOverlayPopover.Root>
            <EditableOverlayPopover.Trigger asChild>
              <AssessmentChoiceAuthoringAction
                active={hasFeedback}
                intent="feedback"
                label={
                  hasFeedback
                    ? `Edit feedback for item ‘${itemLabel}’`
                    : `Add feedback for item ‘${itemLabel}’`
                }
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
                  placeholder: "Feedback for this item",
                  syncKey: privateFeedback?.document,
                  target: feedbackTarget,
                }}
              />
            </EditableOverlayPopover.Portal>
          </EditableOverlayPopover.Root>
          <AssessmentChoiceAuthoringAction
            disabled={deleteUnavailable}
            onClick={() => {
              deletePair();
            }}
            label={`Delete matching pair ${pairIndex}`}
            intent="delete"
            {...(deleteUnavailable
              ? { unavailableReason: "Matching requires at least one pair." }
              : {})}
          >
            <Trash size={iconSm} />
          </AssessmentChoiceAuthoringAction>
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
  const addPair = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "matching_pairs_group");
    if (currentPos === null) return;
    addMatchingPair(props.editor, currentPos);
  };

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-course-matching__group"
    >
      <div data-bounded-scroll="" className="sc-course-matching__scroll">
        <div className="sc-course-matching__header">
          <span aria-hidden />
          <span>Items</span>
          <span>Matches</span>
          <span aria-hidden />
        </div>
        <NodeViewContent className="sc-course-matching__pair-list" />
        <AssessmentChoiceAddButton
          label="Add pair"
          contentEditable={false}
          onClick={addPair}
          className="sc-course-matching__add"
        />
      </div>
      <MatchingBoundedScrollHint />
    </NodeViewWrapper>
  );
}

function MatchingBoundedScrollHint() {
  return (
    <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
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
