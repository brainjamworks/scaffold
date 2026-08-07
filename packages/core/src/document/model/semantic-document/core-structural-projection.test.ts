import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import { projectCourseStructure } from "../course-structure/course-structure-projection";
import type { SemanticDefinitionLookup } from "./definition-lookup";
import { projectSemanticDocument } from "./project-semantic-document";

const IDS = {
  course: id("course000001"),
  courseSection: id("csection0001"),
  surface1: id("surface00001"),
  surface2: id("surface00002"),
  region: id("region000001"),
  layout: id("layout000001"),
  layoutSection1: id("lsection0001"),
  layoutSection2: id("lsection0002"),
  grid: id("grid00000001"),
  cell1: id("cell00000001"),
  cell2: id("cell00000002"),
  block1: id("block0000001"),
  block2: id("block0000002"),
  privateWrapper: id("private00001"),
  privateParagraph: id("privatepara1"),
} as const;

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "block+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    courseSection: {
      group: "block",
      atom: true,
      selectable: true,
      attrs: { id: { default: null }, title: { default: null } },
    },
    surface: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    layout: {
      group: "block",
      content: "section+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    section: {
      content: "block+",
      attrs: { id: { default: null }, label: { default: null }, role: { default: null } },
    },
    grid: {
      group: "block",
      content: "cell+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    cell: {
      content: "block+",
      selectable: false,
      attrs: { id: { default: null } },
    },
    unknown_wrapper: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null } },
    },
    host_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

const definitions = createDefinitions();

describe("Core structural semantic projection", () => {
  it("projects a page through transparent wrappers and closes mounted Block roots", () => {
    const doc = documentNode("page", [
      node("surface", IDS.surface1, { variant: "page-default" }, [
        node("region", IDS.region, { role: "main" }, [
          node("unknown_wrapper", IDS.privateWrapper, {}, [
            node("host_block", IDS.block1, {}, [
              node("paragraph", IDS.privateParagraph, {}, [], "Private answer text"),
              node("nested_block", IDS.block2),
            ]),
          ]),
        ]),
      ]),
    ]);

    const snapshot = project(doc, 11);

    expect(tree(snapshot.roots)).toEqual([
      [
        "surface00001:surface:Page",
        [["region000001:region:Main", ["block0000001:block:Host card"]]],
      ],
    ]);
    expect(snapshot.itemById.has(IDS.privateWrapper)).toBe(false);
    expect(snapshot.itemById.has(IDS.privateParagraph)).toBe(false);
    expect(snapshot.itemById.has(IDS.block2)).toBe(false);
    expect(snapshot.locationById.get(IDS.surface1)).toMatchObject({
      nodeType: "surface",
      selectionTarget: { kind: "near" },
      surfaceId: IDS.surface1,
    });
    expect(snapshot.locationById.get(IDS.block1)?.from).toBeGreaterThan(
      snapshot.locationById.get(IDS.region)?.from ?? 0,
    );
  });

  it("projects unsectioned slideshow roots and nested Layout Sections in document order", () => {
    const doc = documentNode("slideshow", [
      node("surface", IDS.surface1, { variant: "slide-content" }, [
        node("layout", IDS.layout, { variant: "tabs" }, [
          node("section", IDS.layoutSection1, { label: "Overview" }, [
            node("host_block", IDS.block1),
          ]),
          node("section", IDS.layoutSection2, {}, [node("nested_block", IDS.block2)]),
        ]),
      ]),
      node("surface", IDS.surface2, { variant: "slide-content" }, [
        node("host_block", id("block0000003")),
      ]),
    ]);

    const snapshot = project(doc, 12);

    expect(snapshot.mode).toBe("slideshow");
    expect(snapshot.roots.map(({ id }) => id)).toEqual([IDS.surface1, IDS.surface2]);
    expect(tree(snapshot.roots[0]?.children ?? [])).toEqual([
      [
        "layout000001:layout:Tabs",
        [
          ["lsection0001:layout-section:Overview", ["block0000001:block:Host card"]],
          ["lsection0002:layout-section:Panel", ["block0000002:block:Nested card"]],
        ],
      ],
    ]);
    expect(snapshot.itemById.get(IDS.layout)?.definitionId).toBe("tabs");
    expect(snapshot.itemById.get(IDS.layoutSection2)?.definitionId).toBe("tabs");
  });

  it("synthesizes Course Section ownership and emits Grid and Cells without actions", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Practice" }),
      node("surface", IDS.surface1, { variant: "slide-content" }, [
        node("grid", IDS.grid, {}, [
          node("cell", IDS.cell1, {}, [node("host_block", IDS.block1)]),
          node("cell", IDS.cell2, {}, [node("nested_block", IDS.block2)]),
        ]),
      ]),
    ]);

    const snapshot = project(doc, 13);

    expect(tree(snapshot.roots)).toEqual([
      [
        "csection0001:course-section:Practice",
        [
          [
            "surface00001:surface:Slide",
            [
              [
                "grid00000001:grid:Grid",
                [
                  ["cell00000001:cell:Cell 1", ["block0000001:block:Host card"]],
                  ["cell00000002:cell:Cell 2", ["block0000002:block:Nested card"]],
                ],
              ],
            ],
          ],
        ],
      ],
    ]);
    expect(snapshot.parentById.get(IDS.surface1)).toBe(IDS.courseSection);
    expect(snapshot.parentById.get(IDS.courseSection)).toBeNull();
    expect(snapshot.locationById.get(IDS.courseSection)?.surfaceId).toBeNull();
    expect(snapshot.itemById.get(IDS.grid)?.presentation.actionIds).toEqual([]);
    expect(snapshot.itemById.get(IDS.cell1)?.presentation.actionIds).toEqual([]);
  });
});

function project(doc: ProseMirrorNode, revision: number) {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid test Course Structure.");
  return projectSemanticDocument({ doc, courseStructure, definitions, revision });
}

function createDefinitions(): SemanticDefinitionLookup {
  const blocks = new Map([
    ["host_block", { nodeType: "host_block", title: "Host card", isAssessment: false }],
    ["nested_block", { nodeType: "nested_block", title: "Nested card", isAssessment: false }],
  ]);
  const layouts = new Map([["tabs", { id: "tabs", title: "Tabs", section: { label: "Panel" } }]]);
  const surfaces = new Map([
    ["page-default", { id: "page-default", title: "Page" }],
    ["slide-content", { id: "slide-content", title: "Slide" }],
  ]);
  return Object.freeze({
    blocks: Object.freeze({ get: (nodeType: string) => blocks.get(nodeType) }),
    layouts: Object.freeze({ get: (variant: string) => layouts.get(variant) }),
    surfaces: Object.freeze({ get: (variant: string) => surfaces.get(variant) }),
  });
}

function documentNode(mode: "page" | "slideshow", children: readonly ProseMirrorNode[]) {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: IDS.course, mode }, children),
  ]);
}

function node(
  type: string,
  nodeId: EmbeddedNodeId,
  attrs: Readonly<Record<string, unknown>> = {},
  content: readonly ProseMirrorNode[] = [],
  text?: string,
): ProseMirrorNode {
  const children = text === undefined ? content : [schema.text(text)];
  return schema.node(type, { id: nodeId, ...attrs }, children);
}

function tree(
  items: readonly {
    id: EmbeddedNodeId;
    kind: string;
    label: string;
    children: readonly unknown[];
  }[],
): unknown[] {
  return items.map((item) => {
    const value = `${item.id}:${item.kind}:${item.label}`;
    const children = tree(item.children as Parameters<typeof tree>[0]);
    return children.length === 0 ? value : [value, children];
  });
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
