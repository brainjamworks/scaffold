// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  InteractionChromeSlotReason,
  InteractionTargetKind,
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  resolveStructuralChromeFrameElement,
  resolveStructuralChromeTargetDescriptor,
  resolveStructuralChromeTargetFromSnapshot,
  structuralChromeTargetKey,
} from "./structural-chrome-target-projection";

const TestSurfaceNode = structuralNode("surface", "region+");
const TestRegionNode = structuralNode("region", "(layout | grid | paragraph)+");
const TestLayoutNode = structuralNode("layout", "section+");
const TestSectionNode = structuralNode("section", "(grid | paragraph)+");
const TestGridNode = structuralNode("grid", "cell+");
const TestCellNode = structuralNode("cell", "paragraph+");

function structuralNode(name: string, content: string) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
        variant: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-structural-desc-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-v2-structural-desc-${name}`]: "" }, 0];
    },
  });
}

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestSurfaceNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
      TestGridNode,
      TestCellNode,
    ],
    content,
  });
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fullContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: { id: "surface-a", variant: "page-default" },
        content: [
          {
            type: "region",
            attrs: { id: "region-a" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-a", variant: "tabs" },
                content: [
                  {
                    type: "section",
                    attrs: { id: "section-a" },
                    content: [
                      {
                        type: "grid",
                        attrs: { id: "grid-a" },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: "cell-a" },
                            content: [paragraph("cell a text")],
                          },
                          {
                            type: "cell",
                            attrs: { id: "cell-b" },
                            content: [paragraph("cell b text")],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "section",
                    attrs: { id: "section-b" },
                    content: [paragraph("section b text")],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing node ${id}`);
  return found;
}

function structuralRef(input: {
  id?: string;
  kind: InteractionTargetRef["kind"];
  pos?: number;
}): InteractionTargetRef {
  return {
    ...(input.id ? { id: input.id } : {}),
    kind: input.kind,
    ...(Number.isInteger(input.pos) ? { pos: input.pos } : {}),
  };
}

describe("resolveStructuralChromeTargetDescriptor", () => {
  it("resolves every structural kind by id", () => {
    const editor = makeEditor(fullContent());
    const cases = [
      { id: "surface-a", kind: InteractionTargetKind.Surface },
      { id: "region-a", kind: InteractionTargetKind.Region },
      { id: "layout-a", kind: InteractionTargetKind.Layout },
      { id: "section-a", kind: InteractionTargetKind.Section },
      { id: "grid-a", kind: InteractionTargetKind.Grid },
      { id: "cell-a", kind: InteractionTargetKind.Cell },
    ] as const;

    for (const testCase of cases) {
      const pos = nodePosById(editor, testCase.id);
      const descriptor = resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ id: testCase.id, kind: testCase.kind }),
      );

      expect(descriptor).toMatchObject({
        id: testCase.id,
        kind: testCase.kind,
        nodeType: testCase.kind,
        pos,
        target: { id: testCase.id, kind: testCase.kind, pos },
      });
      expect(descriptor?.node).toBe(editor.state.doc.nodeAt(pos));
    }
    editor.destroy();
  });

  it("resolves a structural ref by position", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "grid-a");

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ kind: InteractionTargetKind.Grid, pos }),
    );

    expect(descriptor?.id).toBe("grid-a");
    expect(descriptor?.kind).toBe(InteractionTargetKind.Grid);
    editor.destroy();
  });

  it("returns null for a stale id", () => {
    const editor = makeEditor(fullContent());

    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ id: "grid-gone", kind: InteractionTargetKind.Grid }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for out-of-range positions", () => {
    const editor = makeEditor(fullContent());

    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ kind: InteractionTargetKind.Grid, pos: -1 }),
      ),
    ).toBeNull();
    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({
          kind: InteractionTargetKind.Grid,
          pos: editor.state.doc.content.size + 1,
        }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null when id and position disagree", () => {
    const editor = makeEditor(fullContent());
    const wrongPos = nodePosById(editor, "cell-b");

    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({
          id: "cell-a",
          kind: InteractionTargetKind.Cell,
          pos: wrongPos,
        }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null when the ref kind does not match the live node", () => {
    const editor = makeEditor(fullContent());
    const cellPos = nodePosById(editor, "cell-a");

    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ kind: InteractionTargetKind.Grid, pos: cellPos }),
      ),
    ).toBeNull();
    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ id: "cell-a", kind: InteractionTargetKind.Grid }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for block and field target kinds", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "grid-a");

    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ kind: InteractionTargetKind.Block, pos }),
      ),
    ).toBeNull();
    expect(
      resolveStructuralChromeTargetDescriptor(
        editor.state,
        structuralRef({ kind: InteractionTargetKind.Field, pos }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("includes parent grid facts and cell index on cell descriptors", () => {
    const editor = makeEditor(fullContent());
    const gridPos = nodePosById(editor, "grid-a");

    const first = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "cell-a", kind: InteractionTargetKind.Cell }),
    );
    const second = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "cell-b", kind: InteractionTargetKind.Cell }),
    );

    expect(first).toMatchObject({
      cellId: "cell-a",
      cellIndex: 0,
      gridId: "grid-a",
      gridPos,
      kind: InteractionTargetKind.Cell,
    });
    expect(second).toMatchObject({
      cellId: "cell-b",
      cellIndex: 1,
      gridId: "grid-a",
      gridPos,
    });
    expect(first?.kind === InteractionTargetKind.Cell ? first.gridNode : null).toBe(
      editor.state.doc.nodeAt(gridPos),
    );
    editor.destroy();
  });

  it("includes parent layout facts and definition facts on section descriptors", () => {
    const editor = makeEditor(fullContent());
    const layoutPos = nodePosById(editor, "layout-a");

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "section-a", kind: InteractionTargetKind.Section }),
    );

    expect(descriptor).toMatchObject({
      kind: InteractionTargetKind.Section,
      layoutId: "layout-a",
      layoutPos,
      sectionId: "section-a",
      sectionIndex: 0,
    });
    if (descriptor?.kind !== InteractionTargetKind.Section) {
      throw new Error("expected section descriptor");
    }
    expect(descriptor.layoutDefinition?.id).toBe("tabs");
    expect(descriptor.sectionDefinition).toBe(descriptor.layoutDefinition?.section);
    expect(descriptor.sectionDefinition?.settingsSheet).toBeDefined();
    editor.destroy();
  });

  it("includes the layout definition on layout descriptors", () => {
    const editor = makeEditor(fullContent());

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "layout-a", kind: InteractionTargetKind.Layout }),
    );

    if (descriptor?.kind !== InteractionTargetKind.Layout) {
      throw new Error("expected layout descriptor");
    }
    expect(descriptor.layoutDefinition?.id).toBe("tabs");
    expect(descriptor.layoutDefinition?.settingsSheet).toBeDefined();
    editor.destroy();
  });

  it("includes only the neutral variant fact on surface descriptors", () => {
    const editor = makeEditor(fullContent());

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "surface-a", kind: InteractionTargetKind.Surface }),
    );

    if (descriptor?.kind !== InteractionTargetKind.Surface) {
      throw new Error("expected surface descriptor");
    }
    expect(descriptor.variant).toBe("page-default");
    expect(descriptor).not.toHaveProperty("authoringView");
    editor.destroy();
  });

  it("resolves region descriptors with live node facts for menu content", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "region-a");

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "region-a", kind: InteractionTargetKind.Region }),
    );

    expect(descriptor?.kind).toBe(InteractionTargetKind.Region);
    expect(descriptor?.node).toBe(editor.state.doc.nodeAt(pos));
    editor.destroy();
  });
});

describe("structuralChromeTargetKey", () => {
  it("builds a stable key from descriptor facts", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "grid-a");

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "grid-a", kind: InteractionTargetKind.Grid }),
    );

    expect(descriptor?.targetKey).toBe(`grid:grid:${pos}:grid-a`);
    expect(structuralChromeTargetKey(descriptor!)).toBe(descriptor?.targetKey);
    editor.destroy();
  });

  it("builds a key from a bare target ref", () => {
    expect(
      structuralChromeTargetKey(
        structuralRef({
          id: "cell-a",
          kind: InteractionTargetKind.Cell,
          pos: 7,
        }),
      ),
    ).toBe("cell::7:cell-a");
  });
});

describe("resolveStructuralChromeTargetFromSnapshot", () => {
  function snapshotWithSlot(input: {
    slot: "arrangementMenu" | "movementHandle" | "outline";
    target: InteractionTargetRef | null;
    visible: boolean;
  }) {
    return createInteractionOwnerSnapshot({
      chromeSlots: {
        [input.slot]: createInteractionChromeSlot({
          reason: input.visible
            ? InteractionChromeSlotReason.Allowed
            : InteractionChromeSlotReason.Unavailable,
          target: input.target,
          visible: input.visible,
        }),
      },
    });
  }

  it("resolves a visible arrangementMenu slot to a live descriptor", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "arrangementMenu",
      target: structuralRef({ id: "grid-a", kind: InteractionTargetKind.Grid }),
      visible: true,
    });

    const descriptor = resolveStructuralChromeTargetFromSnapshot(
      editor.state,
      snapshot,
      "arrangementMenu",
    );

    expect(descriptor?.id).toBe("grid-a");
    editor.destroy();
  });

  it("resolves visible outline and movementHandle slots", () => {
    const editor = makeEditor(fullContent());

    const outline = resolveStructuralChromeTargetFromSnapshot(
      editor.state,
      snapshotWithSlot({
        slot: "outline",
        target: structuralRef({
          id: "layout-a",
          kind: InteractionTargetKind.Layout,
        }),
        visible: true,
      }),
      "outline",
    );
    const movement = resolveStructuralChromeTargetFromSnapshot(
      editor.state,
      snapshotWithSlot({
        slot: "movementHandle",
        target: structuralRef({
          id: "layout-a",
          kind: InteractionTargetKind.Layout,
        }),
        visible: true,
      }),
      "movementHandle",
    );

    expect(outline?.id).toBe("layout-a");
    expect(movement?.id).toBe("layout-a");
    editor.destroy();
  });

  it("returns null for a hidden slot even when the target is live", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "arrangementMenu",
      target: structuralRef({ id: "grid-a", kind: InteractionTargetKind.Grid }),
      visible: false,
    });

    expect(
      resolveStructuralChromeTargetFromSnapshot(editor.state, snapshot, "arrangementMenu"),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null when the visible slot target is stale", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "arrangementMenu",
      target: structuralRef({
        id: "grid-gone",
        kind: InteractionTargetKind.Grid,
      }),
      visible: true,
    });

    expect(
      resolveStructuralChromeTargetFromSnapshot(editor.state, snapshot, "arrangementMenu"),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null when the visible slot target is a block ref", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "movementHandle",
      target: structuralRef({
        id: "block-a",
        kind: InteractionTargetKind.Block,
      }),
      visible: true,
    });

    expect(
      resolveStructuralChromeTargetFromSnapshot(editor.state, snapshot, "movementHandle"),
    ).toBeNull();
    editor.destroy();
  });
});

describe("resolveStructuralChromeFrameElement", () => {
  it("finds the structural authoring frame element by neutral marker lookup", () => {
    const editor = makeEditor(fullContent());
    const root = document.createElement("div");
    root.innerHTML = [
      '<div data-authoring-frame="grid" data-id="grid-a">grid frame</div>',
      '<div data-authoring-frame="cell" data-id="grid-a">decoy kind</div>',
      '<div data-authoring-frame="grid" data-id="other">decoy id</div>',
    ].join("");

    const descriptor = resolveStructuralChromeTargetDescriptor(
      editor.state,
      structuralRef({ id: "grid-a", kind: InteractionTargetKind.Grid }),
    );

    const element = resolveStructuralChromeFrameElement(root, descriptor);

    expect(element?.getAttribute("data-authoring-frame")).toBe("grid");
    expect(element?.getAttribute("data-id")).toBe("grid-a");
    editor.destroy();
  });

  it("returns null without a stable structural id", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "grid",
          attrs: { id: null },
          content: [
            {
              type: "cell",
              attrs: { id: null },
              content: [paragraph("anonymous cell")],
            },
          ],
        },
      ],
    });
    const root = document.createElement("div");

    const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, {
      kind: InteractionTargetKind.Grid,
      pos: 0,
    });

    expect(descriptor?.id).toBeNull();
    expect(resolveStructuralChromeFrameElement(root, descriptor)).toBeNull();
    editor.destroy();
  });
});
