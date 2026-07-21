import { CardsIcon as Cards } from "@phosphor-icons/react";
import { MatchingPrivateAssessmentSchema, MatchingSettingsSchema } from "@scaffold/contracts";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  matchingResponseCodec,
  projectMatchingAssessment,
  projectMatchingInteraction,
  projectMatchingLearnerNode,
  projectMatchingSettings,
} from "./assessment";

export const MATCHING_BLOCK_ID = "matching";

const matchingConfiguration = createAssessmentConfiguration({
  schema: MatchingSettingsSchema,
  title: "Matching settings",
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

function fieldContent() {
  return [{ type: "paragraph" }];
}

function makePair() {
  const targetId = createStableId();
  return {
    type: "matching_pair",
    attrs: {
      itemId: createStableId(),
      targetId,
    },
    content: [
      { type: "matching_item", content: fieldContent() },
      { type: "matching_target", content: fieldContent() },
    ],
  };
}

export const matchingBlockDefinition = defineBlock({
  nodeType: "matching",
  boundedPlacement: "fill",
  configuration: matchingConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    matching_item: "Enter your item",
    matching_target: "Enter your match",
  },
  identity: {
    stableChildNodeTypes: ["matching_pair"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "match",
      experience: pageAssessmentExperience,
      response: matchingResponseCodec,
      projection: {
        projectInteraction: projectMatchingInteraction,
        projectAssessment: projectMatchingAssessment,
        projectSettings: projectMatchingSettings,
        projectLearnerNode: projectMatchingLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: MATCHING_BLOCK_ID,
    category: "assessment",
    title: "Matching",
    description: "Match each item to the correct target",
    icon: Cards,
    keywords: ["pair", "match", "term", "definition", "drag"],
    content: () => {
      const pairs = [makePair(), makePair(), makePair()];
      return {
        type: "matching",
        attrs: {
          id: createStableId(),
          assessment: MatchingPrivateAssessmentSchema.parse({
            correctPairs: pairs.map((pair) => ({
              itemId: pair.attrs.itemId,
              targetId: pair.attrs.targetId,
            })),
          }),
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
            content: pairs,
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
