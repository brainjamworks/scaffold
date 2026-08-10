import type { JSONContent } from "@tiptap/core";
import {
  AssessmentGroupContractSchema,
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
  type BlockAssessmentCapabilityDefinition,
  type BlockDefinition,
} from "@/editor/blocks/block-definition";
import {
  projectAssessmentTargetContract,
  requireAssessmentProjection,
} from "@/editor/blocks/assessment/shared/publication/assessment-target";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { RequiresScaffoldPlusResult } from "@/host/contracts/product-access";
import type {
  LearnerProjectionReadinessResult,
  UnavailableContentRef,
  DocumentEstablishmentIssue,
} from "@/document/model/establishment";

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

export type SupportedLearnerProjectionReadiness = Extract<
  LearnerProjectionReadinessResult,
  { readonly status: "supported" }
>;

export type LearnerPublicationProjection =
  | {
      readonly status: "supported";
      readonly learnerContent: JSONContent;
      readonly assessmentTargets: AssessmentTargetContract[];
      readonly assessmentGroups: AssessmentGroupContract[];
      readonly warnings: AssessmentProjectionWarning[];
    }
  | {
      readonly status: "unavailable-content";
      readonly unavailableContent: readonly UnavailableContentRef[];
    }
  | {
      readonly status: "invalid";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    }
  | RequiresScaffoldPlusResult;

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
export function projectLearnerPublication(
  readiness: LearnerProjectionReadinessResult,
  blockDefinitions: BlockDefinitionLookup,
): LearnerPublicationProjection {
  if (readiness.status !== "supported") return readiness;

  const projection = projectAssessmentDocument(readiness, blockDefinitions);
  return {
    status: "supported",
    learnerContent: projection.learnerDocument,
    assessmentTargets: projection.targets,
    assessmentGroups: projection.groups,
    warnings: projection.warnings,
  };
}

export function projectAssessmentDocument(
  readiness: SupportedLearnerProjectionReadiness,
  blockDefinitions: BlockDefinitionLookup,
): AssessmentDocumentProjection {
  const learner = projectLearnerDocument(readiness, blockDefinitions);
  const targets = projectAssessmentTargets(readiness, blockDefinitions);
  const groupProjection = projectAssessmentGroups(
    readiness.canonicalDocument,
    targets,
    blockDefinitions,
  );
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
export function projectLearnerDocument(
  readiness: SupportedLearnerProjectionReadiness,
  blockDefinitions: BlockDefinitionLookup,
): LearnerDocumentProjection {
  const authorDocument = readiness.canonicalDocument;
  const warnings: AssessmentProjectionWarning[] = [];
  collectAssessmentBlocks(authorDocument, blockDefinitions).forEach((block) => {
    if (!block.blockId) warnings.push(missingBlockIdWarning(block));
  });

  return {
    document: redactLearnerNode(authorDocument, blockDefinitions),
    warnings,
  };
}

export function projectAssessmentTargets(
  readiness: SupportedLearnerProjectionReadiness,
  blockDefinitions: BlockDefinitionLookup,
): AssessmentTargetContract[] {
  const authorDocument = readiness.canonicalDocument;
  return collectAssessmentBlocks(authorDocument, blockDefinitions)
    .filter((block) => block.blockId.length > 0)
    .map((block) =>
      projectAssessmentTargetContract({
        blockId: block.blockId,
        definition: block.definition,
        node: block.node,
      }),
    );
}

interface AssessmentGroupProjection {
  groups: AssessmentGroupContract[];
  warnings: AssessmentProjectionWarning[];
}

function projectAssessmentGroups(
  authorDocument: JSONContent,
  targets: AssessmentTargetContract[],
  blockDefinitions: BlockDefinitionLookup,
): AssessmentGroupProjection {
  const targetIds = new Set(targets.map((target) => target.targetId));
  const groups: AssessmentGroupContract[] = [];
  const warnings: AssessmentProjectionWarning[] = [];

  collectQuizBlocks(authorDocument, blockDefinitions).forEach((quiz) => {
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

function collectQuizBlocks(
  root: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
): VisitedQuizBlock[] {
  const quizzes: VisitedQuizBlock[] = [];

  function walk(node: JSONContent, surfaceId: string | null) {
    const nextSurfaceId = node.type === "surface" ? readStringAttr(node, "id") || null : surfaceId;

    if (node.type === "quiz" && blockDefinitions.getByNodeType("quiz")) {
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

function collectAssessmentBlocks(
  root: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
): VisitedAssessmentBlock[] {
  const blocks: VisitedAssessmentBlock[] = [];

  function walk(node: JSONContent, surfaceId: string | null) {
    const nextSurfaceId = node.type === "surface" ? readStringAttr(node, "id") || null : surfaceId;
    const registered = assessmentDefinitionForNode(node, blockDefinitions);

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

function assessmentDefinitionForNode(
  node: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
): {
  definition: BlockDefinition;
  assessment: BlockAssessmentCapabilityDefinition;
} | null {
  if (!node.type) return null;
  const definition = blockDefinitions.getByNodeType(node.type);
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

function redactLearnerNode(
  node: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
): JSONContent {
  const registered = assessmentDefinitionForNode(node, blockDefinitions);
  if (registered) {
    const projection = requireAssessmentProjection(registered.definition);
    return projection.projectLearnerNode(node);
  }

  return {
    ...cloneJsonNodeWithoutContent(node),
    ...(node.content
      ? { content: readContent(node).map((child) => redactLearnerNode(child, blockDefinitions)) }
      : {}),
  };
}
