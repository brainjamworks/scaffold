import { CaretDownIcon as CaretDown } from "@phosphor-icons/react";
import { DropdownPrivateAssessmentSchema, DropdownSettingsSchema } from "@scaffold/contracts";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  dropdownResponseCodec,
  projectDropdownAssessment,
  projectDropdownInteraction,
  projectDropdownLearnerNode,
  projectDropdownSettings,
} from "./assessment";
import { dropdownChoiceLabelContent } from "./dropdown-choice-shared";

export const DROPDOWN_BLOCK_ID = "dropdown";

const dropdownConfiguration = createAssessmentConfiguration({
  schema: DropdownSettingsSchema,
  title: "Dropdown settings",
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
      name: "label",
      label: "Label",
      description: "Names the dropdown for learners using assistive technology.",
      placement: { sheet: { section: "presentation" } },
    },
    {
      kind: "text",
      name: "placeholder",
      label: "Placeholder",
      description: "Shown before the learner chooses an option.",
      placement: { sheet: { section: "presentation" } },
    },
  ] satisfies ConfigurationControlDescriptor[],
});

export const dropdownBlockDefinition = defineBlock({
  nodeType: "dropdown",
  boundedPlacement: "fill",
  configuration: dropdownConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    dropdown_choice: "Enter your option",
  },
  identity: {
    stableChildNodeTypes: ["dropdown_choice"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "single-select",
      experience: pageAssessmentExperience,
      response: dropdownResponseCodec,
      projection: {
        projectInteraction: projectDropdownInteraction,
        projectAssessment: projectDropdownAssessment,
        projectSettings: projectDropdownSettings,
        projectLearnerNode: projectDropdownLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: DROPDOWN_BLOCK_ID,
    category: "assessment",
    title: "Dropdown",
    description: "A compact single-choice question",
    icon: CaretDown,
    keywords: ["select", "menu", "choice", "question"],
    content: () => {
      const firstChoiceId = createStableId();
      const secondChoiceId = createStableId();

      return {
        type: "dropdown",
        attrs: {
          id: createStableId(),
          assessment: DropdownPrivateAssessmentSchema.parse({
            correctOptionId: firstChoiceId,
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
            content: [
              {
                type: "dropdown_choice",
                attrs: { id: firstChoiceId },
                content: [
                  {
                    type: "dropdown_choice_label",
                    content: dropdownChoiceLabelContent(),
                  },
                ],
              },
              {
                type: "dropdown_choice",
                attrs: { id: secondChoiceId },
                content: [
                  {
                    type: "dropdown_choice_label",
                    content: dropdownChoiceLabelContent(),
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
