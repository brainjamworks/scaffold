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
import { projectDropdownLearnerNode } from "@/editor/blocks/assessment/dropdown/assessment";
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

describe("SlideDropdownQuestionSurfaceRuntimeView", () => {
  it("registers one private target and preserves a restored Dropdown response", async () => {
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
      expect(document.querySelectorAll('[data-dropdown-presentation="full-slide"]')).toHaveLength(
        1,
      );
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="dropdown"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(
        document.querySelector("[data-surface-assessment-interaction-content]"),
      ).not.toBeVisible();

      expect(
        setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00002"),
      ).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Select a planet" }).textContent).toContain(
          "Venus",
        );
      });
      fireEvent(window, new Event("resize"));
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        choices: "choice_00002",
      });
    } finally {
      editor.destroy();
    }
  });

  it("submits canonical single-select data and resolves Surface feedback and reveal", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
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
              feedback: richFeedback("Mercury is not the requested planet."),
            },
            choice_00003: { correct: false, expected: true, given: false },
          },
        },
        { response: request.response },
      ),
    );
    const revealAnswer = vi.fn<NonNullable<AssessmentPort["revealAnswer"]>>(async () => ({
      answerKey: {
        kind: "single-select",
        correctOptionId: "choice_00003",
        feedbackByOptionId: {
          choice_00003: richFeedback("Earth is the correct answer."),
        },
      },
    }));

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: { type: "runtime", revealAnswer, submit },
          children: createElement(EditorContent, { editor }),
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      await waitFor(() => expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true));
      expect(
        setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00001"),
      ).toBe(true);
      fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: { kind: "single-select", optionId: "choice_00001" },
        }),
      );
      expect(await screen.findByRole("button", { name: "Show feedback" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
      await waitFor(() => {
        expect(screen.getByRole("combobox", { name: "Select a planet" }).textContent).toContain(
          "Earth",
        );
      });
      expect(revealAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: assessmentTargetId }),
      );
    } finally {
      editor.destroy();
    }
  });

  it("presents a selected-correct result through the shared Dropdown presenter", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: true,
          score: { scaled: 1 },
          items: {
            choice_00003: { correct: true, expected: true, given: true },
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
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      await waitFor(() => expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true));
      expect(
        setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00003"),
      ).toBe(true);
      fireEvent.click(await screen.findByRole("button", { name: "Submit" }));

      const trigger = await screen.findByRole("combobox", { name: "Select a planet" });
      await waitFor(() => {
        expect(trigger).toHaveAttribute("data-course-state", "correct");
        expect(trigger).toBeDisabled();
        expect(trigger).toHaveAccessibleDescription("Submitted answer, correct");
      });
    } finally {
      editor.destroy();
    }
  });
});

function createRuntimeEditor() {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: dropdownQuestionDocument(),
  });
}

function dropdownQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
  if (!definition) throw new Error("Expected slide-dropdown-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Dropdown Question Surface content.");

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
            content: [projectDropdownLearnerNode(authoredQuestion(question))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent): JSONContent {
  const labels = ["Mercury", "Venus", "Earth", "Mars"];
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: assessmentTargetId,
      settings: {
        ...question.attrs?.["settings"],
        label: "Select a planet",
        showAnswer: true,
      },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "dropdown_choices_group"
        ? {
            ...child,
            content: labels.map((label, index) => ({
              type: "dropdown_choice",
              attrs: { id: `choice_${String(index + 1).padStart(5, "0")}` },
              content: [
                {
                  type: "dropdown_choice_label",
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
