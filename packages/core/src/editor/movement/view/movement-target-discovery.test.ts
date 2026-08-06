// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { DocumentNode, CourseDocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import { resolveMovementNodeContext } from "../model/movement-policy";
import { discoverMovementTargetDescriptors } from "./movement-target-discovery";
import {
  createMovementTargetIndexSnapshot,
  measureMovementTargetEntries,
} from "./movement-target-index";

const TEST_BLOCK = "movement_discovery_test_block";
const TEST_CONTAINER = "movement_discovery_test_container";
const CONTAINED_ITEM = "selectable_choice";
const CONTAINED_GROUP = "assessment_choices_group";

const blockDefinitions = createBlockRegistry([
  defineBlock({ nodeType: TEST_BLOCK }),
  defineBlock({ nodeType: TEST_CONTAINER }),
]);

const TestBlockNode = movementBlockNode(TEST_BLOCK, "div");
const TestContainerNode = movementBlockNode(TEST_CONTAINER, "section", `${TEST_BLOCK}+`);
const TestArrangementNode = Node.create({
  name: "movement_discovery_arrangement",
  group: "arrangement",
  content: "block*",
});
const TestRegionNode = Node.create({
  name: "movement_discovery_region",
  group: "region",
  content: "block*",
});

const ContainedItemNode = Node.create({
  name: CONTAINED_ITEM,
  content: "paragraph+",
  defining: true,
  isolating: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-discovery-contained-item]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      {
        "data-contained-movement-target": "",
        "data-movement-target-axis": "horizontal",
        "data-discovery-contained-item": "",
        "data-id": node.attrs["id"],
      },
      0,
    ];
  },
});

const ContainedGroupNode = Node.create({
  name: CONTAINED_GROUP,
  group: "block",
  content: `${CONTAINED_ITEM}+`,
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-discovery-contained-group]" }];
  },

  renderHTML() {
    return ["div", { "data-discovery-contained-group": "" }, 0];
  },
});

interface DiscoveryHarness {
  readonly editor: Editor;
  readonly element: HTMLElement;
}

const mounted: DiscoveryHarness[] = [];

afterEach(() => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    harness.editor.destroy();
    harness.element.remove();
  }
  vi.restoreAllMocks();
});

describe("movement target discovery", () => {
  it("discovers stable structure descriptors once and excludes the source subtree", () => {
    const harness = makeEditor([
      {
        type: TEST_CONTAINER,
        attrs: { id: "container-a" },
        content: [{ type: TEST_BLOCK, attrs: { id: "inside-source" } }],
      },
      { type: TEST_BLOCK, attrs: { id: "target-b" } },
    ]);
    const sourcePos = nodePos(harness.editor, TEST_CONTAINER, "container-a");
    const targetPos = nodePos(harness.editor, TEST_BLOCK, "target-b");
    const source = resolveMovementNodeContext(harness.editor.state.doc, sourcePos)!;
    const descendants = vi.spyOn(harness.editor.state.doc, "descendants");
    const nodeDOM = vi.spyOn(harness.editor.view, "nodeDOM");

    const result = discoverMovementTargetDescriptors({
      blockDefinitions,
      documentRevision: 12,
      source: { context: source, kind: "structure" },
      view: harness.editor.view,
    });

    expect(result.documentRevision).toBe(12);
    expect(result.descriptors.map((descriptor) => descriptor.context.node.attrs["id"])).toContain(
      "target-b",
    );
    expect(
      result.descriptors.map((descriptor) => descriptor.context.node.attrs["id"]),
    ).not.toContain("container-a");
    expect(
      result.descriptors.map((descriptor) => descriptor.context.node.attrs["id"]),
    ).not.toContain("inside-source");
    expect(
      result.descriptors.find((descriptor) => descriptor.context.node.attrs["id"] === "target-b")
        ?.key,
    ).toBe(`structure:${TEST_BLOCK}:${targetPos}:target-b`);
    expect(descendants).toHaveBeenCalledTimes(1);
    expect(nodeDOM).toHaveBeenCalled();
  });

  it("discovers only contained siblings in the same owner", () => {
    const harness = makeEditor([containedGroup(["a", "b"]), containedGroup(["outside"])]);
    const sourcePos = nodePos(harness.editor, CONTAINED_ITEM, "a");
    const source = resolveMovementNodeContext(harness.editor.state.doc, sourcePos)!;

    const result = discoverMovementTargetDescriptors({
      blockDefinitions,
      documentRevision: 2,
      source: { context: source, kind: "contained" },
      view: harness.editor.view,
    });

    expect(result.descriptors.map((descriptor) => descriptor.context.node.attrs["id"])).toEqual([
      "b",
    ]);
    expect(result.descriptors[0]?.kind).toBe("contained");
    expect(result.descriptors[0]?.axis).toBe("horizontal");
  });

  it("keeps repeated snapshot queries free of discovery, nodeDOM, posAtCoords, and rect reads", () => {
    const harness = makeEditor([
      { type: TEST_BLOCK, attrs: { id: "source-a" } },
      { type: TEST_BLOCK, attrs: { id: "target-b" } },
    ]);
    const sourcePos = nodePos(harness.editor, TEST_BLOCK, "source-a");
    const targetPos = nodePos(harness.editor, TEST_BLOCK, "target-b");
    const source = resolveMovementNodeContext(harness.editor.state.doc, sourcePos)!;
    const target = requiredElement<HTMLElement>(
      harness.element,
      `[data-node="${TEST_BLOCK}"][data-id="target-b"]`,
    );
    const rectRead = vi
      .spyOn(target, "getBoundingClientRect")
      .mockReturnValue(new DOMRect(20, 40, 200, 80));
    const descendants = vi.spyOn(harness.editor.state.doc, "descendants");
    const nodeDOM = vi.spyOn(harness.editor.view, "nodeDOM");
    const posAtCoords = vi.spyOn(harness.editor.view, "posAtCoords");
    const discovery = discoverMovementTargetDescriptors({
      blockDefinitions,
      documentRevision: 1,
      source: { context: source, kind: "structure" },
      view: harness.editor.view,
    });
    const entries = measureMovementTargetEntries(discovery.descriptors);
    const snapshot = createMovementTargetIndexSnapshot({
      documentRevision: discovery.documentRevision,
      entries,
      geometryRevision: 1,
    });
    const countsAfterMeasurement = {
      descendants: descendants.mock.calls.length,
      nodeDOM: nodeDOM.mock.calls.length,
      posAtCoords: posAtCoords.mock.calls.length,
      rect: rectRead.mock.calls.length,
    };

    for (let index = 0; index < 20; index += 1) {
      expect(
        snapshot.query({ x: 100, y: 70 }, { context: source, kind: "structure" })?.target.pos,
      ).toBe(targetPos);
    }

    expect(descendants).toHaveBeenCalledTimes(countsAfterMeasurement.descendants);
    expect(nodeDOM).toHaveBeenCalledTimes(countsAfterMeasurement.nodeDOM);
    expect(posAtCoords).toHaveBeenCalledTimes(countsAfterMeasurement.posAtCoords);
    expect(rectRead).toHaveBeenCalledTimes(countsAfterMeasurement.rect);
  });
});

function movementBlockNode(name: string, tag: "div" | "section", content?: string) {
  return Node.create({
    name,
    group: "block",
    ...(content ? { content } : { atom: true }),
    selectable: true,

    addAttributes() {
      return { id: { default: null } };
    },

    parseHTML() {
      return [{ tag: `${tag}[data-discovery-block="${name}"]` }];
    },

    renderHTML({ node }) {
      return [
        tag,
        {
          ...courseBlockAuthoringFrameAttributes({
            blockId: node.attrs["id"],
            nodeType: name,
          }),
          "data-discovery-block": name,
        },
        ...(content ? [0] : []),
      ];
    },
  });
}

function makeEditor(content: JSONContent[]): DiscoveryHarness {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      TestArrangementNode,
      TestRegionNode,
      TestBlockNode,
      TestContainerNode,
      ContainedItemNode,
      ContainedGroupNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface00001", variant: "page-default" },
              content,
            },
          ],
        },
      ],
    },
  });
  const harness = { editor, element };
  mounted.push(harness);
  return harness;
}

function containedGroup(ids: readonly string[]): JSONContent {
  return {
    type: CONTAINED_GROUP,
    content: ids.map((id) => ({
      type: CONTAINED_ITEM,
      attrs: { id },
      content: [{ type: "paragraph" }],
    })),
  };
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== type || (id !== undefined && node.attrs["id"] !== id)) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Expected ${type}:${id ?? ""}.`);
  return found;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}
