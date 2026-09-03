import {
  CaretDownIcon as CaretDown,
  DotsThreeIcon as DotsThree,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
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
  CategoriseSettingsSchema,
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
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import {
  createAuthoringContainedReorderProjection,
  resolveAuthoringNodeViewSiblingElements,
} from "@/editor/movement/view/authoring-contained-reorder-projection";
import {
  authoringMovementSnapshotChromeAttributes,
  type AuthoringContainedMovementProjection,
  type AuthoringContainedMovementStrategy,
} from "@/editor/movement/view/authoring-movement-presentation";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import { EditableOverlayPopover } from "@/editor/rich-text/authoring/nested-overlay/EditableOverlayPopoverShell";
import {
  AUTHORING_CHROME_SUPPRESSION_ATTR,
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { currentNodeViewPos, safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { assessmentPromptDomId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { Select } from "@/ui/components/Select/Select";
import * as SelectMenu from "@/ui/components/Select/SelectMenu";
import { zIndex } from "@/ui/overlays/z-index";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import {
  createCategoriseBinNode,
  createCategoriseBinTitleNode,
  createCategoriseBinsGroupNode,
  createCategoriseContentNode,
  createCategoriseItemBodyNode,
  createCategoriseItemNode,
  createCategoriseItemsGroupNode,
  categoriseCategoryPublicLabel,
  categoriseItemPublicLabel,
} from "./categorise-fields-shared";
import {
  addCategoriseCategory,
  addCategoriseItem,
  applyCategoriseItemMovement,
  canApplyCategoriseItemMovement,
  canDeleteCategoriseCategory,
  canDeleteCategoriseItem,
  canNavigateCategoriseItemMovement,
  canTargetCategoriseItemMovement,
  deleteCategoriseCategory,
  deleteCategoriseItem,
  describeCategoriseItemMovementDestination,
  reassignCategoriseItem,
} from "./commands";
import { createCategoriseItemAuthoringReorderProjection } from "./categorise-authoring-reorder-projection";
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
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () =>
      createAuthoringContainedReorderProjection({
        axis: "vertical",
        getSiblingElements: (sourceElement) =>
          resolveAuthoringNodeViewSiblingElements(
            sourceElement,
            (element) => element.getAttribute("data-node") === "categorise-bin",
          ),
        getSourceElement: () => presentationRef.current,
      }),
    [],
  );
  const isEditable = useCategoriseEditorEditable(props.editor);
  const rawPos = safeGetPos(props.getPos);
  const pos = typeof rawPos === "number" ? rawPos : null;
  const categoryId = String(props.node.attrs["id"] ?? "");
  const binPosition = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_bin");
      return currentPos !== null
        ? readSiblingPosition(editor, currentPos, "categorise_bin")
        : { count: 1, index: 1 };
    },
  });
  const [expanded, setExpanded] = useState(binPosition.index === 1);
  const deleteBin = () => {
    if (!props.editor.isEditable) return;
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "categorise_bin");
    if (currentPos === null) return;
    deleteCategoriseCategory(props.editor, currentPos);
  };
  const deleteUnavailable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_bin");
      return currentPos === null || !canDeleteCategoriseCategory(editor, currentPos);
    },
  });
  const categoryLabel = categoriseCategoryPublicLabel(
    props.node.firstChild?.textContent ?? "",
    binPosition.index,
  );

  return (
    <NodeViewWrapper
      ref={presentationRef}
      data-node="categorise-bin"
      data-bin-id={categoryId}
      data-expanded={expanded ? "true" : "false"}
      role="group"
      aria-label={`Category ‘${categoryLabel}’`}
      {...containedMovementTargetAttributes()}
      className="sc-course-categorise__bin"
    >
      <div className="sc-course-categorise__bin-header">
        {isEditable && (
          <CategoriseAuthoringMovementAction
            getPresentationElement={() => presentationRef.current}
            getSourcePos={() => safeGetPos(props.getPos)}
            label={`category ${binPosition.index}, ${categoryLabel}`}
            projection={reorderProjection}
            sourceKey={categoryId}
            sourcePos={pos ?? undefined}
          />
        )}
        <NodeViewContent className="sc-course-categorise__bin-content" />
        {isEditable && (
          <>
            <AssessmentChoiceAuthoringAction
              active={expanded}
              aria-expanded={expanded}
              className="sc-app-categorise__category-disclosure"
              data-categorise-category-disclosure=""
              onClick={() => setExpanded((current) => !current)}
              label={`${expanded ? "Collapse" : "Expand"} category ${binPosition.index}, ${categoryLabel}`}
              intent="options"
              owner="app"
            >
              <CaretDown size={iconSm} weight="bold" />
            </AssessmentChoiceAuthoringAction>
            <AssessmentChoiceAuthoringAction
              className="sc-app-categorise__delete-category"
              onClick={() => {
                deleteBin();
              }}
              label={`Delete category ${binPosition.index}`}
              intent="delete"
              owner="app"
              {...(deleteUnavailable
                ? { unavailableReason: "Categorise requires two categories and one item." }
                : {})}
            >
              <Trash size={iconSm} />
            </AssessmentChoiceAuthoringAction>
          </>
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
    <NodeViewWrapper data-slot="categorise-bin-title" className="sc-course-categorise__bin-title">
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
    addCategoriseCategory(props.editor, currentPos);
  };

  return (
    <NodeViewWrapper data-slot="categorise-bins-group" className="sc-course-categorise__bins">
      <NodeViewContent className="sc-course-categorise__bin-grid sc-course-categorise__bin-grid--authoring" />
      {isEditable && (
        <AssessmentChoiceAddButton
          label="Add category"
          contentEditable={false}
          onClick={addBin}
          className="sc-app-categorise__add"
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
    <NodeViewWrapper data-slot="categorise-item-body" className="sc-course-categorise__item-body">
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
        className="sc-course-categorise__item"
      >
        <NodeViewContent className="sc-course-categorise__item-content" />
      </NodeViewWrapper>
    );
  }

  return <CategoriseEditableItemNodeView {...props} />;
}

function CategoriseEditableItemNodeView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () => createCategoriseItemAuthoringReorderProjection(() => presentationRef.current),
    [],
  );
  const movementStrategy = useMemo<AuthoringContainedMovementStrategy>(
    () => ({
      apply: applyCategoriseItemMovement,
      canApply: canApplyCategoriseItemMovement,
      canNavigateKeyboard: canNavigateCategoriseItemMovement,
      canTarget: canTargetCategoriseItemMovement,
      describeDestination: (editor, source, intent) =>
        describeCategoriseItemMovementDestination(editor, source, intent),
      keyboardNavigation: "spatial",
    }),
    [],
  );
  const itemId = String(props.node.attrs["id"] ?? "");
  const pos = safeGetPos(props.getPos);
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
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null ? readSiblingIndex(editor, currentPos, "categorise_item") : 1;
    },
  });
  const itemLabel = categoriseItemPublicLabel(props.node.textContent, itemIndex);
  const categoryIndex = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null
        ? readAncestorSiblingIndex(editor, currentPos, "categorise_bin")
        : 1;
    },
  });
  const categoryOptions = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos !== null
        ? readCategoriseCategoryOptions(editor, currentPos)
        : { currentCategoryId: "", options: [] };
    },
  });
  const deleteUnavailable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const currentPos = currentNodeViewPos(editor, props.getPos, "categorise_item");
      return currentPos === null || !canDeleteCategoriseItem(editor, currentPos);
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
    deleteCategoriseItem(props.editor, currentPos);
  };

  return (
    <NodeViewWrapper
      ref={presentationRef}
      data-node="categorise-item"
      data-item-id={itemId}
      role="group"
      aria-label={`Item ‘${itemLabel}’`}
      {...containedMovementTargetAttributes()}
      className="sc-course-categorise__item sc-course-categorise__item--editable"
    >
      <div className="sc-course-categorise__item-row">
        <ContainedMovementHandle
          getPresentationElement={() => presentationRef.current}
          getSourcePos={() => safeGetPos(props.getPos)}
          label={`item ${itemIndex} in category ${categoryIndex}`}
          projection={reorderProjection}
          sourceKey={itemId}
          sourcePos={pos}
          strategy={movementStrategy}
          className="sc-app-contained-movement-handle--row-offset"
        />
        <NodeViewContent className="sc-course-categorise__item-content" />
        <EditableOverlayPopover.Root>
          <EditableOverlayPopover.Trigger asChild>
            <AssessmentChoiceAuthoringAction
              active={hasFeedback}
              className="sc-app-categorise__item-options-trigger"
              intent="options"
              label={`Item options for ‘${itemLabel}’`}
              owner="app"
            >
              <DotsThree size={iconSm} weight="bold" />
            </AssessmentChoiceAuthoringAction>
          </EditableOverlayPopover.Trigger>
          <EditableOverlayPopover.Portal>
            <EditableOverlayPopover.Content
              align="start"
              description="Move this answer, edit its feedback or remove it."
              footerStart={
                <div className="sc-app-categorise__item-options-move">
                  <span className="sc-app-categorise__item-options-label">Move to</span>
                  <CategoriseAuthoringCategorySelect
                    categories={categoryOptions.options}
                    itemLabel={itemLabel}
                    value={categoryOptions.currentCategoryId}
                    onValueChange={(categoryId) => {
                      const currentPos = currentNodeViewPos(
                        props.editor,
                        props.getPos,
                        "categorise_item",
                      );
                      if (currentPos !== null) {
                        reassignCategoriseItem(props.editor, currentPos, categoryId);
                      }
                    }}
                  />
                </div>
              }
              footerEnd={
                <EditableOverlayPopover.TextAction
                  aria-label="Delete item"
                  disabled={deleteUnavailable}
                  onClick={() => {
                    deleteItem();
                  }}
                  title={deleteUnavailable ? "Categorise requires at least one item." : undefined}
                  tone="danger"
                >
                  <Trash size={iconSm} aria-hidden />
                  Delete item
                </EditableOverlayPopover.TextAction>
              }
              icon={<DotsThree size={iconSm} weight="bold" />}
              side="bottom"
              title="Item options"
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
                syncKey: itemAssessment.feedback?.document,
                target: feedbackTarget,
              }}
            />
          </EditableOverlayPopover.Portal>
        </EditableOverlayPopover.Root>
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
    addCategoriseItem(props.editor, currentPos);
  };

  return (
    <NodeViewWrapper data-slot="categorise-items-group" className="sc-course-categorise__items">
      <NodeViewContent className="sc-course-categorise__item-grid" />
      {isEditable && (
        <AssessmentChoiceAddButton
          label={`Add item to category ${categoryIndex}`}
          contentEditable={false}
          onClick={addItem}
          className="sc-app-categorise__add"
        />
      )}
    </NodeViewWrapper>
  );
}

export const CategoriseContentNode = createCategoriseContentNode({
  content: "categorise_bins_group",
  addNodeView: () => ReactNodeViewRenderer(CategoriseContentNodeView),
});

function CategoriseContentNodeView(props: NodeViewProps) {
  const group = authoringCategoriseGroup(props);
  return (
    <NodeViewWrapper
      data-assessment-interaction-content=""
      data-bounded-scroll-frame=""
      data-categorise-presentation="authoring-outline"
      data-slot="categorise-content"
      className="sc-course-categorise__content"
    >
      <div data-bounded-scroll="" className="sc-course-categorise__scroll">
        <NodeViewContent
          role="group"
          aria-label={group.legend || undefined}
          aria-labelledby={group.legend ? undefined : assessmentPromptDomId(group.authoredBlockId)}
          className="sc-course-categorise__flow"
        />
      </div>
      <div data-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function CategoriseAuthoringMovementAction({
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
  projection: AuthoringContainedMovementProjection;
  sourceKey: string;
  sourcePos: number | null | undefined;
}) {
  return (
    <ContainedMovementHandle
      getPresentationElement={getPresentationElement}
      getSourcePos={getSourcePos}
      className="sc-app-categorise__move-action"
      label={label}
      projection={projection}
      sourceKey={sourceKey}
      sourcePos={sourcePos}
    />
  );
}

function CategoriseAuthoringCategorySelect({
  categories,
  itemLabel,
  onValueChange,
  value,
}: {
  categories: readonly { id: string; label: string }[];
  itemLabel: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const currentCategory = categories.find((category) => category.id === value);
  const destinations = categories.filter((category) => category.id !== value);
  const currentLabel = currentCategory?.label ?? "Choose category";

  return (
    <Select.Root value={value} onValueChange={onValueChange}>
      <Select.Trigger
        {...authoringMovementSnapshotChromeAttributes()}
        aria-label={`Move ‘${itemLabel}’ to category. Current category: ‘${currentLabel}’`}
        className="sc-app-categorise__category-select"
        contentEditable={false}
        data-no-select
      >
        <Select.Value className="sc-app-categorise__category-select-value">
          {currentLabel}
        </Select.Value>
      </Select.Trigger>
      <SelectMenu.Portal>
        <SelectMenu.Content
          {...authoringChromeAttributes(AuthoringChromeKind.Popover)}
          {...{ [AUTHORING_CHROME_SUPPRESSION_ATTR]: "" }}
          aria-label={`Move ‘${itemLabel}’ to another category`}
          contentEditable={false}
          position="popper"
          sideOffset={6}
          className="sc-select-content sc-app-categorise__category-select-content"
          style={{ zIndex: zIndex.popover }}
        >
          <SelectMenu.Viewport className="sc-select-viewport">
            {destinations.map((category) => (
              <SelectMenu.Item
                key={category.id}
                value={category.id}
                textValue={category.label}
                className="sc-select-item sc-app-categorise__category-select-item"
              >
                <SelectMenu.ItemText>{category.label}</SelectMenu.ItemText>
              </SelectMenu.Item>
            ))}
          </SelectMenu.Viewport>
        </SelectMenu.Content>
      </SelectMenu.Portal>
    </Select.Root>
  );
}

function authoringCategoriseGroup(props: NodeViewProps): {
  authoredBlockId: string | null;
  legend: string;
} {
  const pos = safeGetPos(props.getPos);
  if (typeof pos !== "number") return { authoredBlockId: null, legend: "" };
  const resolved = props.editor.state.doc.resolve(pos);
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (!isCategoriseAssessmentOwnerType(node.type.name)) continue;
    const id = node.attrs["id"];
    const settings = CategoriseSettingsSchema.safeParse(node.attrs["settings"] ?? {});
    return {
      authoredBlockId: typeof id === "string" && id.trim() ? id : null,
      legend: settings.success ? (settings.data.legend?.trim() ?? "") : "",
    };
  }
  return { authoredBlockId: null, legend: "" };
}

function readCategoriseCategoryOptions(
  editor: NodeViewProps["editor"],
  itemPos: number,
): { currentCategoryId: string; options: Array<{ id: string; label: string }> } {
  const resolved = editor.state.doc.resolve(itemPos);
  let categorise = null as typeof resolved.parent | null;
  let currentCategoryId = "";
  for (let depth = resolved.depth; depth >= 0; depth -= 1) {
    const node = resolved.node(depth);
    if (node.type.name === "categorise_bin") {
      currentCategoryId = String(node.attrs["id"] ?? "");
    }
    if (isCategoriseAssessmentOwnerType(node.type.name)) {
      categorise = node;
      break;
    }
  }
  const options: Array<{ id: string; label: string }> = [];
  categorise?.descendants((node) => {
    if (node.type.name !== "categorise_bin") return true;
    const id = String(node.attrs["id"] ?? "");
    if (id) {
      options.push({
        id,
        label: categoriseCategoryPublicLabel(
          node.firstChild?.textContent ?? "",
          options.length + 1,
        ),
      });
    }
    return false;
  });
  return { currentCategoryId, options };
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
  const parent = resolveAssessmentAttrParent(editor, itemPos, [
    "categorise",
    "surface_categorise_question",
  ]);
  if (!parent || !itemId) return { feedback: null };
  const assessment = CategorisePrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  return {
    feedback: assessment.feedbackByItemId[itemId] ?? null,
  };
}

function setCategoriseItemFeedback(
  editor: NodeViewProps["editor"],
  itemPos: number | null,
  itemId: string,
  feedback: AssessmentFeedbackContent | null,
) {
  if (!editor.isEditable || itemPos === null || !itemId) return;
  const parent = resolveAssessmentAttrParent(editor, itemPos, [
    "categorise",
    "surface_categorise_question",
  ]);
  if (!parent) return;
  const assessment = CategorisePrivateAssessmentSchema.parse(parent.node.attrs["assessment"] ?? {});
  setAssessmentAttr(editor, parent, {
    ...assessment,
    feedbackByItemId: nextAssessmentFeedbackRecord(assessment.feedbackByItemId, itemId, feedback),
  });
}

function isCategoriseAssessmentOwnerType(typeName: string): boolean {
  return typeName === "categorise" || typeName === "surface_categorise_question";
}
