import type { Extensions } from "@tiptap/core";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { SelectableChoiceAuthoringNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-authoring";
import { InlineIconAuthoringNode } from "@/editor/rich-text/inline-icon/authoring/InlineIconAuthoringNode";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { VocabularyTermAuthoringNode } from "@/editor/rich-text/vocabulary-term/authoring/VocabularyTermAuthoringNode";
import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";
import { createAuthoringBlockExtensions } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createEmptyInsertionRowExtension } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBoundedContainerStructurePolicy } from "@/editor/bounded-containers/authoring/BoundedContainerStructurePolicy";
import { createSlashCommand } from "@/editor/suggestions/slash/SlashCommand";
import { StableIdPasteNormalization } from "@/document/authoring/stable-id-paste-normalization";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { createSurfaceLifecycleAuthoringPolicy } from "@/document/authoring/surface-lifecycle-authoring-policy";
import { AuthoringSlideDividers } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { createSurfaceRootSelectionPolicy } from "@/editor/surfaces/authoring/surface-root-selection-policy";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInSurfaceAuthoringViewMap } from "@/editor/surfaces/authoring/surface-authoring-views";
import { createSurfaceAuthoringNode } from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import "@/editor/surfaces/authoring/AuthoringSlideDividers.css";
import "@/editor/rich-text/view/text-alignment.css";

const builtInSurfaceAuthoringNode = createSurfaceAuthoringNode({
  registry: builtInSurfaceVariantRegistry,
  views: builtInSurfaceAuthoringViewMap,
});

export function createCourseDocumentAuthoringExtensions({
  editable,
}: {
  editable: boolean;
}): Extensions {
  return [
    ...createCourseDocumentBaseExtensions({
      assessmentActionsGroupNode: AssessmentActionsGroupNode,
      assessmentChoicesGroupNode: AssessmentChoicesGroupNode,
      assessmentHintNode: AssessmentHintNode,
      assessmentHintsGroupNode: AssessmentHintsGroupNode,
      assessmentSummaryFeedbackNode: AssessmentSummaryFeedbackNode,
      blockStableIdNodeTypes: builtInBlockRegistry.stableIdNodeTypes,
      cellNode: CellAuthoringNode,
      gridNode: GridAuthoringNode,
      inlineIconNode: InlineIconAuthoringNode,
      layoutNode: LayoutAuthoringNode,
      mathInlineNode: MathInlineNode,
      selectableChoiceNode: SelectableChoiceAuthoringNode,
      regionNode: RegionAuthoringNode,
      resizableBlockNodeTypes: builtInBlockRegistry.resizableNodeTypes,
      sectionNode: SectionAuthoringNode,
      surfaceNode: builtInSurfaceAuthoringNode,
      updateDocumentIds: editable,
      vocabularyTermNode: VocabularyTermAuthoringNode,
    }),
    AuthoringSlideDividers,
    createSurfaceRootSelectionPolicy({ surfaceVariants: builtInSurfaceVariantRegistry }),
    createSurfaceLifecycleAuthoringPolicy({ registry: builtInSurfaceVariantRegistry }),
    createBoundedContainerStructurePolicy(builtInBlockRegistry),
    createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    StableIdPasteNormalization,
    Placeholder.configure({
      showOnlyWhenEditable: true,
      // Show every empty-slot placeholder all the time, not just on
      // the cursor's current node because placeholders are the affordance
      // that tells the author what to type in each slot.
      showOnlyCurrent: false,
      includeChildren: true,
      placeholder: resolveEditorPlaceholder,
    }),
    createEmptyInsertionRowExtension({ surfaceVariants: builtInSurfaceVariantRegistry }),
    createSlashCommand({
      items: builtInInsertCatalog.actions,
      surfaceVariants: builtInSurfaceVariantRegistry,
    }),
    ...createAuthoringBlockExtensions(builtInBlockRegistry),
  ];
}
