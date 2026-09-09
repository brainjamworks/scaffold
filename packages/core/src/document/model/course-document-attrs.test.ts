import { describe, expect, it } from "vite-plus/test";

import { toPortableCourseDocumentAttrs } from "./course-document-attrs";

describe("toPortableCourseDocumentAttrs", () => {
  it("omits ProseMirror null sentinels for absent orchestration values", () => {
    expect(
      toPortableCourseDocumentAttrs({
        schemaVersion: 5,
        requiresScaffoldPlus: false,
        mode: "slideshow",
        surfaceSize: "16x9",
        overflowMode: "clip",
        theme: { schemaVersion: 1 },
        branching: null,
        learnerInteractions: null,
        presentation: null,
      }),
    ).toEqual({
      schemaVersion: 5,
      requiresScaffoldPlus: false,
      mode: "slideshow",
      surfaceSize: "16x9",
      overflowMode: "clip",
      theme: { schemaVersion: 1 },
    });
  });

  it("omits undefined orchestration values without mutating the working attrs", () => {
    const working = {
      mode: "page",
      learnerInteractions: undefined,
      presentation: undefined,
    };
    const portable = toPortableCourseDocumentAttrs(working);

    expect(portable).toEqual({ mode: "page" });
    expect(working).toEqual({
      mode: "page",
      learnerInteractions: undefined,
      presentation: undefined,
    });
  });

  it("preserves present orchestration values", () => {
    const presentation = { schemaVersion: 1, surfaces: [] };
    expect(toPortableCourseDocumentAttrs({ mode: "slideshow", presentation })).toEqual({
      mode: "slideshow",
      presentation,
    });
  });

  it("passes non-record attrs through for portable validation to reject", () => {
    expect(toPortableCourseDocumentAttrs(null)).toBeNull();
    expect(toPortableCourseDocumentAttrs("courseDocument")).toBe("courseDocument");
  });
});
