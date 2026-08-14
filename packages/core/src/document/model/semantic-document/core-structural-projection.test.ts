import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  PresentationContentLayoutSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
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
  cellParagraph: id("cellpara0001"),
  emptyCellParagraph: id("emptycell001"),
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
      attrs: {
        id: { default: null },
        mode: { default: "page" },
        semanticLabel: { default: null },
      },
    },
    courseSection: {
      group: "block",
      atom: true,
      selectable: true,
      attrs: {
        id: { default: null },
        title: { default: null },
        semanticLabel: { default: null },
      },
    },
    surface: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: {
        id: { default: null },
        variant: { default: null },
        semanticLabel: { default: null },
      },
    },
    region: {
      group: "block",
      content: "block+",
      selectable: false,
      attrs: {
        id: { default: null },
        role: { default: "main" },
        contentLayout: contentLayoutAttr(),
        semanticLabel: { default: null },
      },
    },
    layout: {
      group: "block",
      content: "section+",
      attrs: {
        id: { default: null },
        variant: { default: null },
        semanticLabel: { default: null },
      },
    },
    section: {
      content: "block+",
      attrs: {
        id: { default: null },
        label: { default: null },
        role: { default: null },
        contentLayout: contentLayoutAttr(),
        semanticLabel: { default: null },
      },
    },
    grid: {
      group: "block",
      content: "cell+",
      selectable: false,
      attrs: { id: { default: null }, semanticLabel: { default: null } },
    },
    cell: {
      content: "block+",
      selectable: false,
      attrs: {
        id: { default: null },
        contentLayout: contentLayoutAttr(),
        semanticLabel: { default: null },
      },
    },
    unknown_wrapper: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, semanticLabel: { default: null } },
    },
    host_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null }, semanticLabel: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null }, semanticLabel: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null }, semanticLabel: { default: null } },
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

  it("projects Course Section-owned slideshow roots and nested Layout Sections in document order", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Introduction" }),
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
    expect(snapshot.roots.map(({ id }) => id)).toEqual([IDS.courseSection]);
    expect(tree(snapshot.roots[0]?.children[0]?.children ?? [])).toEqual([
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

  it("publishes direct Cell prose while preserving nested structural ownership and opacity", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Practice" }),
      node("surface", IDS.surface1, { variant: "slide-content" }, [
        node("grid", IDS.grid, {}, [
          node("cell", IDS.cell1, {}, [
            node("paragraph", IDS.cellParagraph, {}, [], "Direct Cell prose"),
            node("host_block", IDS.block1, {}, [
              node("paragraph", IDS.privateParagraph, {}, [], "Private Block prose"),
            ]),
          ]),
          node("cell", IDS.cell2, {}, [
            node("paragraph", IDS.emptyCellParagraph),
            node("layout", IDS.layout, { variant: "tabs" }, [
              node("section", IDS.layoutSection1, { label: "Nested panel" }, [
                node("nested_block", IDS.block2),
              ]),
            ]),
          ]),
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
                  [
                    "cell00000001:cell:Cell 1",
                    ["cellpara0001:rich-text:Direct Cell prose", "block0000001:block:Host card"],
                  ],
                  [
                    "cell00000002:cell:Cell 2",
                    [
                      "emptycell001:rich-text:Paragraph",
                      [
                        "layout000001:layout:Tabs",
                        [
                          [
                            "lsection0001:layout-section:Nested panel",
                            ["block0000002:block:Nested card"],
                          ],
                        ],
                      ],
                    ],
                  ],
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
    expect(snapshot.parentById.get(IDS.cellParagraph)).toBe(IDS.cell1);
    expect(snapshot.parentById.get(IDS.emptyCellParagraph)).toBe(IDS.cell2);
    expect(snapshot.parentById.get(IDS.layout)).toBe(IDS.cell2);
    expect(snapshot.parentById.get(IDS.block2)).toBe(IDS.layoutSection1);
    expect(snapshot.itemById.has(IDS.privateParagraph)).toBe(false);
  });

  it("publishes only eligible Slideshow container layouts and preserves indexes", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Practice" }),
      node("surface", IDS.surface1, { variant: "slide-content" }, [
        node("region", IDS.region, { contentLayout: PresentationContentLayout.Sequence }, [
          node("grid", IDS.grid, {}, [
            node("cell", IDS.cell1, { contentLayout: PresentationContentLayout.Sequence }, [
              node("paragraph", IDS.cellParagraph, {}, [], "Sequence cell prose"),
            ]),
            node("cell", IDS.cell2, {}, [
              node("layout", IDS.layout, { variant: "tabs" }, [
                node(
                  "section",
                  IDS.layoutSection1,
                  { label: "Sequence panel", contentLayout: PresentationContentLayout.Sequence },
                  [node("host_block", IDS.block1)],
                ),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);

    const snapshot = project(doc, 15);

    expect(tree(snapshot.roots)).toEqual([
      [
        "csection0001:course-section:Practice",
        [
          [
            "surface00001:surface:Slide",
            [
              [
                "region000001:region:Main",
                [
                  [
                    "grid00000001:grid:Grid",
                    [
                      [
                        "cell00000001:cell:Cell 1",
                        ["cellpara0001:rich-text:Sequence cell prose"],
                      ],
                      [
                        "cell00000002:cell:Cell 2",
                        [
                          [
                            "layout000001:layout:Tabs",
                            [
                              [
                                "lsection0001:layout-section:Sequence panel",
                                ["block0000001:block:Host card"],
                              ],
                            ],
                          ],
                        ],
                      ],
                    ],
                  ],
                ],
              ],
            ],
          ],
        ],
      ],
    ]);
    expect(presentationContainer(snapshot, IDS.region)).toEqual({
      contentLayout: PresentationContentLayout.Sequence,
    });
    expect(presentationContainer(snapshot, IDS.cell1)).toEqual({
      contentLayout: PresentationContentLayout.Sequence,
    });
    expect(presentationContainer(snapshot, IDS.cell2)).toEqual({
      contentLayout: PresentationContentLayout.Flow,
    });
    expect(presentationContainer(snapshot, IDS.layoutSection1)).toEqual({
      contentLayout: PresentationContentLayout.Sequence,
    });
    for (const id of [
      IDS.courseSection,
      IDS.surface1,
      IDS.grid,
      IDS.layout,
      IDS.cellParagraph,
      IDS.block1,
    ]) {
      expect(presentationContainer(snapshot, id)).toBeNull();
    }
    expect(snapshot.parentById.get(IDS.region)).toBe(IDS.surface1);
    expect(snapshot.parentById.get(IDS.grid)).toBe(IDS.region);
    expect(snapshot.parentById.get(IDS.cell1)).toBe(IDS.grid);
    expect(snapshot.parentById.get(IDS.layout)).toBe(IDS.cell2);
    expect(snapshot.parentById.get(IDS.layoutSection1)).toBe(IDS.layout);
    expect(snapshot.parentById.get(IDS.block1)).toBe(IDS.layoutSection1);
  });

  it("keeps eligible Page container layouts null", () => {
    const doc = documentNode("page", [
      node("surface", IDS.surface1, { variant: "page-default" }, [
        node("region", IDS.region, { contentLayout: PresentationContentLayout.Sequence }, [
          node("grid", IDS.grid, {}, [
            node("cell", IDS.cell1, { contentLayout: PresentationContentLayout.Sequence }, [
              node("layout", IDS.layout, { variant: "tabs" }, [
                node(
                  "section",
                  IDS.layoutSection1,
                  { contentLayout: PresentationContentLayout.Sequence },
                  [node("paragraph", IDS.cellParagraph)],
                ),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);

    const snapshot = project(doc, 16);

    for (const id of [IDS.region, IDS.cell1, IDS.layoutSection1]) {
      expect(presentationContainer(snapshot, id)).toBeNull();
    }
    expect([...snapshot.itemById.values()].every((item) => item.presentationContainer === null)).toBe(
      true,
    );
  });

  it("rejects an invalid eligible layout reaching semantic projection", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, { title: "Practice" }),
      node("surface", IDS.surface1, { variant: "slide-content" }, [
        node("region", IDS.region, { contentLayout: "unsupported" }, [
          node("paragraph", IDS.cellParagraph),
        ]),
      ]),
    ]);

    expect(() => project(doc, 17)).toThrow(/invalid contentLayout/);
  });

  it("applies authored labels before descriptions and derived labels across every projection path", () => {
    const doc = documentNode("slideshow", [
      node("courseSection", IDS.courseSection, {
        semanticLabel: "  Author course  ",
        title: "Learner course title",
      }),
      node(
        "surface",
        IDS.surface1,
        {
          semanticLabel: "Author surface",
          variant: "slide-content",
        },
        [
          node("region", IDS.region, { role: "main", semanticLabel: "Author region" }, [
            node("grid", IDS.grid, { semanticLabel: "Author grid" }, [
              node("cell", IDS.cell1, { semanticLabel: "Author cell" }, [
                node(
                  "paragraph",
                  IDS.cellParagraph,
                  { semanticLabel: "Repeated prose" },
                  [],
                  "Learner first prose",
                ),
                node(
                  "paragraph",
                  IDS.emptyCellParagraph,
                  { semanticLabel: "Repeated prose" },
                  [],
                  "Learner second prose",
                ),
              ]),
            ]),
            node("layout", IDS.layout, { semanticLabel: "Author layout", variant: "tabs" }, [
              node(
                "section",
                IDS.layoutSection1,
                { label: "Learner section", semanticLabel: "Author section" },
                [
                  node("host_block", IDS.block1, { semanticLabel: "Author block" }, [
                    node(
                      "paragraph",
                      IDS.privateParagraph,
                      { semanticLabel: "Author published child" },
                      [],
                      "Learner child content",
                    ),
                  ]),
                ],
              ),
            ]),
          ]),
        ],
      ),
    ]);

    const snapshot = project(doc, 14, describedHostDefinitions());

    expect(snapshot.itemById.get(IDS.courseSection)?.label).toBe("Author course");
    expect(snapshot.itemById.get(IDS.surface1)?.label).toBe("Author surface");
    expect(snapshot.itemById.get(IDS.region)?.label).toBe("Author region");
    expect(snapshot.itemById.get(IDS.grid)?.label).toBe("Author grid");
    expect(snapshot.itemById.get(IDS.cell1)?.label).toBe("Author cell");
    expect(snapshot.itemById.get(IDS.cellParagraph)?.label).toBe("Repeated prose 1");
    expect(snapshot.itemById.get(IDS.emptyCellParagraph)?.label).toBe("Repeated prose 2");
    expect(snapshot.itemById.get(IDS.layout)?.label).toBe("Author layout");
    expect(snapshot.itemById.get(IDS.layoutSection1)?.label).toBe("Author section");
    expect(snapshot.itemById.get(IDS.block1)?.label).toBe("Author block");
    expect(snapshot.itemById.get(IDS.privateParagraph)?.label).toBe("Author published child");
  });
});

function project(
  doc: ProseMirrorNode,
  revision: number,
  semanticDefinitions: SemanticDefinitionLookup = definitions,
) {
  const json = doc.toJSON();
  for (const child of json.content?.[0]?.content ?? []) {
    if (child.type !== "courseSection") continue;
    child.attrs = { id: child.attrs?.["id"], title: child.attrs?.["title"] };
  }
  const courseStructure = projectCourseStructure(json);
  if (!courseStructure) throw new Error("Invalid test Course Structure.");
  return projectSemanticDocument({
    doc,
    courseStructure,
    definitions: semanticDefinitions,
    revision,
  });
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

function describedHostDefinitions(): SemanticDefinitionLookup {
  const base = createDefinitions();
  return Object.freeze({
    ...base,
    blocks: Object.freeze({
      get(nodeType: string) {
        const definition = base.blocks.get(nodeType);
        if (!definition || nodeType !== "host_block") return definition;
        return {
          ...definition,
          documentSemantics: {
            describe: () => ({ label: "Described host" }),
            projectChildren: () => [
              {
                label: "Definition child",
                relativePos: 0,
                semanticRole: "published-child" as const,
              },
            ],
          },
        };
      },
    }),
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

function contentLayoutAttr() {
  return {
    default: PresentationContentLayout.Flow,
    validate(value: unknown) {
      PresentationContentLayoutSchema.parse(value);
    },
  };
}

function presentationContainer(
  snapshot: ReturnType<typeof project>,
  itemId: EmbeddedNodeId,
) {
  return snapshot.itemById.get(itemId)?.presentationContainer;
}
