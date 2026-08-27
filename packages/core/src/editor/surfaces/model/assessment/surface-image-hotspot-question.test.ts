// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import {
  EmbeddedNodeIdSchema,
  ImageHotspotCanvasDataSchema,
  ImageHotspotPrivateAssessmentSchema,
  ImageHotspotSettingsSchema,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  removeImageHotspotChecked,
  resolveImageHotspotAuthoringModel,
  toggleImageHotspotCorrectChecked,
} from "@/editor/blocks/assessment/image-hotspot/image-hotspot-authoring-commands";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";

describe("surface Image Hotspot question", () => {
  it("creates one private target owner with editable Image Hotspot defaults", () => {
    const definition = requireImageHotspotDefinition();
    const surface = definition.createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_image_hotspot_question",
      attrs: {
        settings: ImageHotspotSettingsSchema.parse({ legend: "Select regions" }),
        assessment: ImageHotspotPrivateAssessmentSchema.parse({}),
      },
    });
    expect(question?.content?.map(({ type }) => type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "image_hotspot_canvas",
      "assessment_actions_group",
    ]);
    expect(question?.content?.[3]?.attrs?.["data"]).toEqual(ImageHotspotCanvasDataSchema.parse({}));
  });

  it("keeps the private owner out of the ordinary block catalogue", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_image_hotspot_question")).toBeUndefined();
  });

  it("assigns and preserves one stable target id during template insertion", () => {
    const composition = createCoreScaffoldAuthoringComposition();
    const firstSurfaceId = createEmbeddedNodeId();
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              {
                type: "courseSection",
                attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
              },
              slideCoverSurfaceDefinition.createSurface({ surfaceId: firstSurfaceId }),
            ],
          },
        ],
      },
    });

    try {
      expect(
        insertSurfaceTemplateAfterSurface(editor, composition.capabilities.surfaces.registry, {
          afterSurfaceId: firstSurfaceId,
          variantId: requireImageHotspotDefinition().id,
        }),
      ).toBe(true);
      const targetId = findImageHotspotQuestionId(editor);
      expect(EmbeddedNodeIdSchema.safeParse(targetId).success).toBe(true);

      editor.commands.setContent(editor.getJSON());
      expect(findImageHotspotQuestionId(editor)).toBe(targetId);
    } finally {
      editor.destroy();
    }
  });

  it("uses the Surface owner for checked canvas and answer-key mutations", () => {
    const editor = createAuthoringEditor();

    try {
      const target = createAuthoringNodeTarget(editor, {
        id: "target000001",
        nodeType: "surface_image_hotspot_question",
      }).read();
      if (!target) throw new Error("Expected a Surface-owned Image Hotspot target.");

      const model = resolveImageHotspotAuthoringModel(target);
      expect(model?.data.hotspots.map(({ id }) => id)).toEqual(["hotsp_000001"]);

      const result = toggleImageHotspotCorrectChecked({
        tr: editor.state.tr,
        target,
        hotspotId: "hotsp_000001",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      editor.view.dispatch(result.tr);

      const updated = createAuthoringNodeTarget(editor, {
        id: "target000001",
        nodeType: "surface_image_hotspot_question",
      }).read();
      expect(
        updated && resolveImageHotspotAuthoringModel(updated)?.assessment.correctHotspotIds,
      ).toEqual(["hotsp_000001"]);

      if (!updated) throw new Error("Expected the updated Surface-owned target.");
      const removeResult = removeImageHotspotChecked({
        tr: editor.state.tr,
        target: updated,
        hotspotId: "hotsp_000001",
      });
      expect(removeResult.ok).toBe(true);
      if (!removeResult.ok) return;
      editor.view.dispatch(removeResult.tr);

      const removed = createAuthoringNodeTarget(editor, {
        id: "target000001",
        nodeType: "surface_image_hotspot_question",
      }).read();
      const removedModel = removed ? resolveImageHotspotAuthoringModel(removed) : null;
      expect(removedModel?.data.hotspots).toEqual([]);
      expect(removedModel?.assessment.correctHotspotIds).toEqual([]);
    } finally {
      editor.destroy();
    }
  });
});

function requireImageHotspotDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-image-hotspot-question");
  if (!definition) throw new Error("Expected slide-image-hotspot-question Surface definition.");
  return definition;
}

function createAuthoringEditor() {
  const definition = requireImageHotspotDefinition();
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Image Hotspot question content.");

  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: createCoreScaffoldAuthoringComposition(),
    }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
            },
            {
              ...surface,
              content: [
                {
                  ...question,
                  attrs: { ...question.attrs, id: "target000001" },
                  content: (question.content ?? []).map((child) =>
                    child.type === "image_hotspot_canvas"
                      ? {
                          ...child,
                          attrs: {
                            data: ImageHotspotCanvasDataSchema.parse({
                              image: {
                                mode: "managed",
                                mediaId: "hotspot-image",
                                alt: "A map",
                              },
                              hotspots: [
                                {
                                  id: "hotsp_000001",
                                  centerX: 50,
                                  centerY: 50,
                                  radius: 10,
                                  label: "Centre",
                                },
                              ],
                              maxClicks: 1,
                            }),
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
    },
  });
}

function findImageHotspotQuestionId(editor: Editor) {
  let targetId: unknown;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_image_hotspot_question") return true;
    targetId = node.attrs["id"];
    return false;
  });
  return targetId;
}
