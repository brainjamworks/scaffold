import { describe, expect, it } from "vite-plus/test";

import { dropdownConfiguration } from "@/editor/blocks/assessment/dropdown/dropdown-definition";

import { defineAssessmentSurfaceConfiguration } from "../../authoring/assessment-surface-configuration";
import { builtInSurfaceAuthoringViewBindings } from "../../authoring/surface-authoring-views";
import { builtInSurfaceVariantRegistry } from "../../model/built-in-surface-variant-definitions";
import { slideDropdownQuestionSurfaceConfiguration as binding } from "./binding";

const surfaceDefinition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
if (!surfaceDefinition) throw new Error("Surface variant is not registered.");

const reference = defineAssessmentSurfaceConfiguration({
  surfaceDefinition,
  questionConfiguration: dropdownConfiguration,
});

const sampleValue = {
  question: { points: 2, maxAttempts: null, label: "Choose one", placeholder: "Select…" },
  surface: { header: { enabled: false }, footer: { enabled: true } },
};

describe("slide dropdown binding parity", () => {
  it("is the configuration wired into the authoring registry", () => {
    const entry = builtInSurfaceAuthoringViewBindings.find(
      (binding) => binding.variantId === "slide-dropdown-question",
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
