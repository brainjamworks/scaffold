// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { projectDragDropLearnerNode } from "@/editor/assessment/drag-drop/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { MediaPort } from "@/host/ports";
import {
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

const targetId = "target000001";
const problemId = `artifact:artifact-1/block:${targetId}`;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SlideDragDropQuestionSurfaceRuntimeView", () => {
  it("registers one private target and presents the existing family full-slide", async () => {
    const editor = createRuntimeEditor();
    let store: AssessmentStoreApi | null = null;

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          media: testMediaPort(),
          onStore: (value) => {
            store = value;
          },
        }),
      );

      await waitFor(() => expect(hasAssessmentRegistration(store, problemId)).toBe(true));
      expect(requireAssessmentStore(store).getState().registrations[problemId]).toMatchObject({
        targetId,
        interactionKind: "spatial-placement",
      });
      expect(document.querySelector('[data-drag-drop-presentation="full-slide"]')).not.toBeNull();
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="drag-drop"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(document.querySelector('[data-node="drag_drop"]')).toBeNull();
      expect(document.querySelector(".sc-block-frame")).toBeNull();
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
    content: dragDropQuestionDocument(),
  });
}

function dragDropQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
  if (!definition) throw new Error("Expected slide-drag-drop-question Surface definition.");
  const surface = definition.createSurface({ surfaceId: createEmbeddedNodeId() });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Drag and Drop question content.");

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          { type: "courseSection", attrs: { id: "section00001", title: "Assessment" } },
          {
            ...surface,
            content: [projectDragDropLearnerNode(authoredQuestion(question))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: targetId,
      assessment: {
        correctPlacements: [
          {
            markerId: "marker000001",
            geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          },
        ],
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              id: "canvas000001",
              data: {
                image: { mode: "managed", mediaId: "media0000001", alt: "Map" },
                imageAspectRatio: 2,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers: [{ id: "marker000001", label: "London", visualOverride: null }],
              },
            },
          }
        : child,
    ),
  };
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}

function testMediaPort(): MediaPort {
  return {
    resolve: async () => "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    upload: async () => {
      throw new Error("Uploads are unavailable in this fixture.");
    },
  };
}
