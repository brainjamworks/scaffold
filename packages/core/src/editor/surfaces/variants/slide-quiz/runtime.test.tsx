// @vitest-environment happy-dom

import {
  AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshotSchema,
  EmbeddedNodeIdSchema,
  QuizAttemptStateSchema,
  QuizSettingsSchema,
  type QuizSettings,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { projectMcqLearnerNode } from "@/editor/assessment/mcq/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-multiple-choice-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-drag-drop-question-node";
import { SURFACE_QUIZ_NODE_TYPE } from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { createQuizQuestion } from "@/editor/surfaces/model/templates/assessment/slide-quiz";
import type { AssessmentPort } from "@/host/ports";
import {
  assessmentQuizOutcome,
  createAssessmentRuntimeTestRoot,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const QUIZ_ID = EmbeddedNodeIdSchema.parse("quiz00000001");
const QUESTION_IDS = ["questn_00001", "questn_00002"] as const;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideQuizSurfaceRuntimeView", () => {
  it("presents Drag and Drop through the family full-slide presenter under the Quiz owner", async () => {
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({
        composition: createCoreScaffoldRuntimeComposition(),
      }),
      content: dragDropQuizDocument(),
    });

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: createQuizPort(),
          children: createElement(EditorContent, { editor }),
        }),
      );

      const start = await screen.findByRole("button", { name: "Start quiz" });
      await waitFor(() => expect(start).toBeEnabled());
      fireEvent.click(start);
      await waitFor(() =>
        expect(document.querySelector('[data-drag-drop-presentation="full-slide"]')).not.toBeNull(),
      );
      expect(document.querySelector('[data-node="drag_drop"]')).toBeNull();
      expect(document.querySelector('[data-runtime-frame="block"]')).toBeNull();
      expect(document.querySelectorAll("[data-surface-quiz]")).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it("mounts one canonical Quiz, aliases its control state to the Surface, and keeps question navigation internal", async () => {
    const editor = createRuntimeEditor();
    const assessment = createQuizPort();
    let assessmentStore: AssessmentStoreApi | null = null;

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment,
          children: createElement(EditorContent, { editor }),
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      expect(await screen.findByRole("button", { name: "Start quiz" })).toBeInTheDocument();
      expect(document.querySelector(".sc-course-slide-quiz__progress")).toBeNull();
      expect(document.querySelectorAll(".sc-slide-quiz-surface-runtime-view")).toHaveLength(1);
      expect(document.querySelectorAll(`[data-node="${SURFACE_QUIZ_NODE_TYPE}"]`)).toHaveLength(1);
      expect(document.querySelectorAll('[data-node="quiz"]')).toHaveLength(0);
      expect(document.querySelectorAll('[data-runtime-frame="block"]')).toHaveLength(0);
      await waitFor(() =>
        expect(getControlBindingRegistryForEditor(editor).get(SURFACE_ID)).toBeDefined(),
      );
      const binding = getControlBindingRegistryForEditor(editor).get(SURFACE_ID);
      if (!binding?.stateReader) throw new Error("Expected Quiz Surface state reader.");
      expect(binding.stateReader.read({ targetId: SURFACE_ID, key: "status" })).toBe("not-started");
      const store = requireAssessmentStore(assessmentStore);
      expect(Object.values(store.getState().quizRegistrations)).toEqual([
        expect.objectContaining({ authoredGroupId: QUIZ_ID, targetIds: QUESTION_IDS }),
      ]);

      fireEvent.click(screen.getByRole("button", { name: "Start quiz" }));
      await waitFor(() =>
        expect(document.querySelector('[data-quiz-status="in_progress"]')).not.toBeNull(),
      );
      expect(binding.stateReader.read({ targetId: SURFACE_ID, key: "status" })).toBe("in-progress");
      expect(document.querySelectorAll('[data-mcq-presentation="full-slide"]')).toHaveLength(1);
      const surface = document.querySelector<HTMLElement>('[data-surface-variant="slide-quiz"]');
      expect(surface).not.toBeNull();
      expect(surface?.className).not.toMatch(/(?:selectable-choice|multiple-choice)-.*surface/);
      expect(
        surface?.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="multiple-choice"]',
        ),
      ).not.toBeNull();
      expect(document.activeElement).toBe(
        surface?.querySelector('[data-full-slide-question-stage=""]'),
      );
      expect(screen.getByRole("radio", { name: "Answer one A" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("radio", { name: "Answer one A" }));
      const next = screen.getByRole("button", { name: "Next question" });
      await waitFor(() => expect(next).toBeEnabled());
      fireEvent.click(next);
      expect(document.querySelector("[data-quiz-view-id]")).toHaveAttribute(
        "data-active-question-id",
        QUESTION_IDS[1],
      );
      expect(document.querySelector("[data-node=surface]")).toHaveAttribute(
        "data-surface-variant",
        "slide-quiz",
      );
    } finally {
      editor.destroy();
    }
  });

  it("summarizes the configured commitment before starting", async () => {
    const editor = createRuntimeEditor({
      passingScore: 0.75,
      reviewTiming: "after_each_answer",
      timer: { enabled: true, durationSeconds: 120 },
    });

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
        }),
      );

      const state = await screen.findByText("Ready to begin?");
      const startState = state.closest(".sc-course-slide-quiz__state");
      expect(startState?.querySelector(".sc-course-slide-quiz__eyebrow")).toBeNull();
      expect(startState).toHaveTextContent("2 questions");
      expect(startState).toHaveTextContent("2 points");
      expect(startState).toHaveTextContent("2-minute time limit");
      expect(startState).toHaveTextContent("Pass mark 75%");
      expect(startState).toHaveTextContent("Submit each answer before continuing.");
      expect(document.querySelector(".sc-course-slide-quiz__progress")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("keeps authorized result-only completion on the summary", async () => {
    const editor = createRuntimeEditor({ reviewDetail: "result_only" });

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          initialSnapshot: completedQuizSnapshot(),
        }),
      );

      expect(await screen.findByTestId("quiz-completion-summary")).toHaveTextContent("2 / 2");
      expect(screen.queryByRole("button", { name: "Review answers" })).toBeNull();
      expect(screen.queryByTestId("quiz-answer-review-context")).toBeNull();
      expect(document.querySelector("[data-quiz-stage-visible='true']")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("permits authorized full review and toggles between submitted and correct answers", async () => {
    const editor = createRuntimeEditor({ reviewDetail: "full_review" });

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          initialSnapshot: completedQuizSnapshot({ includeProblem: true }),
        }),
      );

      fireEvent.click(await screen.findByRole("button", { name: "Review answers" }));
      await waitFor(() =>
        expect(document.querySelector("[data-quiz-view-id]")).toHaveAttribute(
          "data-quiz-reviewing-answers",
          "true",
        ),
      );
      expect(screen.getByTestId("quiz-answer-review-controls")).toBeInTheDocument();
      const showAnswer = screen.getByRole("button", { name: "Show answer" });
      expect(showAnswer).toHaveAttribute("aria-pressed", "false");
      expect(choiceDescription("choice_one01")).toBe("Submitted answer, incorrect");
      expect(choiceDescription("choice_one02")).toBeNull();

      fireEvent.click(showAnswer);

      await waitFor(() => expect(showAnswer).toHaveAttribute("aria-pressed", "true"));
      expect(choiceDescription("choice_one01")).toBeNull();
      expect(choiceDescription("choice_one02")).toBe("Selected answer, correct");

      fireEvent.click(showAnswer);

      await waitFor(() => expect(showAnswer).toHaveAttribute("aria-pressed", "false"));
      expect(choiceDescription("choice_one01")).toBe("Submitted answer, incorrect");
      expect(choiceDescription("choice_one02")).toBeNull();
    } finally {
      editor.destroy();
    }
  });
});

function createRuntimeEditor(settings: Partial<QuizSettings> = {}) {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: quizDocument(settings),
  });
}

function quizDocument(settings: Partial<QuizSettings>): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-quiz");
  if (!definition) throw new Error("Expected slide-quiz Surface definition.");
  const surface = definition.createSurface({ surfaceId: SURFACE_ID });
  const quiz = surface.content?.[0];
  if (!quiz) throw new Error("Expected Quiz Surface content.");
  const surfaceWithBoundaries = {
    ...surface,
    attrs: {
      ...surface.attrs,
      settings: {
        ...surface.attrs?.["settings"],
        header: { enabled: true },
        footer: { enabled: true },
      },
    },
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
            attrs: { id: EmbeddedNodeIdSchema.parse("section00001"), title: "Assessment" },
          },
          {
            ...surfaceWithBoundaries,
            content: [
              boundary("surface_header"),
              {
                ...quiz,
                attrs: {
                  ...quiz.attrs,
                  id: QUIZ_ID,
                  settings: QuizSettingsSchema.parse(settings),
                },
                content: [question(QUESTION_IDS[0], "one"), question(QUESTION_IDS[1], "two")],
              },
              boundary("surface_footer"),
            ],
          },
        ],
      },
    ],
  };
}

function dragDropQuizDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-quiz");
  if (!definition) throw new Error("Expected slide-quiz Surface definition.");
  const surface = definition.createSurface({ surfaceId: SURFACE_ID });
  const quiz = surface.content?.[0];
  if (!quiz) throw new Error("Expected Quiz Surface content.");
  const authored = createQuizQuestion(SURFACE_DRAG_DROP_QUESTION_NODE_TYPE);
  const question = {
    ...authored,
    attrs: { ...authored.attrs, id: QUESTION_IDS[0] },
    content: (authored.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              ...child.attrs,
              id: EmbeddedNodeIdSchema.parse("canvas000001"),
              data: {
                image: { mode: "managed", mediaId: "map-image", alt: "Map" },
                imageAspectRatio: 2,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers: [{ id: "marker000001", label: "London", visualOverride: null }],
              },
            },
          }
        : child,
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
            attrs: { id: EmbeddedNodeIdSchema.parse("section00001"), title: "Assessment" },
          },
          {
            ...surface,
            content: [
              {
                ...quiz,
                attrs: { ...quiz.attrs, id: QUIZ_ID },
                content: [question],
              },
            ],
          },
        ],
      },
    ],
  };
}

function completedQuizSnapshot({ includeProblem = false }: { includeProblem?: boolean } = {}) {
  const firstResult = {
    isCorrect: false,
    score: { scaled: 0 },
    feedback: null,
    items: {
      choice_one01: { correct: false, expected: false, given: true },
      choice_one02: { correct: true, expected: true, given: false },
    },
  };
  return AssessmentLearnerSnapshotSchema.parse({
    snapshotVersion: 2,
    artifactId: "artifact-1",
    problems: includeProblem
      ? {
          [QUESTION_IDS[0]]: AssessmentProblemSnapshotSchema.parse({
            response: { kind: "single-select", optionId: "choice_one01" },
            submitted: true,
            attemptNumber: 1,
            hintsShown: 0,
            checkResult: null,
            submissionResult: firstResult,
          }),
        }
      : {},
    quizzes: {
      [QUIZ_ID]: {
        attemptId: "attempt-completed",
        status: "completed",
        currentTargetId: null,
        submittedTargetIds: [...QUESTION_IDS],
        startedAt: "2026-08-29T12:00:00.000Z",
        finishedAt: "2026-08-29T12:05:00.000Z",
        expiresAt: null,
        score: { scaled: 1, raw: 2, min: 0, max: 2 },
        successStatus: null,
        resultsByTargetId: includeProblem ? { [QUESTION_IDS[0]]: firstResult } : {},
        answerReviewAuthorized: true,
      },
    },
  });
}

function choiceDescription(choiceId: string): string | null {
  const choice = document.body.querySelector<HTMLInputElement>(`input[value="${choiceId}"]`);
  const describedBy = choice?.getAttribute("aria-describedby");
  if (!describedBy) return null;
  return describedBy
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function boundary(type: "surface_header" | "surface_footer"): JSONContent {
  return {
    type,
    content: (["left", "center", "right"] as const).map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph" }],
    })),
  };
}

function question(id: string, ordinal: string): JSONContent {
  const authored = createQuizQuestion(SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE);
  return projectMcqLearnerNode({
    ...authored,
    attrs: { ...authored.attrs, id },
    content: (authored.content ?? []).map((child) => {
      if (child.type === "assessment_prompt") {
        return { ...child, content: [paragraph(`Question ${ordinal}`)] };
      }
      if (child.type !== "assessment_choices_group") return child;
      return {
        ...child,
        content: [
          selectableChoice(`choice_${ordinal}01`, `Answer ${ordinal} A`),
          selectableChoice(`choice_${ordinal}02`, `Answer ${ordinal} B`),
        ],
      };
    }),
  });
}

function selectableChoice(id: string, label: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [{ type: "selectable_choice_body", content: [paragraph(label)] }],
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function createQuizPort(): AssessmentPort {
  return {
    type: "runtime",
    submit: vi.fn(),
    quiz: {
      startAttempt: vi.fn(async ({ groupId }) =>
        assessmentQuizOutcome(
          QuizAttemptStateSchema.parse({
            attemptId: "attempt-1",
            groupId,
            status: "in_progress",
            currentTargetId: QUESTION_IDS[0],
            submittedTargetIds: [],
            startedAt: "2026-08-29T12:00:00.000Z",
            finishedAt: null,
            expiresAt: null,
            score: null,
            successStatus: null,
            resultsByTargetId: {},
            answerReviewAuthorized: false,
          }),
        ),
      ),
      submitQuestion: vi.fn(),
      finishAttempt: vi.fn(),
    },
  };
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}
