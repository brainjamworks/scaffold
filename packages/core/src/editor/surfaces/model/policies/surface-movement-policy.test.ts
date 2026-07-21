// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";

import type { SurfaceVariantDefinition } from "../surface-variant-definition";
import {
  canInsertSurfaceStructureChild,
  canMoveSurfaceStructureNode,
} from "./surface-movement-policy";
import { allowsSurfaceRootInsertion } from "./surface-root-insertion-policy";
import { createSurfaceVariantRegistry } from "../surface-variant-registry";

const FIXED_VARIANT = "surface-movement-fixed-test";

const fixedSurfaceDefinition: SurfaceVariantDefinition = {
  id: FIXED_VARIANT,
  modes: ["page"],
  title: "Fixed movement test surface",
  description: "Test surface with role-keyed fixed fixtures.",
  structurePolicy: {
    fixedChildren: [
      { type: "movement_fixture", attrs: { structuralRole: "primary" } },
      { type: "movement_fixture", attrs: { structuralRole: "secondary" } },
    ],
    allowRootInsertion: false,
  },
  createSurface: ({ surfaceId }) =>
    surface(surfaceId, FIXED_VARIANT, [
      fixture("primary", "primary"),
      fixture("secondary", "secondary"),
    ]),
};

const unconstrainedSurfaceDefinition: SurfaceVariantDefinition = {
  id: "page-default",
  modes: ["page"],
  defaultForModes: ["page"],
  title: "Unconstrained movement test surface",
  description: "Test surface without a fixed child signature.",
  createSurface: ({ surfaceId }) =>
    surface(surfaceId, "page-default", [fixture("default-child", "unrelated")]),
};

const surfaceVariants = createSurfaceVariantRegistry([
  fixedSurfaceDefinition,
  unconstrainedSurfaceDefinition,
]);

const MovementFixtureNode = Node.create({
  name: "movement_fixture",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      structuralRole: { default: "unrelated" },
    };
  },

  renderHTML() {
    return ["div"];
  },
});

const MovementSurfaceNode = Node.create({
  name: "surface",
  content: "block+",

  addAttributes() {
    return {
      id: { default: null },
      variant: { default: null },
    };
  },

  renderHTML() {
    return ["section", 0];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("surface movement policy", () => {
  it("protects a direct child matching a declared fixed type and structural role", () => {
    const editor = makeEditor([
      surface("fixed", FIXED_VARIANT, [
        fixture("primary", "primary"),
        fixture("secondary", "secondary"),
      ]),
    ]);

    expect(
      canMoveSurfaceStructureNode(editor.state.doc, nodePos(editor, "primary"), surfaceVariants),
    ).toBe(false);
  });

  it("does not protect the same node type when its structural role is not declared", () => {
    const editor = makeEditor([
      surface("fixed", FIXED_VARIANT, [
        fixture("tertiary", "tertiary"),
        fixture("secondary", "secondary"),
      ]),
    ]);

    expect(
      canMoveSurfaceStructureNode(editor.state.doc, nodePos(editor, "tertiary"), surfaceVariants),
    ).toBe(true);
  });

  it("allows a matching node outside a fixed surface to retain normal movement", () => {
    const editor = makeEditor([surface("page", "page-default", [fixture("outside", "primary")])]);

    expect(
      canMoveSurfaceStructureNode(editor.state.doc, nodePos(editor, "outside"), surfaceVariants),
    ).toBe(true);
  });

  it("allows arbitrary direct-child insertion into an unconstrained page surface", () => {
    const editor = makeEditor([surface("page", "page-default", [fixture("existing", "primary")])]);
    const { node: pageSurface } = surfaceNode(editor, "page");
    const extra = editor.schema.nodeFromJSON(fixture("extra", "secondary"));

    expect(
      canInsertSurfaceStructureChild({
        surface: pageSurface,
        child: extra,
        surfaceVariants,
      }),
    ).toBe(true);
  });

  it("rejects inserting any extra direct child into a fixed signature", () => {
    const editor = makeEditor([
      surface("fixed", FIXED_VARIANT, [
        fixture("primary", "primary"),
        fixture("secondary", "secondary"),
      ]),
    ]);
    const { node: fixedSurface } = surfaceNode(editor, "fixed");
    const extra = editor.schema.nodeFromJSON(fixture("extra", "tertiary"));

    expect(
      canInsertSurfaceStructureChild({
        surface: fixedSurface,
        child: extra,
        surfaceVariants,
      }),
    ).toBe(false);
  });

  it("rejects movement and insertion when the surface variant is unavailable", () => {
    const editor = makeEditor([
      surface("unknown", "missing-variant", [fixture("child", "primary")]),
    ]);
    const { node: unknownSurface } = surfaceNode(editor, "unknown");
    const extra = editor.schema.nodeFromJSON(fixture("extra", "secondary"));

    expect(
      canMoveSurfaceStructureNode(editor.state.doc, nodePos(editor, "child"), surfaceVariants),
    ).toBe(false);
    expect(
      canInsertSurfaceStructureChild({
        surface: unknownSurface,
        child: extra,
        surfaceVariants,
      }),
    ).toBe(false);
  });

  it("allows root insertion only when the resolved surface policy permits it", () => {
    const editor = makeEditor([
      surface("fixed", FIXED_VARIANT, [fixture("fixed-child", "primary")]),
      surface("page", "page-default", [fixture("page-child", "primary")]),
      surface("unknown", "missing-variant", [fixture("unknown-child", "primary")]),
    ]);

    expect(allowsSurfaceRootInsertion(surfaceNode(editor, "fixed").node, surfaceVariants)).toBe(
      false,
    );
    expect(allowsSurfaceRootInsertion(surfaceNode(editor, "page").node, surfaceVariants)).toBe(
      true,
    );
    expect(allowsSurfaceRootInsertion(surfaceNode(editor, "unknown").node, surfaceVariants)).toBe(
      false,
    );
  });
});

function makeEditor(surfaces: JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, undoRedo: false }),
      CourseDocumentNode,
      MovementSurfaceNode,
      MovementFixtureNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "page" },
          content: surfaces,
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function nodePos(editor: Editor, id: string): number {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    result = pos;
    return false;
  });
  if (result === null) throw new Error(`expected node "${id}"`);
  return result;
}

function surfaceNode(editor: Editor, id: string) {
  const pos = nodePos(editor, id);
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "surface") throw new Error(`expected surface "${id}"`);
  return { node, pos };
}

function surface(id: string, variant: string, content: JSONContent[]): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant },
    content,
  };
}

function fixture(id: string, structuralRole: string): JSONContent {
  return {
    type: "movement_fixture",
    attrs: { id, structuralRole },
  };
}
