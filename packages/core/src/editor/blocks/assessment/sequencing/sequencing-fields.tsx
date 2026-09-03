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
  SequencingSettingsSchema,
  type AssessmentFeedbackContent,
} from "@scaffold/contracts";

import {
  AssessmentChoiceAddButton,
  AssessmentChoiceAuthoringAction,
} from "@/ui/components/course/AssessmentChoiceAuthoringRow/AssessmentChoiceAuthoringRow";
import {
  nextAssessmentFeedbackRecord,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
  setAssessmentAttr,
} from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import {
  ContainedMovementHandle,
  type ContainedMovementHandleProps,
} from "@/editor/movement/view/ContainedMovementHandle";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import { currentNodeViewPos, safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { assessmentPromptDomId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { isAssessmentQuestionNode } from "@/editor/blocks/assessment/shared/nodes/assessment-meta";
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
  sequencingReorderLabel,
} from "@/editor/assessment/sequencing/sequencing-fields-shared";
import { createSequencingAuthoringReorderProjection } from "./sequencing-authoring-reorder-projection";
import { addSequencingItem, deleteSequencingItem } from "./commands";
import "@/editor/assessment/sequencing/Sequencing.css";

export {
  describeSequencingItemAccessibilityState,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  reconcileSequencingOrder,
  revealedSequenceAssessment,
  revealedSequenceOrder,
  resolveAuthorizedSequenceOrder,
} from "@/editor/assessment/sequencing/sequencing-fields-shared";

export const SequencingItemNode = createSequencingItemNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemNodeView),
});

function SequencingItemNodeView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () => createSequencingAuthoringReorderProjection(() => presentationRef.current),
    [],
  );
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
        placeholder: "Feedback for this item",
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
  const itemCount = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "sequencing_item");
      return currentPos !== null ? editor.state.doc.resolve(currentPos).parent.childCount : 0;
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
    props.editor.commands.focus();
    deleteSequencingItem(props.editor, currentPos);
  };
  const deleteUnavailable = itemCount <= 2;
  const reorderLabel = sequencingReorderLabel(props.node.textContent, itemIndex, itemCount);

  return (
    <NodeViewWrapper
      ref={presentationRef}
      role="listitem"
      data-node="sequencing-item"
      data-item-id={itemId}
      {...containedMovementTargetAttributes()}
      className="sc-course-sequencing__item"
    >
      <span contentEditable={false} aria-hidden="true" className="sc-course-sequencing__position">
        {itemIndex}
      </span>
      <SequencingAuthoringMovementAction
        getPresentationElement={() => presentationRef.current}
        getSourcePos={() => safeGetPos(props.getPos)}
        label={reorderLabel}
        projection={reorderProjection}
        sourceKey={itemId}
        sourcePos={pos}
      />
      <div className="sc-course-sequencing__item-content">
        <NodeViewContent />
      </div>
      <EditableOverlayPopover.Root>
        <EditableOverlayPopover.Trigger asChild>
          <AssessmentChoiceAuthoringAction
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
              placeholder: "Feedback for this item",
              syncKey: privateFeedback?.document,
              target: feedbackTarget,
            }}
          />
        </EditableOverlayPopover.Portal>
      </EditableOverlayPopover.Root>
      <AssessmentChoiceAuthoringAction
        disabled={deleteUnavailable}
        intent="delete"
        onClick={() => {
          deleteItem();
        }}
        label={`Delete sequencing item ${itemIndex}`}
        owner="app"
        {...(deleteUnavailable
          ? { unavailableReason: "Sequencing requires at least two items." }
          : {})}
      >
        <Trash size={iconSm} />
      </AssessmentChoiceAuthoringAction>
    </NodeViewWrapper>
  );
}

function SequencingAuthoringMovementAction({
  getPresentationElement,
  getSourcePos,
  label,
  projection,
  sourceKey,
  sourcePos,
}: {
  getPresentationElement: () => HTMLElement | null;
  getSourcePos: () => number | null | undefined;
  label: string;
  projection: NonNullable<ContainedMovementHandleProps["projection"]>;
  sourceKey: string;
  sourcePos: number | null | undefined;
}) {
  return (
    <ContainedMovementHandle
      getPresentationElement={getPresentationElement}
      getSourcePos={getSourcePos}
      label={label}
      projection={projection}
      sourceKey={sourceKey}
      sourcePos={sourcePos}
    />
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
  const group = authoringSequencingGroup(props);

  const addItem = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "sequencing_items_group");
    if (currentPos === null) return;
    props.editor.commands.focus();
    addSequencingItem(props.editor, currentPos);
  };

  return (
    <NodeViewWrapper
      data-assessment-interaction-content=""
      data-bounded-scroll-frame=""
      data-sequencing-density={props.node.childCount >= 6 ? "compact" : "comfortable"}
      data-slot="sequencing-items-group"
      className="sc-course-sequencing__group"
    >
      <div data-bounded-scroll="" className="sc-course-sequencing__scroll">
        <NodeViewContent<"div">
          as="div"
          role="list"
          aria-label={group.legend || undefined}
          aria-labelledby={group.legend ? undefined : assessmentPromptDomId(group.authoredBlockId)}
          className="sc-course-sequencing__list"
        />
        <AssessmentChoiceAddButton
          className="sc-app-sequencing-add-item"
          label="Add item"
          leading={
            <span aria-hidden="true" className="sc-app-sequencing-add-item__position">
              {props.node.childCount + 1}
            </span>
          }
          contentEditable={false}
          onClick={addItem}
        />
      </div>
      <SequencingBoundedScrollHint />
    </NodeViewWrapper>
  );
}

function authoringSequencingGroup(props: NodeViewProps): {
  authoredBlockId: string | null;
  legend: string;
} {
  const pos = safeGetPos(props.getPos);
  if (typeof pos !== "number") return { authoredBlockId: null, legend: "" };
  const resolved = props.editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!isAssessmentQuestionNode(node)) continue;
    const id = node.attrs["id"];
    const settings = SequencingSettingsSchema.safeParse(node.attrs["settings"] ?? {});
    return {
      authoredBlockId: typeof id === "string" && id.trim() ? id : null,
      legend: settings.success ? (settings.data.legend?.trim() ?? "") : "",
    };
  }
  return { authoredBlockId: null, legend: "" };
}

function SequencingBoundedScrollHint() {
  return (
    <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
      Scroll for more ↓
    </div>
  );
}

function readSequencingItemFeedback(
  editor: NodeViewProps["editor"],
  itemPos: number,
  itemId: string,
): AssessmentFeedbackContent | null {
  const parent = resolveAssessmentAttrParent(editor, itemPos, [
    "sequencing",
    "surface_sequencing_question",
  ]);
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
  const parent = resolveAssessmentAttrParent(editor, itemPos, [
    "sequencing",
    "surface_sequencing_question",
  ]);
  if (!parent || !itemId) return;
  const assessment = SequencingPrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByItemId: nextAssessmentFeedbackRecord(assessment.feedbackByItemId, itemId, feedback),
  });
}
