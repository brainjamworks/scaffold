import { describe, expect, it } from "vite-plus/test";

import { quizConfiguration } from "@/editor/blocks/assessment/quiz/quiz-definition";

import { defineAssessmentSurfaceConfiguration } from "../../authoring/assessment-surface-configuration";
import { builtInSurfaceAuthoringViewBindings } from "../../authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";
import { slideQuizSurfaceConfiguration as binding } from "./binding";

const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-quiz");
if (!surfaceDefinition) throw new Error("Surface variant is not registered.");

const reference = defineAssessmentSurfaceConfiguration({
  surfaceDefinition,
  questionConfiguration: quizConfiguration,
});

const sampleValue = {
  question: {
    allowBacktracking: true,
    reviewTiming: "after_each_answer",
    reviewDetail: "full_review",
    attemptsPerQuestion: 2,
    isGraded: true,
    passingScore: 0.7,
    timer: { enabled: true, durationSeconds: 600 },
  },
  surface: { header: { enabled: false }, footer: { enabled: true } },
};

describe("slide quiz binding parity", () => {
  it("is the configuration wired into the authoring registry", () => {
    const entry = builtInSurfaceAuthoringViewBindings.find(
      (binding) => binding.variantId === "slide-quiz",
    );
    expect(entry?.configuration).toBe(binding);
  });

  it("exposes the same controls in the same order", () => {
    expect(binding.controls.map((control) => control.name)).toEqual(
      reference.controls.map((control) => control.name),
    );
    expect(binding.controls).toEqual(reference.controls);
  });

  it("exposes the same sheet", () => {
    expect(binding.sheet).toEqual(reference.sheet);
  });

  it("accepts and rejects the same edit values", () => {
    const bindingSchema = binding.editSchema;
    const referenceSchema = reference.editSchema;
    expect(bindingSchema).toBeDefined();
    expect(referenceSchema).toBeDefined();
    if (!bindingSchema || !referenceSchema) return;
    expect(bindingSchema.safeParse(sampleValue)).toEqual(referenceSchema.safeParse(sampleValue));
    expect(bindingSchema.safeParse({ question: {}, surface: {} }).success).toBe(
      referenceSchema.safeParse({ question: {}, surface: {} }).success,
    );
  });
});
