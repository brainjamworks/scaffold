// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import {
  SurfaceFooterNode,
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import type { FixedSurfaceChild } from "../surface-variant-definition";
import {
  matchFixedSurfaceChildren,
  snapshotSurfaceStructureChildrenFromJSON,
  snapshotSurfaceStructureChildrenFromProseMirror,
  type SurfaceStructureChild,
} from "./surface-fixed-structure";

const FIXED_CHILDREN = [
  { type: "heading", attrs: { level: 1 } },
  { type: "region", attrs: { role: "primary" } },
  { type: "region", attrs: { role: "secondary" } },
] as const satisfies readonly FixedSurfaceChild[];

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("matchFixedSurfaceChildren", () => {
  it("returns an exact result for matching types, order, and declared attributes", () => {
    const children: readonly SurfaceStructureChild[] = [
      { type: "heading", attrs: { level: 1, id: "generated-heading" } },
      {
        type: "region",
        attrs: { id: "generated-primary", role: "primary", verticalPosition: "middle" },
      },
      { type: "region", attrs: { id: "generated-secondary", role: "secondary" } },
    ];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({ exact: true });
  });

  it("reports the first type mismatch when fixed children are in the wrong order", () => {
    const children: readonly SurfaceStructureChild[] = [
      { type: "region", attrs: { role: "primary" } },
      { type: "heading", attrs: { level: 1 } },
      { type: "region", attrs: { role: "secondary" } },
    ];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "type",
        index: 0,
        expectedType: "heading",
        actualType: "region",
      },
    });
  });

  it("reports a missing fixed child as a count mismatch", () => {
    expect(matchFixedSurfaceChildren(FIXED_CHILDREN.slice(0, 2), FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "count",
        index: 2,
        expectedCount: 3,
        actualCount: 2,
      },
    });
  });

  it("reports an extra fixed child as a count mismatch", () => {
    const children = [...FIXED_CHILDREN, { type: "paragraph" }];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "count",
        index: 3,
        expectedCount: 3,
        actualCount: 4,
      },
    });
  });

  it("reports the first divergence for a prepended extra child", () => {
    const children: readonly SurfaceStructureChild[] = [{ type: "paragraph" }, ...FIXED_CHILDREN];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "count",
        index: 0,
        expectedCount: 3,
        actualCount: 4,
      },
    });
  });

  it("reports the first divergence for a missing internal child", () => {
    const children: readonly SurfaceStructureChild[] = [FIXED_CHILDREN[0], FIXED_CHILDREN[2]];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "count",
        index: 1,
        expectedCount: 3,
        actualCount: 2,
      },
    });
  });

  it("reports a mismatched logical region role", () => {
    const children: readonly SurfaceStructureChild[] = [
      { type: "heading", attrs: { level: 1 } },
      { type: "region", attrs: { role: "secondary" } },
      { type: "region", attrs: { role: "primary" } },
    ];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "attribute",
        index: 1,
        attribute: "role",
        expectedValue: "primary",
        actualValue: "secondary",
      },
    });
  });

  it("reports a mismatched heading level", () => {
    const children: readonly SurfaceStructureChild[] = [
      { type: "heading", attrs: { level: 2 } },
      { type: "region", attrs: { role: "primary" } },
      { type: "region", attrs: { role: "secondary" } },
    ];

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({
      exact: false,
      mismatch: {
        kind: "attribute",
        index: 0,
        attribute: "level",
        expectedValue: 1,
        actualValue: 2,
      },
    });
  });
});

describe("surface structure child snapshots", () => {
  it("normalizes JSON direct children without generated IDs or authored descendants", () => {
    const first = snapshotSurfaceStructureChildrenFromJSON(
      surface([
        { type: "heading", attrs: { id: "heading-a", level: 1 }, content: [text("First")] },
        {
          type: "region",
          attrs: { id: "region-a", role: "primary" },
          content: [{ type: "paragraph", content: [text("Authored first content")] }],
        },
      ]),
    );
    const second = snapshotSurfaceStructureChildrenFromJSON(
      surface([
        { type: "heading", attrs: { id: "heading-b", level: 1 }, content: [text("Second")] },
        {
          type: "region",
          attrs: { id: "region-b", role: "primary" },
          content: [{ type: "paragraph", content: [text("Different authored content")] }],
        },
      ]),
    );

    expect(first).toEqual([
      { type: "heading", attrs: { level: 1 } },
      { type: "region", attrs: { role: "primary" } },
    ]);
    expect(second).toEqual(first);
  });

  it("excludes optional JSON header and footer boundaries from the fixed signature", () => {
    const children = snapshotSurfaceStructureChildrenFromJSON(
      surface([
        header("surface_header"),
        { type: "heading", attrs: { level: 1 } },
        { type: "region", attrs: { id: "region-a", role: "primary" } },
        { type: "region", attrs: { id: "region-b", role: "secondary" } },
        header("surface_footer"),
      ]),
    );

    expect(matchFixedSurfaceChildren(children, FIXED_CHILDREN)).toEqual({ exact: true });
  });

  it("normalizes ProseMirror direct children with the same boundary and content rules", () => {
    const first = snapshotSurfaceStructureChildrenFromProseMirror(
      proseMirrorSurface(
        surface([
          header("surface_header"),
          { type: "heading", attrs: { level: 1 }, content: [text("First title")] },
          {
            type: "region",
            attrs: { id: "region-a", role: "primary" },
            content: [{ type: "paragraph", content: [text("First content")] }],
          },
          {
            type: "region",
            attrs: { id: "region-b", role: "secondary" },
            content: [{ type: "paragraph", content: [text("Second content")] }],
          },
          header("surface_footer"),
        ]),
      ),
    );
    const second = snapshotSurfaceStructureChildrenFromProseMirror(
      proseMirrorSurface(
        surface([
          header("surface_header"),
          { type: "heading", attrs: { level: 1 }, content: [text("Changed title")] },
          {
            type: "region",
            attrs: { id: "region-c", role: "primary" },
            content: [{ type: "paragraph", content: [text("Changed first content")] }],
          },
          {
            type: "region",
            attrs: { id: "region-d", role: "secondary" },
            content: [{ type: "paragraph", content: [text("Changed second content")] }],
          },
          header("surface_footer"),
        ]),
      ),
    );

    expect(second).toEqual(first);
    expect(first[1]?.attrs).not.toHaveProperty("id");
    expect(matchFixedSurfaceChildren(first, FIXED_CHILDREN)).toEqual({ exact: true });
  });
});

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

const TestSectionArrangementNode = Node.create({
  name: "testSectionArrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

function proseMirrorSurface(surfaceJson: JSONContent) {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        heading: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      ExtendedHeading,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
      SlideCoverSubtitleNode,
      SurfaceFooterNode,
      TestArrangementNode,
      TestSectionArrangementNode,
    ],
  });
  editors.push(editor);
  return editor.schema.nodeFromJSON(surfaceJson);
}

function surface(content: JSONContent[]): JSONContent {
  return {
    type: "surface",
    attrs: { id: "surface-a", variant: "test" },
    content,
  };
}

function text(value: string): JSONContent {
  return { type: "text", text: value };
}

function header(type: "surface_header" | "surface_footer"): JSONContent {
  return {
    type,
    content: ["left", "center", "right"].map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph" }],
    })),
  };
}
