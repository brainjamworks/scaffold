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
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";
import type { RequiresScaffoldPlusResult } from "@/host/contracts/product-access";
import type {
  LearnerProjectionReadinessResult,
  UnavailableContentRef,
  DocumentEstablishmentIssue,
} from "@/document/model/establishment";

export type AssessmentBlockNodeType = string;

export type AssessmentProjectionWarningCode = "missing-block-id" | "invalid-assessment-group";

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
  surfaceVariants: SurfaceVariantLookup,
): LearnerPublicationProjection {
  if (readiness.status !== "supported") return readiness;

  const projection = projectAssessmentDocument(readiness, blockDefinitions, surfaceVariants);
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
  surfaceVariants: SurfaceVariantLookup,
): AssessmentDocumentProjection {
  const learner = projectLearnerDocument(readiness, blockDefinitions, surfaceVariants);
  const targets = projectAssessmentTargets(readiness, blockDefinitions, surfaceVariants);
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
 * Block or Surface assessment capability for its learner-facing projection.
 */
export function projectLearnerDocument(
  readiness: SupportedLearnerProjectionReadiness,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): LearnerDocumentProjection {
  const authorDocument = readiness.canonicalDocument;
  const warnings: AssessmentProjectionWarning[] = [];
  collectAssessmentBlocks(authorDocument, blockDefinitions).forEach((block) => {
    if (!block.blockId) warnings.push(missingBlockIdWarning(block));
  });
  return {
    document: redactLearnerNode(authorDocument, blockDefinitions, surfaceVariants),
    warnings,
  };
}

export function projectAssessmentTargets(
  readiness: SupportedLearnerProjectionReadiness,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): AssessmentTargetContract[] {
  const authorDocument = readiness.canonicalDocument;
  const blockTargets = collectAssessmentBlocks(authorDocument, blockDefinitions)
    .filter((block) => block.blockId.length > 0)
    .map((block) =>
      projectAssessmentTargetContract({
        blockId: block.blockId,
        definition: block.definition,
        node: block.node,
      }),
    );
  const surfaceTargets = projectSurfaceAssessmentTargets(authorDocument, surfaceVariants);
  return [...blockTargets, ...surfaceTargets];
}

function projectSurfaceAssessmentTargets(
  root: JSONContent,
  surfaceVariants: SurfaceVariantLookup,
): AssessmentTargetContract[] {
  const targets: AssessmentTargetContract[] = [];

  function walk(node: JSONContent) {
    if (node.type === "surface") {
      const variantId = readStringAttr(node, "variant");
      const capability = surfaceVariants.get(variantId)?.assessmentTargets;
      if (capability) {
        targets.push(...capability.projectTargets(node));
      }
    }

    for (const child of readContent(node)) walk(child);
  }

  walk(root);
  return targets;
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

    const children = readContent(quiz.node);
    if (children.length === 0) return;

    const childIds = children
      .map((child) => readStringAttr(child, "id"))
      .filter((id) => id.length > 0);

    if (
      childIds.length !== children.length ||
      new Set(childIds).size !== childIds.length ||
      childIds.some((id) => !targetIds.has(id))
    ) {
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
  surfaceVariants: SurfaceVariantLookup,
): JSONContent {
  const registered = assessmentDefinitionForNode(node, blockDefinitions);
  if (registered) {
    const projection = requireAssessmentProjection(registered.definition);
    return projection.projectLearnerNode(node);
  }

  if (node.type === "surface") {
    const variantId = readStringAttr(node, "variant");
    const capability = surfaceVariants.get(variantId)?.assessmentTargets;
    if (capability) {
      return redactLearnerChildren(
        capability.projectLearnerSurface(node),
        blockDefinitions,
        surfaceVariants,
      );
    }
  }

  return redactLearnerChildren(node, blockDefinitions, surfaceVariants);
}

function redactLearnerChildren(
  node: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    ...(node.content
      ? {
          content: readContent(node)
            .filter((child) => !isOmittableEmptyQuiz(child, blockDefinitions))
            .map((child) => redactLearnerNode(child, blockDefinitions, surfaceVariants)),
        }
      : {}),
  };
}

function isOmittableEmptyQuiz(node: JSONContent, blockDefinitions: BlockDefinitionLookup): boolean {
  return (
    node.type === "quiz" &&
    blockDefinitions.getByNodeType("quiz") !== undefined &&
    readStringAttr(node, "id").length > 0 &&
    readContent(node).length === 0
  );
}
