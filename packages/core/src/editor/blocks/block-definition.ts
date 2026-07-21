import type { Icon } from "@phosphor-icons/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { ZodType, ZodTypeAny, ZodTypeDef } from "zod";

import type {
  AssessmentAnswerKey,
  AssessmentInteractionContract,
  AssessmentInteractionKind,
  AssessmentResponseValue,
  AssessmentTargetSettings,
} from "@scaffold/contracts";
import type { ConfigurationDefinition } from "../configuration/definition";
import { deriveQuickMenuDefinition } from "../configuration/quick-menu-derivation";
import type { QuickControlDescriptor, QuickMenuDefinition } from "../configuration/quick-menu";
import { deriveSettingsSheetDefinition } from "../configuration/settings-sheet-derivation";
import type { NodeSettingsSheetDefinition } from "../configuration/settings-sheet";
import type { BoundedPlacement } from "../frame/model/bounded-placement";

export type BlockAttrSurface = "data" | "settings" | "options";

export type BlockAttrSchemasDefinition = {
  readonly [TAttr in BlockAttrSurface]?: ZodTypeAny;
};

export type BlockFrameResizeMode = "freeform" | "responsive";

export interface BlockFrameDefinition {
  /** Whether the shared selected-block resize frame should render handles. */
  readonly resizable: boolean;
  /** How rendered block content responds when the outer frame changes size. */
  readonly resizeMode?: BlockFrameResizeMode;
  /** Whether resize should preserve the target's measured or authored ratio. */
  readonly preserveAspectRatio?: boolean;
  /** Optional intrinsic visual aspect ratio, expressed as width / height. */
  readonly aspectRatio?: number | null;
}

export type BlockEmbeddedChildSelectionPolicy = "delegate-to-parent";

export interface BlockInteractionDefinition {
  /** Selection policy for registered child course blocks embedded inside this block. */
  readonly embeddedChildSelection?: BlockEmbeddedChildSelectionPolicy;
}

export interface BlockManagedChildSettingsDefinition {
  /** ProseMirror group on child nodes this policy applies to. */
  readonly childGroup: string;
  /** Settings field names controlled by the parent block. */
  readonly names: readonly string[];
  /** Author-facing disabled reason rendered by settings surfaces. */
  readonly reason: string;
  /** Optional author-facing explanation for individual managed names. */
  readonly hints?: Readonly<Record<string, string>>;
}

export interface BlockChildSettingsDefinition {
  /** Child settings controlled by this parent while the child remains portable. */
  readonly managedFields?: readonly BlockManagedChildSettingsDefinition[];
}

export interface BlockStagedBoundedHostDefinition {
  /** ProseMirror group whose direct children receive the host's finite stage. */
  readonly childGroup: string;
}

export interface BlockIdentityDefinition {
  /** Private child node types that also carry persisted stable ids. */
  readonly stableChildNodeTypes?: readonly string[];
}

export interface BlockPlaceholderContext {
  readonly editor: Editor;
  readonly node: ProseMirrorNode;
  readonly pos: number;
  readonly ancestor: ProseMirrorNode;
  readonly depth: number;
  readonly $pos: ResolvedPos;
}

export type BlockPlaceholderValue =
  | string
  | ((context: BlockPlaceholderContext) => string | undefined);

export type BlockPlaceholderDefinition = Readonly<Record<string, BlockPlaceholderValue>>;

export type BlockInsertCategory =
  | "content"
  | "display"
  | "media"
  | "data"
  | "assessment"
  | "activity"
  | "embed"
  | "layout";

export interface BlockInsertDefinition {
  /** Stable authoring action identity, which may differ from nodeType. */
  readonly id: string;
  /** Optional parent action id for insert variants that share a node type. */
  readonly variantOf?: string;
  readonly title: string;
  readonly description: string;
  readonly icon: Icon;
  readonly category: BlockInsertCategory;
  readonly keywords?: readonly string[];
  /** Fresh ProseMirror node JSON for each insert invocation. */
  readonly content: () => Record<string, unknown>;
  readonly validateNode?: (node: ProseMirrorNode) => {
    readonly code: string;
    readonly message: string;
    readonly field?: string;
  } | null;
}

export interface BlockAuthoringControlsInput {
  readonly editor: Editor;
  readonly nodeType: string;
  readonly pos: number;
  readonly targetId?: string;
}

export type BlockAuthoringMenuControlDescriptor =
  | QuickControlDescriptor
  | {
      readonly kind: "action";
      readonly id: string;
      readonly label: string;
      readonly icon?: Icon;
      readonly destructive?: boolean;
      readonly disabled?: boolean;
      readonly title?: string;
      readonly presentation?: "icon-text" | "icon-only";
      readonly run?: () => void;
    };

export interface BlockAuthoringControlsDefinition {
  readonly controls: (
    input: BlockAuthoringControlsInput,
  ) => readonly BlockAuthoringMenuControlDescriptor[];
}

export interface AssessmentExperienceDefinition {
  readonly submit: boolean;
  readonly attempts: boolean;
  readonly hints: boolean;
  readonly showAnswer: boolean;
  readonly summaryFeedback: boolean;
  readonly perItemFeedback: boolean;
}

export interface AssessmentCapabilityResponseDefinition<LocalResponse = unknown> {
  readonly schema: ZodType<LocalResponse, ZodTypeDef, unknown>;
  readonly toContractResponse: (response: unknown) => AssessmentResponseValue;
  readonly fromContractResponse: (response: AssessmentResponseValue) => LocalResponse;
  readonly hasResponse: (response: unknown) => boolean;
}

export interface AssessmentCapabilityProjectionDefinition {
  readonly projectInteraction: (
    node: JSONContent,
    settings: unknown,
  ) => AssessmentInteractionContract;
  readonly projectAssessment: (node: JSONContent) => AssessmentAnswerKey;
  readonly projectSettings?: (settings: unknown) => Partial<AssessmentTargetSettings>;
  readonly projectLearnerNode: (node: JSONContent) => JSONContent;
}

export interface BlockAssessmentCapabilityDefinition {
  readonly interactionKind: AssessmentInteractionKind;
  readonly experience: AssessmentExperienceDefinition;
  readonly response: AssessmentCapabilityResponseDefinition;
  readonly projection: AssessmentCapabilityProjectionDefinition;
}

export interface BlockCapabilitiesDefinition {
  readonly assessment?: BlockAssessmentCapabilityDefinition;
}

export function defineAssessmentCapability(
  definition: BlockAssessmentCapabilityDefinition,
): BlockAssessmentCapabilityDefinition {
  return definition;
}

export interface BlockDefinitionInput {
  readonly nodeType: string;
  readonly authoringControls?: BlockAuthoringControlsDefinition;
  readonly capabilities?: BlockCapabilitiesDefinition;
  readonly childSettings?: BlockChildSettingsDefinition;
  readonly configuration?: ConfigurationDefinition;
  readonly identity?: BlockIdentityDefinition;
  readonly insert?: BlockInsertDefinition;
  readonly interaction?: BlockInteractionDefinition;
  readonly placeholders?: BlockPlaceholderDefinition;
  readonly boundedPlacement?: BoundedPlacement;
  readonly stagedBoundedHost?: BlockStagedBoundedHostDefinition;
  readonly frame?: BlockFrameDefinition;
}

export interface BlockDefinition extends BlockDefinitionInput {
  readonly attrSchemas?: BlockAttrSchemasDefinition;
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
}

export function defineBlock(input: BlockDefinitionInput): BlockDefinition {
  const attrSchemas = deriveAttrSchemas(input.configuration);
  const quickMenu = deriveQuickMenuDefinition(input.configuration);
  const settingsSheet = deriveSettingsSheetDefinition(input.configuration);
  const frame = normalizeFrameDefinition(input.frame);

  return Object.freeze({
    ...input,
    ...(attrSchemas ? { attrSchemas } : {}),
    ...(quickMenu ? { quickMenu } : {}),
    ...(settingsSheet ? { settingsSheet: { nodeType: input.nodeType, ...settingsSheet } } : {}),
    ...(frame ? { frame } : {}),
  });
}

export function getBlockAttrSchema(
  definition: BlockDefinition,
  attr: BlockAttrSurface,
): ZodTypeAny | undefined {
  return definition.attrSchemas?.[attr];
}

function deriveAttrSchemas(
  configuration: ConfigurationDefinition | undefined,
): BlockAttrSchemasDefinition | undefined {
  if (!configuration) return undefined;

  return {
    [configuration.attr]: configuration.schema,
  };
}

function normalizeFrameDefinition(
  frame: BlockFrameDefinition | undefined,
): BlockFrameDefinition | undefined {
  if (!frame) return undefined;

  const resizeMode = frame.resizeMode ?? (frame.resizable ? "responsive" : undefined);
  const aspectRatio =
    typeof frame.aspectRatio === "number" &&
    Number.isFinite(frame.aspectRatio) &&
    frame.aspectRatio > 0
      ? frame.aspectRatio
      : frame.aspectRatio === null
        ? null
        : undefined;

  return {
    resizable: frame.resizable,
    ...(resizeMode ? { resizeMode } : {}),
    ...(frame.preserveAspectRatio === undefined
      ? {}
      : { preserveAspectRatio: frame.preserveAspectRatio }),
    ...(aspectRatio === undefined ? {} : { aspectRatio }),
  };
}
