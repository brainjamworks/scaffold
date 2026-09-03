import type { JSONContent } from "@tiptap/core";
import {
  AssessmentGroupContractSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  QuizSettingsSchema,
  type AssessmentGroupContract,
  type AssessmentTargetContract,
} from "@scaffold/contracts";

import { isDragDropNotLearnerReady } from "@/editor/assessment/drag-drop/assessment";
import { QUESTION_TYPE_TAGS } from "@/editor/assessment/quiz/question-type-tags";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
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
import { SURFACE_QUIZ_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { matchFixedSurfaceChildrenFromJSON } from "@/editor/surfaces/model/policies/surface-fixed-structure";
import type { RequiresScaffoldPlusResult } from "@/host/contracts/product-access";
import type {
  LearnerProjectionReadinessResult,
  UnavailableContentRef,
  DocumentEstablishmentIssue,
} from "@/document/model/establishment";

export type AssessmentBlockNodeType = string;

export interface MisplacedSurfaceQuestionDetails {
  readonly kind: "surface";
  readonly capabilityId: string;
  readonly stableId: string;
}

export class MisplacedSurfaceQuestionError extends Error {
  readonly details: MisplacedSurfaceQuestionDetails;

  constructor(details: MisplacedSurfaceQuestionDetails) {
    super(`Surface assessment question "${details.capabilityId}" is outside a Surface variant.`);
    this.name = "MisplacedSurfaceQuestionError";
    this.details = details;
  }
}

export function isMisplacedSurfaceQuestion(error: unknown): error is MisplacedSurfaceQuestionError {
  return error instanceof MisplacedSurfaceQuestionError;
}

const SURFACE_ASSESSMENT_QUESTION_NODE_TYPES: ReadonlySet<string> = new Set(
  Object.keys(QUESTION_TYPE_TAGS).filter(
    (nodeType) => nodeType.startsWith("surface_") && nodeType.endsWith("_question"),
  ),
);

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

  try {
    const projection = projectAssessmentDocument(readiness, blockDefinitions, surfaceVariants);
    return {
      status: "supported",
      learnerContent: projection.learnerDocument,
      assessmentTargets: projection.targets,
      assessmentGroups: projection.groups,
      warnings: projection.warnings,
    };
  } catch (error) {
    if (isDragDropNotLearnerReady(error) || isMisplacedSurfaceQuestion(error)) {
      return {
        status: "unavailable-content",
        unavailableContent: [{ ...error.details, path: [] }],
      };
    }
    throw error;
  }
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
    surfaceVariants,
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
    document: redactLearnerNode(authorDocument, blockDefinitions, surfaceVariants, false),
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
  surfaceVariants: SurfaceVariantLookup,
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

  collectSurfaceQuizzes(authorDocument, surfaceVariants).forEach((quiz) => {
    if (!quiz.groupId) {
      throw new Error(`Surface Quiz on "${quiz.surfaceId}" is missing its stable group id.`);
    }
    const children = readContent(quiz.node);
    if (children.length === 0) return;
    const childIds = children.map((child) => readStringAttr(child, "id"));
    if (
      childIds.some((id) => id.length === 0) ||
      new Set(childIds).size !== childIds.length ||
      childIds.some((id) => !targetIds.has(id))
    ) {
      throw new Error(`Surface Quiz "${quiz.groupId}" has invalid assessment membership.`);
    }
    groups.push(
      AssessmentGroupContractSchema.parse({
        schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
        kind: "quiz",
        groupId: quiz.groupId,
        targetIds: childIds,
        settings: QuizSettingsSchema.parse(readAttrs(quiz.node)["settings"] ?? {}),
      }),
    );
  });

  return { groups, warnings };
}

interface VisitedSurfaceQuiz {
  readonly node: JSONContent;
  readonly groupId: string;
  readonly surfaceId: string;
}

function collectSurfaceQuizzes(
  root: JSONContent,
  surfaceVariants: SurfaceVariantLookup,
): VisitedSurfaceQuiz[] {
  const quizzes: VisitedSurfaceQuiz[] = [];

  function walk(node: JSONContent) {
    if (node.type === "surface") {
      const variantId = readStringAttr(node, "variant");
      if (variantId === "slide-quiz" && surfaceVariants.get(variantId)) {
        const surfaceId = readStringAttr(node, "id");
        const match = matchFixedSurfaceChildrenFromJSON(node, [{ type: SURFACE_QUIZ_NODE_TYPE }]);
        if (!surfaceId || !match.exact) {
          throw new Error('Surface "slide-quiz" has malformed private Quiz content.');
        }
        const quiz = match.children[0]!;
        quizzes.push({ node: quiz, groupId: readStringAttr(quiz, "id"), surfaceId });
        return;
      }
    }

    for (const child of readContent(node)) walk(child);
  }

  walk(root);
  return quizzes;
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
  insideSurface: boolean,
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
        true,
      );
    }
  }

  if (
    !insideSurface &&
    node.type !== undefined &&
    SURFACE_ASSESSMENT_QUESTION_NODE_TYPES.has(node.type)
  ) {
    throw new MisplacedSurfaceQuestionError({
      kind: "surface",
      capabilityId: node.type,
      stableId: readStringAttr(node, "id"),
    });
  }

  return redactLearnerChildren(node, blockDefinitions, surfaceVariants, insideSurface);
}

function redactLearnerChildren(
  node: JSONContent,
  blockDefinitions: BlockDefinitionLookup,
  surfaceVariants: SurfaceVariantLookup,
  insideSurface: boolean,
): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(node),
    ...(node.content
      ? {
          content: readContent(node)
            .filter((child) => !isOmittableEmptyQuiz(child, blockDefinitions))
            .map((child) => redactLearnerNode(child, blockDefinitions, surfaceVariants, insideSurface)),
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
