import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { SemanticItem } from "@/document/model/semantic-document";

import {
  deriveCourseOutlineSurfaceDropTargets,
  orderedCourseOutlineSurfaces,
} from "./course-outline-surface-drop-targets";

describe("Course Outline Surface drop targets", () => {
  it("derives stable-ID before and after destinations in document order", () => {
    const roots = [surface("a"), surface("b"), surface("c")];

    expect(deriveCourseOutlineSurfaceDropTargets(roots, id("b"))).toEqual([
      { targetSurfaceId: id("a"), destination: { beforeSurfaceId: id("a") } },
      { targetSurfaceId: id("c"), destination: { afterSurfaceId: id("c") } },
    ]);
  });

  it("uses the complete semantic tree even when a Course Section is visually collapsed", () => {
    const roots = [section("one", [surface("a"), surface("b")]), section("two", [surface("c")])];

    expect(orderedCourseOutlineSurfaces(roots).map((item) => item.id)).toEqual([
      id("a"),
      id("b"),
      id("c"),
    ]);
    expect(deriveCourseOutlineSurfaceDropTargets(roots, id("a"))).toContainEqual({
      targetSurfaceId: id("c"),
      destination: { afterSurfaceId: id("c") },
    });
  });

  it("does not produce same-position destinations or targets for non-Surface rows", () => {
    const roots = [section("one", [surface("a")]), section("two", [surface("b")])];

    expect(deriveCourseOutlineSurfaceDropTargets(roots, id("missing"))).toEqual([]);
    expect(deriveCourseOutlineSurfaceDropTargets(roots, id("a"))).toEqual([
      { targetSurfaceId: id("b"), destination: { afterSurfaceId: id("b") } },
    ]);
  });

  it("emits explicit destinations for adjacent and trailing empty Course Sections", () => {
    const roots = [
      section("one", [surface("a")]),
      section("two", []),
      section("three", []),
    ];

    expect(deriveCourseOutlineSurfaceDropTargets(roots, id("a"))).toEqual(
      expect.arrayContaining([
        {
          targetSectionId: id("two"),
          destination: { intoCourseSectionId: id("two"), edge: "end" },
        },
        {
          targetSectionId: id("three"),
          destination: { intoCourseSectionId: id("three"), edge: "end" },
        },
      ]),
    );
  });
});

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function surface(value: string): SemanticItem {
  return item(value, "surface", []);
}

function section(value: string, children: readonly SemanticItem[]): SemanticItem {
  return item(value, "course-section", children);
}

function item(
  value: string,
  kind: SemanticItem["kind"],
  children: readonly SemanticItem[],
): SemanticItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label: value,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children,
  };
}
