import { ListChecksIcon as ListChecks } from "@phosphor-icons/react";
import { QuizSettingsSchema } from "@scaffold/contracts";

import { ASSESSMENT_QUESTION_CONTENT } from "@/document/model/content-model/content-groups";
import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { emptyQuizSettings } from "./quiz-shared";

export const QUIZ_BLOCK_ID = "quiz";

const quizConfiguration = defineConfiguration({
  attr: "settings",
  schema: QuizSettingsSchema,
  createInitialDraft: emptyQuizSettings,
  sheet: {
    title: "Quiz settings",
    description: "Control the quiz flow, result visibility, answer review, scoring, and timer.",
    defaultOpenSections: ["behaviour"],
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
    ],
  },
  controls: [
    {
      kind: "boolean",
      name: "allowBacktracking",
      label: "Allow backtracking",
      description: "Let learners return to previous questions before they are locked.",
      presentation: "switch",
      placement: { sheet: { section: "behaviour" } },
    },
    {
      kind: "select",
      name: "reviewTiming",
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
      name: "reviewDetail",
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
      name: "attemptsPerQuestion",
      label: "Attempts per question",
      description: "Limit retries when answers are submitted and reviewed one question at a time.",
      min: 1,
      max: 3,
      step: 1,
      integer: true,
      visibleWhen: { name: "reviewTiming", equals: "after_each_answer" },
      placement: { sheet: { section: "behaviour" } },
    },
    {
      kind: "boolean",
      name: "isGraded",
      label: "Graded",
      description: "Include this quiz in graded results.",
      presentation: "switch",
      placement: { sheet: { section: "scoring" } },
    },
    {
      kind: "boolean",
      name: "timer.enabled",
      label: "Time limit",
      description: "Start the countdown when the learner begins the quiz.",
      presentation: "switch",
      placement: { sheet: { section: "timer" } },
    },
    {
      kind: "number",
      name: "timer.durationSeconds",
      label: "Duration",
      description: "Set the time limit in seconds.",
      min: 0,
      step: 60,
      integer: true,
      placement: { sheet: { section: "timer" } },
    },
  ],
});

export const quizBlockDefinition = defineBlock({
  nodeType: "quiz",
  boundedPlacement: "fill",
  stagedBoundedHost: {
    childGroup: ASSESSMENT_QUESTION_CONTENT,
  },
  configuration: quizConfiguration,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  interaction: {
    embeddedChildSelection: "delegate-to-parent",
  },
  childSettings: {
    managedFields: [
      {
        childGroup: "assessment_question",
        names: ["feedbackMode", "showAnswer", "maxAttempts", "isGraded"],
        reason: "Managed by quiz",
      },
    ],
  },
  insert: {
    id: QUIZ_BLOCK_ID,
    category: "assessment",
    title: "Quiz",
    description: "A staged set of assessment questions",
    icon: ListChecks,
    keywords: ["quiz", "assessment", "questions", "test"],
    content: () => ({
      type: "quiz",
      attrs: {
        id: createStableId(),
        settings: emptyQuizSettings(),
      },
    }),
  },
});
