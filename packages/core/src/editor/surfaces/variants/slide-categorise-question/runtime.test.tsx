// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { projectCategoriseLearnerNode } from "@/editor/assessment/categorise/assessment";
import { slideCategoriseQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-categorise-question";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { AssessmentPort } from "@/host/ports";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideCategoriseQuestionSurfaceRuntimeView", () => {
  it("registers the private question target and renders one full-slide interaction", async () => {
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

      await waitFor(() => {
        expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      });
      await waitFor(() =>
        expect(
          getControlBindingRegistryForEditor(editor).get(
            EmbeddedNodeIdSchema.parse("surface00001"),
          ),
        ).toBeDefined(),
      );

      const interactions = document.querySelectorAll("[data-categorise-presentation]");
      expect(interactions).toHaveLength(1);
      expect(interactions[0]).toHaveAttribute("data-categorise-presentation", "full-slide");
      expect(document.querySelector('[data-categorise-presentation="inline"]')).toBeNull();
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="categorise"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(document.querySelector(".sc-assessment-slide-surface-runtime-view")).not.toBeNull();
      expect(
        document.querySelector(
          ".sc-assessment-slide-surface-runtime-view [data-assessment-interaction-content]:not([hidden])",
        ),
      ).not.toBeNull();
      expect(document.querySelector('[data-node="surface_categorise_question"]')).toHaveAttribute(
        "data-surface-assessment-question",
      );
    } finally {
      editor.destroy();
    }
  });

  it("submits the presenter response through the existing assessment facade", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) => {
      const firstPlacement =
        request.response.kind === "classify" ? request.response.placements[0] : undefined;
      return assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items: firstPlacement
            ? {
                [firstPlacement.itemId]: {
                  correct: false,
                  expected: firstPlacement.categoryId,
                  given: firstPlacement.categoryId,
                },
              }
            : {},
        },
        { response: request.response },
      );
    });

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

      await waitFor(() => {
        expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      });
      const store = requireAssessmentStore(assessmentStore);
      const registration = store.getState().registrations[problemId];
      if (
        !registration ||
        registration.config.learningEventDefinition.interaction.kind !== "classify"
      ) {
        throw new Error("Expected a registered classify interaction.");
      }
      const interaction = registration.config.learningEventDefinition.interaction;
      for (let placedCount = 1; placedCount <= interaction.items.length; placedCount += 1) {
        const currentItem = screen.getByRole("button", {
          name: /^Select .+ for placement$/,
        });
        const currentItemLabel = currentItem
          .getAttribute("aria-label")
          ?.replace(/^Select /, "")
          .replace(/ for placement$/, "");
        if (!currentItemLabel) throw new Error("Expected a labelled current Categorise item.");
        fireEvent.click(currentItem);
        expect(currentItem).toHaveAttribute("aria-pressed", "true");
        fireEvent.click(
          screen.getByRole("button", { name: `Place ${currentItemLabel} in category 1` }),
        );
        await waitFor(() => {
          expect(
            Object.keys(localAssessmentResponse(assessmentStore, problemId)?.["placements"] ?? {}),
          ).toHaveLength(placedCount);
        });
      }
      expect(
        Object.keys(localAssessmentResponse(assessmentStore, problemId)?.["placements"] ?? {}),
      ).toHaveLength(interaction.items.length);

      const submitButton = await screen.findByRole("button", { name: "Submit" });
      await waitFor(() => expect(submitButton).not.toBeDisabled());
      fireEvent.click(submitButton);

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: expect.objectContaining({ kind: "classify" }),
        }),
      );
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
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
    content: categoriseQuestionDocument(),
  });
}

function categoriseQuestionDocument(): JSONContent {
  const surface = slideCategoriseQuestionSurfaceDefinition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Categorise Question Surface content.");

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
            content: [
              projectCategoriseLearnerNode({
                ...question,
                attrs: { ...question.attrs, id: assessmentTargetId },
              }),
            ],
          },
        ],
      },
    ],
  };
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}
