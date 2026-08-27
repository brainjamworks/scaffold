import {
  AssessmentTargetContractSchema,
  MatchingPrivateAssessmentSchema,
  MatchingSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/blocks/assessment/shared/model/assessment-control-definition";
import {
  projectMatchingAssessment,
  projectMatchingInteraction,
  projectMatchingLearnerNode,
  projectMatchingSettings,
} from "@/editor/blocks/assessment/matching/assessment";
import { matchingPairContent } from "@/editor/blocks/assessment/matching/matching-fields-shared";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/blocks/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_MATCHING_QUESTION_NODE_TYPE } from "../../assessment/surface-matching-question-node";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_MATCHING_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_MATCHING_QUESTION_VARIANT_ID = "slide-matching-question";

function projectSurfaceMatchingTargets(surface: JSONContent) {
  const surfaceContent = readContent(surface);
  const questions = surfaceContent.filter(
    (child) => child.type === SURFACE_MATCHING_QUESTION_NODE_TYPE,
  );
  const question = surfaceContent.length === 1 && questions.length === 1 ? questions[0] : undefined;
  if (!question) {
    throw new Error(
      `Surface "${SLIDE_MATCHING_QUESTION_VARIANT_ID}" must contain exactly one matching question.`,
    );
  }

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_MATCHING_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = MatchingSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "matching",
    interaction: projectMatchingInteraction(question),
    assessment: projectMatchingAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectMatchingSettings(settings),
    },
  });

  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerMatchingSurface(surface: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child.type === SURFACE_MATCHING_QUESTION_NODE_TYPE
              ? projectMatchingLearnerNode(child)
              : child,
          ),
        }
      : {}),
  };
}

function createMatchingPair() {
  return {
    type: "matching_pair",
    attrs: { id: createEmbeddedNodeId() },
    content: matchingPairContent(),
  };
}

export const slideMatchingQuestionSurfaceDefinition = {
  id: SLIDE_MATCHING_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Matching Question",
  description: "Full-slide question for pairing related items.",
  catalogue: {
    section: "assessment",
    order: 30,
    preview: {
      kind: "row",
      gap: "small",
      children: [
        {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "title", emphasis: "strong" },
            { kind: "slot", role: "panel" },
            { kind: "slot", role: "panel" },
          ],
        },
        {
          kind: "column",
          gap: "small",
          children: [
            { kind: "slot", role: "panel" },
            { kind: "slot", role: "panel" },
          ],
        },
      ],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_MATCHING_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: [{ type: SURFACE_MATCHING_QUESTION_NODE_TYPE }],
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceMatchingTargets,
    projectLearnerSurface: projectLearnerMatchingSurface,
  },
  createSurface: ({ surfaceId }) => ({
    type: "surface",
    attrs: {
      id: surfaceId,
      variant: SLIDE_MATCHING_QUESTION_VARIANT_ID,
      settings: DEFAULT_SLIDE_MATCHING_QUESTION_SURFACE_SETTINGS,
    },
    content: [
      {
        type: SURFACE_MATCHING_QUESTION_NODE_TYPE,
        attrs: {
          settings: MatchingSettingsSchema.parse({}),
          assessment: MatchingPrivateAssessmentSchema.parse({}),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Matching" }] }],
          },
          {
            type: "assessment_instructions",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Match each item" }] }],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "matching_pairs_group",
            content: [createMatchingPair(), createMatchingPair(), createMatchingPair()],
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  }),
} satisfies SurfaceVariantDefinition;
