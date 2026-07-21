import { BracketsCurlyIcon as BracketsCurly } from "@phosphor-icons/react";

import { assessmentShellPlaceholders } from "@/editor/blocks/assessment/shared/nodes/assessment-placeholders";
import { pageAssessmentExperience } from "@/editor/blocks/assessment/shared/model/assessment-capability";
import { createStableId } from "@/document/model/identity/stable-ids";
import { createAssessmentConfiguration } from "@/editor/configuration/assessment-configuration";
import type { ConfigurationControlDescriptor } from "@/editor/configuration/definition";
import {
  defineAssessmentCapability,
  defineBlock,
  type BlockAuthoringControlsInput,
  type BlockAuthoringMenuControlDescriptor,
} from "@/editor/blocks/block-definition";
import { FillBlanksPrivateAssessmentSchema, FillBlanksSettingsSchema } from "@scaffold/contracts";

import {
  fillBlanksResponseCodec,
  projectFillBlanksAssessment,
  projectFillBlanksInteraction,
  projectFillBlanksLearnerNode,
  projectFillBlanksSettings,
} from "./assessment";
import {
  applyFillBlankToEditor,
  canApplyFillBlankToEditor,
  createFillBlankAssessmentEntry,
} from "./commands";

export const FILL_BLANKS_BLOCK_ID = "fill_blanks";

const fillBlanksConfiguration = createAssessmentConfiguration({
  schema: FillBlanksSettingsSchema,
  title: "Fill in the blanks settings",
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

function blankNode(answer: string) {
  const id = createStableId();
  return {
    type: "fill_blank",
    attrs: {
      id,
      placeholder: "",
    },
    assessmentEntry: createFillBlankAssessmentEntry(answer),
  };
}

function fillBlanksAuthoringControls({
  editor,
}: BlockAuthoringControlsInput): readonly BlockAuthoringMenuControlDescriptor[] {
  const canCreateBlank = canApplyFillBlankToEditor(editor);

  return [
    {
      kind: "action",
      id: "fill-blanks:create-blank",
      label: "Create blank",
      icon: BracketsCurly,
      presentation: "icon-only",
      disabled: !canCreateBlank,
      run: () => {
        if (!canCreateBlank) return;
        applyFillBlankToEditor(editor);
      },
    },
  ];
}

export const fillBlanksBlockDefinition = defineBlock({
  nodeType: "fill_blanks",
  boundedPlacement: "fill",
  authoringControls: {
    controls: fillBlanksAuthoringControls,
  },
  configuration: fillBlanksConfiguration,
  placeholders: {
    ...assessmentShellPlaceholders,
    fill_blanks_body: "Write the sentence or paragraph",
  },
  identity: {
    stableChildNodeTypes: ["fill_blank"],
  },
  capabilities: {
    assessment: defineAssessmentCapability({
      interactionKind: "fill-blanks",
      experience: pageAssessmentExperience,
      response: fillBlanksResponseCodec,
      projection: {
        projectInteraction: projectFillBlanksInteraction,
        projectAssessment: projectFillBlanksAssessment,
        projectSettings: projectFillBlanksSettings,
        projectLearnerNode: projectFillBlanksLearnerNode,
      },
    }),
  },
  frame: {
    preserveAspectRatio: true,
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: FILL_BLANKS_BLOCK_ID,
    category: "assessment",
    title: "Fill in the blanks",
    description: "Learners type missing words into a sentence",
    icon: BracketsCurly,
    keywords: ["fill", "blank", "cloze", "gap", "text", "completion"],
    content: () => {
      const blank = blankNode("Paris");
      return {
        type: "fill_blanks",
        attrs: {
          id: createStableId(),
          assessment: FillBlanksPrivateAssessmentSchema.parse({
            blanksById: {
              [blank.attrs.id]: blank.assessmentEntry,
            },
          }),
        },
        content: [
          {
            type: "assessment_title",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Fill in the blanks" }] },
            ],
          },
          {
            type: "assessment_instructions",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Complete each blank" }] },
            ],
          },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "fill_blanks_body",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "The capital of France is " },
                  {
                    type: blank.type,
                    attrs: blank.attrs,
                  },
                  { type: "text", text: "." },
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
