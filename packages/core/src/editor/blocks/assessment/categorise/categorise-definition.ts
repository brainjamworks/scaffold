import { ListBulletsIcon as ListBullets } from "@phosphor-icons/react";
import { CategorisePrivateAssessmentSchema, CategoriseSettingsSchema } from "@scaffold/contracts";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  categoriseResponseCodec,
  projectCategoriseAssessment,
  projectCategoriseInteraction,
  projectCategoriseLearnerNode,
  projectCategoriseSettings,
} from "./assessment";

export const CATEGORISE_BLOCK_ID = "categorise";

const categoriseConfiguration = createAssessmentConfiguration({
  schema: CategoriseSettingsSchema,
  title: "Categorise settings",
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

function makeItem() {
  return {
    type: "categorise_item",
    attrs: { id: createStableId() },
    content: [{ type: "categorise_item_body", content: [{ type: "paragraph" }] }],
  };
}

function makeBin(items: ReturnType<typeof makeItem>[]) {
  return {
    type: "categorise_bin",
    attrs: { id: createStableId() },
    content: [
      { type: "categorise_bin_title", content: [{ type: "paragraph" }] },
      { type: "categorise_items_group", content: items },
    ],
  };
}

export const categoriseBlockDefinition = defineBlock({
  nodeType: "categorise",
  boundedPlacement: "fill",
  configuration: categoriseConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    categorise_bin_title: "Enter your category name",
    categorise_item_body: "Enter your item",
  },
  identity: {
    stableChildNodeTypes: ["categorise_bin", "categorise_item"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "classify",
      experience: pageAssessmentExperience,
      response: categoriseResponseCodec,
      projection: {
        projectInteraction: projectCategoriseInteraction,
        projectAssessment: projectCategoriseAssessment,
        projectSettings: projectCategoriseSettings,
        projectLearnerNode: projectCategoriseLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: CATEGORISE_BLOCK_ID,
    category: "assessment",
    title: "Categorise",
    description: "Sort items into categories",
    icon: ListBullets,
    keywords: ["category", "categorize", "classify", "sort", "bin", "bucket", "drag"],
    content: () => {
      const bins = [makeBin([makeItem(), makeItem()]), makeBin([makeItem(), makeItem()])];

      return {
        type: "categorise",
        attrs: {
          id: createStableId(),
          assessment: CategorisePrivateAssessmentSchema.parse({}),
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Categorise" }] }],
          },
          {
            type: "assessment_instructions",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Sort into categories" }] },
            ],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "categorise_content",
            content: [
              {
                type: "categorise_bins_group",
                content: bins,
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
