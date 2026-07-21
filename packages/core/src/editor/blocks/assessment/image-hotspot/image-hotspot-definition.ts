import { TargetIcon as Target } from "@phosphor-icons/react";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import { defineAssessmentCapability, defineBlock } from "@/editor/blocks/block-definition";
import {
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
} from "@scaffold/contracts";

import {
  imageHotspotResponseCodec,
  projectImageHotspotAssessment,
  projectImageHotspotInteraction,
  projectImageHotspotLearnerNode,
  projectImageHotspotSettings,
} from "./assessment";

export const IMAGE_HOTSPOT_BLOCK_ID = "image_hotspot";

const imageHotspotConfiguration = createAssessmentConfiguration({
  schema: ImageHotspotSettingsSchema,
  title: "Image hotspot settings",
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

export const imageHotspotBlockDefinition = defineBlock({
  nodeType: "image_hotspot",
  configuration: imageHotspotConfiguration,
  placeholders: assessmentShellPlaceholders,
  boundedPlacement: "fill",
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "spatial-hotspot",
      experience: pageAssessmentExperience,
      response: imageHotspotResponseCodec,
      projection: {
        projectInteraction: projectImageHotspotInteraction,
        projectAssessment: projectImageHotspotAssessment,
        projectSettings: projectImageHotspotSettings,
        projectLearnerNode: projectImageHotspotLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: IMAGE_HOTSPOT_BLOCK_ID,
    category: "assessment",
    title: "Image hotspot",
    description: "Click on regions of an image to answer",
    icon: Target,
    keywords: ["hotspot", "image", "click", "region", "identify", "spatial"],
    content: () => ({
      type: "image_hotspot",
      attrs: {
        id: createStableId(),
        assessment: ImageHotspotPrivateAssessmentSchema.parse({}),
      },
      content: [
        {
          type: "assessment_title",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Image hotspot" }] }],
        },
        {
          type: "assessment_instructions",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Click the correct region" }] },
          ],
        },
        { type: "assessment_prompt", content: [{ type: "paragraph" }] },
        { type: "image_hotspot_canvas" },
        {
          type: "assessment_actions_group",
          content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
        },
      ],
    }),
  },
});
