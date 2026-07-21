import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import { MultiselectPrivateAssessmentSchema, MultiselectSettingsSchema } from "@scaffold/contracts";

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
  multiselectResponseCodec,
  projectMultiselectAssessment,
  projectMultiselectInteraction,
  projectMultiselectLearnerNode,
  projectMultiselectSettings,
} from "./assessment";

export const MULTISELECT_BLOCK_ID = "multiselect";

const multiselectConfiguration = createAssessmentConfiguration({
  schema: MultiselectSettingsSchema,
  title: "Multi-select settings",
  defaultOpenSections: ["scoring"],
  sections: [
    { id: "scoring", title: "Scoring" },
    { id: "attempts-selection", title: "Attempts and selection" },
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
      placement: { sheet: { section: "attempts-selection" } },
    },
    {
      kind: "number",
      name: "maxSelect",
      label: "Max selections",
      description: "Leave blank to let learners choose any number of options.",
      min: 1,
      step: 1,
      integer: true,
      emptyValue: null,
      placement: { sheet: { section: "attempts-selection" } },
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

export const multiselectBlockDefinition = defineBlock({
  nodeType: "multiselect",
  boundedPlacement: "fill",
  configuration: multiselectConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    ...selectableChoicePlaceholders,
  },
  identity: {
    stableChildNodeTypes: ["selectable_choice"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "multi-select",
      experience: pageAssessmentExperience,
      response: multiselectResponseCodec,
      projection: {
        projectInteraction: projectMultiselectInteraction,
        projectAssessment: projectMultiselectAssessment,
        projectSettings: projectMultiselectSettings,
        projectLearnerNode: projectMultiselectLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: MULTISELECT_BLOCK_ID,
    category: "assessment",
    title: "Multi-select",
    description: "A question with one or more correct answers",
    icon: ListChecks,
    keywords: ["checkbox", "question", "multi"],
    content: () => {
      const firstChoiceId = createStableId();
      const secondChoiceId = createStableId();
      const thirdChoiceId = createStableId();

      return {
        type: "multiselect",
        attrs: {
          id: createStableId(),
          assessment: MultiselectPrivateAssessmentSchema.parse({
            correctOptionIds: [firstChoiceId, secondChoiceId],
          }),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Multiselect" }] }],
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
              {
                type: "selectable_choice",
                attrs: { id: thirdChoiceId },
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
