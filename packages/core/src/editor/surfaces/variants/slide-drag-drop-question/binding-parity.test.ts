import { describe, expect, it } from "vite-plus/test";

import { dragDropConfiguration } from "@/editor/blocks/assessment/drag-drop/drag-drop-definition";

import { defineAssessmentSurfaceConfiguration } from "../../authoring/assessment-surface-configuration";
import { builtInSurfaceAuthoringViewBindings } from "../../authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";
import { slideDragDropQuestionSurfaceConfiguration as binding } from "./binding";

const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
if (!surfaceDefinition) throw new Error("Surface variant is not registered.");

const reference = defineAssessmentSurfaceConfiguration({
  surfaceDefinition,
  questionConfiguration: dragDropConfiguration,
});

const sampleValue = {
  question: {
    gradingMode: "partial-credit",
    points: 2,
    maxAttempts: null,
    legend: "Place each marker",
  },
  surface: { header: { enabled: false }, footer: { enabled: true } },
};

describe("slide drag-drop binding parity", () => {
  it("is the configuration wired into the authoring registry", () => {
    const entry = builtInSurfaceAuthoringViewBindings.find(
      (binding) => binding.variantId === "slide-drag-drop-question",
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
