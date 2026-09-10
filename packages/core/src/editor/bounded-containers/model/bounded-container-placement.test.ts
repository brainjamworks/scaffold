// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { LayerNode } from "@/document/model/layers/layer-node";
import { resolveLayerTargetAtPosition } from "@/document/model/layers/layer-editing-policy";
import { GridNode, CellNode } from "@/editor/arrangements/grid/model/grid-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createTestNodeIdentityExtension } from "@/editor/testing/node-identity";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  allowsBoundedContainerRootInsertionAtPosition as allowsBoundedContainerRootInsertionAtPositionWithLookup,
  isActiveBoundedContainerAtPosition as isActiveBoundedContainerAtPositionWithLookup,
  isFillOccupantNode as isFillOccupantNodeWithLookup,
  resolveActiveBoundedPlacement as resolveActiveBoundedPlacementWithLookup,
} from "./bounded-container-placement";

const editors: Editor[] = [];
const TEST_STAGED_CHILD_GROUP = "test_staged_bounded_child";
const TEST_STAGED_HOST_TYPE = "test_staged_bounded_host_policy";
const TEST_STAGED_CHILD_TYPE = "test_staged_bounded_child_policy";
const TEST_STAGED_INTERMEDIATE_TYPE = "test_staged_bounded_intermediate_policy";
const TEST_INELIGIBLE_CHILD_TYPE = "test_ineligible_bounded_child_policy";
let nextFixtureCellId = 1;

const TestStagedHostNode = Node.create({
  name: TEST_STAGED_HOST_TYPE,
  group: "block",
  content: "block+",
  renderHTML() {
    return ["section", { "data-node": TEST_STAGED_HOST_TYPE }, 0];
  },
});

const TestStagedChildNode = Node.create({
  name: TEST_STAGED_CHILD_TYPE,
  group: `block ${TEST_STAGED_CHILD_GROUP}`,
  atom: true,
  renderHTML() {
    return ["div", { "data-node": TEST_STAGED_CHILD_TYPE }];
  },
});

const TestStagedIntermediateNode = Node.create({
  name: TEST_STAGED_INTERMEDIATE_TYPE,
  group: "block",
  content: "block+",
  renderHTML() {
    return ["div", { "data-node": TEST_STAGED_INTERMEDIATE_TYPE }, 0];
  },
});

const TestIneligibleChildNode = Node.create({
  name: TEST_INELIGIBLE_CHILD_TYPE,
  group: "block assessment_question",
  atom: true,
  renderHTML() {
    return ["div", { "data-node": TEST_INELIGIBLE_CHILD_TYPE }];
  },
});

const testStagedHostDefinition = defineBlock({
  nodeType: TEST_STAGED_HOST_TYPE,
  title: "Test staged bounded host",
  boundedPlacement: "fill",
  stagedBoundedHost: {
    childGroup: TEST_STAGED_CHILD_GROUP,
  },
});

const testStagedChildDefinition = defineBlock({
  nodeType: TEST_STAGED_CHILD_TYPE,
  title: "Test staged child",
  boundedPlacement: "fill",
});

const testIneligibleChildDefinition = defineBlock({
  nodeType: TEST_INELIGIBLE_CHILD_TYPE,
  title: "Test ineligible child",
  boundedPlacement: "fill",
});

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  testStagedHostDefinition,
  testStagedChildDefinition,
  testIneligibleChildDefinition,
]);

function isFillOccupantNode(node: Parameters<typeof isFillOccupantNodeWithLookup>[0]) {
  return isFillOccupantNodeWithLookup(node, testBlockRegistry, builtInLayoutRegistry);
}

function allowsBoundedContainerRootInsertionAtPosition(
  input: Omit<
    Parameters<typeof allowsBoundedContainerRootInsertionAtPositionWithLookup>[0],
    "blockDefinitions" | "layoutDefinitions"
  >,
) {
  return allowsBoundedContainerRootInsertionAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
    layoutDefinitions: builtInLayoutRegistry,
  });
}

function resolveActiveBoundedPlacement(
  input: Omit<
    Parameters<typeof resolveActiveBoundedPlacementWithLookup>[0],
    "blockDefinitions" | "layoutDefinitions"
  >,
) {
  return resolveActiveBoundedPlacementWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
    layoutDefinitions: builtInLayoutRegistry,
  });
}

function isActiveBoundedContainerAtPosition(
  input: Omit<
    Parameters<typeof isActiveBoundedContainerAtPositionWithLookup>[0],
    "blockDefinitions" | "layoutDefinitions"
  >,
) {
  return isActiveBoundedContainerAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
    layoutDefinitions: builtInLayoutRegistry,
  });
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("bounded container placement", () => {
  it("reads fill occupancy from the addressed Layer without consuming hidden siblings", () => {
    const editor = makeLayerEditor([
      layer("layer0000001", [paragraph("Visible composition")]),
      layer("layer0000002", [grid()]),
    ]);
    expect(
      resolveLayerTargetAtPosition({
        doc: editor.state.doc,
        pos: nodePosById(editor, "layer0000002"),
        layoutDefinitions: builtInLayoutRegistry,
      }),
    ).toMatchObject({ layerId: "layer0000002" });

    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: editor.state.doc,
        pos: nodePosById(editor, "layer0000001"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: editor.state.doc,
        pos: nodePosById(editor, "layer0000002"),
      }),
    ).toBe(false);
    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, "paragraph"),
      }),
    ).toBe("fill");
  });

  it("hands a whole fill Layout through its Layer to the logical Region", () => {
    const editor = makeLayerEditor([layer("layer0000001", [tabsLayout()])]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, "layout"),
      }),
    ).toBe("fill");
  });

  it("resolves an exact layered Section before its enclosing Region Layer", () => {
    const editor = makeLayerEditor([
      layer("layer0000001", [
        layoutWithSection("tabs", [paragraph("Section content")], "layer0000004"),
      ]),
    ]);
    const sectionPos = nodePosById(editor, "section-tabs");

    expect(
      isActiveBoundedContainerAtPosition({
        containerType: "section",
        doc: editor.state.doc,
        pos: sectionPos,
      }),
    ).toBe(true);
    expect(
      resolveLayerTargetAtPosition({
        doc: editor.state.doc,
        pos: firstNodePos(editor, "paragraph"),
        layoutDefinitions: builtInLayoutRegistry,
      }),
    ).toMatchObject({
      ownerSlot: { logicalOwner: { id: "section-tabs" } },
      layerId: "layer0000004",
    });
  });

  it("keeps root insertion open without a direct fill and closed with one", () => {
    const emptyEditor = makeEditor([boundedRegion("region-empty", [paragraph()])]);
    const occupiedEditor = makeEditor([boundedRegion("regionocc001", [grid()])]);

    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: emptyEditor.state.doc,
        pos: firstNodePos(emptyEditor, "layer"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: occupiedEditor.state.doc,
        pos: firstNodePos(occupiedEditor, "layer"),
      }),
    ).toBe(false);
  });

  it("keeps root insertion open for non-bounded and invalid positions", () => {
    const editor = makeEditor([paragraph()]);

    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: editor.state.doc,
        pos: firstNodePos(editor, "paragraph"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: editor.state.doc,
        pos: -1,
      }),
    ).toBe(true);
  });

  it("uses active bounded cell position for insertion affordances", () => {
    const flowEditor = makeEditor([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([tabsLayout()]), cell([paragraph()])],
      },
    ]);
    const boundedEditor = makeEditor([
      boundedRegion("region000001", [
        {
          type: "grid",
          attrs: { id: "grid-a" },
          content: [cell([tabsLayout()]), cell([paragraph()])],
        },
      ]),
    ]);
    const tabs = firstNode(flowEditor, "layout");
    const paragraphNode = firstNode(flowEditor, "paragraph");

    expect(isFillOccupantNode(tabs)).toBe(true);
    expect(isFillOccupantNode(paragraphNode)).toBe(false);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: flowEditor.state.doc,
        pos: cellContainingPos(flowEditor, "layout"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: boundedEditor.state.doc,
        pos: cellContainingPos(boundedEditor, "layout"),
      }),
    ).toBe(false);
  });

  it("uses active bounded section position and exposes unregistered owner defects", () => {
    const flowFillEditor = makeEditor([tabsLayoutWithSectionContent([grid()])]);
    const boundedFillEditor = makeEditor([
      boundedRegion("region000001", [tabsLayoutWithSectionContent([grid()])]),
    ]);
    const flowBasicEditor = makeEditor([layoutWithSection("basic", [grid()])]);

    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: flowFillEditor.state.doc,
        pos: firstLayerPosOwnedBy(flowFillEditor, "section"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: boundedFillEditor.state.doc,
        pos: firstLayerPosOwnedBy(boundedFillEditor, "section"),
      }),
    ).toBe(false);
    expect(() =>
      allowsBoundedContainerRootInsertionAtPosition({
        doc: flowBasicEditor.state.doc,
        pos: firstLayerPosOwnedBy(flowBasicEditor, "section"),
      }),
    ).toThrow('Section "sectionpage1" belongs to an unregistered Layout.');
  });

  it("does not activate fill placement for a direct surface child", () => {
    const editor = makeEditor([paragraph()]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, "paragraph"),
      }),
    ).toBeUndefined();
  });

  it("activates fill placement for a direct region child", () => {
    const editor = makeEditor([boundedRegion("region000001", [paragraph()])]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, "paragraph"),
      }),
    ).toBe("fill");
  });

  it("activates grid cell placement only when the grid is in an active bounded context", () => {
    const flowEditor = makeEditor([grid()]);
    const boundedEditor = makeEditor([boundedRegion("region000001", [grid()])]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: flowEditor.state.doc,
        pos: firstNodePos(flowEditor, "paragraph"),
      }),
    ).toBeUndefined();
    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: boundedEditor.state.doc,
        pos: firstNodePos(boundedEditor, "paragraph"),
      }),
    ).toBe("fill");
  });

  it("activates fill layout section placement only when the layout is in an active bounded context", () => {
    const flowEditor = makeEditor([tabsLayoutWithSectionContent([paragraph()])]);
    const boundedEditor = makeEditor([
      boundedRegion("region000001", [tabsLayoutWithSectionContent([paragraph()])]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: flowEditor.state.doc,
        pos: firstNodePos(flowEditor, "paragraph"),
      }),
    ).toBeUndefined();
    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: boundedEditor.state.doc,
        pos: firstNodePos(boundedEditor, "paragraph"),
      }),
    ).toBe("fill");
  });

  it.each(["tabs", "paginated"])(
    "reports %s Sections active only through finite Region handoff",
    (variant) => {
      const flowEditor = makeEditor([layoutWithSection(variant, [paragraph()])]);
      const boundedEditor = makeEditor([
        boundedRegion("region000001", [layoutWithSection(variant, [paragraph()])]),
      ]);

      expect(
        isActiveBoundedContainerAtPosition({
          containerType: "section",
          doc: flowEditor.state.doc,
          pos: firstNodePos(flowEditor, "section"),
        }),
      ).toBe(false);
      expect(
        isActiveBoundedContainerAtPosition({
          containerType: "section",
          doc: boundedEditor.state.doc,
          pos: firstNodePos(boundedEditor, "section"),
        }),
      ).toBe(true);
    },
  );

  it("activates eligible direct children of a staged host when the host fills a region", () => {
    const editor = makeEditor([
      boundedRegion("region000001", [
        stagedHost([stagedChild("question-a"), stagedChild("question-b")]),
      ]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBe("fill");
  });

  it("activates staged children through the existing bounded grid and tabs seams", () => {
    const gridEditor = makeEditor([
      boundedRegion("region000001", [
        {
          type: "grid",
          attrs: { id: "grid-a" },
          content: [cell([stagedHost([stagedChild("question-grid")])])],
        },
      ]),
    ]);
    const tabsEditor = makeEditor([
      boundedRegion("region000002", [
        tabsLayoutWithSectionContent([stagedHost([stagedChild("question-tabs")])]),
      ]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: gridEditor.state.doc,
        pos: firstNodePos(gridEditor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBe("fill");
    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: tabsEditor.state.doc,
        pos: firstNodePos(tabsEditor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBe("fill");
  });

  it("keeps staged children natural in flow and ignores children outside the declared group", () => {
    const flowEditor = makeEditor([stagedHost([stagedChild("question-flow")])]);
    const ineligibleEditor = makeEditor([
      boundedRegion("region000001", [stagedHost([{ type: TEST_INELIGIBLE_CHILD_TYPE }])]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: flowEditor.state.doc,
        pos: firstNodePos(flowEditor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBeUndefined();
    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: ineligibleEditor.state.doc,
        pos: firstNodePos(ineligibleEditor, TEST_INELIGIBLE_CHILD_TYPE),
      }),
    ).toBeUndefined();
  });

  it("does not stage eligible descendants beyond the host's direct children", () => {
    const editor = makeEditor([
      boundedRegion("region000001", [
        stagedHost([stagedIntermediate([stagedChild("question-nested")])]),
      ]),
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBeUndefined();
  });
});

function makeEditor(surfaceContent: JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      createTestNodeIdentityExtension(),
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      LayerNode,
      TestStagedHostNode,
      TestStagedIntermediateNode,
      TestStagedChildNode,
      TestIneligibleChildNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface-a", variant: "slide-content" },
              content: surfaceContent,
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function makeLayerEditor(layers: JSONContent[]): Editor {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      createTestNodeIdentityExtension(),
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      RegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      LayerNode,
      TestStagedHostNode,
      TestStagedIntermediateNode,
      TestStagedChildNode,
      TestIneligibleChildNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "surface00001", variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: "region000001" },
                  content: layers,
                },
              ],
            },
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function layer(id: string, content: JSONContent[]): JSONContent {
  return { type: "layer", attrs: { id }, content };
}

function nodePosById(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing fixture node "${id}".`);
  return found;
}

function firstNode(editor: Editor, nodeType: string) {
  return nthNode(editor, nodeType, 0);
}

function firstNodePos(editor: Editor, nodeType: string) {
  return nthNodePos(editor, nodeType, 0);
}

function cellContainingPos(editor: Editor, childType: string): number {
  let out: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (out || node.type.name !== "cell") return !out;

    let containsChild = node.type.name === childType;
    node.descendants((child) => {
      if (child.type.name !== childType) return true;
      containsChild = true;
      return false;
    });

    if (!containsChild) return true;
    node.forEach((child, offset) => {
      if (child.type.name === "layer") out = pos + 1 + offset;
    });
    return false;
  });

  if (out === null) throw new Error(`expected cell containing "${childType}"`);
  return out;
}

function firstLayerPosOwnedBy(editor: Editor, ownerType: string): number {
  let out: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== ownerType) return true;
    node.forEach((child, offset) => {
      if (child.type.name === "layer") out = pos + 1 + offset;
    });
    return false;
  });
  if (out === null) throw new Error(`expected Layer owned by "${ownerType}"`);
  return out;
}

function nthNode(editor: Editor, nodeType: string, targetIndex: number) {
  let found = 0;
  let out = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== nodeType) return true;
    if (found === targetIndex) {
      out = node;
      return false;
    }
    found += 1;
    return true;
  });

  if (!out) throw new Error(`expected "${nodeType}" node`);
  return out;
}

function nthNodePos(editor: Editor, nodeType: string, targetIndex: number) {
  let found = 0;
  let out: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== nodeType) return true;
    if (found === targetIndex) {
      out = pos;
      return false;
    }
    found += 1;
    return true;
  });

  if (out === null) throw new Error(`expected "${nodeType}" node`);
  return out;
}

function paragraph(text = ""): JSONContent {
  return text
    ? {
        type: "paragraph",
        content: [{ type: "text", text }],
      }
    : { type: "paragraph" };
}

function grid(): JSONContent {
  return {
    type: "grid",
    attrs: { id: "grid-b" },
    content: [cell([paragraph()])],
  };
}

function cell(content: JSONContent[]): JSONContent {
  return {
    type: "cell",
    attrs: { id: `cell${String(nextFixtureCellId++).padStart(8, "0")}` },
    content: [createLayerWithContent(content)],
  };
}

function boundedRegion(id: string, content: JSONContent[]): JSONContent {
  return {
    type: "region",
    attrs: { id },
    content: [createLayerWithContent(content)],
  };
}

function tabsLayout(): JSONContent {
  return tabsLayoutWithSectionContent([paragraph()]);
}

function tabsLayoutWithSectionContent(content: JSONContent[]): JSONContent {
  return layoutWithSection("tabs", content);
}

function layoutWithSection(
  variant: string,
  content: JSONContent[],
  sectionLayerId?: string,
): JSONContent {
  return {
    type: "layout",
    attrs: { id: `layout-${variant}`, variant },
    content: [
      {
        type: "section",
        attrs: {
          id: variant === "tabs" ? "section-tabs" : "sectionpage1",
          role: "tab-panel",
        },
        content: [
          sectionLayerId ? layer(sectionLayerId, content) : createLayerWithContent(content),
        ],
      },
    ],
  };
}

function stagedHost(content: JSONContent[]): JSONContent {
  return {
    type: TEST_STAGED_HOST_TYPE,
    content,
  };
}

function stagedChild(id: string): JSONContent {
  return {
    type: TEST_STAGED_CHILD_TYPE,
    attrs: { id },
  };
}

function stagedIntermediate(content: JSONContent[]): JSONContent {
  return {
    type: TEST_STAGED_INTERMEDIATE_TYPE,
    content,
  };
}
