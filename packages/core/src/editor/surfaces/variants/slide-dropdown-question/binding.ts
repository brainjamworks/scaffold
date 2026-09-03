import { z } from "zod";

import { dropdownConfiguration } from "@/editor/blocks/assessment/dropdown/dropdown-definition";
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
 * Explicit surface configuration for the slide dropdown question.
 *
 * This is a deliberately duplicated pairing: the question sheet, controls
 * and defaults are written out for this variant instead of projected from
 * the block configuration by generic machinery. Validation schemas are
 * shared (never duplicated); behaviour delegates to the shared draft
 * helpers. `binding-parity.test.ts` fails loudly if the block definition
 * drifts from this pairing.
 */
const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
if (!surfaceDefinition)
  throw new Error('Surface variant "slide-dropdown-question" is not registered.');
const expectedQuestion = requireFixedQuestionDefinition(surfaceDefinition);

const questionEditSchema = dropdownConfiguration.editSchema ?? dropdownConfiguration.schema;

const slideDropdownEditSchema = z
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

const slideDropdownQuestionControls = [
  // Standard assessment controls shared by every question family.
  ...createAssessmentConfigurationControls().map(asQuestionControl),
  // Dropdown's own controls, written out so this variant reads complete.
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
    placement: { sheet: { section: "attempts" } },
  },
  {
    kind: "text",
    name: "question.label",
    label: "Label",
    description: "Shown above the dropdown. Leave blank to use the assessment prompt as its name.",
    placement: { sheet: { section: "presentation" } },
  },
  {
    kind: "text",
    name: "question.placeholder",
    label: "Placeholder",
    description: "Shown before the learner chooses an option.",
    placement: { sheet: { section: "presentation" } },
  },
  ...ASSESSMENT_SURFACE_REGION_CONTROLS,
] as const satisfies readonly ConfigurationControlDescriptor[];

export const slideDropdownQuestionSurfaceConfiguration: ConfigurationDefinition =
  defineConfiguration({
    attr: "settings",
    schema: surfaceDefinition.settingsSchema,
    editSchema: slideDropdownEditSchema,
    read: ({ target }) =>
      readAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: dropdownConfiguration,
        expectedQuestion,
        target,
      }),
    apply: ({ tr, target, value }) =>
      applyAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: dropdownConfiguration,
        expectedQuestion,
        editSchema: slideDropdownEditSchema,
        tr,
        target,
        value,
      }),
    controls: [...slideDropdownQuestionControls],
    sheet: {
      title: "Dropdown settings",
      description: "Control grading, feedback, and answer review for this question.",
      sections: [
        {
          id: "behaviour",
          title: "Behaviour",
          description: "Set when learners get feedback and how this question counts.",
        },
        { id: "scoring", title: "Scoring" },
        { id: "attempts", title: "Attempts" },
        { id: "presentation", title: "Presentation" },
        { id: SURFACE_REGIONS_SECTION_ID, title: "Header and footer" },
      ],
      defaultOpenSections: ["scoring", SURFACE_REGIONS_SECTION_ID],
    },
  });
