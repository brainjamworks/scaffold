import {
  AssessmentTargetContractSchema,
  McqPrivateAssessmentSchema,
  McqSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import {
  projectMcqAssessment,
  projectMcqInteraction,
  projectMcqLearnerNode,
  projectMcqSettings,
} from "@/editor/blocks/assessment/mcq/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "../../assessment/surface-multiple-choice-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_MULTIPLE_CHOICE_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_MULTIPLE_CHOICE_QUESTION_VARIANT_ID = "slide-multiple-choice-question";
const SLIDE_MULTIPLE_CHOICE_QUESTION_FIXED_CHILDREN = [
  { type: SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

function projectSurfaceMultipleChoiceTargets(surface: JSONContent) {
  const question = resolveMultipleChoiceQuestion(surface);

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_MULTIPLE_CHOICE_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = McqSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "mcq",
    interaction: projectMcqInteraction(question),
    assessment: projectMcqAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectMcqSettings(settings),
    },
  });
  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerMultipleChoiceSurface(surface: JSONContent): JSONContent {
  const question = resolveMultipleChoiceQuestion(surface);
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child === question ? projectMcqLearnerNode(child) : child,
          ),
        }
      : {}),
  };
}

function resolveMultipleChoiceQuestion(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(
    surface,
    SLIDE_MULTIPLE_CHOICE_QUESTION_FIXED_CHILDREN,
  );
  if (!result.exact) {
    throw new Error(
      `Surface "${SLIDE_MULTIPLE_CHOICE_QUESTION_VARIANT_ID}" must contain exactly one multiple-choice question.`,
    );
  }
  return result.children[0]!;
}

export const slideMultipleChoiceQuestionSurfaceDefinition = {
  id: SLIDE_MULTIPLE_CHOICE_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Multiple Choice Question",
  description: "Full-slide question with one selectable answer.",
  catalogue: {
    section: "assessment",
    order: 50,
    preview: {
      kind: "column",
      children: [
        { kind: "slot", role: "title" },
        { kind: "slot", role: "content" },
      ],
      proportions: [1, 3],
    },
  },
  settingsSchema: SurfaceSettingsSchema,
  documentSemantics: createSurfaceDocumentSemantics({
    contentRootNodeTypes: [SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_MULTIPLE_CHOICE_QUESTION_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceMultipleChoiceTargets,
    projectLearnerSurface: projectLearnerMultipleChoiceSurface,
  },
  createSurface: ({ surfaceId }) => {
    const choiceIds = Array.from({ length: 4 }, () => createEmbeddedNodeId());
    return {
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: SLIDE_MULTIPLE_CHOICE_QUESTION_VARIANT_ID,
        settings: DEFAULT_SLIDE_MULTIPLE_CHOICE_QUESTION_SURFACE_SETTINGS,
      },
      content: [
        {
          type: SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
          attrs: {
            settings: McqSettingsSchema.parse({ legend: "Choose one answer" }),
            assessment: McqPrivateAssessmentSchema.parse({
              correctOptionId: choiceIds[0],
            }),
          },
          content: [
            {
              type: "assessment_title",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "Multiple choice" }] },
              ],
            },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Choose one" }] }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: choiceIds.map((id, index) => ({
                type: "selectable_choice",
                attrs: { id },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: `Option ${index + 1}` }],
                      },
                    ],
                  },
                ],
              })),
            },
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    };
  },
} satisfies SurfaceVariantDefinition;
