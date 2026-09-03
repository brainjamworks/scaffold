import { z } from "zod";

import { dragDropConfiguration } from "@/editor/blocks/assessment/drag-drop/drag-drop-definition";
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
 * Explicit surface configuration for the slide drag-drop question.
 *
 * This is a deliberately duplicated pairing: the question sheet, controls
 * and defaults are written out for this variant instead of projected from
 * the block configuration by generic machinery. Validation schemas are
 * shared (never duplicated); behaviour delegates to the shared draft
 * helpers. `binding-parity.test.ts` fails loudly if the block definition
 * drifts from this pairing.
 */
const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
if (!surfaceDefinition)
  throw new Error('Surface variant "slide-drag-drop-question" is not registered.');
const expectedQuestion = requireFixedQuestionDefinition(surfaceDefinition);

const questionEditSchema = dragDropConfiguration.editSchema ?? dragDropConfiguration.schema;

const slideDragDropEditSchema = z
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

const slideDragDropQuestionControls = [
  // Standard assessment controls shared by every question family.
  ...createAssessmentConfigurationControls().map(asQuestionControl),
  // Drag-drop's own controls, written out so this variant reads complete.
  // If the block definition gains a control, binding-parity.test.ts fails
  // until it is added here explicitly.
  {
    kind: "select",
    name: "question.gradingMode",
    label: "Grading",
    description: "Give equal partial credit per marker or require every marker to be correct.",
    options: [
      { value: "partial-credit", label: "Partial credit" },
      { value: "all-or-nothing", label: "All or nothing" },
    ],
    placement: { sheet: { section: "scoring" } },
  },
  {
    kind: "number",
    name: "question.points",
    label: "Points",
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
    description: "Describe the marker placement area when the prompt does not.",
    placement: { sheet: { section: "presentation" } },
  },
  ...ASSESSMENT_SURFACE_REGION_CONTROLS,
] as const satisfies readonly ConfigurationControlDescriptor[];

export const slideDragDropQuestionSurfaceConfiguration: ConfigurationDefinition =
  defineConfiguration({
    attr: "settings",
    schema: surfaceDefinition.settingsSchema,
    editSchema: slideDragDropEditSchema,
    read: ({ target }) =>
      readAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: dragDropConfiguration,
        expectedQuestion,
        target,
      }),
    apply: ({ tr, target, value }) =>
      applyAssessmentSurfaceDraft({
        surfaceDefinition,
        questionConfiguration: dragDropConfiguration,
        expectedQuestion,
        editSchema: slideDragDropEditSchema,
        tr,
        target,
        value,
      }),
    controls: [...slideDragDropQuestionControls],
    sheet: {
      title: "Drag and Drop settings",
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
