// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, type PresentationConfigurationV1 } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import { canDeleteSurface, deleteSurface } from "./surface-document-commands";

const FIRST_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const SECOND_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");

function presentationFor(surfaceIds: readonly string[]): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: surfaceIds.map((surfaceId) => ({
      surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
      durationMs: 0,
      actions: [],
    })),
  };
}

/**
 * Builds a slideshow through the real authoring composition, so the delete
 * probe runs against the shipped schema and the shipped Presentation contract.
 */
function createSlideshowEditor(surfaceIds: readonly string[]): Editor {
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
          attrs: {
            id: "course000001",
            mode: "slideshow",
            presentation: presentationFor(surfaceIds),
            surfaceSize: "16x9",
            overflowMode: "fit",
          },
          content: [
            { type: "courseSection", attrs: { id: "section00001", title: "Presentation" } },
            ...surfaceIds.map((surfaceId) =>
              slideCoverSurfaceDefinition.createSurface({
                surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
              }),
            ),
          ],
        },
      ],
    },
  });
}

describe("deleting the last Surface of a Presentation", () => {
  it("refuses instead of throwing when the slideshow has one slide", () => {
    const editor = createSlideshowEditor([FIRST_SURFACE_ID]);
    const before = editor.getJSON();

    expect(() => canDeleteSurface(editor, FIRST_SURFACE_ID)).not.toThrow();
    expect(canDeleteSurface(editor, FIRST_SURFACE_ID)).toBe(false);
    expect(deleteSurface(editor, FIRST_SURFACE_ID)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("still allows deleting a slide while another one remains", () => {
    const editor = createSlideshowEditor([FIRST_SURFACE_ID, SECOND_SURFACE_ID]);

    expect(canDeleteSurface(editor, FIRST_SURFACE_ID)).toBe(true);
    expect(deleteSurface(editor, FIRST_SURFACE_ID)).toBe(true);

    const children: JSONContent[] = editor.getJSON().content?.[0]?.content ?? [];
    const surfaces = children.filter((child) => child.type === "surface");
    expect(surfaces.map((child) => child.attrs?.["id"])).toEqual([SECOND_SURFACE_ID]);

    editor.destroy();
  });
});
