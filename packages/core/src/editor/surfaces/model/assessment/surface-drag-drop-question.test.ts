// @vitest-environment happy-dom

import { DragDropPrivateAssessmentSchema, DragDropSettingsSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { defaultDragDropCanvasData } from "@/editor/assessment/drag-drop/drag-drop-canvas-shared";
import { parseDragDropAuthoredQuestion } from "@/editor/assessment/drag-drop/node-codecs";
import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { createSurfaceDragDropQuestionNode } from "./surface-drag-drop-question-node";

describe("surface Drag and Drop question", () => {
  it("creates one private target owner with one canonical canvas", () => {
    const surface = requireDefinition().createSurface({ surfaceId: createEmbeddedNodeId() });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_drag_drop_question",
      attrs: {
        settings: DragDropSettingsSchema.parse({ legend: "Place each marker on the image" }),
        assessment: DragDropPrivateAssessmentSchema.parse({}),
      },
    });
    expect(question?.content?.map(({ type }) => type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "drag_drop_canvas",
      "assessment_actions_group",
    ]);
    expect(question?.content?.[3]?.attrs?.["data"]).toEqual(defaultDragDropCanvasData());
  });

  it("uses the same family parser for the private Surface owner", () => {
    const question = requireDefinition().createSurface({
      surfaceId: createEmbeddedNodeId(),
    }).content?.[0];
    if (!question) throw new Error("Expected a private Drag and Drop question.");

    expect(
      parseDragDropAuthoredQuestion({
        ...question,
        attrs: { ...question.attrs, id: "target000001" },
        content: (question.content ?? []).map((child) =>
          child.type === "drag_drop_canvas"
            ? { ...child, attrs: { ...child.attrs, id: "canvas000001" } }
            : child,
        ),
      }),
    ).toMatchObject({ ownerId: "target000001", ready: false });
  });

  it("keeps the private owner out of ordinary Block insertion", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_drag_drop_question")).toBeUndefined();
    expect(
      builtInBlockRegistry.definitions.some(
        ({ nodeType }) => nodeType === "surface_drag_drop_question",
      ),
    ).toBe(false);
  });

  it("defines a fixed non-selectable full-slide assessment owner", () => {
    expect(createSurfaceDragDropQuestionNode().config).toMatchObject({
      name: "surface_drag_drop_question",
      content:
        "assessment_title assessment_instructions assessment_prompt drag_drop_canvas assessment_actions_group",
      defining: true,
      isolating: true,
      selectable: false,
      draggable: false,
    });
  });
});

function requireDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
  if (!definition) throw new Error("Expected slide-drag-drop-question Surface definition.");
  return definition;
}
