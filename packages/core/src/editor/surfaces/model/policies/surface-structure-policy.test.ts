// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  ARRANGEMENT_CONTENT,
  SECTION_ARRANGEMENT_CONTENT,
} from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedHeading } from "@/editor/rich-text/model/rich-text-blocks";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SurfaceFooterNode,
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { slideCoverSurfaceDefinition } from "../templates/slide-cover";
import type { SurfaceVariantDefinition } from "../surface-variant-definition";
import { validateCourseSurfaceStructure } from "./surface-structure-policy";
import { createSurfaceVariantRegistry } from "../surface-variant-registry";

const FIXED_STRUCTURE_VARIANT = "surface-structure-policy-fixed-test";

const fixedStructureSurfaceDefinition: SurfaceVariantDefinition = {
  id: FIXED_STRUCTURE_VARIANT,
  modes: ["slideshow"],
  title: "Fixed structure policy test surface",
  description: "Test surface with an ordered attribute-aware signature.",
  structurePolicy: {
    fixedChildren: [
      { type: "heading", attrs: { level: 1 } },
      { type: "region", attrs: { role: "primary" } },
      { type: "region", attrs: { role: "secondary" } },
    ],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) => fixedSurface(surfaceId),
};

const surfaceVariants = createSurfaceVariantRegistry([
  fixedStructureSurfaceDefinition,
  slideCoverSurfaceDefinition,
]);

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

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("surface structure policy validation", () => {
  it("accepts an exact fixed signature with optional header and footer boundaries", () => {
    const surface = proseMirrorSurface(
      fixedSurface("surface-a", [
        header("surface_header"),
        ...fixedChildren(),
        header("surface_footer"),
      ]),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("reports a fixed child with the wrong structural role", () => {
    const surface = proseMirrorSurface(
      fixedSurface("surface-a", [
        { type: "heading", attrs: { level: 1 } },
        { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
        { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
      ]),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_attribute_mismatch",
        nodeType: "region",
        childIndex: 1,
        attribute: "role",
        expectedValue: "primary",
        actualValue: "secondary",
        message:
          'fixed surface child 1 "region" must have attribute "role" equal to "primary"; received "secondary"',
        surfaceId: "surface-a",
        surfaceVariant: FIXED_STRUCTURE_VARIANT,
      },
    ]);
  });

  it("reports fixed children in the wrong order", () => {
    const surface = proseMirrorSurface(
      fixedSurface("surface-a", [
        { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
        { type: "heading", attrs: { level: 1 } },
        { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
      ]),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_type_mismatch",
        nodeType: "region",
        childIndex: 0,
        expectedType: "heading",
        actualType: "region",
        message: 'fixed surface child 0 must be "heading"; received "region"',
        surfaceId: "surface-a",
        surfaceVariant: FIXED_STRUCTURE_VARIANT,
      },
    ]);
  });

  it("reports a missing fixed child", () => {
    const surface = proseMirrorSurface(
      fixedSurface("surface-a", [
        { type: "heading", attrs: { level: 1 } },
        { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
      ]),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 3,
        actualCount: 2,
        message: "fixed surface signature requires 3 children; received 2",
        surfaceId: "surface-a",
        surfaceVariant: FIXED_STRUCTURE_VARIANT,
      },
    ]);
  });

  it("reports an extra fixed child", () => {
    const surface = proseMirrorSurface(
      fixedSurface("surface-a", [...fixedChildren(), { type: "paragraph" }]),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 3,
        actualCount: 4,
        message: "fixed surface signature requires 3 children; received 4",
        surfaceId: "surface-a",
        surfaceVariant: FIXED_STRUCTURE_VARIANT,
      },
    ]);
  });

  it("accepts the built-in slide cover skeleton", () => {
    const surface = proseMirrorSurface(
      slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-a" }),
    );

    expect(validateCourseSurfaceStructure(surface, surfaceVariants)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("rejects a slide cover missing a fixed heading", () => {
    const surface = proseMirrorSurface({
      type: "surface",
      attrs: { id: "surface-a", variant: "slide-cover" },
      content: [
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 2,
        actualCount: 1,
        message: "fixed surface signature requires 2 children; received 1",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
    ]);
  });

  it("rejects an extra slide cover subtitle", () => {
    const surface = proseMirrorSurface({
      type: "surface",
      attrs: { id: "surface-a", variant: "slide-cover" },
      content: [
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 2,
        actualCount: 3,
        message: "fixed surface signature requires 2 children; received 3",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
    ]);
  });

  it("rejects an extra slide cover heading", () => {
    const surface = proseMirrorSurface({
      type: "surface",
      attrs: { id: "surface-a", variant: "slide-cover" },
      content: [
        { type: "heading", attrs: { level: 1 } },
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
      ],
    });

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 2,
        actualCount: 3,
        message: "fixed surface signature requires 2 children; received 3",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
    ]);
  });

  it("rejects duplicate header and footer fixtures as global invariants", () => {
    const surface = proseMirrorSurface({
      type: "surface",
      attrs: { id: "surface-a", variant: "slide-cover" },
      content: [
        header("surface_header"),
        header("surface_header"),
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        header("surface_footer"),
        header("surface_footer"),
      ],
    });

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "duplicate_header_footer",
        nodeType: "surface_header",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
      {
        code: "duplicate_header_footer",
        nodeType: "surface_footer",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
      {
        code: "fixed_surface_child_count_mismatch",
        nodeType: "surface",
        expectedCount: 2,
        actualCount: 4,
        message: "fixed surface signature requires 2 children; received 4",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
    ]);
  });

  it("rejects malformed header and footer slot structures", () => {
    const surface = proseMirrorSurface({
      type: "surface",
      attrs: { id: "surface-a", variant: "slide-cover" },
      content: [
        header("surface_header", ["right"]),
        { type: "heading", attrs: { level: 1 } },
        {
          type: "slide_cover_subtitle",
          content: [{ type: "paragraph" }],
        },
        header("surface_footer", ["left", "left", "right"]),
      ],
    });

    expect(validateCourseSurfaceStructure(surface, surfaceVariants).violations).toEqual([
      {
        code: "invalid_header_footer_slots",
        nodeType: "surface_header",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
      {
        code: "invalid_header_footer_slots",
        nodeType: "surface_footer",
        surfaceId: "surface-a",
        surfaceVariant: "slide-cover",
      },
    ]);
  });
});

function proseMirrorSurface(surface: JSONContent) {
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
  return editor.schema.nodeFromJSON(surface);
}

function header(
  type: "surface_header" | "surface_footer",
  positions: string[] = ["left", "center", "right"],
): JSONContent {
  return {
    type,
    content: positions.map((position) => ({
      type: "surface_header_footer_slot",
      attrs: { position },
      content: [{ type: "paragraph" }],
    })),
  };
}

function fixedSurface(surfaceId: string, content: JSONContent[] = fixedChildren()): JSONContent {
  return {
    type: "surface",
    attrs: { id: surfaceId, variant: FIXED_STRUCTURE_VARIANT },
    content,
  };
}

function fixedChildren(): JSONContent[] {
  return [
    { type: "heading", attrs: { level: 1 } },
    { type: "region", attrs: { role: "primary" }, content: [{ type: "paragraph" }] },
    { type: "region", attrs: { role: "secondary" }, content: [{ type: "paragraph" }] },
  ];
}
