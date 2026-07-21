import { ListNumbersIcon as ListNumbers } from "@phosphor-icons/react";
import { SequencingPrivateAssessmentSchema, SequencingSettingsSchema } from "@scaffold/contracts";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  sequencingResponseCodec,
  projectSequencingAssessment,
  projectSequencingInteraction,
  projectSequencingLearnerNode,
  projectSequencingSettings,
} from "./assessment";

export const SEQUENCING_BLOCK_ID = "sequencing";

const sequencingConfiguration = createAssessmentConfiguration({
  schema: SequencingSettingsSchema,
  title: "Sequencing settings",
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

export const sequencingBlockDefinition = defineBlock({
  nodeType: "sequencing",
  boundedPlacement: "fill",
  configuration: sequencingConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    sequencing_item: "Enter your step",
  },
  identity: {
    stableChildNodeTypes: ["sequencing_item"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "sequence",
      experience: pageAssessmentExperience,
      response: sequencingResponseCodec,
      projection: {
        projectInteraction: projectSequencingInteraction,
        projectAssessment: projectSequencingAssessment,
        projectSettings: projectSequencingSettings,
        projectLearnerNode: projectSequencingLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: SEQUENCING_BLOCK_ID,
    category: "assessment",
    title: "Sequencing",
    description: "Arrange items in the correct order",
    icon: ListNumbers,
    keywords: ["order", "arrange", "sort", "drag"],
    content: () => {
      const itemIds = [createStableId(), createStableId(), createStableId()];

      return {
        type: "sequencing",
        attrs: {
          id: createStableId(),
          assessment: SequencingPrivateAssessmentSchema.parse({
            correctOrder: itemIds,
          }),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Sequencing" }] }],
          },
          {
            type: "assessment_instructions",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Drag to reorder" }] }],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "sequencing_items_group",
            content: itemIds.map((id) => ({
              type: "sequencing_item",
              attrs: { id },
              content: [{ type: "paragraph" }],
            })),
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
