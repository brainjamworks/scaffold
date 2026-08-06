import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { createCourseStructureModule } from "@/document/model/course-structure";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { selectRuntimePlayer } from "./player-selection";

const PAGE_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface-page");
const FIRST_SLIDE_ID = EmbeddedNodeIdSchema.parse("slide_000002");
const SECOND_SLIDE_ID = EmbeddedNodeIdSchema.parse("slide_000001");
const COURSE_SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
const courseStructure = createCourseStructureModule({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

describe("selectRuntimePlayer", () => {
  it("selects a page only from its validated surface instance", () => {
    const structure = validatedStructure(
      createScaffoldDocumentContent({ mode: "page", surfaceId: PAGE_SURFACE_ID }),
    );

    expect(selectRuntimePlayer(structure)).toEqual({
      status: "available",
      player: "page",
      mode: "page",
      surfaceIds: [PAGE_SURFACE_ID],
    });
  });

  it("preserves validated slideshow instance order", () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      surfaceId: FIRST_SLIDE_ID,
    });
    const courseDocument = content.content?.[0];
    const firstSurface = courseDocument?.content?.[0];
    if (!courseDocument || !firstSurface) throw new Error("missing slideshow fixture");
    const slideCover = builtInSurfaceVariantRegistry.get("slide-cover");
    if (!slideCover) throw new Error("missing slide-cover definition");
    courseDocument.content = [
      firstSurface,
      slideCover.createSurface({ surfaceId: SECOND_SLIDE_ID }),
    ];
    const before = structuredClone(content);

    const selection = selectRuntimePlayer(validatedStructure(content));

    expect(selection).toEqual({
      status: "available",
      player: "slideshow",
      mode: "slideshow",
      surfaceIds: [FIRST_SLIDE_ID, SECOND_SLIDE_ID],
    });
    expect(content).toEqual(before);
  });

  it("flattens a sectioned Slideshow without selecting Course Section boundaries", () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      surfaceId: FIRST_SLIDE_ID,
    });
    const courseDocument = content.content?.[0];
    const firstSurface = courseDocument?.content?.[0];
    const slideCover = builtInSurfaceVariantRegistry.get("slide-cover");
    if (!courseDocument || !firstSurface || !slideCover) {
      throw new Error("missing sectioned slideshow fixture");
    }
    courseDocument.content = [
      { type: "courseSection", attrs: { id: COURSE_SECTION_ID, title: "Introduction" } },
      firstSurface,
      slideCover.createSurface({ surfaceId: SECOND_SLIDE_ID }),
    ];

    const structure = validatedStructure(content);

    expect(structure.sectioning).toBe("course-sections");
    expect(selectRuntimePlayer(structure)).toEqual({
      status: "available",
      player: "slideshow",
      mode: "slideshow",
      surfaceIds: [FIRST_SLIDE_ID, SECOND_SLIDE_ID],
    });
    expect(selectRuntimePlayer(structure).surfaceIds).not.toContain(COURSE_SECTION_ID);
  });
});

function validatedStructure(content: JSONContent) {
  const result = courseStructure.validate(content);
  if (!result.ok) throw new Error(`invalid test fixture: ${JSON.stringify(result.issues)}`);
  return result.value;
}
