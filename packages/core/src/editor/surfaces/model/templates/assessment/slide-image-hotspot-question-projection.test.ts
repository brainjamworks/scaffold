import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Image Hotspot question assessment projection", () => {
  it("projects one canonical spatial-hotspot target from the Surface owner", () => {
    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: courseDocumentWithImageHotspotSurface() },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      targetId: "target000001",
      blockId: "target000001",
      blockType: "image_hotspot",
      interaction: {
        kind: "spatial-hotspot",
        maxSelections: 2,
        hotspots: [
          {
            id: "hotsp_000001",
            label: "Northern region",
            geometry: { kind: "circle", centerX: 28, centerY: 34, radius: 9 },
          },
          {
            id: "hotsp_000002",
            label: "Southern region",
            geometry: { kind: "circle", centerX: 67, centerY: 71, radius: 11 },
          },
        ],
      },
      assessment: {
        kind: "spatial-hotspot",
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["hotsp_000001"],
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Find the marked places",
        maxAttempts: 2,
        points: 4,
        showAnswer: true,
      },
    });

    const learnerQuestion = descendantsOfType(
      projection.learnerDocument,
      "surface_image_hotspot_question",
    )[0];
    expect(learnerQuestion?.attrs).not.toHaveProperty("assessment");
    const learnerCanvas = descendantsOfType(projection.learnerDocument, "image_hotspot_canvas")[0];
    expect(learnerCanvas?.attrs?.["data"]?.hotspots[0]).not.toHaveProperty("correct");
  });

  it("keeps malformed Surface-owned content observable", () => {
    const document = courseDocumentWithImageHotspotSurface();
    const surface = document.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected Surface fixture.");
    surface.content = [{ type: "paragraph", content: [{ type: "text", text: "Invalid" }] }];

    expect(() =>
      projectAssessmentDocument(
        { status: "supported", canonicalDocument: document },
        builtInBlockRegistry,
        builtInSurfaceVariantRegistry,
      ),
    ).toThrow("must contain exactly one image-hotspot question");
  });

  it("projects a question with no hotspot regions without an authoring warning", () => {
    const document = courseDocumentWithImageHotspotSurface();
    const question = imageHotspotQuestion(document);
    const canvas = question.content?.find((child) => child.type === "image_hotspot_canvas");
    if (!canvas) throw new Error("Expected Image Hotspot canvas fixture.");
    canvas.attrs = {
      ...canvas.attrs,
      data: { ...canvas.attrs?.["data"], hotspots: [] },
    };
    question.attrs = {
      ...question.attrs,
      assessment: { ...question.attrs?.["assessment"], correctHotspotIds: [] },
    };

    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: document },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      interaction: { kind: "spatial-hotspot", hotspots: [] },
      assessment: { kind: "spatial-hotspot", correctHotspotIds: [] },
    });
  });

  it("projects a question with no correct hotspot without an authoring warning", () => {
    const document = courseDocumentWithImageHotspotSurface();
    const question = imageHotspotQuestion(document);
    question.attrs = {
      ...question.attrs,
      assessment: { ...question.attrs?.["assessment"], correctHotspotIds: [] },
    };

    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: document },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      assessment: { kind: "spatial-hotspot", correctHotspotIds: [] },
    });
  });
});

function imageHotspotQuestion(document: JSONContent): JSONContent {
  const question = descendantsOfType(document, "surface_image_hotspot_question")[0];
  if (!question) throw new Error("Expected Surface Image Hotspot question fixture.");
  return question;
}

function courseDocumentWithImageHotspotSurface(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-image-hotspot-question");
  if (!definition) throw new Error("Expected slide-image-hotspot-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Image Hotspot question.");

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
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
                    legend: "Find the marked places",
                    maxAttempts: 2,
                    points: 4,
                    showAnswer: true,
                  },
                  assessment: {
                    gradingMode: "all-or-nothing",
                    correctHotspotIds: ["hotsp_000001"],
                    feedbackByHotspotId: {},
                    missFeedback: null,
                    summaryFeedback: null,
                  },
                },
                content: (question.content ?? []).map((child) =>
                  child.type === "image_hotspot_canvas"
                    ? {
                        ...child,
                        attrs: {
                          data: {
                            image: {
                              mode: "managed",
                              mediaId: "hotspot-image",
                              alt: "Regional map",
                            },
                            hotspots: [
                              {
                                id: "hotsp_000001",
                                centerX: 28,
                                centerY: 34,
                                radius: 9,
                                label: "Northern region",
                              },
                              {
                                id: "hotsp_000002",
                                centerX: 67,
                                centerY: 71,
                                radius: 11,
                                label: "Southern region",
                              },
                            ],
                            maxClicks: 2,
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

function descendantsOfType(root: JSONContent, type: string): JSONContent[] {
  const matches: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) matches.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(root);
  return matches;
}
