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
import { createEmptyInsertionRowExtension } from "@/editor/suggestions/empty-row/EmptyInsertionRowExtension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBoundedContainerStructurePolicy } from "@/editor/bounded-containers/authoring/BoundedContainerStructurePolicy";
import { createSlashCommand } from "@/editor/suggestions/slash/SlashCommand";
import { createStructuralClipboardPolicy } from "@/document/authoring/structural-clipboard-policy";
import { createCourseSectionNode } from "@/document/model/nodes";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createScaffoldAuthoringCataloguesStorageExtension } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { AuthoringSlideDividers } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { createSurfaceRootSelectionPolicy } from "@/editor/surfaces/authoring/surface-root-selection-policy";
import { createSurfaceAuthoringNode } from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import "@/editor/surfaces/authoring/AuthoringSlideDividers.css";
import "@/editor/rich-text/view/text-alignment.css";

import type { ScaffoldAuthoringComposition } from "./scaffold-authoring-composition";

export function createCourseDocumentAuthoringExtensions({
  editable,
  composition,
}: {
  editable: boolean;
  composition: ScaffoldAuthoringComposition;
}): Extensions {
  const blockRegistry = composition.capabilities.blocks.registry;
  const layoutRegistry = composition.capabilities.layouts.registry;
  const surfaceRegistry = composition.capabilities.surfaces.registry;
  const { layoutNode, sectionNode } = createLayoutAuthoringNodes({
    registry: layoutRegistry,
    authoringViews: composition.layouts.views,
    blockDefinitions: blockRegistry,
  });
  const surfaceNode = createSurfaceAuthoringNode({
    registry: surfaceRegistry,
    views: composition.surfaces.views,
  });

  return [
    createScaffoldCapabilitiesStorageExtension(composition.capabilities),
    createScaffoldAuthoringCataloguesStorageExtension(composition.catalogues),
    createCourseStructureCommandsExtension(),
    ...createCourseDocumentBaseExtensions({
      assessmentActionsGroupNode: AssessmentActionsGroupNode,
      assessmentChoicesGroupNode: AssessmentChoicesGroupNode,
      assessmentHintNode: AssessmentHintNode,
      assessmentHintsGroupNode: AssessmentHintsGroupNode,
      assessmentSummaryFeedbackNode: AssessmentSummaryFeedbackNode,
      cellNode: CellAuthoringNode,
      courseSectionNode: createCourseSectionNode(),
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
    createBoundedContainerStructurePolicy(blockRegistry, layoutRegistry),
    createScaffoldInteractionOwnerExtension(blockRegistry),
    createStructuralClipboardPolicy({
      blockDefinitions: blockRegistry,
      layoutDefinitions: layoutRegistry,
      surfaceVariants: surfaceRegistry,
    }),
    Placeholder.configure({
      showOnlyWhenEditable: true,
      // Show every empty-slot placeholder all the time, not just on
      // the cursor's current node because placeholders are the affordance
      // that tells the author what to type in each slot.
      showOnlyCurrent: false,
      includeChildren: true,
      placeholder: resolveEditorPlaceholder,
    }),
    createEmptyInsertionRowExtension({
      blockDefinitions: blockRegistry,
      surfaceVariants: surfaceRegistry,
    }),
    createSlashCommand({
      blockDefinitions: blockRegistry,
      items: composition.catalogues.inDocument.actions,
      layoutDefinitions: layoutRegistry,
      surfaceVariants: surfaceRegistry,
    }),
    ...composition.blocks.extensions,
  ];
}
