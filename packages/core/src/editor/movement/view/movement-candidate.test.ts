// @vitest-environment happy-dom

import { Editor, Node, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode, createCourseSectionNode } from "@/document/model/nodes";
import { LayerNode } from "@/document/model/layers/layer-node";
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
  movementCandidatesAreSemanticallyEqual,
} from "./movement-candidate";
import {
  AddCellAtGridEnd,
  InsertAfterTarget,
  InsertBeforeTarget,
  InsertInsideTarget,
  MoveContainedBeforeTarget,
} from "../model/movement-intents";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing/node-identity";
import {
  ContainedMovementTarget,
  createMovementTarget,
  RegionMovementTarget,
} from "../model/movement-target";
import { discoverMovementTargetDescriptors } from "./movement-target-discovery";
import {
  createMovementTargetIndexSnapshot,
  measureMovementTargetEntries,
  type MovementTargetDescriptor,
} from "./movement-target-index";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: "test_block", title: "Movement candidate block" }),
  defineBlock({ nodeType: "test_framed_block", title: "Framed movement candidate" }),
  defineBlock({ nodeType: "test_framed_assessment", title: "Framed assessment candidate" }),
  defineBlock({ nodeType: "test_composite_block", title: "Composite movement candidate" }),
]);

const createStructureMovementPolicy = (
  schema: Parameters<typeof createStructureMovementPolicyWithLookup>[0],
) => createStructureMovementPolicyWithLookup(schema, testBlockRegistry);

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
  group: "block assessment_question",
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

const SelectableChoiceNode = containedChildNode("selectable_choice");
const AssessmentChoicesGroupNode = containedGroupNode(
  "assessment_choices_group",
  "selectable_choice+",
  "data-slot",
  "assessment-choices-group",
);
const SequencingItemNode = containedChildNode("sequencing_item");
const SequencingItemsGroupNode = containedGroupNode(
  "sequencing_items_group",
  "sequencing_item+",
  "data-slot",
  "sequencing-items-group",
);
const MatchingPairNode = containedChildNode("matching_pair");
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
  "categorise_bin_title categorise_items_group",
);
const CategoriseBinsGroupNode = containedGroupNode(
  "categorise_bins_group",
  "categorise_bin+",
  "data-slot",
  "categorise-bins-group",
);
const CategoriseItemBodyNode = containedFieldNode("categorise_item_body");
const CategoriseItemNode = containedChildNode("categorise_item", "categorise_item_body");
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

function containedChildNode(name: string, content = "paragraph+") {
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
          parseHTML: (element: HTMLElement) => element.getAttribute("data-id") ?? "",
          renderHTML: (attrs: { id?: unknown }) =>
            typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
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

function courseDocument(content: JSONContent[]): JSONContent {
  return {
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
      createTestNodeIdentityExtension(),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      SurfaceNode,
      MovementRegionNode,
      LayerNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
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

function indexedMovementHarness(
  editor: Editor,
  sourcePos: number,
  rects: ReadonlyMap<number, DOMRect>,
) {
  const sourceContext = resolveMovementNodeContext(editor.state.doc, sourcePos);
  if (!sourceContext) throw new Error("Expected indexed movement source context.");
  const source = { context: sourceContext, kind: "structure" as const };
  const discovery = discoverMovementTargetDescriptors({
    blockDefinitions: testBlockRegistry,
    documentRevision: 0,
    source,
    view: editor.view,
  });
  for (const descriptor of discovery.descriptors) {
    vi.spyOn(descriptor.element, "getBoundingClientRect").mockReturnValue(
      rects.get(descriptor.documentPosition) ??
        rect({
          bottom: 10_120,
          left: 10_000,
          right: 10_200,
          top: 10_000,
        }),
    );
  }
  const entries = measureMovementTargetEntries(discovery.descriptors);
  const snapshot = createMovementTargetIndexSnapshot({
    documentRevision: discovery.documentRevision,
    entries,
    geometryRevision: 1,
  });
  return {
    descriptors: discovery.descriptors,
    candidateAt(point: Readonly<{ x: number; y: number }>) {
      return deriveMovementCandidateWithLookup({
        canApplyMovementResult: () => true,
        point,
        queryResult: snapshot.query(point, source),
        source: sourceContext,
      });
    },
  };
}

function descriptorAt(
  descriptors: readonly MovementTargetDescriptor[],
  documentPosition: number,
): MovementTargetDescriptor {
  const descriptor = descriptors.find((item) => item.documentPosition === documentPosition);
  if (!descriptor) throw new Error(`Expected movement descriptor at ${documentPosition}.`);
  return descriptor;
}

afterEach(() => {
  vi.restoreAllMocks();
});

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
  it("recognizes owner-rendered isolating children without a feature allowlist", () => {
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

describe("movement candidate construction", () => {
  it("constructs and semantically keys a movement intent from a cached query result", () => {
    const editor = makeEditor([block("a"), block("b")]);
    const source = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "a"),
    )!;
    const targetContext = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "b"),
    )!;
    const target = createMovementTarget(targetContext, rect());

    const candidate = deriveMovementCandidateWithLookup({
      canApplyMovementResult: () => true,
      point: { x: 100, y: 125 },
      queryResult: { key: "structure:test_block:b", placement: null, target },
      source,
    });

    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.key).toBe("structure:test_block:b");
    editor.destroy();
  });

  it("keeps final movement policy authoritative after a cached geometry hit", () => {
    const editor = makeEditor([block("a"), block("b")]);
    const source = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "a"),
    )!;
    const targetContext = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "b"),
    )!;

    expect(
      deriveMovementCandidateWithLookup({
        canApplyMovementResult: () => false,
        point: { x: 100, y: 125 },
        queryResult: {
          key: "structure:test_block:b",
          placement: null,
          target: createMovementTarget(targetContext, rect()),
        },
        source,
      }),
    ).toBeNull();
    editor.destroy();
  });

  it("constructs contained placement intents from the cached query result", () => {
    const editor = makeEditor([
      containedGroup("assessment_choices_group", [
        containedChild("selectable_choice", "a"),
        containedChild("selectable_choice", "b"),
      ]),
    ]);
    const source = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "selectable_choice", "a"),
    )!;
    const targetContext = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "selectable_choice", "b"),
    )!;
    const target = new ContainedMovementTarget(targetContext, rect());

    const candidate = deriveContainedMovementCandidate({
      queryResult: { key: "contained:selectable_choice:b", placement: "before", target },
      source,
    });

    expect(candidate?.intent).toBeInstanceOf(MoveContainedBeforeTarget);
    expect(candidate?.key).toBe("contained:selectable_choice:b");
    editor.destroy();
  });

  it("compares semantic target keys plus intent instead of rectangle identity", () => {
    const editor = makeEditor([block("a"), block("b")]);
    const source = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "a"),
    )!;
    const targetContext = resolveMovementNodeContext(
      editor.state.doc,
      nodePos(editor, "test_block", "b"),
    )!;
    const first = deriveMovementCandidateWithLookup({
      point: { x: 100, y: 125 },
      queryResult: {
        key: "structure:test_block:b",
        placement: null,
        target: createMovementTarget(targetContext, rect()),
      },
      source,
    });
    const second = deriveMovementCandidateWithLookup({
      point: { x: 120, y: 225 },
      queryResult: {
        key: "structure:test_block:b",
        placement: null,
        target: createMovementTarget(targetContext, rect({ bottom: 230, top: 110 })),
      },
      source,
    });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(movementCandidatesAreSemanticallyEqual(first, second)).toBe(true);
    editor.destroy();
  });
});

describe("indexed structure movement integration", () => {
  it("keeps empty-cell anchors and framed-child blank space targetable", () => {
    const emptyCell = cell([]);
    const framedCell = cell([framedBlock("framed")]);
    const editor = makeEditor([block("source"), grid([emptyCell, framedCell])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const emptyCellPos = nodePos(editor, "cell", emptyCell.attrs?.["id"] as string);
    const framedCellPos = nodePos(editor, "cell", framedCell.attrs?.["id"] as string);
    const framedPos = nodePos(editor, "test_framed_block", "framed");
    const harness = indexedMovementHarness(
      editor,
      sourcePos,
      new Map([
        [emptyCellPos, rect({ bottom: 180, height: 140, left: 20, right: 220, top: 40 })],
        [framedCellPos, rect({ bottom: 180, height: 140, left: 260, right: 460, top: 40 })],
        [framedPos, rect({ bottom: 100, height: 40, left: 280, right: 420, top: 60 })],
      ]),
    );

    expect(descriptorAt(harness.descriptors, emptyCellPos).element).toHaveAttribute(
      "data-authoring-frame",
      "cell",
    );
    const emptyCandidate = harness.candidateAt({ x: 100, y: 120 });
    expect(emptyCandidate?.intent).toBeInstanceOf(InsertInsideTarget);
    expect(emptyCandidate?.target.pos).toBe(emptyCellPos);

    const framedBlankCandidate = harness.candidateAt({ x: 320, y: 150 });
    expect(framedBlankCandidate?.intent).toBeInstanceOf(InsertInsideTarget);
    expect(framedBlankCandidate?.target.pos).toBe(framedCellPos);
    editor.destroy();
  });

  it("resolves exact grid-end space and the adjacent gutter through the grid descriptor", () => {
    const editor = makeEditor([block("source"), grid([cell([framedBlock("framed")]), cell([])])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const gridPos = nodePos(editor, "grid");
    const framedPos = nodePos(editor, "test_framed_block", "framed");
    const harness = indexedMovementHarness(
      editor,
      sourcePos,
      new Map([
        [gridPos, rect({ bottom: 180, height: 140, left: 20, right: 420, top: 40, width: 400 })],
        [framedPos, rect({ bottom: 120, height: 60, left: 40, right: 200, top: 60, width: 160 })],
      ]),
    );

    for (const point of [
      { x: 410, y: 90 },
      { x: 440, y: 90 },
    ]) {
      const candidate = harness.candidateAt(point);
      expect(candidate?.intent).toBeInstanceOf(AddCellAtGridEnd);
      expect(candidate?.target.pos).toBe(gridPos);
    }
    editor.destroy();
  });

  it("resolves visual row gaps above and below a grid", () => {
    const editor = makeEditor([
      block("source"),
      grid([cell([block("inside")]), cell([])]),
      block("after"),
    ]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const gridPos = nodePos(editor, "grid");
    const harness = indexedMovementHarness(
      editor,
      sourcePos,
      new Map([
        [gridPos, rect({ bottom: 160, height: 120, left: 10, right: 410, top: 40, width: 400 })],
      ]),
    );

    const before = harness.candidateAt({ x: 200, y: 20 });
    expect(before?.intent).toBeInstanceOf(InsertBeforeTarget);
    expect(before?.target.pos).toBe(gridPos);
    const after = harness.candidateAt({ x: 200, y: 180 });
    expect(after?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(after?.target.pos).toBe(gridPos);
    editor.destroy();
  });

  it("uses the grid wrapper geometry for the row indicator instead of a child block", () => {
    const editor = makeEditor([grid([cell([block("inside")]), cell([])]), block("source")]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const gridPos = nodePos(editor, "grid");
    const childPos = nodePos(editor, "test_block", "inside");
    const harness = indexedMovementHarness(
      editor,
      sourcePos,
      new Map([
        [gridPos, rect({ bottom: 160, height: 120, left: 10, right: 410, top: 40, width: 400 })],
        [childPos, rect({ bottom: 150, height: 80, left: 20, right: 100, top: 70, width: 80 })],
      ]),
    );

    const candidate = harness.candidateAt({ x: 200, y: 170 });
    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.target.pos).toBe(gridPos);
    expect(candidate?.target.rect).toMatchObject({ left: 10, right: 410, width: 400 });
    editor.destroy();
  });

  it("discovers nested field content through its registered block owner", () => {
    const editor = makeEditor([block("source"), compositeBlock("Nested target")]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const targetPos = nodePos(editor, "test_composite_block");
    const harness = indexedMovementHarness(editor, sourcePos, new Map([[targetPos, rect()]]));

    expect(textPos(editor, "target")).toBeGreaterThan(targetPos);
    const candidate = harness.candidateAt({ x: 100, y: 125 });
    expect(candidate?.intent).toBeInstanceOf(InsertAfterTarget);
    expect(candidate?.target).toMatchObject({
      pos: targetPos,
      nodeType: editor.schema.nodes["test_composite_block"],
    });
    editor.destroy();
  });

  it("keeps region whitespace as an explicit inside target", () => {
    const editor = makeEditor([block("source"), region([{ type: "paragraph" }])]);
    const sourcePos = nodePos(editor, "test_block", "source");
    const regionPos = nodePos(editor, "region");
    const harness = indexedMovementHarness(editor, sourcePos, new Map([[regionPos, rect()]]));

    const candidate = harness.candidateAt({ x: 100, y: 70 });
    expect(candidate?.target).toBeInstanceOf(RegionMovementTarget);
    expect(candidate?.target.pos).toBe(regionPos);
    expect(candidate?.intent).toBeInstanceOf(InsertInsideTarget);
    editor.destroy();
  });
});
