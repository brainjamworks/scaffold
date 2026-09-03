import { z } from "zod";

import { quizConfiguration } from "@/editor/blocks/assessment/quiz/quiz-definition";
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
 * Explicit surface configuration for the slide quiz.
 *
 * This is a deliberately duplicated pairing: the question sheet, controls
 * and defaults are written out for this variant instead of projected from
 * the block configuration by generic machinery. Validation schemas are
 * shared (never duplicated); behaviour delegates to the shared draft
 * helpers. `binding-parity.test.ts` fails loudly if the block definition
 * drifts from this pairing.
 */
const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-quiz");
if (!surfaceDefinition) throw new Error('Surface variant "slide-quiz" is not registered.');
const expectedQuestion = requireFixedQuestionDefinition(surfaceDefinition);

const questionEditSchema = quizConfiguration.editSchema ?? quizConfiguration.schema;

const slideQuizEditSchema = z
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

const slideQuizQuestionControls = [
  // Quiz's own controls, written out so this variant reads complete.
  // If the block definition gains a control, binding-parity.test.ts fails
  // until it is added here explicitly.
  {
    kind: "boolean",
    name: "question.allowBacktracking",
    label: "Allow backtracking",
    description: "Let learners return to previous questions before they are locked.",
    presentation: "switch",
    placement: { sheet: { section: "behaviour" } },
  },
  {
    kind: "select",
    name: "question.reviewTiming",
    label: "Review timing",
    description: "Choose whether answers are graded after the quiz or after each answer.",
    options: [
      { value: "after_quiz", label: "After quiz submission" },
      { value: "after_each_answer", label: "After each answer" },
    ],
    placement: { sheet: { section: "behaviour" } },
  },
  {
    kind: "select",
    name: "question.reviewDetail",
    label: "Review detail",
    description: "Choose how much review learners see after grading.",
    options: [
      { value: "none", label: "No review" },
      { value: "result_only", label: "Result only" },
      { value: "full_review", label: "Full review" },
    ],
    placement: { sheet: { section: "behaviour" } },
  },
  {
    kind: "number",
    name: "question.attemptsPerQuestion",
    label: "Attempts per question",
    description: "Limit retries when answers are submitted and reviewed one question at a time.",
    min: 1,
    max: 3,
    step: 1,
    integer: true,
    visibleWhen: { name: "question.reviewTiming", equals: "after_each_answer" },
    placement: { sheet: { section: "behaviour" } },
  },
  {
    kind: "boolean",
    name: "question.isGraded",
    label: "Graded",
    description: "Include this quiz in graded results.",
    presentation: "switch",
    placement: { sheet: { section: "scoring" } },
  },
  {
    kind: "number",
    name: "question.passingScore",
    label: "Passing score",
    description: "Set a normalized score from 0 to 1, or leave empty for no pass criterion.",
    min: 0,
    max: 1,
    step: 0.01,
    emptyValue: null,
    placement: { sheet: { section: "scoring" } },
  },
  {
    kind: "boolean",
    name: "question.timer.enabled",
    label: "Time limit",
    description: "Start the countdown when the learner begins the quiz.",
    presentation: "switch",
    placement: { sheet: { section: "timer" } },
  },
  {
    kind: "number",
    name: "question.timer.durationSeconds",
    label: "Duration",
    description: "Set the time limit in seconds.",
    min: 0,
    step: 60,
    integer: true,
    placement: { sheet: { section: "timer" } },
  },
  ...ASSESSMENT_SURFACE_REGION_CONTROLS,
] as const satisfies readonly ConfigurationControlDescriptor[];

export const slideQuizSurfaceConfiguration: ConfigurationDefinition = defineConfiguration({
  attr: "settings",
  schema: surfaceDefinition.settingsSchema,
  editSchema: slideQuizEditSchema,
  read: ({ target }) =>
    readAssessmentSurfaceDraft({
      surfaceDefinition,
      questionConfiguration: quizConfiguration,
      expectedQuestion,
      target,
    }),
  apply: ({ tr, target, value }) =>
    applyAssessmentSurfaceDraft({
      surfaceDefinition,
      questionConfiguration: quizConfiguration,
      expectedQuestion,
      editSchema: slideQuizEditSchema,
      tr,
      target,
      value,
    }),
  controls: [...slideQuizQuestionControls],
  sheet: {
    title: "Quiz settings",
    description: "Control the quiz flow, result visibility, answer review, scoring, and timer.",
    sections: [
      {
        id: "behaviour",
        title: "Learner flow",
        description:
          "Set how learners move through questions and what they can review after finishing.",
      },
      {
        id: "scoring",
        title: "Scoring",
        description: "Decide whether this quiz contributes to graded results.",
      },
      {
        id: "timer",
        title: "Timer",
        description: "Set an attempt-level countdown that starts when the learner begins.",
      },
      { id: SURFACE_REGIONS_SECTION_ID, title: "Header and footer" },
    ],
    defaultOpenSections: ["behaviour", SURFACE_REGIONS_SECTION_ID],
  },
});
