import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import type { BlockDefinition as CoreBlockDefinition } from "../editor/blocks/block-definition";
import type { InsertAction as CoreInsertAction } from "../editor/insertion/insert-action";
import type { InsertCatalog as CoreInsertCatalog } from "../editor/insertion/insert-catalog";
// @ts-expect-error The Agent facade does not expose raw authoring view contracts.
import type { AuthoringSurfaceViewProps } from "./agent-host";
import type { InsertCatalog as AgentInsertCatalog } from "./agent-host";
// @ts-expect-error The Agent facade deliberately removed this compatibility type name.
import type { InsertCatalogItem } from "./agent-host";
// @ts-expect-error The Agent facade deliberately removed this compatibility type name.
import type { RegisteredBlockDefinition } from "./agent-host";
import type { BlockDefinition as AgentBlockDefinition } from "./agent-host";
import * as agentHost from "@scaffold/core/agent-host";
import {
  Button,
  ScaffoldAgentDockEmptyState,
  ScaffoldAgentDockFrame,
  ScaffoldUnavailableAgentDock,
  CourseModeSchema,
  CourseSelectionMode,
  IconButton,
  InteractionTargetKind,
  Mark,
  Pill,
  Textarea,
  canInsertCatalogItem,
  createCatalogNodeChecked,
  createGridTemplate,
  getInsertableCatalogItems,
  getSurfaceViewSettings,
  insertGridChecked,
  insertNodeChecked,
  materializeCatalogNodeHorizontalAlignment,
  projectAssessmentDocument,
  publishInteractionOwnerSnapshot,
  replaceNodeContentChecked,
  resolveBlockChromeTargetDescriptor,
  resolveCourseSelectionProjection,
  resolveStructuralChromeTargetDescriptor,
  type AssessmentDocumentProjection,
  type BlockDefinition,
  type BlockChromeTargetDescriptor,
  type CheckedMutationIssue,
  type CheckedMutationResult,
  type CourseMode,
  type CourseSelectionMode as CourseSelectionModeType,
  type CourseSelectionProjection,
  type ScaffoldAgentDockEmptyStateProps,
  type ScaffoldAgentDockFrameProps,
  type ScaffoldAgentIntegration,
  type ScaffoldAgentIntegrationProps,
  type ScaffoldAgentWorkspaceContribution,
  type ScaffoldBlockContext,
  type ScaffoldUnavailableAgentDockProps,
  type CreateCatalogNodeCheckedResult,
  type GridTemplateOptions,
  type InsertAction as AgentInsertAction,
  type InteractionOwnerSnapshot,
  type InteractionTargetKind as InteractionTargetKindType,
  type InteractionTargetRef,
  type MaterializeCatalogNodeHorizontalAlignmentInput,
  type StructuralChromeTargetDescriptor,
  type SurfaceViewSettings,
} from "@scaffold/core/agent-host";

export type RemovedAuthoringSurfaceViewProps = AuthoringSurfaceViewProps;
export type RemovedAgentRegisteredBlockDefinition = RegisteredBlockDefinition;
export type RemovedAgentInsertCatalogItem = InsertCatalogItem;

const agentHostValues = {
  Button,
  ScaffoldAgentDockEmptyState,
  ScaffoldAgentDockFrame,
  ScaffoldUnavailableAgentDock,
  CourseModeSchema,
  CourseSelectionMode,
  IconButton,
  InteractionTargetKind,
  Mark,
  Pill,
  Textarea,
  canInsertCatalogItem,
  createCatalogNodeChecked,
  createGridTemplate,
  getInsertableCatalogItems,
  getSurfaceViewSettings,
  insertGridChecked,
  insertNodeChecked,
  materializeCatalogNodeHorizontalAlignment,
  projectAssessmentDocument,
  publishInteractionOwnerSnapshot,
  replaceNodeContentChecked,
  resolveBlockChromeTargetDescriptor,
  resolveCourseSelectionProjection,
  resolveStructuralChromeTargetDescriptor,
};

type AgentHostTypeSurface = {
  assessmentProjection: AssessmentDocumentProjection;
  blockContext: ScaffoldBlockContext;
  blockDescriptor: BlockChromeTargetDescriptor;
  blockDefinition: BlockDefinition;
  catalogItem: AgentInsertAction;
  catalog: AgentInsertCatalog;
  catalogNodeResult: CreateCatalogNodeCheckedResult;
  checkedIssue: CheckedMutationIssue;
  checkedResult: CheckedMutationResult;
  courseMode: CourseMode;
  courseSelectionMode: CourseSelectionModeType;
  dockEmptyStateProps: ScaffoldAgentDockEmptyStateProps;
  dockFrameProps: ScaffoldAgentDockFrameProps;
  integration: ScaffoldAgentIntegration;
  integrationProps: ScaffoldAgentIntegrationProps;
  interactionOwnerSnapshot: InteractionOwnerSnapshot;
  interactionTargetKind: InteractionTargetKindType;
  interactionTargetRef: InteractionTargetRef;
  materializeAlignmentInput: MaterializeCatalogNodeHorizontalAlignmentInput;
  selectionProjection: CourseSelectionProjection;
  structuralDescriptor: StructuralChromeTargetDescriptor;
  unavailableDockProps: ScaffoldUnavailableAgentDockProps;
  viewSettings: SurfaceViewSettings;
  workspaceContribution: ScaffoldAgentWorkspaceContribution;
  gridTemplateOptions: GridTemplateOptions;
};

describe("@scaffold/core/agent-host", () => {
  it("keeps public Agent block and insertion contracts type-aligned", () => {
    expectTypeOf<CoreBlockDefinition>().toEqualTypeOf<AgentBlockDefinition>();
    expectTypeOf<CoreInsertAction>().toEqualTypeOf<AgentInsertAction>();
    expectTypeOf<CoreInsertCatalog>().toEqualTypeOf<AgentInsertCatalog>();
  });

  it("publishes the curated Agent host value surface", () => {
    expect(Object.keys(agentHost).sort()).toEqual(Object.keys(agentHostValues).sort());
    expect(Object.values(agentHostValues).every((value) => value !== undefined)).toBe(true);
  });

  it("does not expose raw registries, constructors, legacy names, or authoring internals", () => {
    for (const key of [
      "builtInBlockRegistry",
      "builtInBlockDefinitions",
      "AuthoringSurfaceView",
      "createBlockRegistry",
      "createInsertCatalog",
      "createCourseDocumentAuthoringExtensions",
      "defineBlock",
      "defineInsertAction",
      "getBlockDefinitions",
      "getCatalog",
      "registerBlockInsertAction",
    ]) {
      expect(agentHost).not.toHaveProperty(key);
    }
  });

  it("publishes the named types required by Agent host signatures", () => {
    expectTypeOf<AgentHostTypeSurface>().toBeObject();
  });
});
