import { z } from "zod";

import { categoriseConfiguration } from "@/editor/blocks/assessment/categorise/categorise-definition";
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
} from "../../authoring/assessment-surface-draft";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";

/**
 * Explicit surface configuration for the slide categorise question.
 *
 * This is a deliberately duplicated pairing: the question sheet, controls
 * and defaults are written out for this variant instead of projected from
 * the block configuration by generic machinery. Validation schemas are
 * shared (never duplicated); behaviour delegates to the shared draft
 * helpers. If the block definition drifts from this pairing, add the
 * missing controls here by hand: nothing projects them automatically.
 */
const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-categorise-question");
if (!surfaceDefinition)
  throw new Error('Surface variant "slide-categorise-question" is not registered.');
const expectedQuestion = requireFixedQuestionDefinition(surfaceDefinition);

const questionEditSchema = categoriseConfiguration.editSchema ?? categoriseConfiguration.schema;

const slideCategoriseEditSchema = z
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

const slideCategoriseQuestionControls = [
  // Standard assessment controls shared by every question family.
  ...createAssessmentConfigurationControls().map(asQuestionControl),
  // Categorise's own controls, written out so this variant reads complete.
  // If the block definition gains a control, add it here explicitly:
  // nothing projects it automatically.
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
    name: "question.legend",
    label: "Accessible response label",
    description:
      "Used as the answer area label for assistive technology. Leave blank when the prompt already describes the expected response.",
    placement: { sheet: { section: "presentation" } },
  },
  ...ASSESSMENT_SURFACE_REGION_CONTROLS,
] as const satisfies readonly ConfigurationControlDescriptor[];

export const slideCategoriseQuestionSurfaceConfiguration: ConfigurationDefinition =
  defineConfiguration({
    attr: "settings",
    schema: surfaceDefinition.settingsSchema,
    editSchema: slideCategoriseEditSchema,
    read: ({ target }) =>
      readAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: categoriseConfiguration,
        expectedQuestion,
        target,
      }),
    apply: ({ tr, target, value }) =>
      applyAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: categoriseConfiguration,
        expectedQuestion,
        editSchema: slideCategoriseEditSchema,
        tr,
        target,
        value,
      }),
    controls: [...slideCategoriseQuestionControls],
    sheet: {
      title: "Categorise settings",
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
