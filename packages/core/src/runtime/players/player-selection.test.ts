import { describe, expect, it } from "vite-plus/test";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { projectCourseStructure } from "@/document/model/course-structure";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { selectRuntimePlayer } from "./player-selection";

const PAGE_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface-page");
const FIRST_SLIDE_ID = EmbeddedNodeIdSchema.parse("slide_000002");
const SECOND_SLIDE_ID = EmbeddedNodeIdSchema.parse("slide_000001");
const COURSE_SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
describe("selectRuntimePlayer", () => {
  it("selects the page Surface from document content", () => {
    const content = createScaffoldDocumentContent({ mode: "page", surfaceId: PAGE_SURFACE_ID });

    const structure = projectCourseStructure(content);
    expect(structure?.kind).toBe("page");
    expect(selectRuntimePlayer(content)).toEqual({
      player: "page",
      mode: "page",
      structure,
    });
  });

  it("preserves slideshow Surface order", () => {
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

    const selection = selectRuntimePlayer(content);

    const structure = projectCourseStructure(content);
    expect(structure?.kind).toBe("unsectioned-slideshow");
    expect(selection).toEqual({
      player: "slideshow",
      mode: "slideshow",
      structure,
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

    const structure = projectCourseStructure(content);
    expect(structure?.kind).toBe("sectioned-slideshow");
    expect(selectRuntimePlayer(content)).toEqual({
      player: "slideshow",
      mode: "slideshow",
      structure,
    });
    expect(structure?.surfaceIds).not.toContain(COURSE_SECTION_ID);
  });

  it("returns no player selection for malformed Course Structure", () => {
    const content = createScaffoldDocumentContent({
      mode: "slideshow",
      surfaceId: FIRST_SLIDE_ID,
    });
    const courseDocument = content.content?.[0];
    const firstSurface = courseDocument?.content?.[0];
    if (!courseDocument || !firstSurface) throw new Error("missing slideshow fixture");
    courseDocument.content = [
      firstSurface,
      { type: "courseSection", attrs: { id: COURSE_SECTION_ID, title: "Practice" } },
      structuredClone(firstSurface),
    ];

    expect(selectRuntimePlayer(content)).toBeNull();
  });
});
