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
import { projectFillBlanksLearnerNode } from "@/editor/blocks/assessment/fill-blanks/assessment";
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
const longRevealedAnswer = "a substantially longer accepted response with several words";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideFillBlanksQuestionSurfaceRuntimeView", () => {
  it("registers one private target, binds the Surface control, and preserves a restored response", async () => {
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
      expect(
        document.querySelectorAll('[data-fill-blanks-presentation="full-slide"]'),
      ).toHaveLength(1);
      expect(document.querySelectorAll('.sc-course-fill-blank__input[type="text"]')).toHaveLength(
        2,
      );

      expect(
        setAssessmentResponseField(assessmentStore, problemId, "blanks", {
          blank0000001: "alpha",
          blank0000002: "beta",
        }),
      ).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "Blank 1 of 2, first term" })).toHaveValue(
          "alpha",
        );
        expect(screen.getByRole("textbox", { name: "Blank 2 of 2, second term" })).toHaveValue(
          "beta",
        );
      });
      fireEvent(window, new Event("resize"));
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual({
        blanks: { blank0000001: "alpha", blank0000002: "beta" },
      });
    } finally {
      editor.destroy();
    }
  });

  it("submits canonical cloze data and resolves Surface feedback, reveal, and retry", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items: {
            blank0000001: {
              correct: false,
              expected: "alpha",
              given: "wrong",
              feedback: richFeedback("Review the first term."),
            },
            blank0000002: { correct: true, expected: "beta", given: "beta" },
          },
        },
        { response: request.response },
      ),
    );
    const revealAnswer = vi.fn<NonNullable<AssessmentPort["revealAnswer"]>>(async () => ({
      answerKey: {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "blank0000001",
            acceptedAnswers: [longRevealedAnswer],
            caseSensitive: false,
            trimWhitespace: true,
          },
          {
            blankId: "blank0000002",
            acceptedAnswers: ["beta"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: { blank0000001: richFeedback("Review the first term.") },
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

      fireEvent.change(screen.getByRole("textbox", { name: "Blank 1 of 2, first term" }), {
        target: { value: "wrong" },
      });
      expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
      fireEvent.change(screen.getByRole("textbox", { name: "Blank 2 of 2, second term" }), {
        target: { value: "beta" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: {
            kind: "fill-blanks",
            blanks: [
              { blankId: "blank0000001", value: "wrong" },
              { blankId: "blank0000002", value: "beta" },
            ],
          },
        }),
      );
      expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Blank 1 of 2, first term" })).toHaveAttribute(
        "readonly",
      );
      expect(
        screen.getByRole("textbox", { name: "Blank 1 of 2, first term" }),
      ).toHaveAccessibleDescription("Submitted answer, incorrect. Feedback available");
      fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));
      await waitFor(() => {
        expect(screen.getByRole("textbox", { name: "Blank 1 of 2, first term" })).toHaveValue(
          longRevealedAnswer,
        );
      });
      expect(revealAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ targetId: assessmentTargetId }),
      );
    } finally {
      editor.destroy();
    }
  });

  it("does not commit an immediate response when Enter belongs to IME composition", async () => {
    const editor = createRuntimeEditor({ feedbackMode: "immediate" });
    const check = vi.fn<NonNullable<AssessmentPort["check"]>>(async (request) =>
      assessmentProblemOutcome(
        { feedback: null, isCorrect: true, score: { scaled: 1 }, items: {} },
        { response: request.response },
      ),
    );

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: {
            type: "runtime",
            check,
            submit: async (request) =>
              assessmentProblemOutcome(
                { feedback: null, isCorrect: true, score: { scaled: 1 }, items: {} },
                { response: request.response },
              ),
          },
          children: createElement(EditorContent, { editor }),
        }),
      );
      const first = await screen.findByRole("textbox", { name: "Blank 1 of 2, first term" });
      fireEvent.change(first, { target: { value: "alpha" } });
      fireEvent.keyDown(first, { key: "Enter", isComposing: true });
      expect(check).not.toHaveBeenCalled();
    } finally {
      editor.destroy();
    }
  });
});

function createRuntimeEditor({ feedbackMode = "on_submit" } = {}) {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: fillBlanksQuestionDocument(feedbackMode),
  });
}

function fillBlanksQuestionDocument(feedbackMode: string): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-fill-blanks-question");
  if (!definition) throw new Error("Expected slide-fill-blanks-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Fill in Blanks Surface content.");

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            type: "courseSection",
            attrs: { id: EmbeddedNodeIdSchema.parse("section00001"), title: "Assessment" },
          },
          {
            ...surface,
            content: [projectFillBlanksLearnerNode(authoredQuestion(question, feedbackMode))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent, feedbackMode: string): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: assessmentTargetId,
      settings: { ...question.attrs?.["settings"], feedbackMode, showAnswer: true },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "fill_blanks_body" ? authoredBody() : child,
    ),
  };
}

function authoredBody(): JSONContent {
  return {
    type: "fill_blanks_body",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The first term is " },
          { type: "fill_blank", attrs: { id: "blank0000001", placeholder: "first term" } },
          { type: "text", text: ", while the second is " },
          { type: "fill_blank", attrs: { id: "blank0000002", placeholder: "second term" } },
          { type: "text", text: "." },
        ],
      },
    ],
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
