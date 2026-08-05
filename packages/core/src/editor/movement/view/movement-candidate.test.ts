// @vitest-environment happy-dom

import { Editor, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  courseBlockAuthoringFrameAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import {
  canApplyStructureMovementBoundary,
  canStartContainedMovement,
  canStartStructureMovement,
  canTargetStructureMovement,
  createStructureMovementPolicy as createStructureMovementPolicyWithLookup,
  resolveMovementNodeContext,
  resolveContainedMovementSourceContext,
} from "../model/movement-policy";
import {
  deriveContainedMovementCandidate,
  deriveMovementCandidate as deriveMovementCandidateWithLookup,
} from "./movement-candidate";
import { resolveMovementAnchorElement as resolveMovementAnchorElementWithLookup } from "./movement-dom";
import {
  AddCellAfterTarget,
  AddCellAtGridEnd,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
  MoveContainedAfterTarget,
  MoveContainedBeforeTarget,
} from "../model/movement-intents";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionMovementTarget } from "../model/movement-target";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: "test_block" }),
  defineBlock({ nodeType: "test_framed_block" }),
  defineBlock({ nodeType: "test_framed_assessment" }),
  defineBlock({ nodeType: "test_composite_block" }),
]);

const createStructureMovementPolicy = (
  schema: Parameters<typeof createStructureMovementPolicyWithLookup>[0],
) => createStructureMovementPolicyWithLookup(schema, testBlockRegistry);

const deriveMovementCandidate = (
  input: Omit<Parameters<typeof deriveMovementCandidateWithLookup>[0], "blockDefinitions">,
) =>
  deriveMovementCandidateWithLookup({
    ...input,
    blockDefinitions: testBlockRegistry,
  });

const resolveMovementAnchorElement = (
  dom: Parameters<typeof resolveMovementAnchorElementWithLookup>[0],
  context: Parameters<typeof resolveMovementAnchorElementWithLookup>[1],
) => resolveMovementAnchorElementWithLookup(dom, context, testBlockRegistry);

const MovementGridNode = GridNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "grid",
          frameKind: "grid",
        }),
        {
          "data-node": "grid",
          "data-definition": "grid",
        },
      ),
      0,
    ];
  },
});

const MovementCellNode = CellNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "cell",
          frameKind: "cell",
        }),
        {
          "data-node": "cell",
          "data-definition": "cell",
        },
      ),
      0,
    ];
  },
});

const MovementLayoutNode = LayoutNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    const definition =
      typeof node.attrs["variant"] === "string" && node.attrs["variant"]
        ? node.attrs["variant"]
        : "layout";

    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          definition,
          id: node.attrs["id"],
          nodeType: "layout",
          frameKind: "layout",
        }),
        {
          "data-node": "layout",
        },
      ),
      0,
    ];
  },
});

const MovementSectionNode = SectionNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "section",
          frameKind: "section",
        }),
        {
          "data-node": "section",
          "data-definition": "section",
        },
      ),
      0,
    ];
  },
});

const MovementRegionNode = RegionNode.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        structuralAuthoringFrameAttributes({
          id: node.attrs["id"],
          nodeType: "region",
          frameKind: "region",
        }),
        {
          "data-node": "region",
        },
      ),
      0,
    ];
  },
});

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = typeof HTMLAttributes["data-id"] === "string" ? HTMLAttributes["data-id"] : "";
    return [
      "div",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: id,
          nodeType: "test_block",
        }),
        "data-node": "test_block",
        "data-test-block": "",
      },
    ];
  },
});

const TestFramedBlockNode = Node.create({
  name: "test_framed_block",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-framed-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = typeof HTMLAttributes["data-id"] === "string" ? HTMLAttributes["data-id"] : "";
    return [
      "div",
      {
        ...HTMLAttributes,
        "data-test-framed-block": "",
      },
      [
        "div",
        { "data-authoring-frame-wrapper": "" },
        [
          "article",
          {
            ...courseBlockAuthoringFrameAttributes({
              blockId: id,
              nodeType: "test_framed_block",
            }),
            "data-node": "test_framed_block",
          },
        ],
      ],
    ];
  },
});

const TestFieldNode = Node.create({
  name: "test_field",
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-test-field]" }];
  },

  renderHTML() {
    return ["div", { "data-test-field": "" }, 0];
  },
});

const TestFramedAssessmentNode = Node.create({
  name: "test_framed_assessment",
  group: "block",
  content: "assessment_choices_group",
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "framed-assessment-test-id",
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-test-framed-assessment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = typeof HTMLAttributes["id"] === "string" ? HTMLAttributes["id"] : "";
    return [
      "section",
      { "data-test-framed-assessment": "" },
      [
        "div",
        { "data-authoring-frame-wrapper": "" },
        [
          "article",
          {
            ...courseBlockAuthoringFrameAttributes({
              blockId: id,
              nodeType: "test_framed_assessment",
            }),
            "data-node": "test_framed_assessment",
          },
          0,
        ],
      ],
    ];
  },
});

const TestCompositeBlockNode = Node.create({
  name: "test_composite_block",
  group: "block",
  content: "test_field",
  defining: true,
  isolating: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: "composite-block-test-id",
      },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-test-composite-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const id = typeof HTMLAttributes["id"] === "string" ? HTMLAttributes["id"] : "";
    return [
      "section",
      { "data-test-composite-block": "" },
      [
        "div",
        {
          ...courseBlockAuthoringFrameAttributes({
            blockId: id,
            nodeType: "test_composite_block",
          }),
          "data-node": "test_composite_block",
        },
        0,
      ],
    ];
  },
});

const SelectableChoiceNode = containedChildNode("selectable_choice", "data-choice-id");
const AssessmentChoicesGroupNode = containedGroupNode(
  "assessment_choices_group",
  "selectable_choice+",
  "data-slot",
  "assessment-choices-group",
);
const SequencingItemNode = containedChildNode("sequencing_item", "data-item-id");
const SequencingItemsGroupNode = containedGroupNode(
  "sequencing_items_group",
  "sequencing_item+",
  "data-slot",
  "sequencing-items-group",
);
const MatchingPairNode = containedChildNode("matching_pair", "data-pair-id");
const MatchingPairsGroupNode = containedGroupNode(
  "matching_pairs_group",
  "matching_pair+",
  "data-slot",
  "matching-pairs-group",
);

let generatedMovementTestId = 0;

function movementTestId(prefix: string): string {
  generatedMovementTestId += 1;
  return `${prefix}-${generatedMovementTestId}`;
}
const CategoriseBinTitleNode = containedFieldNode("categorise_bin_title");
const CategoriseBinNode = containedChildNode(
  "categorise_bin",
  "data-bin-id",
  "categorise_bin_title categorise_items_group",
);
const CategoriseBinsGroupNode = containedGroupNode(
  "categorise_bins_group",
  "categorise_bin+",
  "data-slot",
  "categorise-bins-group",
);
const CategoriseItemBodyNode = containedFieldNode("categorise_item_body");
const CategoriseItemNode = containedChildNode(
  "categorise_item",
  "data-item-id",
  "categorise_item_body",
);
const CategoriseItemsGroupNode = containedGroupNode(
  "categorise_items_group",
  "categorise_item*",
  "data-slot",
  "categorise-items-group",
);

function block(id: string): JSONContent {
  return { type: "test_block", attrs: { id } };
}

function framedBlock(id: string): JSONContent {
  return { type: "test_framed_block", attrs: { id } };
}

function containedFieldNode(name: string) {
  return Node.create({
    name,
    content: "paragraph+",

    parseHTML() {
      return [{ tag: `div[data-contained-test-node="${name}"]` }];
    },

    renderHTML() {
      return ["div", { "data-contained-test-node": name }, 0];
    },
  });
}

function containedChildNode(name: string, idAttribute: string, content = "paragraph+") {
  return Node.create({
    name,
    content,
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute(idAttribute) ?? "",
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" ? { [idAttribute]: attrs.id } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-contained-test-node="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        {
          ...HTMLAttributes,
          "data-contained-movement-target": "",
          "data-contained-test-node": name,
        },
        0,
      ];
    },
  });
}

function containedGroupNode(name: string, content: string, attr: string, value: string) {
  return Node.create({
    name,
    group: "block",
    content,
    defining: true,
    isolating: true,

    parseHTML() {
      return [{ tag: `div[${attr}="${value}"]` }];
    },

    renderHTML() {
      return ["div", { [attr]: value }, 0];
    },
  });
}

function compositeBlock(text: string): JSONContent {
  return {
    type: "test_composite_block",
    content: [
      {
        type: "test_field",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}

function section(content: JSONContent[]): JSONContent {
  return { type: "section", attrs: { id: movementTestId("section") }, content };
}

function sectionWithId(id: string, content: JSONContent[]): JSONContent {
  return { type: "section", attrs: { id }, content };
}

function layout(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: movementTestId("layout") },
    content: [section(content)],
  };
}

function cell(content: JSONContent[]): JSONContent {
  return { type: "cell", attrs: { id: movementTestId("cell") }, content };
}

function region(content: JSONContent[]): JSONContent {
  return { type: "region", attrs: { id: movementTestId("region") }, content };
}

function grid(cells: JSONContent[]): JSONContent {
  return {
    type: "grid",
    attrs: { id: movementTestId("grid") },
    content: cells,
  };
}

function containedChild(type: string, id: string): JSONContent {
  return {
    type,
    attrs: { id },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: id }],
      },
    ],
  };
}

function categoriseItem(id: string): JSONContent {
  return {
    type: "categorise_item",
    attrs: { id },
    content: [
      {
        type: "categorise_item_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
      },
    ],
  };
}

function categoriseBin(id: string, itemId: string): JSONContent {
  return {
    type: "categorise_bin",
    attrs: { id },
    content: [
      {
        type: "categorise_bin_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
      },
      {
        type: "categorise_items_group",
        content: [categoriseItem(itemId)],
      },
    ],
  };
}

function containedGroup(type: string, children: JSONContent[]): JSONContent {
  return { type, content: children };
}

function framedAssessment(children: JSONContent[]): JSONContent {
  return {
    type: "test_framed_assessment",
    content: [containedGroup("assessment_choices_group", children)],
  };
}

function courseDocument(content: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: "surface-1", variant: "page-default" },
            content,
          },
        ],
      },
    ],
  };
}

function makeEditor(content: JSONContent[]) {
  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        dropcursor: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      MovementRegionNode,
      MovementGridNode,
      MovementCellNode,
      MovementLayoutNode,
      MovementSectionNode,
      TestBlockNode,
      TestFramedBlockNode,
      TestFieldNode,
      TestFramedAssessmentNode,
      TestCompositeBlockNode,
      SelectableChoiceNode,
      AssessmentChoicesGroupNode,
      SequencingItemNode,
      SequencingItemsGroupNode,
      MatchingPairNode,
      MatchingPairsGroupNode,
      CategoriseItemBodyNode,
      CategoriseItemNode,
      CategoriseItemsGroupNode,
      CategoriseBinTitleNode,
      CategoriseBinNode,
      CategoriseBinsGroupNode,
    ],
    content: courseDocument(content),
  });

  render(createElement(EditorContent, { editor }));
  return editor;
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Could not find text: ${text}`);
  return found;
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) {
    throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  }

  return found;
}

function rect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    bottom: 130,
    height: 120,
    left: 10,
    right: 210,
    top: 10,
    width: 200,
    x: 10,
    y: 10,
    toJSON: () => ({}),
    ...overrides,
  };
}

function stubPosAtCoords(editor: Editor, pos: number) {
  return vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ inside: -1, pos });
}

function stubNodeRect(editor: Editor, pos: number, nextRect: DOMRect = rect()) {
  const dom = editor.view.nodeDOM(pos);
  const context = resolveMovementNodeContext(editor.state.doc, pos);
  if (!(dom instanceof HTMLElement)) {
    throw new Error(`No element for node at ${pos}`);
  }
  if (!context) {
    throw new Error(`No movement context for node at ${pos}`);
  }

  const anchor = resolveMovementAnchorElement(dom, context);
  if (!anchor) {
    throw new Error(`No movement anchor for node at ${pos}`);
  }

  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(nextRect);
}

function stubContainedNodeRect(editor: Editor, pos: number, nextRect: DOMRect = rect()) {
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) {
    throw new Error(`No element for contained node at ${pos}`);
  }
  const anchor = dom.matches("[data-contained-movement-target]")
    ? dom
    : dom.querySelector("[data-contained-movement-target]");
  if (!(anchor instanceof HTMLElement)) {
    throw new Error(`No contained movement anchor for node at ${pos}`);
  }
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(nextRect);
}

describe("structure movement policy", () => {
  it("allows registered blocks, layouts, and sections as movement sources", () => {
    const editor = makeEditor([block("a"), layout([block("b")])]);
    const policy = createStructureMovementPolicy(editor.schema);

    const blockContext = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "a"),
    );
    const layoutContext = resolveMovementNodeContext(editor.state.doc, nodePos(editor, "layout"));
    const sectionContext = resolveMovementNodeContext(editor.state.doc, nodePos(editor, "section"));

    expect(blockContext?.nodeType).toBe(editor.schema.nodes["test_block"]);
    expect(layoutContext?.nodeType).toBe(editor.schema.nodes["layout"]);
    expect(sectionContext?.nodeType).toBe(editor.schema.nodes["section"]);
    expect(canStartStructureMovement(policy, blockContext)).toBe(true);
    expect(canStartStructureMovement(policy, layoutContext)).toBe(true);
    expect(canStartStructureMovement(policy, sectionContext)).toBe(true);
    editor.destroy();
  });

  it("rejects grid and cell node types as movement sources", () => {
    const editor = makeEditor([grid([cell([block("a")])])]);
    const policy = createStructureMovementPolicy(editor.schema);

    expect(
      canStartStructureMovement(
        policy,
        resolveMovementNodeContext(editor.state.doc, nodePos(editor, "grid")),
      ),
    ).toBe(false);
    expect(
      canStartStructureMovement(
        policy,
        resolveMovementNodeContext(editor.state.doc, nodePos(editor, "cell")),
      ),
    ).toBe(false);
    editor.destroy();
  });

  it("allows regions only as structure movement targets", () => {
    const editor = makeEditor([region([block("a")])]);
    const policy = createStructureMovementPolicy(editor.schema);
    const regionContext = resolveMovementNodeContext(editor.state.doc, nodePos(editor, "region"));

    expect(canStartStructureMovement(policy, regionContext)).toBe(false);
    expect(canTargetStructureMovement(policy, regionContext)).toBe(true);
    editor.destroy();
  });

  it("allows section movement only within the owning layout boundary", () => {
    const editor = makeEditor([
      {
        type: "layout",
        content: [
          sectionWithId("section-a", [block("a")]),
          sectionWithId("section-b", [block("b")]),
        ],
      },
      {
        type: "layout",
        content: [sectionWithId("section-c", [block("c")])],
      },
      block("outside"),
    ]);

    expect(
      canApplyStructureMovementBoundary(
        editor.state.doc,
        nodePos(editor, "section", "section-a"),
        nodePos(editor, "section", "section-b"),
      ),
    ).toBe(true);
    expect(
      canApplyStructureMovementBoundary(
        editor.state.doc,
        nodePos(editor, "section", "section-a"),
        nodePos(editor, "section", "section-c"),
      ),
    ).toBe(false);
    expect(
      canApplyStructureMovementBoundary(
        editor.state.doc,
        nodePos(editor, "section", "section-a"),
        nodePos(editor, "test_block", "outside"),
      ),
    ).toBe(false);
    expect(
      canApplyStructureMovementBoundary(
        editor.state.doc,
        nodePos(editor, "test_block", "outside"),
        nodePos(editor, "section", "section-a"),
      ),
    ).toBe(true);

    editor.destroy();
  });

  it("resolves parent, index, and ancestors for a movement node context", () => {
    const editor = makeEditor([grid([cell([block("a")])])]);
    const context = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "a"),
    );

    expect(context).toMatchObject({
      index: 0,
      parent: expect.objectContaining({ type: editor.schema.nodes["cell"] }),
      parentType: editor.schema.nodes["cell"],
    });
    expect(context?.ancestors.map((ancestor) => ancestor.nodeType.name)).toEqual([
      "courseDocument",
      "surface",
      "grid",
      "cell",
    ]);
    editor.destroy();
  });
});

describe("contained authored movement policy", () => {
  it("recognizes supported contained child nodes without making them structure sources", () => {
    const editor = makeEditor([
      containedGroup("assessment_choices_group", [containedChild("selectable_choice", "choice-a")]),
      containedGroup("sequencing_items_group", [containedChild("sequencing_item", "sequence-a")]),
      containedGroup("matching_pairs_group", [containedChild("matching_pair", "match-a")]),
      containedGroup("categorise_bins_group", [categoriseBin("bin-a", "item-a")]),
    ]);
    const structurePolicy = createStructureMovementPolicy(editor.schema);

    for (const type of [
      "selectable_choice",
      "sequencing_item",
      "matching_pair",
      "categorise_bin",
      "categorise_item",
    ]) {
      const context = resolveMovementNodeContext(editor.state.doc, nodePos(editor, type));
      expect(canStartContainedMovement(context)).toBe(true);
      expect(canStartStructureMovement(structurePolicy, context)).toBe(false);
    }

    editor.destroy();
  });

  it("resolves before and after targets only inside the source owner boundary", () => {
    const editor = makeEditor([
      containedGroup("assessment_choices_group", [
        containedChild("selectable_choice", "a"),
        containedChild("selectable_choice", "b"),
        containedChild("selectable_choice", "c"),
      ]),
    ]);
    const sourcePos = nodePos(editor, "selectable_choice", "a");
    const targetPos = nodePos(editor, "selectable_choice", "c");
    stubContainedNodeRect(
      editor,
      targetPos,
      rect({
        bottom: 130,
        height: 120,
        left: 10,
        right: 210,
        top: 10,
        width: 200,
      }),
    );

    const before = deriveContainedMovementCandidate({
      point: { x: 100, y: 20 },
      sourcePos,
      view: editor.view,
    });
    const after = deriveContainedMovementCandidate({
      point: { x: 100, y: 125 },
      sourcePos,
      view: editor.view,
    });

    expect(before?.intent).toBeInstanceOf(MoveContainedBeforeTarget);
    expect(before?.intent.target.pos).toBe(targetPos);
    expect(after?.intent).toBeInstanceOf(MoveContainedAfterTarget);
    expect(after?.intent.target.pos).toBe(targetPos);
    editor.destroy();
  });

  it("resolves contained row targets inside a framed assessment owner", () => {
    const editor = makeEditor([
      framedAssessment([
        containedChild("selectable_choice", "a"),
        containedChild("selectable_choice", "b"),
        containedChild("selectable_choice", "c"),
      ]),
    ]);
    const sourcePos = nodePos(editor, "selectable_choice", "a");
    const targetPos = nodePos(editor, "selectable_choice", "c");
    stubContainedNodeRect(
      editor,
      targetPos,
      rect({
        bottom: 130,
        height: 120,
        left: 10,
        right: 210,
        top: 10,
        width: 200,
      }),
    );

    const candidate = deriveContainedMovementCandidate({
      point: { x: 100, y: 125 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(MoveContainedAfterTarget);
    expect(candidate?.intent.target.pos).toBe(targetPos);
    expect(candidate?.source.parentPos).toBe(
      resolveMovementNodeContext(editor.state.doc, targetPos)?.parentPos,
    );
    editor.destroy();
  });

  it("resolves an after target from the bottom gutter of the last contained row", () => {
    const editor = makeEditor([
      containedGroup("assessment_choices_group", [
        containedChild("selectable_choice", "a"),
        containedChild("selectable_choice", "b"),
        containedChild("selectable_choice", "c"),
      ]),
    ]);
    const sourcePos = nodePos(editor, "selectable_choice", "a");
    const targetPos = nodePos(editor, "selectable_choice", "c");
    stubContainedNodeRect(
      editor,
      targetPos,
      rect({
        bottom: 130,
        height: 120,
        left: 10,
        right: 210,
        top: 10,
        width: 200,
      }),
    );

    const after = deriveContainedMovementCandidate({
      point: { x: 100, y: 150 },
      sourcePos,
      view: editor.view,
    });

    expect(after?.intent).toBeInstanceOf(MoveContainedAfterTarget);
    expect(after?.intent.target.pos).toBe(targetPos);
    editor.destroy();
  });

  it("rejects contained row targets outside the owner boundary", () => {
    const editor = makeEditor([
      containedGroup("assessment_choices_group", [containedChild("selectable_choice", "a")]),
      containedGroup("assessment_choices_group", [containedChild("selectable_choice", "b")]),
    ]);
    const sourcePos = nodePos(editor, "selectable_choice", "a");
    const targetPos = nodePos(editor, "selectable_choice", "b");
    stubContainedNodeRect(editor, targetPos);

    expect(
      deriveContainedMovementCandidate({
        point: { x: 100, y: 70 },
        sourcePos,
        view: editor.view,
      }),
    ).toBeNull();
    editor.destroy();
  });

  it("does not resolve editable field content as a contained movement source", () => {
    const editor = makeEditor([
      containedGroup("sequencing_items_group", [containedChild("sequencing_item", "Nested text")]),
    ]);

    expect(
      resolveContainedMovementSourceContext(editor.state.doc, textPos(editor, "text") + 2),
    ).toBeNull();
    editor.destroy();
  });
});

describe("structure movement candidate resolution", () => {
  it("returns a validated candidate for block-edge targets without mutating the document", () => {
    const editor = makeEditor([block("a"), block("b")]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "test_block", "b");
    const before = editor.getJSON();

    stubPosAtCoords(editor, targetPos);
    stubNodeRect(editor, targetPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 125 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(targetPos);
    expect(candidate?.source).toMatchObject({
      pos: sourcePos,
      nodeType: editor.schema.nodes["test_block"],
    });
    expect(candidate?.target).toMatchObject({
      pos: targetPos,
      nodeType: editor.schema.nodes["test_block"],
    });
    expect(candidate?.target.context).toMatchObject({
      pos: targetPos,
      nodeType: editor.schema.nodes["test_block"],
    });
    expect(candidate?.target.node.attrs["id"]).toBe("b");
    expect(editor.getJSON()).toEqual(before);
    editor.destroy();
  });

  it("attaches structural movement context to movement target wrappers", () => {
    const editor = makeEditor([block("source"), grid([cell([block("inside")])])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const cellPos = nodePos(editor, "cell");
    const containedBlockPos = nodePos(editor, "test_block", "inside");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      cellPos,
      rect({
        bottom: 180,
        height: 140,
        left: 20,
        right: 220,
        top: 40,
        width: 200,
      }),
    );
    stubNodeRect(
      editor,
      containedBlockPos,
      rect({
        bottom: 100,
        height: 40,
        left: 40,
        right: 180,
        top: 60,
        width: 140,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 80, y: 150 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.target.context).toMatchObject({
      index: 0,
      parentPos: nodePos(editor, "grid"),
      pos: cellPos,
      nodeType: editor.schema.nodes["cell"],
    });
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("returns beside results for existing cell edge targets", () => {
    const editor = makeEditor([block("a"), grid([cell([]), cell([block("b")])])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "cell");

    stubPosAtCoords(editor, targetPos);
    stubNodeRect(editor, targetPos);

    expect(
      deriveMovementCandidate({
        canApplyMovementResult: () => true,
        point: { x: 205, y: 70 },
        sourcePos,
        view: editor.view,
      })?.intent,
    ).toBeInstanceOf(AddCellAfterTarget);
    editor.destroy();
  });

  it("uses visual Scaffold anchors so empty cells stay valid drop targets", () => {
    const editor = makeEditor([block("a"), grid([cell([]), cell([block("b")])])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "cell");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(editor, targetPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 70 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertInsideTarget);
    expect(candidate?.intent.target.pos).toBe(targetPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("resolves framed child blank cell space as a cell insertion target", () => {
    const editor = makeEditor([block("source"), grid([cell([framedBlock("framed")]), cell([])])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const cellPos = nodePos(editor, "cell");
    const framedPos = nodePos(editor, "test_framed_block", "framed");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      cellPos,
      rect({
        bottom: 180,
        height: 140,
        left: 20,
        right: 220,
        top: 40,
        width: 200,
      }),
    );
    stubNodeRect(
      editor,
      framedPos,
      rect({
        bottom: 100,
        height: 40,
        left: 40,
        right: 180,
        top: 60,
        width: 140,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 80, y: 150 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertInsideTarget);
    expect(candidate?.intent.target.pos).toBe(cellPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("resolves grid gutters as grid-boundary cell insertion targets", () => {
    const editor = makeEditor([block("a"), grid([cell([]), cell([block("b")])])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const gridPos = nodePos(editor, "grid");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(editor, gridPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 230, y: 70 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(AddCellAtGridEnd);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("resolves framed child grid-end drags as grid-boundary cell insertion targets", () => {
    const editor = makeEditor([block("source"), grid([cell([framedBlock("framed")]), cell([])])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const gridPos = nodePos(editor, "grid");
    const framedPos = nodePos(editor, "test_framed_block", "framed");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      gridPos,
      rect({
        bottom: 180,
        height: 140,
        left: 20,
        right: 420,
        top: 40,
        width: 400,
      }),
    );
    stubNodeRect(
      editor,
      framedPos,
      rect({
        bottom: 120,
        height: 60,
        left: 40,
        right: 200,
        top: 60,
        width: 160,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 410, y: 90 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(AddCellAtGridEnd);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("resolves the visual row gap below a grid as an insert-after-grid target", () => {
    const editor = makeEditor([grid([cell([block("a")]), cell([])]), block("b")]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const gridPos = nodePos(editor, "grid");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(editor, gridPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 150 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("prefers the grid row edge over a framed child frame after the pointer leaves the grid", () => {
    const editor = makeEditor([grid([cell([framedBlock("framed")]), cell([])]), block("source")]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const gridPos = nodePos(editor, "grid");
    const framedPos = nodePos(editor, "test_framed_block", "framed");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      gridPos,
      rect({
        bottom: 160,
        height: 120,
        left: 10,
        right: 410,
        top: 40,
        width: 400,
      }),
    );
    stubNodeRect(
      editor,
      framedPos,
      rect({
        bottom: 210,
        height: 150,
        left: 20,
        right: 220,
        top: 60,
        width: 200,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 120, y: 170 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(candidate?.target.rect).toMatchObject({
      left: 10,
      right: 410,
      width: 400,
    });
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("uses the grid wrapper rect for row-drop indicators when a grid contains blocks", () => {
    const editor = makeEditor([grid([cell([block("a")]), cell([])]), block("b")]);
    const sourcePos = nodePos(editor, "test_block", "b");
    const gridPos = nodePos(editor, "grid");
    const blockPos = nodePos(editor, "test_block", "a");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      gridPos,
      rect({
        bottom: 160,
        height: 120,
        left: 10,
        right: 410,
        top: 40,
        width: 400,
      }),
    );
    stubNodeRect(
      editor,
      blockPos,
      rect({
        bottom: 150,
        height: 80,
        left: 20,
        right: 100,
        top: 70,
        width: 80,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 200, y: 170 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(candidate?.target.rect).toMatchObject({
      left: 10,
      right: 410,
      width: 400,
    });
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("prefers the grid row edge over a child block edge after the pointer leaves the grid", () => {
    const editor = makeEditor([grid([cell([block("a")]), cell([])]), block("b")]);
    const sourcePos = nodePos(editor, "test_block", "b");
    const gridPos = nodePos(editor, "grid");
    const blockPos = nodePos(editor, "test_block", "a");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(
      editor,
      gridPos,
      rect({
        bottom: 160,
        height: 120,
        left: 10,
        right: 210,
        top: 40,
        width: 200,
      }),
    );
    stubNodeRect(
      editor,
      blockPos,
      rect({
        bottom: 150,
        height: 80,
        left: 20,
        right: 100,
        top: 70,
        width: 80,
      }),
    );

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 80, y: 170 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("resolves the visual row gap above a grid as an insert-before-grid target", () => {
    const editor = makeEditor([block("a"), grid([cell([block("b")]), cell([])])]);
    const sourcePos = nodePos(editor, "test_block", "b");
    const gridPos = nodePos(editor, "grid");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    stubNodeRect(editor, gridPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 0 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertBeforeTarget);
    expect(candidate?.intent.target.pos).toBe(gridPos);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("climbs from nested field content to the owning registered block target", () => {
    const editor = makeEditor([block("a"), compositeBlock("Nested target")]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const targetPos = nodePos(editor, "test_composite_block");

    stubPosAtCoords(editor, textPos(editor, "target") + 2);
    stubNodeRect(editor, targetPos);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 125 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.intent.target.pos).toBe(targetPos);
    expect(candidate?.target).toMatchObject({
      pos: targetPos,
      nodeType: editor.schema.nodes["test_composite_block"],
    });
    editor.destroy();
  });

  it("returns inside results for surface and section interiors", () => {
    const editor = makeEditor([block("a"), layout([block("b")])]);
    const sourcePos = nodePos(editor, "test_block", "a");
    const surfacePos = nodePos(editor, "surface");
    const sectionPos = nodePos(editor, "section");

    stubPosAtCoords(editor, surfacePos);
    stubNodeRect(editor, surfacePos);
    expect(
      deriveMovementCandidate({
        canApplyMovementResult: () => true,
        point: { x: 100, y: 70 },
        sourcePos,
        view: editor.view,
      })?.intent,
    ).toBeInstanceOf(InsertInsideTarget);

    vi.restoreAllMocks();
    stubPosAtCoords(editor, sectionPos);
    stubNodeRect(editor, sectionPos);
    expect(
      deriveMovementCandidate({
        canApplyMovementResult: () => true,
        point: { x: 100, y: 70 },
        sourcePos,
        view: editor.view,
      })?.intent,
    ).toBeInstanceOf(InsertInsideTarget);
    editor.destroy();
  });

  it("resolves region whitespace as an explicit inside target", () => {
    const editor = makeEditor([block("source"), region([{ type: "paragraph" }])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const regionPos = nodePos(editor, "region");
    const regionDom = editor.view.nodeDOM(regionPos);
    const regionAnchor =
      regionDom instanceof Element && regionDom.matches('[data-authoring-frame="region"]')
        ? regionDom
        : regionDom instanceof Element
          ? regionDom.querySelector('[data-authoring-frame="region"]')
          : null;
    if (!(regionAnchor instanceof HTMLElement)) {
      throw new Error("No authoring frame for region target");
    }
    vi.spyOn(regionAnchor, "getBoundingClientRect").mockReturnValue(rect());
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue(null);

    const candidate = deriveMovementCandidate({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 70 },
      sourcePos,
      view: editor.view,
    });

    expect(candidate?.target).toBeInstanceOf(RegionMovementTarget);
    expect(candidate?.target.pos).toBe(regionPos);
    expect(candidate?.intent).toBeInstanceOf(InsertInsideTarget);
    expect(posAtCoords).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("rejects self and descendant targets before command dispatch", () => {
    const editor = makeEditor([layout([block("a")]), block("b")]);
    const layoutPos = nodePos(editor, "layout");
    const sectionPos = nodePos(editor, "section");

    stubPosAtCoords(editor, layoutPos);
    stubNodeRect(editor, layoutPos);
    expect(
      deriveMovementCandidate({
        canApplyMovementResult: () => true,
        point: { x: 100, y: 70 },
        sourcePos: layoutPos,
        view: editor.view,
      }),
    ).toBeNull();

    vi.restoreAllMocks();
    stubPosAtCoords(editor, sectionPos);
    stubNodeRect(editor, sectionPos);
    expect(
      deriveMovementCandidate({
        canApplyMovementResult: () => true,
        point: { x: 100, y: 70 },
        sourcePos: layoutPos,
        view: editor.view,
      }),
    ).toBeNull();
    editor.destroy();
  });
});
