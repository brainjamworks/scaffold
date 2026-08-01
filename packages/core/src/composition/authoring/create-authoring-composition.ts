import type { Extensions } from "@tiptap/core";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { createLayoutAuthoringNodes } from "@/editor/arrangements/layout/authoring/layout-nodes";
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
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createEmptyInsertionRowExtension } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBoundedContainerStructurePolicy } from "@/editor/bounded-containers/authoring/BoundedContainerStructurePolicy";
import { createSlashCommand } from "@/editor/suggestions/slash/SlashCommand";
import { StableIdPasteNormalization } from "@/document/authoring/stable-id-paste-normalization";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { createSurfaceLifecycleAuthoringPolicy } from "@/document/authoring/surface-lifecycle-authoring-policy";
import { AuthoringSlideDividers } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { createSurfaceRootSelectionPolicy } from "@/editor/surfaces/authoring/surface-root-selection-policy";
import { createSurfaceAuthoringNode } from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import "@/editor/surfaces/authoring/AuthoringSlideDividers.css";
import "@/editor/rich-text/view/text-alignment.css";

import {
  createCoreScaffoldAuthoringComposition,
  type ScaffoldAuthoringComposition,
} from "./scaffold-authoring-composition";
import { createScaffoldAuthoringCataloguesStorageExtension } from "./scaffold-authoring-catalogues-storage";

export function createCourseDocumentAuthoringExtensions({
  editable,
  composition,
}: {
  editable: boolean;
  composition?: ScaffoldAuthoringComposition;
}): Extensions {
  const resolvedComposition = composition ?? createCoreScaffoldAuthoringComposition();
  const blockRegistry = resolvedComposition.capabilities.blocks.registry;
  const surfaceRegistry = resolvedComposition.capabilities.surfaces.registry;
  const { layoutNode, sectionNode } = createLayoutAuthoringNodes({
    registry: resolvedComposition.capabilities.layouts.registry,
    authoringViews: resolvedComposition.layouts.views,
    blockDefinitions: blockRegistry,
  });
  const surfaceNode = createSurfaceAuthoringNode({
    registry: surfaceRegistry,
    views: resolvedComposition.surfaces.views,
  });

  return [
    createScaffoldCapabilitiesStorageExtension(resolvedComposition.capabilities),
    createScaffoldAuthoringCataloguesStorageExtension(resolvedComposition.catalogues),
    ...createCourseDocumentBaseExtensions({
      assessmentActionsGroupNode: AssessmentActionsGroupNode,
      assessmentChoicesGroupNode: AssessmentChoicesGroupNode,
      assessmentHintNode: AssessmentHintNode,
      assessmentHintsGroupNode: AssessmentHintsGroupNode,
      assessmentSummaryFeedbackNode: AssessmentSummaryFeedbackNode,
      blockStableIdNodeTypes: blockRegistry.stableIdNodeTypes,
      cellNode: CellAuthoringNode,
      gridNode: GridAuthoringNode,
      inlineIconNode: InlineIconAuthoringNode,
      layoutNode,
      mathInlineNode: MathInlineNode,
      selectableChoiceNode: SelectableChoiceAuthoringNode,
      regionNode: RegionAuthoringNode,
      resizableBlockNodeTypes: blockRegistry.resizableNodeTypes,
      sectionNode,
      surfaceNode,
      updateDocumentIds: editable,
      vocabularyTermNode: VocabularyTermAuthoringNode,
    }),
    AuthoringSlideDividers,
    createSurfaceRootSelectionPolicy({ surfaceVariants: surfaceRegistry }),
    createSurfaceLifecycleAuthoringPolicy({ registry: surfaceRegistry }),
    createBoundedContainerStructurePolicy(
      blockRegistry,
      resolvedComposition.capabilities.layouts.registry,
    ),
    createScaffoldInteractionOwnerExtension(blockRegistry),
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
    createEmptyInsertionRowExtension({ surfaceVariants: surfaceRegistry }),
    createSlashCommand({
      items: builtInInsertCatalog.actions,
      surfaceVariants: surfaceRegistry,
    }),
    ...resolvedComposition.blocks.extensions,
  ];
}
