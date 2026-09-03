import { z } from "zod";

import { multiselectConfiguration } from "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { createAssessmentConfigurationControls } from "@/editor/configuration/assessment-configuration";
import {
  defineConfiguration,
  type ConfigurationControlDescriptor,
  type ConfigurationDefinition,
} from "@/editor/configuration/definition";
import { SurfaceRegionToggleSchema } from "@/schemas/course-document";

import {
  applyAssessmentSurfaceDraft,
  ASSESSMENT_SURFACE_REGION_CONTROLS,
  readAssessmentSurfaceDraft,
  requireFixedQuestionDefinition,
  SURFACE_REGIONS_SECTION_ID,
} from "../../authoring/assessment-surface-configuration";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";

/**
 * Explicit surface configuration for the slide multiselect question.
 *
 * This is a deliberately duplicated pairing: the question sheet, controls
 * and defaults are written out for this variant instead of projected from
 * the block configuration by generic machinery. Validation schemas are
 * shared (never duplicated); behaviour delegates to the shared draft
 * helpers. `binding-parity.test.ts` fails loudly if the block definition
 * drifts from this pairing.
 */
const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-multiselect-question");
if (!surfaceDefinition)
  throw new Error('Surface variant "slide-multiselect-question" is not registered.');
const expectedQuestion = requireFixedQuestionDefinition(surfaceDefinition);

const questionEditSchema = multiselectConfiguration.editSchema ?? multiselectConfiguration.schema;

const slideMultiselectEditSchema = z
  .object({
    question: questionEditSchema,
    surface: z
      .object({
        header: SurfaceRegionToggleSchema,
        footer: SurfaceRegionToggleSchema,
      })
      .strict(),
  })
  .strict();

function asQuestionControl(
  control: ConfigurationControlDescriptor,
): ConfigurationControlDescriptor {
  return { ...control, name: `question.${control.name}` };
}

const slideMultiselectQuestionControls = [
  // Standard assessment controls shared by every question family.
  ...createAssessmentConfigurationControls().map(asQuestionControl),
  // Multi-select's own controls, written out so this variant reads complete.
  // If the block definition gains a control, binding-parity.test.ts fails
  // until it is added here explicitly.
  {
    kind: "number",
    name: "question.points",
    label: "Points",
    description: "Set the score value for this question.",
    min: 0,
    step: 1,
    integer: true,
    placement: { sheet: { section: "scoring" } },
  },
  {
    kind: "number",
    name: "question.maxAttempts",
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
    name: "question.maxSelect",
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
    name: "question.legend",
    label: "Accessible response label",
    description:
      "Used as the answer area label for assistive technology. Leave blank when the prompt already describes the expected response.",
    placement: { sheet: { section: "presentation" } },
  },
  ...ASSESSMENT_SURFACE_REGION_CONTROLS,
] as const satisfies readonly ConfigurationControlDescriptor[];

export const slideMultiselectQuestionSurfaceConfiguration: ConfigurationDefinition =
  defineConfiguration({
    attr: "settings",
    schema: surfaceDefinition.settingsSchema,
    editSchema: slideMultiselectEditSchema,
    read: ({ target }) =>
      readAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: multiselectConfiguration,
        expectedQuestion,
        target,
      }),
    apply: ({ tr, target, value }) =>
      applyAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: multiselectConfiguration,
        expectedQuestion,
        editSchema: slideMultiselectEditSchema,
        tr,
        target,
        value,
      }),
    controls: [...slideMultiselectQuestionControls],
    sheet: {
      title: "Multi-select settings",
      description: "Control grading, feedback, and answer review for this question.",
      sections: [
        {
          id: "behaviour",
          title: "Behaviour",
          description: "Set when learners get feedback and how this question counts.",
        },
        { id: "scoring", title: "Scoring" },
        { id: "attempts-selection", title: "Attempts and selection" },
        { id: "presentation", title: "Presentation" },
        { id: SURFACE_REGIONS_SECTION_ID, title: "Header and footer" },
      ],
      defaultOpenSections: ["scoring", SURFACE_REGIONS_SECTION_ID],
    },
  });
