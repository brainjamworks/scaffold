import { getSchema, type Extensions } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import type { Schema } from "@tiptap/pm/model";

import { createGridAuthoringNodes } from "@/editor/arrangements/grid/authoring/grid-nodes";
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
import { createSlashCommand } from "@/editor/suggestions/slash/SlashCommand";
import { createStructuralClipboardPolicy } from "@/document/authoring/structural-clipboard-policy";
import type { StructuralFragmentCarrierLimits } from "@/document/authoring/structural-clipboard/structural-fragment-carrier";
import {
  authoringCourseDocumentContentExpression,
  createUnavailableContentAuthoringExtensions,
} from "@/document/authoring/unavailable-content";
import { createSemanticDocumentExtension } from "@/document/authoring/semantic-document";
import { resolveEditorPlaceholder } from "@/editor/prosemirror/placeholder/resolve-editor-placeholder";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createScaffoldAuthoringCataloguesStorageExtension } from "@/composition/extensions/scaffold-authoring-catalogues-storage";
import { createCourseDocumentBaseExtensions } from "@/composition/model/create-document-composition";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import { CourseDocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import {
  assertMountedNodeIdentitySchema,
  type DocumentCapabilityLookups,
} from "@/document/model/establishment";
import { AuthoringSlideDividers } from "@/editor/surfaces/authoring/AuthoringSlideDividers";
import { createSurfaceRootSelectionPolicy } from "@/editor/surfaces/authoring/surface-root-selection-policy";
import { createSurfaceAuthoringNode } from "@/editor/surfaces/authoring/nodes/surface-authoring-node";
import { RegionAuthoringNode } from "@/editor/surfaces/authoring/nodes/region-authoring-node";
import { ContentLayoutProjectionExtension } from "@/editor/content-layout/prosemirror/content-layout-projection-extension";
import "@/editor/surfaces/authoring/AuthoringSlideDividers.css";
import "@/editor/rich-text/view/text-alignment.css";

import type { ScaffoldAuthoringComposition } from "./scaffold-authoring-composition";

const courseDocumentAuthoringEnvironmentBrand: unique symbol = Symbol(
  "CourseDocumentAuthoringEnvironment",
);

export interface CourseDocumentAuthoringEnvironment {
  readonly [courseDocumentAuthoringEnvironmentBrand]: true;
}

export interface CourseDocumentAuthoringEnvironmentState {
  readonly extensions: Extensions;
  readonly schema: Schema;
  readonly capabilities: DocumentCapabilityLookups;
  readonly composition: ScaffoldAuthoringComposition;
  readonly editable: boolean;
}

const environmentStates = new WeakMap<
  CourseDocumentAuthoringEnvironment,
  CourseDocumentAuthoringEnvironmentState
>();

export const AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS: StructuralFragmentCarrierLimits = Object.freeze(
  {
    maxCarrierBytes: 2_000_000,
    fragmentDecodeLimits: Object.freeze({
      maxEncodedBytes: 1_000_000,
      maxNestingDepth: 1_000,
      maxVisitedValues: 100_000,
      maxArrayLength: 100_000,
      maxObjectPropertyCount: 100_000,
      maxStringBytes: 100_000,
    }),
  },
);

export function createCourseDocumentAuthoringEnvironment({
  composition,
  editable = true,
}: {
  composition: ScaffoldAuthoringComposition;
  editable?: boolean;
}): CourseDocumentAuthoringEnvironment {
  const extensions = Object.freeze([
    ...createCourseDocumentAuthoringExtensions({ editable, composition }),
    UndoRedo,
  ]) as unknown as Extensions;
  const schema = getSchema(extensions);
  assertMountedNodeIdentitySchema(schema);

  const environment = Object.freeze({}) as CourseDocumentAuthoringEnvironment;
  environmentStates.set(
    environment,
    Object.freeze({
      extensions,
      schema,
      composition,
      editable,
      capabilities: Object.freeze({
        blocks: composition.capabilities.blocks.registry,
        layouts: composition.capabilities.layouts.registry,
        surfaces: composition.capabilities.surfaces.registry,
      }),
    }),
  );
  return environment;
}

export function getCourseDocumentAuthoringEnvironmentState(
  environment: CourseDocumentAuthoringEnvironment,
): CourseDocumentAuthoringEnvironmentState {
  const state = environmentStates.get(environment);
  if (!state) {
    throw new Error("Course Document authoring environment was not created by Core.");
  }
  return state;
}

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
  const { CellAuthoringNode, GridAuthoringNode } = createGridAuthoringNodes(blockRegistry);
  const { layoutNode, sectionNode } = createLayoutAuthoringNodes({
    registry: layoutRegistry,
    authoringViews: composition.layouts.views,
    blockDefinitions: blockRegistry,
  });
  const surfaceNode = createSurfaceAuthoringNode({
    registry: surfaceRegistry,
    views: composition.surfaces.views,
  });
  const courseDocumentNode = CourseDocumentNode.extend({
    content: authoringCourseDocumentContentExpression(),
  });
  const baseExtensions = createCourseDocumentBaseExtensions({
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
  }).map((extension) =>
    extension.name === CourseDocumentNode.name ? courseDocumentNode : extension,
  );

  return [
    createScaffoldCapabilitiesStorageExtension(composition.capabilities),
    createSemanticDocumentExtension(composition.documentSemantics),
    ContentLayoutProjectionExtension,
    createScaffoldAuthoringCataloguesStorageExtension(composition.catalogues),
    createCourseStructureCommandsExtension(),
    ...baseExtensions,
    AuthoringSlideDividers,
    createSurfaceRootSelectionPolicy({ surfaceVariants: surfaceRegistry }),
    createScaffoldInteractionOwnerExtension(blockRegistry),
    createStructuralClipboardPolicy({
      blockDefinitions: blockRegistry,
      blockDuplications: composition.capabilities.blocks.duplication,
      carrierLimits: AUTHORING_STRUCTURAL_CLIPBOARD_LIMITS,
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
      layoutDefinitions: layoutRegistry,
      surfaceVariants: surfaceRegistry,
    }),
    createSlashCommand({
      blockDefinitions: blockRegistry,
      items: composition.catalogues.inDocument.actions,
      layoutDefinitions: layoutRegistry,
      surfaceVariants: surfaceRegistry,
    }),
    ...composition.blocks.extensions,
    ...createUnavailableContentAuthoringExtensions(),
  ];
}
