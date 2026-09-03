import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Drag and Drop question assessment projection", () => {
  it("projects one canonical spatial-placement target and redacts private answers", () => {
    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: courseDocumentWithDragDropSurface() },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      targetId: "target000001",
      blockId: "target000001",
      blockType: "drag_drop",
      interaction: {
        kind: "spatial-placement",
        markers: [{ id: "marker000001", label: "London" }],
      },
      assessment: {
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: 2,
        correctPlacements: [
          {
            markerId: "marker000001",
            geometry: { kind: "circle", centerX: 25, centerY: 60, radius: 7 },
          },
        ],
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Place city markers",
        maxAttempts: 2,
        points: 4,
        showAnswer: true,
      },
    });

    const serializedLearner = JSON.stringify(projection.learnerDocument);
    expect(serializedLearner).toContain("surface_drag_drop_question");
    expect(serializedLearner).toContain("marker000001");
    expect(serializedLearner).toContain("London");
    expect(serializedLearner).not.toContain("correctPlacements");
    expect(serializedLearner).not.toContain("feedbackByMarkerId");
    expect(serializedLearner).not.toContain("Private marker feedback");
    expect(serializedLearner).not.toContain("centerX");
  });

  it("refuses target and learner projection until required setup is complete", () => {
    const definition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
    if (!definition?.assessmentTargets) {
      throw new Error("Expected Drag and Drop assessment Surface capability.");
    }
    const draft = definition.createSurface({ surfaceId: createEmbeddedNodeId() });
    const question = draft.content?.[0];
    if (!question) throw new Error("Expected Drag and Drop question content.");
    const incomplete = {
      ...draft,
      content: [
        {
          ...question,
          attrs: { ...question.attrs, id: "target000001" },
          content: (question.content ?? []).map((child) =>
            child.type === "drag_drop_canvas"
              ? { ...child, attrs: { ...child.attrs, id: "canvas000001" } }
              : child,
          ),
        },
      ],
    };

    expect(() => definition.assessmentTargets?.projectTargets(incomplete)).toThrow(
      "not learner-ready",
    );
    expect(() => definition.assessmentTargets?.projectLearnerSurface(incomplete)).toThrow(
      "not learner-ready",
    );
  });
});

function courseDocumentWithDragDropSurface(): JSONContent {
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
          {
            type: "courseSection",
            attrs: { id: "section00001", title: "Introduction" },
          },
          {
            ...surface,
            content: [
              {
                ...question,
                attrs: {
                  ...question.attrs,
                  id: "target000001",
                  settings: {
                    feedbackMode: "on_submit",
                    isGraded: true,
                    showAnswer: true,
                    gradingMode: "partial-credit",
                    points: 4,
                    maxAttempts: 2,
                    legend: "Place city markers",
                  },
                  assessment: {
                    correctPlacements: [
                      {
                        markerId: "marker000001",
                        geometry: {
                          kind: "circle",
                          centerX: 25,
                          centerY: 60,
                          radius: 7,
                        },
                      },
                    ],
                    feedbackByMarkerId: {
                      marker000001: {
                        kind: "rich-text",
                        document: {
                          type: "doc",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Private marker feedback" }],
                            },
                          ],
                        },
                      },
                    },
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
                            markers: [
                              {
                                id: "marker000001",
                                label: "London",
                                visualOverride: null,
                              },
                            ],
                          },
                        },
                      }
                    : child,
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}
