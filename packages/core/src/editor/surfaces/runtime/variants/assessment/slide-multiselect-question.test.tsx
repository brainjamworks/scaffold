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
import { projectMultiselectLearnerNode } from "@/editor/blocks/assessment/multiselect/assessment";
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

describe("SlideMultiselectQuestionSurfaceRuntimeView", () => {
  it("registers one private target and preserves a restored multi-choice response", async () => {
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
        interactionKind: "multi-select",
      });
      expect(
        document.querySelectorAll('[data-multiselect-presentation="full-slide"]'),
      ).toHaveLength(1);
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="multiselect"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();

      expect(
        setAssessmentResponseField(assessmentStore, problemId, "choices", [
          "choice_00002",
          "choice_00004",
        ]),
      ).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("checkbox", { name: "Venus", checked: true })).toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Mars", checked: true })).toBeInTheDocument();
      });
      fireEvent(window, new Event("resize"));
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        choices: ["choice_00002", "choice_00004"],
      });
    } finally {
      editor.destroy();
    }
  });

  it("enforces max selections, submits canonical ids, and resolves Surface feedback", async () => {
    const editor = createRuntimeEditor();
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0.5 },
          items: {
            choice_00003: {
              correct: false,
              expected: false,
              given: true,
              feedback: richFeedback("Earth is not one of the requested inner planets."),
            },
          },
        },
        { response: request.response },
      ),
    );
    const revealAnswer = vi.fn<NonNullable<AssessmentPort["revealAnswer"]>>(async () => ({
      answerKey: {
        kind: "multi-select",
        correctOptionIds: ["choice_00001", "choice_00002"],
        feedbackByOptionId: {},
      },
    }));

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: { type: "runtime", revealAnswer, submit },
          children: createElement(EditorContent, { editor }),
        }),
      );

      const mercury = await screen.findByRole("checkbox", { name: "Mercury" });
      const venus = screen.getByRole("checkbox", { name: "Venus" });
      const earth = screen.getByRole("checkbox", { name: "Earth" });
      fireEvent.click(mercury);
      fireEvent.click(venus);

      await waitFor(() => {
        expect(earth).toBeDisabled();
        expect(earth).toHaveAccessibleDescription(
          "Maximum 2 selected. Deselect an option before choosing another.",
        );
      });
      fireEvent.click(mercury);
      await waitFor(() => expect(earth).toBeEnabled());
      fireEvent.click(earth);
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: {
            kind: "multi-select",
            optionIds: ["choice_00002", "choice_00003"],
          },
        }),
      );
      expect(
        await screen.findByRole("button", { name: "Show feedback for Earth" }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));
      await waitFor(() => {
        expect(choiceRow(mercury)).toHaveAttribute("data-result-state", "correct");
        expect(choiceRow(venus)).toHaveAttribute("data-result-state", "correct");
        expect(choiceRow(earth)).not.toHaveAttribute("data-result-state");
        expect(mercury).toBeChecked();
        expect(venus).toBeChecked();
        expect(earth).not.toBeChecked();
      });
      expect(revealAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: assessmentTargetId }),
      );
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
    content: multiselectQuestionDocument(),
  });
}

function choiceRow(input: HTMLElement): HTMLElement {
  const row = input.closest<HTMLElement>(".sc-course-assessment-choice");
  if (!row) throw new Error("Expected selectable choice row.");
  return row;
}

function multiselectQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiselect-question");
  if (!definition) throw new Error("Expected slide-multiselect-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Multi-select Question Surface content.");

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
            content: [projectMultiselectLearnerNode(authoredQuestion(question))],
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
      settings: { ...question.attrs?.["settings"], maxSelect: 2 },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "assessment_choices_group"
        ? {
            ...child,
            content: labels.map((label, index) => ({
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
