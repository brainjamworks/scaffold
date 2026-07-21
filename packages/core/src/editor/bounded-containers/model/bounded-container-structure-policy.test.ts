// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { GridNode, CellNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  allowsBoundedContainerRootInsertionAtPosition as allowsBoundedContainerRootInsertionAtPositionWithLookup,
  isActiveBoundedContainerAtPosition as isActiveBoundedContainerAtPositionWithLookup,
  isFillOccupantNode as isFillOccupantNodeWithLookup,
  resolveActiveBoundedPlacement as resolveActiveBoundedPlacementWithLookup,
  validateBoundedContainerStructure as validateBoundedContainerStructureWithLookup,
} from "./bounded-container-structure-policy";

const editors: Editor[] = [];
const TEST_STAGED_CHILD_GROUP = "test_staged_bounded_child";
const TEST_STAGED_HOST_TYPE = "test_staged_bounded_host_policy";
const TEST_STAGED_CHILD_TYPE = "test_staged_bounded_child_policy";
const TEST_STAGED_INTERMEDIATE_TYPE = "test_staged_bounded_intermediate_policy";
const TEST_INELIGIBLE_CHILD_TYPE = "test_ineligible_bounded_child_policy";

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
  group: "block",
  atom: true,
  renderHTML() {
    return ["div", { "data-node": TEST_INELIGIBLE_CHILD_TYPE }];
  },
});

const testStagedHostDefinition = defineBlock({
  nodeType: TEST_STAGED_HOST_TYPE,
  boundedPlacement: "fill",
  stagedBoundedHost: {
    childGroup: TEST_STAGED_CHILD_GROUP,
  },
});

const testStagedChildDefinition = defineBlock({
  nodeType: TEST_STAGED_CHILD_TYPE,
  boundedPlacement: "fill",
});

const testIneligibleChildDefinition = defineBlock({
  nodeType: TEST_INELIGIBLE_CHILD_TYPE,
  boundedPlacement: "fill",
});

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  testStagedHostDefinition,
  testStagedChildDefinition,
  testIneligibleChildDefinition,
]);

function validateBoundedContainerStructure(
  doc: Parameters<typeof validateBoundedContainerStructureWithLookup>[0],
) {
  return validateBoundedContainerStructureWithLookup(doc, testBlockRegistry);
}

function isFillOccupantNode(node: Parameters<typeof isFillOccupantNodeWithLookup>[0]) {
  return isFillOccupantNodeWithLookup(node, testBlockRegistry);
}

function allowsBoundedContainerRootInsertionAtPosition(
  input: Omit<
    Parameters<typeof allowsBoundedContainerRootInsertionAtPositionWithLookup>[0],
    "blockDefinitions"
  >,
) {
  return allowsBoundedContainerRootInsertionAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

function resolveActiveBoundedPlacement(
  input: Omit<Parameters<typeof resolveActiveBoundedPlacementWithLookup>[0], "blockDefinitions">,
) {
  return resolveActiveBoundedPlacementWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

function isActiveBoundedContainerAtPosition(
  input: Omit<
    Parameters<typeof isActiveBoundedContainerAtPositionWithLookup>[0],
    "blockDefinitions"
  >,
) {
  return isActiveBoundedContainerAtPositionWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });
}

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("bounded container structure policy", () => {
  it("rejects sibling content next to a fill grid in a region", () => {
    const doc = proseMirrorDoc([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [grid(), paragraph()],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: false,
      violations: [
        {
          code: "fill_occupant_requires_exclusive_container",
          containerType: "region",
          fillOccupantType: "grid",
        },
      ],
    });
  });

  it("allows sibling content next to a fill tabs layout in a page-flow cell", () => {
    const doc = proseMirrorDoc([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([tabsLayout(), paragraph()])],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("rejects sibling content next to a fill tabs layout in an active bounded cell", () => {
    const doc = proseMirrorDoc([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "grid",
            attrs: { id: "grid-a" },
            content: [cell([tabsLayout(), paragraph()])],
          },
        ],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: false,
      violations: [
        {
          code: "fill_occupant_requires_exclusive_container",
          containerType: "cell",
          fillOccupantType: "layout",
        },
      ],
    });
  });

  it("allows a fill occupant when it is the only child", () => {
    const doc = proseMirrorDoc([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([tabsLayout()])],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("allows normal flow content and non-fill layouts to share a cell", () => {
    const doc = proseMirrorDoc([
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [cell([basicLayout(), paragraph()])],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("allows sibling content next to a fill occupant in a page-flow fill layout section", () => {
    const doc = proseMirrorDoc([tabsLayoutWithSectionContent([grid(), paragraph()])]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("rejects sibling content next to a fill occupant in an active bounded fill layout section", () => {
    const doc = proseMirrorDoc([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [tabsLayoutWithSectionContent([grid(), paragraph()])],
      },
    ]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: false,
      violations: [
        {
          code: "fill_occupant_requires_exclusive_container",
          containerType: "section",
          fillOccupantType: "grid",
        },
      ],
    });
  });

  it("allows sibling content next to a fill occupant in a non-fill layout section", () => {
    const doc = proseMirrorDoc([basicLayoutWithSectionContent([grid(), paragraph()])]);

    expect(validateBoundedContainerStructure(doc)).toEqual({
      ok: true,
      violations: [],
    });
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
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "grid",
            attrs: { id: "grid-a" },
            content: [cell([tabsLayout()]), cell([paragraph()])],
          },
        ],
      },
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

  it("uses active bounded section position for insertion affordances", () => {
    const flowFillEditor = makeEditor([tabsLayoutWithSectionContent([grid()])]);
    const boundedFillEditor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [tabsLayoutWithSectionContent([grid()])],
      },
    ]);
    const flowBasicEditor = makeEditor([basicLayoutWithSectionContent([grid()])]);

    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: flowFillEditor.state.doc,
        pos: firstNodePos(flowFillEditor, "section"),
      }),
    ).toBe(true);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: boundedFillEditor.state.doc,
        pos: firstNodePos(boundedFillEditor, "section"),
      }),
    ).toBe(false);
    expect(
      allowsBoundedContainerRootInsertionAtPosition({
        doc: flowBasicEditor.state.doc,
        pos: firstNodePos(flowBasicEditor, "section"),
      }),
    ).toBe(true);
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
    const editor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [paragraph()],
      },
    ]);

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
    const boundedEditor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [grid()],
      },
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

  it("activates fill layout section placement only when the layout is in an active bounded context", () => {
    const flowEditor = makeEditor([tabsLayoutWithSectionContent([paragraph()])]);
    const boundedEditor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [tabsLayoutWithSectionContent([paragraph()])],
      },
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
        {
          type: "region",
          attrs: { id: "region-a" },
          content: [layoutWithSection(variant, [paragraph()])],
        },
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
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [stagedHost([stagedChild("question-a"), stagedChild("question-b")])],
      },
    ]);

    expect(
      resolveActiveBoundedPlacement({
        capability: "fill",
        doc: editor.state.doc,
        pos: firstNodePos(editor, TEST_STAGED_CHILD_TYPE),
      }),
    ).toBe("fill");
    expect(validateBoundedContainerStructure(editor.state.doc)).toEqual({
      ok: true,
      violations: [],
    });
  });

  it("activates staged children through the existing bounded grid and tabs seams", () => {
    const gridEditor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "grid",
            attrs: { id: "grid-a" },
            content: [cell([stagedHost([stagedChild("question-grid")])])],
          },
        ],
      },
    ]);
    const tabsEditor = makeEditor([
      {
        type: "region",
        attrs: { id: "region-b" },
        content: [tabsLayoutWithSectionContent([stagedHost([stagedChild("question-tabs")])])],
      },
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
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [stagedHost([{ type: TEST_INELIGIBLE_CHILD_TYPE }])],
      },
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
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [stagedHost([stagedIntermediate([stagedChild("question-nested")])])],
      },
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

function proseMirrorDoc(surfaceContent: JSONContent[]) {
  return makeEditor(surfaceContent).state.doc;
}

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
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
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

    let containsChild = false;
    node.forEach((child) => {
      if (child.type.name === childType) containsChild = true;
    });

    if (!containsChild) return true;
    out = pos;
    return false;
  });

  if (out === null) throw new Error(`expected cell containing "${childType}"`);
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
    attrs: { id: `cell-${content.length}` },
    content,
  };
}

function tabsLayout(): JSONContent {
  return tabsLayoutWithSectionContent([paragraph()]);
}

function tabsLayoutWithSectionContent(content: JSONContent[]): JSONContent {
  return layoutWithSection("tabs", content);
}

function layoutWithSection(variant: string, content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: `layout-${variant}`, variant },
    content: [
      {
        type: "section",
        attrs: { id: `section-${variant}`, role: "tab-panel" },
        content,
      },
    ],
  };
}

function basicLayout(): JSONContent {
  return basicLayoutWithSectionContent([paragraph()]);
}

function basicLayoutWithSectionContent(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layout-basic", variant: "basic" },
    content: [
      {
        type: "section",
        attrs: { id: "section-basic" },
        content,
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
