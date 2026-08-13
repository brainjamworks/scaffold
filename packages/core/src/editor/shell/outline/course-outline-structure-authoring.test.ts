import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vite-plus/test";

import type { CourseStructureCommand } from "@/document/model/course-structure";

import { createCourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const OTHER_SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00002");
const SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");

describe("createCourseOutlineStructureAuthoringPort", () => {
  it.each([
    [
      "creates a Course Section",
      (port: ReturnType<typeof createCourseOutlineStructureAuthoringPort>) =>
        port.createCourseSection("Overview"),
      { type: "course-section.create", title: "Overview", placement: "end" },
    ],
    [
      "renames a Course Section",
      (port: ReturnType<typeof createCourseOutlineStructureAuthoringPort>) =>
        port.renameCourseSection({ courseSectionId: SECTION_ID, title: "Changed" }),
      { type: "course-section.rename", courseSectionId: SECTION_ID, title: "Changed" },
    ],
    [
      "duplicates a Course Section",
      (port: ReturnType<typeof createCourseOutlineStructureAuthoringPort>) =>
        port.duplicateCourseSection(SECTION_ID),
      { type: "course-section.duplicate", courseSectionId: SECTION_ID },
    ],
    [
      "deletes a Course Section with exact confirmed membership",
      (port: ReturnType<typeof createCourseOutlineStructureAuthoringPort>) =>
        port.deleteCourseSection({ courseSectionId: SECTION_ID, expectedSurfaceIds: [SURFACE_ID] }),
      {
        type: "course-section.delete",
        courseSectionId: SECTION_ID,
        expectedSurfaceIds: [SURFACE_ID],
      },
    ],
    [
      "moves a Surface",
      (port: ReturnType<typeof createCourseOutlineStructureAuthoringPort>) =>
        port.moveSurface({
          surfaceId: SURFACE_ID,
          destination: { afterSurfaceId: OTHER_SURFACE_ID },
        }),
      {
        type: "surface.move",
        surfaceId: SURFACE_ID,
        destination: { afterSurfaceId: OTHER_SURFACE_ID },
      },
    ],
  ] as const)("%s through the stable-ID command seam", (_name, invoke, expected) => {
    const harness = createEditorHarness(true);
    const result = invoke(createCourseOutlineStructureAuthoringPort(harness.editor));

    expect(result).toEqual({ ok: true });
    expect(harness.canApply).toHaveBeenCalledWith(expected);
    expect(harness.apply).toHaveBeenCalledWith(expected);
    expect(harness.run).toHaveBeenCalledTimes(1);
  });

  it("returns a stale result without dispatch when the command is no longer applicable", () => {
    const harness = createEditorHarness(false);
    const port = createCourseOutlineStructureAuthoringPort(harness.editor);

    expect(
      port.deleteCourseSection({ courseSectionId: SECTION_ID, expectedSurfaceIds: [] }),
    ).toEqual({
      ok: false,
      message: "This Course Section could not be deleted. Its membership may have changed.",
    });
    expect(harness.apply).not.toHaveBeenCalled();
    expect(harness.run).not.toHaveBeenCalled();
  });

  it("uses command applicability for concrete Surface destinations", () => {
    const harness = createEditorHarness(true);
    const port = createCourseOutlineStructureAuthoringPort(harness.editor);
    const destination = { beforeSurfaceId: OTHER_SURFACE_ID };

    expect(port.canMoveSurface(SURFACE_ID, destination)).toBe(true);
    expect(harness.canApply).toHaveBeenCalledWith({
      type: "surface.move",
      surfaceId: SURFACE_ID,
      destination,
    });
  });
});

function createEditorHarness(applicable: boolean) {
  const canApply = vi.fn((_command: CourseStructureCommand) => applicable);
  const apply = vi.fn((_command: CourseStructureCommand) => chain);
  const run = vi.fn(() => applicable);
  const chain = { applyCourseStructureCommand: apply, run };
  const editor = {
    isDestroyed: false,
    state: { doc: {} },
    can: () => ({ applyCourseStructureCommand: canApply }),
    chain: () => chain,
  } as unknown as Editor;
  return { editor, canApply, apply, run };
}
