import type { AssessmentExperienceDefinition } from "@/editor/blocks/block-definition";

export type AssessmentExperienceConfig = AssessmentExperienceDefinition;

export const pageAssessmentExperience = {
  submit: true,
  attempts: true,
  hints: true,
  showAnswer: true,
  summaryFeedback: true,
  perItemFeedback: true,
} satisfies AssessmentExperienceDefinition;
