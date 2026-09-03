// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { projectMcqLearnerNode } from "@/editor/blocks/assessment/mcq/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { AssessmentPort } from "@/host/ports";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideMultipleChoiceQuestionSurfaceRuntimeView", () => {
  it("registers one private target and preserves a restored single-choice response", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      await waitFor(() => expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true));
      await waitFor(() =>
        expect(
          getControlBindingRegistryForEditor(editor).get(
            EmbeddedNodeIdSchema.parse("surface00001"),
          ),
        ).toBeDefined(),
      );
      const store = requireAssessmentStore(assessmentStore);
      expect(store.getState().registrations[problemId]).toMatchObject({
        targetId: assessmentTargetId,
        interactionKind: "single-select",
      });
      expect(document.querySelectorAll('[data-mcq-presentation="full-slide"]')).toHaveLength(1);
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="multiple-choice"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-node="surface_multiple_choice_question"]'),
      ).toHaveAttribute("data-surface-assessment-question");

      expect(
        setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00003"),
      ).toBe(true);
      await waitFor(() =>
        expect(screen.getByRole("radio", { name: "Jupiter", checked: true })).toBeInTheDocument(),
      );
      fireEvent(window, new Event("resize"));
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        choices: "choice_00003",
      });
    } finally {
      editor.destroy();
    }
  });

  it("submits the canonical response and resolves feedback through the Surface target", async () => {
    const editor = createRuntimeEditor();
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items: {
            choice_00001: {
              correct: false,
              expected: false,
              given: true,
              feedback: richFeedback("Look beyond the nearest planet."),
            },
          },
        },
        { response: request.response },
      ),
    );

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: { type: "runtime", submit },
          children: createElement(EditorContent, { editor }),
        }),
      );

      fireEvent.click(await screen.findByRole("radio", { name: "Venus" }));
      const submitButton = await screen.findByRole("button", { name: "Submit" });
      await waitFor(() => expect(submitButton).toBeEnabled());
      fireEvent.click(submitButton);

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: { kind: "single-select", optionId: "choice_00001" },
        }),
      );
      expect(
        await screen.findByRole("button", { name: "Show feedback for Venus" }),
      ).toBeInTheDocument();
    } finally {
      editor.destroy();
    }
  });

  it("keeps full-slide option ordinals unique beyond Z", async () => {
    const labels = Array.from({ length: 28 }, (_, index) => `Option ${index + 1}`);
    const editor = createRuntimeEditor(labels);

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
        }),
      );

      await screen.findByRole("radio", { name: "Option 28" });
      const ordinals = Array.from(
        document.querySelectorAll<HTMLElement>(".sc-course-selectable-choice-interaction__ordinal"),
        (ordinal) => ordinal.textContent,
      );

      expect(ordinals.slice(24)).toEqual(["Y", "Z", "AA", "AB"]);
      expect(new Set(ordinals).size).toBe(ordinals.length);
    } finally {
      editor.destroy();
    }
  });
});

function createRuntimeEditor(labels?: readonly string[]) {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: multipleChoiceQuestionDocument(labels),
  });
}

function multipleChoiceQuestionDocument(labels?: readonly string[]): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiple-choice-question");
  if (!definition) throw new Error("Expected slide-multiple-choice-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Multiple Choice Question Surface content.");

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            type: "courseSection",
            attrs: {
              id: EmbeddedNodeIdSchema.parse("section00001"),
              title: "Assessment",
            },
          },
          {
            ...surface,
            content: [projectMcqLearnerNode(authoredQuestion(question, labels))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent, labels?: readonly string[]): JSONContent {
  const choiceLabels = labels ?? ["Venus", "Mars", "Jupiter", "Mercury"];
  return {
    ...question,
    attrs: { ...question.attrs, id: assessmentTargetId },
    content: (question.content ?? []).map((child) =>
      child.type === "assessment_choices_group"
        ? {
            ...child,
            content: choiceLabels.map((label, index) => ({
              type: "selectable_choice",
              attrs: { id: `choice_${String(index + 1).padStart(5, "0")}` },
              content: [
                {
                  type: "selectable_choice_body",
                  content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
                },
              ],
            })),
          }
        : child,
    ),
  };
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}
