export { Button } from "@/ui/components/Button/Button";
export { IconButton } from "@/ui/components/IconButton/IconButton";
export { Textarea } from "@/ui/components/Input/Input";
export { Mark } from "@/ui/components/Mark/Mark";
export { Pill } from "@/ui/components/Pill/Pill";

export {
  ScaffoldAgentDockEmptyState,
  type ScaffoldAgentDockEmptyStateProps,
} from "@/editor/shell/agent/ScaffoldAgentDockEmptyState";
export {
  ScaffoldAgentDockFrame,
  type ScaffoldAgentDockFrameProps,
} from "@/editor/shell/agent/ScaffoldAgentDockFrame";
export {
  ScaffoldUnavailableAgentDock,
  type ScaffoldUnavailableAgentDockProps,
} from "@/editor/shell/agent/ScaffoldUnavailableAgentDock";
export type {
  ScaffoldAgentIntegration,
  ScaffoldAgentIntegrationProps,
  ScaffoldAgentWorkspaceContribution,
} from "@/editor/shell/agent/agent-integration";

export { CourseModeSchema, type CourseMode } from "@/schemas/course-document";

export { getBlockDefinitionByNodeType } from "@/host/agent/block-definition-metadata";
export { updateRegisteredNodeSettingsChecked } from "@/host/agent/checked-settings";
export {
  canInsertCatalogItem,
  createCatalogNodeChecked,
  getInsertableCatalogItems,
  type CreateCatalogNodeCheckedResult,
} from "@/host/agent/insertion";
export type { BlockDefinition } from "@/editor/blocks/block-definition";
export type { InsertAction } from "@/editor/insertion/insert-action";

export {
  insertNodeChecked,
  replaceNodeContentChecked,
  type CheckedMutationIssue,
  type CheckedMutationResult,
} from "@/document/model/commands/checked-transactions";
export {
  createGridTemplate,
  type GridTemplateOptions,
} from "@/editor/arrangements/grid/model/grid-model";
export { insertGridChecked } from "@/editor/arrangements/grid/model/grid-commands";
export {
  materializeCatalogNodeHorizontalAlignment,
  type MaterializeCatalogNodeHorizontalAlignmentInput,
} from "@/editor/interactions/alignment/alignment-insertion";

export {
  resolveCourseSelectionProjection,
  type CourseSelectionProjection,
} from "@/editor/selection/course-selection-projection";
export type { ScaffoldBlockContext } from "@/editor/selection/block-context";
export { CourseSelectionMode } from "@/editor/selection/selection-facts";
export {
  InteractionTargetKind,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
export { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
export {
  resolveBlockChromeTargetDescriptor,
  type BlockChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
export {
  resolveStructuralChromeTargetDescriptor,
  type StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";

export {
  validateCourseDocumentJSON,
  type CourseDocumentValidationResult,
} from "@/document/model/validation";
export {
  projectAssessmentDocument,
  type AssessmentDocumentProjection,
} from "@/authoring/publication/document-projection";
export { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
export {
  getSurfaceViewSettings,
  type SurfaceViewSettings,
} from "@/document/model/surface-view-settings";
export {
  AuthoringSurfaceView,
  type AuthoringSurfaceViewProps,
} from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
