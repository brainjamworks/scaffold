import type { JSONContent } from "@tiptap/core";
import {
  AssessmentGroupContractSchema,
  AssessmentTargetContractSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  QuizSettingsSchema,
  type AssessmentGroupContract,
  type AssessmentTargetContract,
} from "@scaffold/contracts";

import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/blocks/assessment/shared/publication/projection";
import {
  getBlockAttrSchema,
  type AssessmentCapabilityProjectionDefinition,
  type BlockAssessmentCapabilityDefinition,
  type BlockDefinition,
} from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

export type AssessmentBlockNodeType = string;

export type AssessmentProjectionWarningCode =
  | "missing-block-id"
  | "empty-assessment-group"
  | "invalid-assessment-group";

export interface AssessmentProjectionWarning {
  code: AssessmentProjectionWarningCode;
  blockType: AssessmentBlockNodeType;
  blockId: string | null;
  surfaceId: string | null;
  message: string;
}

export interface LearnerDocumentProjection {
  document: JSONContent;
  warnings: AssessmentProjectionWarning[];
}

export interface AssessmentDocumentProjection {
  learnerDocument: JSONContent;
  targets: AssessmentTargetContract[];
  groups: AssessmentGroupContract[];
  warnings: AssessmentProjectionWarning[];
}

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

interface VisitedAssessmentBlock {
  node: JSONContent;
  definition: BlockDefinition;
  assessment: BlockAssessmentCapabilityDefinition;
  blockId: string;
  surfaceId: string | null;
}

/**
 * Projects authoring JSON into the publication bundle a platform adapter can
 * persist separately: public learner document and canonical assessment
 * targets. This operates only on ProseMirror JSON so XBlock, Moodle, LTI,
 * Teams, or any other host can call it without mounting Tiptap.
 */
export function projectAssessmentDocument(
  authorDocument: JSONContent,
): AssessmentDocumentProjection {
  const learner = projectLearnerDocument(authorDocument);
  const targets = projectAssessmentTargets(authorDocument);
  const groupProjection = projectAssessmentGroups(authorDocument, targets);
  return {
    learnerDocument: learner.document,
    targets,
    groups: groupProjection.groups,
    warnings: [...learner.warnings, ...groupProjection.warnings],
  };
}

/**
 * Redacts private answer data from authoring JSON by asking each registered
 * assessment block capability for its learner-facing projection.
 */
export function projectLearnerDocument(authorDocument: JSONContent): LearnerDocumentProjection {
  const warnings: AssessmentProjectionWarning[] = [];
  collectAssessmentBlocks(authorDocument).forEach((block) => {
    if (!block.blockId) warnings.push(missingBlockIdWarning(block));
  });

  return {
    document: redactLearnerNode(authorDocument),
    warnings,
  };
}

export function projectAssessmentTargets(authorDocument: JSONContent): AssessmentTargetContract[] {
  return collectAssessmentBlocks(authorDocument)
    .filter((block) => block.blockId.length > 0)
    .map((block) => {
      const projection = requireProjection(block);
      const settingsSchema = requireSettingsSchema(block);
      const settings = parseWithDefault<CommonAssessmentSettings>(
        settingsSchema as SafeSchema<CommonAssessmentSettings>,
        readAttrs(block.node)["settings"],
      );

      const target = {
        schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
        targetId: block.blockId,
        blockType: block.definition.nodeType,
        blockId: block.blockId,
        interaction: projection.projectInteraction(block.node, settings),
        assessment: projection.projectAssessment(block.node),
        settings: {
          feedbackMode: settings.feedbackMode,
          isGraded: settings.isGraded,
          showAnswer: settings.showAnswer,
          points: settings.points,
          maxAttempts: settings.maxAttempts,
          ...projection.projectSettings?.(settings),
        },
      };
      return AssessmentTargetContractSchema.parse(target);
    });
}

interface AssessmentGroupProjection {
  groups: AssessmentGroupContract[];
  warnings: AssessmentProjectionWarning[];
}

function projectAssessmentGroups(
  authorDocument: JSONContent,
  targets: AssessmentTargetContract[],
): AssessmentGroupProjection {
  const targetIds = new Set(targets.map((target) => target.targetId));
  const groups: AssessmentGroupContract[] = [];
  const warnings: AssessmentProjectionWarning[] = [];

  collectQuizBlocks(authorDocument).forEach((quiz) => {
    if (!quiz.blockId) {
      warnings.push({
        code: "missing-block-id",
        blockType: "quiz",
        blockId: null,
        surfaceId: quiz.surfaceId,
        message:
          "Quiz block has no id; projection omitted its assessment group because server storage cannot address it stably.",
      });
      return;
    }

    const childIds = readContent(quiz.node)
      .map((child) => readStringAttr(child, "id"))
      .filter((id) => id.length > 0);

    if (childIds.length === 0) {
      warnings.push(emptyAssessmentGroupWarning(quiz));
      return;
    }

    if (new Set(childIds).size !== childIds.length || childIds.some((id) => !targetIds.has(id))) {
      warnings.push(invalidAssessmentGroupWarning(quiz));
      return;
    }

    groups.push(
      AssessmentGroupContractSchema.parse({
        schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
        kind: "quiz",
        groupId: quiz.blockId,
        targetIds: childIds,
        settings: QuizSettingsSchema.parse(readAttrs(quiz.node)["settings"] ?? {}),
      }),
    );
  });

  return { groups, warnings };
}

interface VisitedQuizBlock {
  node: JSONContent;
  blockId: string;
  surfaceId: string | null;
}

function collectQuizBlocks(root: JSONContent): VisitedQuizBlock[] {
  const quizzes: VisitedQuizBlock[] = [];

  function walk(node: JSONContent, surfaceId: string | null) {
    const nextSurfaceId = node.type === "surface" ? readStringAttr(node, "id") || null : surfaceId;

    if (node.type === "quiz") {
      quizzes.push({
        node,
        blockId: readStringAttr(node, "id"),
        surfaceId: nextSurfaceId,
      });
    }

    for (const child of readContent(node)) {
      walk(child, nextSurfaceId);
    }
  }

  walk(root, null);
  return quizzes;
}

function collectAssessmentBlocks(root: JSONContent): VisitedAssessmentBlock[] {
  const blocks: VisitedAssessmentBlock[] = [];

  function walk(node: JSONContent, surfaceId: string | null) {
    const nextSurfaceId = node.type === "surface" ? readStringAttr(node, "id") || null : surfaceId;
    const registered = assessmentDefinitionForNode(node);

    if (registered) {
      blocks.push({
        node,
        definition: registered.definition,
        assessment: registered.assessment,
        blockId: readStringAttr(node, "id"),
        surfaceId: nextSurfaceId,
      });
    }

    for (const child of readContent(node)) {
      walk(child, nextSurfaceId);
    }
  }

  walk(root, null);
  return blocks;
}

function assessmentDefinitionForNode(node: JSONContent): {
  definition: BlockDefinition;
  assessment: BlockAssessmentCapabilityDefinition;
} | null {
  if (!node.type) return null;
  const definition = builtInBlockRegistry.getByNodeType(node.type);
  const assessment = definition?.capabilities?.assessment;
  if (!definition || !assessment) return null;
  return { definition, assessment };
}

function missingBlockIdWarning(block: VisitedAssessmentBlock): AssessmentProjectionWarning {
  return {
    code: "missing-block-id",
    blockType: block.definition.nodeType,
    blockId: null,
    surfaceId: block.surfaceId,
    message:
      "Assessment block has no id; projection omitted its target because server storage cannot address it stably.",
  };
}

function emptyAssessmentGroupWarning(quiz: VisitedQuizBlock): AssessmentProjectionWarning {
  return {
    code: "empty-assessment-group",
    blockType: "quiz",
    blockId: quiz.blockId,
    surfaceId: quiz.surfaceId,
    message: "Quiz has no playable assessment targets; projection omitted its assessment group.",
  };
}

function invalidAssessmentGroupWarning(quiz: VisitedQuizBlock): AssessmentProjectionWarning {
  return {
    code: "invalid-assessment-group",
    blockType: "quiz",
    blockId: quiz.blockId,
    surfaceId: quiz.surfaceId,
    message:
      "Quiz contains children without projected assessment targets; projection omitted its assessment group.",
  };
}

function redactLearnerNode(node: JSONContent): JSONContent {
  const registered = assessmentDefinitionForNode(node);
  if (registered) {
    const projection = requireProjection({
      node,
      definition: registered.definition,
      assessment: registered.assessment,
      blockId: readStringAttr(node, "id"),
      surfaceId: null,
    });
    return projection.projectLearnerNode(node);
  }

  return {
    ...cloneJsonNodeWithoutContent(node),
    ...(node.content ? { content: readContent(node).map(redactLearnerNode) } : {}),
  };
}

function requireProjection(
  block: VisitedAssessmentBlock,
): AssessmentCapabilityProjectionDefinition {
  const projection = block.assessment.projection;
  if (!projection) {
    throw new Error(
      `Assessment block "${block.definition.nodeType}" (${block.definition.nodeType}) is missing capabilities.assessment.projection.`,
    );
  }
  if (!projection.projectLearnerNode) {
    throw new Error(
      `Assessment block "${block.definition.nodeType}" (${block.definition.nodeType}) is missing capabilities.assessment.projection.projectLearnerNode.`,
    );
  }
  return projection;
}

function requireSettingsSchema(block: VisitedAssessmentBlock): SafeSchema<unknown> {
  const settingsSchema = getBlockAttrSchema(block.definition, "settings");
  if (!settingsSchema) {
    throw new Error(
      `Assessment block "${block.definition.nodeType}" (${block.definition.nodeType}) is missing settings attr schema.`,
    );
  }
  return settingsSchema as SafeSchema<unknown>;
}

function parseWithDefault<T>(schema: SafeSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : schema.parse({});
}
