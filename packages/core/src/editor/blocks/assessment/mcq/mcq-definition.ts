import { RadioButtonIcon as RadioButton } from "@phosphor-icons/react";
import { McqPrivateAssessmentSchema, McqSettingsSchema } from "@scaffold/contracts";

import {
  assessmentShellPlaceholders,
  selectableChoicePlaceholders,
} from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  mcqResponseCodec,
  projectMcqAssessment,
  projectMcqInteraction,
  projectMcqLearnerNode,
  projectMcqSettings,
} from "./assessment";

export const MCQ_BLOCK_ID = "mcq";

const mcqConfiguration = createAssessmentConfiguration({
  schema: McqSettingsSchema,
  title: "Multiple choice settings",
  defaultOpenSections: ["scoring"],
  sections: [
    { id: "scoring", title: "Scoring" },
    { id: "attempts", title: "Attempts" },
    { id: "presentation", title: "Presentation" },
  ],
  controls: [
    {
      kind: "number",
      name: "points",
      label: "Points",
      description: "Set the score value for this question.",
      min: 0,
      step: 1,
      integer: true,
      placement: { sheet: { section: "scoring" } },
    },
    {
      kind: "number",
      name: "maxAttempts",
      label: "Max attempts",
      description: "Leave blank to allow unlimited attempts.",
      min: 1,
      step: 1,
      integer: true,
      emptyValue: null,
      placement: { sheet: { section: "attempts" } },
    },
    {
      kind: "text",
      name: "legend",
      label: "Accessible response label",
      description:
        "Used as the answer area label for assistive technology. Leave blank when the prompt already describes the expected response.",
      placement: { sheet: { section: "presentation" } },
    },
  ] satisfies ConfigurationControlDescriptor[],
});

export const mcqBlockDefinition = defineBlock({
  nodeType: "mcq",
  boundedPlacement: "fill",
  configuration: mcqConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    ...selectableChoicePlaceholders,
  },
  identity: {
    stableChildNodeTypes: ["selectable_choice"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "single-select",
      experience: pageAssessmentExperience,
      response: mcqResponseCodec,
      projection: {
        projectInteraction: projectMcqInteraction,
        projectAssessment: projectMcqAssessment,
        projectSettings: projectMcqSettings,
        projectLearnerNode: projectMcqLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: false,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: MCQ_BLOCK_ID,
    category: "assessment",
    title: "Multiple choice",
    description: "A question with one correct answer",
    icon: RadioButton,
    keywords: ["quiz", "question", "radio"],
    content: () => {
      const firstChoiceId = createStableId();
      const secondChoiceId = createStableId();

      return {
        type: "mcq",
        attrs: {
          id: createStableId(),
          assessment: McqPrivateAssessmentSchema.parse({
            correctOptionId: firstChoiceId,
          }),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Multiple choice" }] }],
          },
          {
            type: "assessment_instructions",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Choose one" }] }],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "assessment_choices_group",
            content: [
              {
                type: "selectable_choice",
                attrs: { id: firstChoiceId },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
              {
                type: "selectable_choice",
                attrs: { id: secondChoiceId },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [{ type: "paragraph" }],
                  },
                ],
              },
            ],
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      };
    },
  },
});
