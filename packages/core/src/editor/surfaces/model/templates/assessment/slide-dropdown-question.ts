import {
  AssessmentTargetContractSchema,
  DropdownPrivateAssessmentSchema,
  DropdownSettingsSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
} from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { assessmentControlDefinition } from "@/editor/blocks/assessment/shared/model/assessment-control-definition";
import {
  projectDropdownAssessment,
  projectDropdownInteraction,
  projectDropdownLearnerNode,
  projectDropdownSettings,
} from "@/editor/blocks/assessment/dropdown/assessment";
import {
  cloneJsonNodeWithoutContent,
  readAttrs,
  readContent,
  readStringAttr,
} from "@/editor/blocks/assessment/shared/publication/projection";
import { SurfaceSettingsSchema } from "@/schemas/course-document";
import { createSurfaceAssessmentTargets } from "../../assessment/surface-assessment-target";
import { SURFACE_DROPDOWN_QUESTION_NODE_TYPE } from "../../assessment/surface-dropdown-question-node";
import { createSurfaceDocumentSemantics } from "../../surface-document-semantics";
import { DEFAULT_SURFACE_SETTINGS } from "../../surface-settings";
import type { SurfaceVariantDefinition } from "../../surface-variant-definition";

export const DEFAULT_SLIDE_DROPDOWN_QUESTION_SURFACE_SETTINGS =
  SurfaceSettingsSchema.parse(DEFAULT_SURFACE_SETTINGS);

const SLIDE_DROPDOWN_QUESTION_VARIANT_ID = "slide-dropdown-question";

function projectSurfaceDropdownTargets(surface: JSONContent) {
  const content = readContent(surface);
  const questions = content.filter((child) => child.type === SURFACE_DROPDOWN_QUESTION_NODE_TYPE);
  const question = content.length === 1 && questions.length === 1 ? questions[0] : undefined;
  if (!question) {
    throw new Error(
      `Surface "${SLIDE_DROPDOWN_QUESTION_VARIANT_ID}" must contain exactly one Dropdown question.`,
    );
  }

  const assessmentTargetId = readStringAttr(question, "id");
  if (!assessmentTargetId) {
    throw new Error(
      `Surface "${SLIDE_DROPDOWN_QUESTION_VARIANT_ID}" question is missing its assessment target id.`,
    );
  }

  const settings = DropdownSettingsSchema.parse(readAttrs(question)["settings"] ?? {});
  const target = AssessmentTargetContractSchema.parse({
    schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
    targetId: assessmentTargetId,
    blockId: assessmentTargetId,
    blockType: "dropdown",
    interaction: projectDropdownInteraction(question),
    assessment: projectDropdownAssessment(question),
    settings: {
      feedbackMode: settings.feedbackMode,
      isGraded: settings.isGraded,
      showAnswer: settings.showAnswer,
      points: settings.points,
      maxAttempts: settings.maxAttempts,
      ...projectDropdownSettings(settings),
    },
  });
  return createSurfaceAssessmentTargets([target]);
}

function projectLearnerDropdownSurface(surface: JSONContent): JSONContent {
  return {
    ...cloneJsonNodeWithoutContent(surface),
    ...(surface.content
      ? {
          content: readContent(surface).map((child) =>
            child.type === SURFACE_DROPDOWN_QUESTION_NODE_TYPE
              ? projectDropdownLearnerNode(child)
              : child,
          ),
        }
      : {}),
  };
}

export const slideDropdownQuestionSurfaceDefinition = {
  id: SLIDE_DROPDOWN_QUESTION_VARIANT_ID,
  modes: ["slideshow"],
  title: "Dropdown Question",
  description: "Full-slide question answered from a dropdown menu.",
  catalogue: {
    section: "assessment",
    order: 70,
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
    contentRootNodeTypes: [SURFACE_DROPDOWN_QUESTION_NODE_TYPE],
  }),
  control: assessmentControlDefinition,
  structurePolicy: {
    fixedChildren: [{ type: SURFACE_DROPDOWN_QUESTION_NODE_TYPE }],
    allowRootInsertion: false,
  },
  assessmentTargets: {
    projectTargets: projectSurfaceDropdownTargets,
    projectLearnerSurface: projectLearnerDropdownSurface,
  },
  createSurface: ({ surfaceId }) => {
    const choiceIds = Array.from({ length: 4 }, () => createEmbeddedNodeId());
    return {
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: SLIDE_DROPDOWN_QUESTION_VARIANT_ID,
        settings: DEFAULT_SLIDE_DROPDOWN_QUESTION_SURFACE_SETTINGS,
      },
      content: [
        {
          type: SURFACE_DROPDOWN_QUESTION_NODE_TYPE,
          attrs: {
            settings: DropdownSettingsSchema.parse({ label: "Choose an answer" }),
            assessment: DropdownPrivateAssessmentSchema.parse({
              correctOptionId: choiceIds[0],
            }),
          },
          content: [
            {
              type: "assessment_title",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Dropdown" }] }],
            },
            {
              type: "assessment_instructions",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Select from the dropdown" }],
                },
              ],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "dropdown_choices_group",
              content: choiceIds.map((id, index) => ({
                type: "dropdown_choice",
                attrs: { id },
                content: [
                  {
                    type: "dropdown_choice_label",
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
