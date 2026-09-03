// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
import { projectImageHotspotLearnerNode } from "@/editor/assessment/image-hotspot/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { AssessmentPort, MediaPort } from "@/host/ports";
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

describe("SlideImageHotspotQuestionSurfaceRuntimeView", () => {
  it("registers the private target and preserves a restored spatial response", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          media: testMediaPort(),
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
        interactionKind: "spatial-hotspot",
      });
      expect(
        document.querySelectorAll('[data-image-hotspot-presentation="full-slide"]'),
      ).toHaveLength(1);
      expect(
        document.querySelector(
          '[data-full-slide-question-stage][data-full-slide-question-family="image-hotspot"] > [data-assessment-interaction-content]',
        ),
      ).not.toBeNull();
      expect(
        document.querySelector('[data-node="surface_image_hotspot_question"]'),
      ).toHaveAttribute("data-surface-assessment-question");
      expect(document.querySelector('[data-slot="assessment-prompt"]')).toHaveAttribute(
        "data-assessment-prompt-empty",
        "true",
      );

      expect(
        setAssessmentResponseField(assessmentStore, problemId, "clicks", [
          { id: "click_000001", x: 28, y: 34, hotspotId: "hotsp_000001" },
        ]),
      ).toBe(true);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Pending click/ })).toBeInTheDocument();
      });
      fireEvent(window, new Event("resize"));
      expect(localAssessmentResponse(assessmentStore, problemId)).toMatchObject({
        clicks: [{ x: 28, y: 34, hotspotId: "hotsp_000001" }],
      });
    } finally {
      editor.destroy();
    }
  });

  it("submits the full-slide response through the existing assessment facade", async () => {
    const editor = createRuntimeEditor();
    let assessmentStore: AssessmentStoreApi | null = null;
    const submit = vi.fn<AssessmentPort["submit"]>(async (request) =>
      assessmentProblemOutcome(
        {
          feedback: null,
          isCorrect: request.response.kind === "spatial-hotspot",
          score: { scaled: 1 },
          items: {},
        },
        { response: request.response },
      ),
    );

    try {
      render(
        createAssessmentRuntimeTestRoot({
          assessment: { type: "runtime", submit },
          children: createElement(EditorContent, { editor }),
          media: testMediaPort(),
          onStore: (store) => {
            assessmentStore = store;
          },
        }),
      );

      await waitFor(() => expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true));
      expect(
        setAssessmentResponseField(assessmentStore, problemId, "clicks", [
          { id: "click_000001", x: 28, y: 34, hotspotId: "hotsp_000001" },
        ]),
      ).toBe(true);
      await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled());
      fireEvent.click(screen.getByRole("button", { name: "Submit" }));

      await waitFor(() => expect(submit).toHaveBeenCalledOnce());
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({
          targetId: assessmentTargetId,
          response: {
            kind: "spatial-hotspot",
            selections: [{ x: 28, y: 34, hotspotId: "hotsp_000001" }],
          },
        }),
      );
    } finally {
      editor.destroy();
    }
  });

  it("keeps media failure visible and non-interactive", async () => {
    const editor = createRuntimeEditor();

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          media: {
            ...testMediaPort(),
            resolve: async () => {
              throw new Error("Media unavailable");
            },
          },
        }),
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Hotspot image could not be loaded.",
      );
      expect(screen.queryByRole("group", { name: "Image hotspot response area" })).toBeNull();
    } finally {
      editor.destroy();
    }
  });

  it("renders a zero-region question as the ordinary response surface", async () => {
    const editor = createRuntimeEditor({ hotspots: [] });

    try {
      render(
        createAssessmentRuntimeTestRoot({
          children: createElement(EditorContent, { editor }),
          media: testMediaPort(),
        }),
      );

      expect(
        await screen.findByRole("group", { name: "Image hotspot response area" }),
      ).toBeInTheDocument();
      expect(screen.getByAltText("Regional map")).toBeInTheDocument();
    } finally {
      editor.destroy();
    }
  });
});

function createRuntimeEditor({ hotspots }: { hotspots?: [] } = {}) {
  return new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({
      composition: createCoreScaffoldRuntimeComposition(),
    }),
    content: imageHotspotQuestionDocument(hotspots),
  });
}

function imageHotspotQuestionDocument(hotspots?: []): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-image-hotspot-question");
  if (!definition) throw new Error("Expected slide-image-hotspot-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Image Hotspot Question Surface content.");

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
            content: [projectImageHotspotLearnerNode(authoredQuestion(question, hotspots))],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent, hotspots?: []): JSONContent {
  return {
    ...question,
    attrs: { ...question.attrs, id: assessmentTargetId },
    content: (question.content ?? []).map((child) =>
      child.type === "image_hotspot_canvas"
        ? {
            ...child,
            attrs: {
              data: {
                image: { mode: "managed", mediaId: "hotspot-image", alt: "Regional map" },
                hotspots: hotspots ?? [
                  {
                    id: "hotsp_000001",
                    centerX: 28,
                    centerY: 34,
                    radius: 9,
                    label: "Northern region",
                  },
                ],
                maxClicks: 1,
              },
            },
          }
        : child,
    ),
  };
}

function testMediaPort(): MediaPort {
  return {
    resolve: async () => "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    upload: async () => {
      throw new Error("Uploads are unavailable in this fixture.");
    },
  };
}

function requireAssessmentStore(store: AssessmentStoreApi | null): AssessmentStoreApi {
  if (!store) throw new Error("Expected the assessment store.");
  return store;
}
