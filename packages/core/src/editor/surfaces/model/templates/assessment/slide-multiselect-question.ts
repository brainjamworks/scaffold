import {
  AssessmentTargetContractSchema,
  MultiselectPrivateAssessmentSchema,
  MultiselectSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/assessment/shared/model/assessment-control-definition";
import {
  projectMultiselectAssessment,
  projectMultiselectInteraction,
  projectMultiselectLearnerNode,
  projectMultiselectSettings,
} from "@/editor/assessment/multiselect/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_MULTISELECT_QUESTION_NODE_TYPE } from "../../assessment/surface-multiselect-question-node";
import { matchFixedSurfaceChildrenFromJSON } from "../../policies/surface-fixed-structure";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { FixedSurfaceChild, SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_MULTISELECT_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_MULTISELECT_QUESTION_VARIANT_ID = "slide-multiselect-question";
const SLIDE_MULTISELECT_QUESTION_FIXED_CHILDREN = [
  { type: SURFACE_MULTISELECT_QUESTION_NODE_TYPE },
] as const satisfies readonly FixedSurfaceChild[];

function projectSurfaceMultiselectTargets(surface: JSONContent) {
  const question = resolveMultiselectQuestion(surface);

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_MULTISELECT_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = MultiselectSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "multiselect",
    interaction: projectMultiselectInteraction(question, settings),
    assessment: projectMultiselectAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectMultiselectSettings(settings),
    },
  });
  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerMultiselectSurface(surface: JSONContent): JSONContent {
  const question = resolveMultiselectQuestion(surface);
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child === question ? projectMultiselectLearnerNode(child) : child,
          ),
        }
      : {}),
  };
}

function resolveMultiselectQuestion(surface: JSONContent): JSONContent {
  const result = matchFixedSurfaceChildrenFromJSON(
    surface,
    SLIDE_MULTISELECT_QUESTION_FIXED_CHILDREN,
  );
  if (!result.exact) {
    throw new Error(
      `Surface "${SLIDE_MULTISELECT_QUESTION_VARIANT_ID}" must contain exactly one multi-select question.`,
    );
  }
  return result.children[0]!;
}

export const slideMultiselectQuestionSurfaceDefinition = {
  id: SLIDE_MULTISELECT_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Multi-select Question",
  description: "Full-slide question with one or more selectable answers.",
  catalogue: {
    section: "assessment",
    order: 60,
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
    contentRootNodeTypes: [SURFACE_MULTISELECT_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: SLIDE_MULTISELECT_QUESTION_FIXED_CHILDREN,
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceMultiselectTargets,
    projectLearnerSurface: projectLearnerMultiselectSurface,
  },
  createSurface: ({ surfaceId }) => {
    const choiceIds = Array.from({ length: 4 }, () => createEmbeddedNodeId());
    return {
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: SLIDE_MULTISELECT_QUESTION_VARIANT_ID,
        settings: DEFAULT_SLIDE_MULTISELECT_QUESTION_SURFACE_SETTINGS,
      },
      content: [
        {
          type: SURFACE_MULTISELECT_QUESTION_NODE_TYPE,
          attrs: {
            settings: MultiselectSettingsSchema.parse({ legend: "Choose all that apply" }),
            assessment: MultiselectPrivateAssessmentSchema.parse({
              correctOptionIds: choiceIds.slice(0, 2),
            }),
          },
          content: [
            {
              type: "assessment_title",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Multi-select" }] }],
            },
            {
              type: "assessment_instructions",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Choose all that apply" }],
                },
              ],
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
