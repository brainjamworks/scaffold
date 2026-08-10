import {
  AssessmentTargetContractSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  type AssessmentTargetContract,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import {
  getBlockAttrSchema,
  type AssessmentCapabilityProjectionDefinition,
  type BlockDefinition,
} from "@/editor/blocks/block-definition";

import { readAttrs } from "./projection";

interface CommonAssessmentSettings {
  feedbackMode: "immediate" | "on_submit";
  isGraded: boolean;
  showAnswer: boolean;
  points: number;
  maxAttempts: number | null;
  maxSelect?: number | null;
}

type SafeSchema<T> = {
  parse(value: unknown): T;
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown };
};

/**
 * Projects and validates one mounted assessment Block against the same
 * canonical contract used by publication. This includes private-answer to
 * child-owner reference integrity enforced by AssessmentTargetContractSchema.
 */
export function projectAssessmentTargetContract(input: {
  readonly blockId: string;
  readonly definition: BlockDefinition;
  readonly node: JSONContent;
}): AssessmentTargetContract {
  const { blockId, definition, node } = input;
  const projection = requireAssessmentProjection(definition);
  const settingsSchema = requireAssessmentSettingsSchema(definition);
  const settings = parseWithDefault<CommonAssessmentSettings>(
    settingsSchema as SafeSchema<CommonAssessmentSettings>,
    readAttrs(node)["settings"],
  );

  return AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: blockId,
    blockType: definition.nodeType,
    blockId,
    interaction: projection.projectInteraction(node, settings),
    assessment: projection.projectAssessment(node),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projection.projectSettings?.(settings),
    },
  });
}

export function requireAssessmentProjection(
  definition: BlockDefinition,
): AssessmentCapabilityProjectionDefinition {
  const projection = definition.capabilities?.assessment?.projection;
  if (!projection) {
    throw new Error(
      `Assessment block "${definition.nodeType}" (${definition.nodeType}) is missing capabilities.assessment.projection.`,
    );
  }
  if (!projection.projectLearnerNode) {
    throw new Error(
      `Assessment block "${definition.nodeType}" (${definition.nodeType}) is missing capabilities.assessment.projection.projectLearnerNode.`,
    );
  }
  return projection;
}

function requireAssessmentSettingsSchema(definition: BlockDefinition): SafeSchema<unknown> {
  const settingsSchema = getBlockAttrSchema(definition, "settings");
  if (!settingsSchema) {
    throw new Error(
      `Assessment block "${definition.nodeType}" (${definition.nodeType}) is missing settings attr schema.`,
    );
  }
  return settingsSchema as SafeSchema<unknown>;
}

function parseWithDefault<T>(schema: SafeSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : schema.parse({});
}
