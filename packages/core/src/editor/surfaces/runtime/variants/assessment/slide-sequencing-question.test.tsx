// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { projectSequencingLearnerNode } from "@/editor/blocks/assessment/sequencing/assessment";
import { slideSequencingQuestionSurfaceDefinition } from "@/editor/surfaces/model/templates/assessment/slide-sequencing-question";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { AssessmentPort } from "@/host/ports";

const assessmentTargetId = "target000001";
const problemId = `artifact:artifact-1/block:${assessmentTargetId}`;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideSequencingQuestionSurfaceRuntimeView", () => {
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

      const interactions = document.querySelectorAll("[data-sequencing-presentation]");
      expect(interactions).toHaveLength(1);
      expect(interactions[0]).toHaveAttribute("data-sequencing-presentation", "full-slide");
      expect(document.querySelector('[data-sequencing-presentation="inline"]')).toBeNull();
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="sequencing"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(document.querySelectorAll(".sc-course-sequencing__position")).toHaveLength(3);
      expect(document.querySelector("[data-sequencing-presentation]")).toHaveAttribute(
        "data-sequencing-density",
        "comfortable",
      );
      expect(document.querySelector("[data-bounded-scroll-frame]")).toBeNull();
      const firstAuthoredStep = screen.getByRole("listitem", { name: "Sequence step 1" });
      expect(firstAuthoredStep).toBeInTheDocument();
      expect(
        within(firstAuthoredStep).getByRole("button", {
          name: /^Reorder Sequence step 1, position [1-3] of 3$/,
        }),
      ).toBeInTheDocument();
      expect(
        document.querySelector(
          ".sc-assessment-slide-surface-runtime-view [data-assessment-interaction-content]",
        ),
      ).not.toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("submits, retries, and reveals the full-slide presenter response", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items:
            request.response.kind === "sequence"
              ? Object.fromEntries(
                  request.response.orderedItemIds.map((itemId, index) => [
                    itemId,
                    { correct: index === 0, expected: index + 1, given: index + 1 },
                  ]),
                )
              : {},
        },
        { response: request.response },
      ),
    );
    const revealAnswer = vi.fn<NonNullable<AssessmentPort["revealAnswer"]>>(async () => ({
      answerKey: {
        kind: "sequence",
        correctOrder: ["seqitm_00001", "seqitm_00002", "seqitm_00003"],
        feedbackByItemId: {},
      },
    }));

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: { type: "runtime", submit, revealAnswer },
          children: createElement(EditorContent, { editor }),
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      await waitFor(() => {
        expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      });
      expect(
        setAssessmentResponseField(assessmentStore, problemId, "order", [
          "seqitm_00003",
          "seqitm_00001",
          "seqitm_00002",
        ]),
      ).toBe(true);
      await waitFor(() => {
        expect(localAssessmentResponse(assessmentStore, problemId)?.["order"]).toEqual([
          "seqitm_00003",
          "seqitm_00001",
          "seqitm_00002",
        ]);
        expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
      });

      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          problemId,
          response: {
            kind: "sequence",
            orderedItemIds: ["seqitm_00003", "seqitm_00001", "seqitm_00002"],
          },
        }),
      );
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Show answer" })).toBeInTheDocument();
        expect(document.querySelector(".sc-course-sequencing__state-cue")).toBeNull();
        expect(document.querySelector('[data-course-state="incorrect"]')).not.toBeNull();
      });

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
      });
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
      fireEvent.click(screen.getByRole("button", { name: "Show answer" }));

      await waitFor(() => expect(revealAnswer).toHaveBeenCalledOnce());
      expect(screen.getByRole("button", { name: "Show answer" })).toHaveAttribute(
        "aria-pressed",
        "true",
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
    content: sequencingQuestionDocument(),
  });
}

function sequencingQuestionDocument(): JSONContent {
  const surface = slideSequencingQuestionSurfaceDefinition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Sequencing Question Surface content.");
  const questionContent = question.content ?? [];
  const group = questionContent.find((child) => child.type === "sequencing_items_group");
  const sourceItems: JSONContent[] = group?.content ?? [];
  const labelledItems = sourceItems.map((item, index) => ({
    ...item,
    attrs: { ...item.attrs, id: `seqitm_${String(index + 1).padStart(5, "0")}` },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: `Sequence step ${index + 1}` }],
      },
    ],
  }));
  const labelledQuestion: JSONContent = {
    ...question,
    attrs: { ...question.attrs, id: assessmentTargetId },
    content: questionContent.map((child) =>
      child.type === "sequencing_items_group" ? { ...child, content: labelledItems } : child,
    ),
  };

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
            content: [projectSequencingLearnerNode(labelledQuestion)],
          },
        ],
      },
    ],
  };
}
