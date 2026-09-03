// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { projectMatchingLearnerNode } from "@/editor/assessment/matching/assessment";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
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

describe("SlideMatchingQuestionSurfaceRuntimeView", () => {
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

      const store = requireAssessmentStore(assessmentStore);
      const registration = store.getState().registrations[problemId];
      expect(registration?.targetId).toBe(assessmentTargetId);
      expect(registration?.interactionKind).toBe("match");
      expect(registration?.config.learningEventDefinition.interaction).toMatchObject({
        kind: "match",
        items: [
          { id: "item__000001", label: "France" },
          { id: "item__000002", label: "Spain" },
          { id: "item__000003", label: "Italy" },
        ],
      });
      expect(document.querySelectorAll("[data-matching-presentation]")).toHaveLength(1);
      expect(document.querySelector("[data-matching-presentation]")).toHaveAttribute(
        "data-matching-presentation",
        "full-slide",
      );
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="matching"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(document.querySelector('[data-node="surface_matching_question"]')).toHaveAttribute(
        "data-surface-assessment-question",
      );
      expect(document.querySelector("[data-bounded-scroll-frame]")).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("submits the presenter response through the existing assessment facade", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: false,
          score: { scaled: 0 },
          items:
            request.response.kind === "match"
              ? Object.fromEntries(
                  request.response.pairs.map((pair) => [
                    pair.itemId,
                    { correct: pair.targetId.endsWith("1"), expected: "target_00001" },
                  ]),
                )
              : {},
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

      await waitFor(() => {
        expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      });

      fireEvent.click(screen.getByRole("button", { name: "Select ‘France’ (item 1 of 3)" }));
      fireEvent.click(
        requiredElement<HTMLButtonElement>(
          document,
          '[data-target-id="target_00002"][data-matching-drop-target] .sc-course-matching__place-action',
        ),
      );

      await waitFor(() => {
        expect(localAssessmentResponse(assessmentStore, problemId)).toMatchObject({
          matches: { item__000001: "target_00002" },
        });
      });

      setAssessmentResponseField(assessmentStore, problemId, "matches", {
        item__000001: "target_00002",
        item__000002: "target_00001",
        item__000003: "target_00003",
      });
      await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: {
            kind: "match",
            pairs: [
              { itemId: "item__000001", targetId: "target_00002" },
              { itemId: "item__000002", targetId: "target_00001" },
              { itemId: "item__000003", targetId: "target_00003" },
            ],
          },
        }),
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
    content: matchingQuestionDocument(),
  });
}

function matchingQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-matching-question");
  if (!definition) throw new Error("Expected slide-matching-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Matching Question Surface content.");
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
            content: [projectMatchingLearnerNode(authoredQuestion(question))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent): JSONContent {
  return {
    ...question,
    attrs: { ...question.attrs, id: assessmentTargetId },
    content: (question.content ?? []).map((child) =>
      child.type === "matching_pairs_group"
        ? {
            ...child,
            content: [
              matchingPair("pair__000001", "item__000001", "target_00001", "France", "Paris"),
              matchingPair("pair__000002", "item__000002", "target_00002", "Spain", "Madrid"),
              matchingPair("pair__000003", "item__000003", "target_00003", "Italy", "Rome"),
            ],
          }
        : child,
    ),
  };
}

function matchingPair(
  id: string,
  itemId: string,
  targetId: string,
  itemText: string,
  targetText: string,
): JSONContent {
  return {
    type: "matching_pair",
    attrs: { id },
    content: [
      {
        type: "matching_item",
        attrs: { id: itemId },
        content: [{ type: "paragraph", content: [{ type: "text", text: itemText }] }],
      },
      {
        type: "matching_target",
        attrs: { id: targetId },
        content: [{ type: "paragraph", content: [{ type: "text", text: targetText }] }],
      },
    ],
  };
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}
