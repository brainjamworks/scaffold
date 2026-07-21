// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor as resolveBlockChromeTargetDescriptorWithLookup } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";

import { createAlignmentTargetPort } from "./alignment-target";
import { collectOwnedHorizontalParticipants } from "./owned-content-alignment";

const RESIZABLE = "alignment_target_resizable";
const FIXED = "alignment_target_fixed";

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: RESIZABLE, frame: { resizable: true } }),
  defineBlock({ nodeType: FIXED }),
]);
const testSurfaceVariants = createSurfaceVariantRegistry([
  slideCoverSurfaceDefinition,
  slideContentSurfaceDefinition,
]);
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: testBlockRegistry,
  surfaceVariants: testSurfaceVariants,
});
const resolveBlockChromeTargetDescriptor = (
  state: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[0],
  target: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[1],
) => resolveBlockChromeTargetDescriptorWithLookup(state, target, testBlockRegistry);
function blockNode(name: string) {
  return Node.create({
    name,
    content: "paragraph+",
    defining: true,
    group: "block",
    addAttributes() {
      return {
        id: { default: null },
        frame: { default: null },
        metadata: { default: null },
      };
    },
    parseHTML() {
      return [{ tag: `div[data-alignment-target-${name}]` }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-alignment-target-${name}`]: "" }, 0];
    },
  });
}

function structuralNode(name: string, content = "block+") {
  return Node.create({
    name,
    content,
    group: "block",
    addAttributes() {
      return {
        id: { default: null },
        settings: { default: null },
        variant: { default: null },
        verticalPosition: { default: "top" },
      };
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", HTMLAttributes, 0];
    },
  });
}

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit,
      createScaffoldTextAlignExtension(["paragraph", "heading"]),
      blockNode(RESIZABLE),
      blockNode(FIXED),
      structuralNode("region"),
      structuralNode("cell"),
      structuralNode("grid", "cell+"),
      structuralNode("section"),
      structuralNode("layout", "section+"),
      structuralNode("surface"),
    ],
    content,
  });
}

function ref(id: string): InteractionTargetRef {
  return { id, kind: InteractionTargetKind.Block };
}

function descriptor(editor: Editor, id: string) {
  const result = resolveBlockChromeTargetDescriptor(editor.state, ref(id));
  if (!result) throw new Error(`missing descriptor for ${id}`);
  return result;
}

function structuralDescriptor(
  editor: Editor,
  kind:
    | typeof InteractionTargetKind.Region
    | typeof InteractionTargetKind.Cell
    | typeof InteractionTargetKind.Section
    | typeof InteractionTargetKind.Grid
    | typeof InteractionTargetKind.Layout
    | typeof InteractionTargetKind.Surface,
  id: string,
) {
  const result = resolveStructuralChromeTargetDescriptor(editor.state, { id, kind });
  if (!result) throw new Error(`missing ${kind} descriptor for ${id}`);
  return result;
}

function content(type = RESIZABLE, align = "start"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type,
        attrs: {
          id: "target-a",
          frame: {
            align,
            aspectRatio: 1.5,
            heightPx: 240,
            widthMode: "percent",
            widthPercent: 60,
          },
          metadata: { retained: true },
        },
        content: [{ type: "paragraph", content: [{ type: "text", text: "content" }] }],
      },
    ],
  };
}

describe("alignmentTargetPort", () => {
  it.each([
    ["start", "left"],
    ["center", "center"],
    ["end", "right"],
  ] as const)("reads %s frame alignment as %s", (native, common) => {
    const editor = makeEditor(content(RESIZABLE, native));

    expect(alignmentTargetPort.snapshot(editor.state, descriptor(editor, "target-a"))).toEqual({
      target: descriptor(editor, "target-a").target,
      horizontal: { kind: "value", value: common },
      vertical: { kind: "unavailable" },
    });

    editor.destroy();
  });

  it.each([
    ["left", "start"],
    ["center", "center"],
    ["right", "end"],
  ] as const)("writes %s as %s in one dispatch", (common, native) => {
    const editor = makeEditor(content(RESIZABLE, common === "left" ? "center" : "start"));
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.setHorizontal(editor, ref("target-a"), common)).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({
      align: native,
      aspectRatio: 1.5,
      heightPx: 240,
      widthMode: "percent",
      widthPercent: 60,
    });
    expect(editor.state.doc.nodeAt(0)?.attrs["metadata"]).toEqual({ retained: true });

    editor.destroy();
  });

  it("returns false without dispatch for no-op, invalid, vertical, and stale commands", () => {
    const editor = makeEditor(content());
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.setHorizontal(editor, ref("target-a"), "left")).toBe(false);
    expect(alignmentTargetPort.setHorizontal(editor, ref("target-a"), "top" as "left")).toBe(false);
    expect(alignmentTargetPort.setVertical(editor, ref("target-a"), "top")).toBe(false);
    expect(alignmentTargetPort.setHorizontal(editor, ref("missing"), "right")).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();

    editor.destroy();
  });

  it("makes both axes unavailable for a non-resizable registered block", () => {
    const editor = makeEditor(content(FIXED));

    expect(alignmentTargetPort.snapshot(editor.state, descriptor(editor, "target-a"))).toEqual({
      target: descriptor(editor, "target-a").target,
      horizontal: { kind: "unavailable" },
      vertical: { kind: "unavailable" },
    });
    expect(alignmentTargetPort.setHorizontal(editor, ref("target-a"), "center")).toBe(false);

    editor.destroy();
  });

  it("re-resolves the target immediately before mutation", () => {
    const editor = makeEditor(content());
    const stale = descriptor(editor, "target-a").target;
    editor.commands.deleteNode(RESIZABLE);

    expect(alignmentTargetPort.setHorizontal(editor, stale, "right")).toBe(false);

    editor.destroy();
  });

  it.each([
    [InteractionTargetKind.Region, "region-a", { kind: "value", value: "bottom" }],
    [InteractionTargetKind.Cell, "cell-a", { kind: "value", value: "middle" }],
    [InteractionTargetKind.Section, "section-a", { kind: "unavailable" }],
  ] as const)("reads mixed owned content for a %s target", (kind, id, vertical) => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, kind, id);

    expect(alignmentTargetPort.snapshot(editor.state, target)).toEqual({
      target: target.target,
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical,
    });

    editor.destroy();
  });

  it.each([
    [InteractionTargetKind.Grid, "grid-a"],
    [InteractionTargetKind.Layout, "layout-a"],
  ] as const)("keeps Phase 3 horizontal alignment unavailable for %s", (kind, id) => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, kind, id);

    expect(alignmentTargetPort.snapshot(editor.state, target).horizontal).toEqual({
      kind: "unavailable",
    });
    expect(alignmentTargetPort.setHorizontal(editor, target.target, "center")).toBe(false);

    editor.destroy();
  });

  it("aggregates and writes Surface-owned horizontal content in one dispatch", () => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, InteractionTargetKind.Surface, "surface-a");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.snapshot(editor.state, target)).toEqual({
      target: target.target,
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical: { kind: "value", value: "bottom" },
    });
    expect(alignmentTargetPort.setHorizontal(editor, target.target, "center")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, target.pos, testBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "center" }),
      expect.objectContaining({ kind: "frame", value: "center" }),
    ]);

    editor.destroy();
  });

  it("writes capable Surface vertical state and keeps it unavailable for other variants", () => {
    const editor = makeEditor(structuralContent());
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const capable = structuralDescriptor(editor, InteractionTargetKind.Surface, "surface-a");
    const unavailable = structuralDescriptor(
      editor,
      InteractionTargetKind.Surface,
      "surface-unavailable",
    );

    expect(alignmentTargetPort.setVertical(editor, capable.target, "top")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(alignmentTargetPort.snapshot(editor.state, capable).vertical).toEqual({
      kind: "value",
      value: "top",
    });
    expect(alignmentTargetPort.snapshot(editor.state, unavailable).vertical).toEqual({
      kind: "unavailable",
    });
    expect(alignmentTargetPort.setVertical(editor, unavailable.target, "bottom")).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(1);

    editor.destroy();
  });

  it("aligns all Region participants in one dispatch and restores them with one undo", () => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, InteractionTargetKind.Region, "region-a");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.setHorizontal(editor, target.target, "center")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, target.pos, testBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "center" }),
      expect.objectContaining({ kind: "frame", value: "center" }),
    ]);

    expect(editor.commands.undo()).toBe(true);
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, target.pos, testBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "left" }),
      expect.objectContaining({ kind: "frame", value: "right" }),
    ]);

    editor.destroy();
  });

  it("reads and writes Region vertical position without changing child horizontal state", () => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, InteractionTargetKind.Region, "region-a");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.snapshot(editor.state, target)).toMatchObject({
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical: { kind: "value", value: "bottom" },
    });
    expect(alignmentTargetPort.setVertical(editor, target.target, "middle")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(editor.state.doc.nodeAt(target.pos)?.attrs["verticalPosition"]).toBe("middle");
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, target.pos, testBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "left" }),
      expect.objectContaining({ kind: "frame", value: "right" }),
    ]);
    expect(alignmentTargetPort.setVertical(editor, target.target, "middle")).toBe(false);

    editor.destroy();
  });

  it("derives mixed Grid state across every direct Cell and normalizes them in one undoable write", () => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, InteractionTargetKind.Grid, "grid-a");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.snapshot(editor.state, target)).toEqual({
      target: target.target,
      horizontal: { kind: "unavailable" },
      vertical: { kind: "indeterminate", reason: "mixed" },
    });
    expect(alignmentTargetPort.setHorizontal(editor, target.target, "center")).toBe(false);
    expect(alignmentTargetPort.setVertical(editor, target.target, "bottom")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(cellVerticalPositions(editor, target.pos)).toEqual(["bottom", "bottom"]);

    expect(editor.commands.undo()).toBe(true);
    expect(cellVerticalPositions(editor, target.pos)).toEqual(["middle", "bottom"]);

    editor.destroy();
  });

  it("writes one Cell without changing its sibling", () => {
    const editor = makeEditor(structuralContent());
    const target = structuralDescriptor(editor, InteractionTargetKind.Cell, "cell-a");
    if (target.kind !== InteractionTargetKind.Cell) throw new Error("expected Cell target");

    expect(alignmentTargetPort.setVertical(editor, target.target, "top")).toBe(true);
    expect(cellVerticalPositions(editor, target.gridPos)).toEqual(["top", "bottom"]);

    editor.destroy();
  });

  it("exposes Section vertical position only for active finite handoff", () => {
    const editor = makeEditor(structuralContent());
    const bounded = structuralDescriptor(editor, InteractionTargetKind.Section, "bounded-section");
    const natural = structuralDescriptor(editor, InteractionTargetKind.Section, "section-a");
    const accordion = structuralDescriptor(
      editor,
      InteractionTargetKind.Section,
      "accordion-section",
    );

    expect(alignmentTargetPort.snapshot(editor.state, bounded).vertical).toEqual({
      kind: "value",
      value: "bottom",
    });
    expect(alignmentTargetPort.setVertical(editor, bounded.target, "middle")).toBe(true);
    expect(editor.state.doc.nodeAt(bounded.pos)?.attrs["verticalPosition"]).toBe("middle");
    expect(alignmentTargetPort.snapshot(editor.state, natural).vertical).toEqual({
      kind: "unavailable",
    });
    expect(alignmentTargetPort.snapshot(editor.state, accordion).vertical).toEqual({
      kind: "unavailable",
    });
    expect(alignmentTargetPort.setVertical(editor, accordion.target, "middle")).toBe(false);

    editor.destroy();
  });

  it("re-resolves structural targets and skips empty or uniform no-op scopes", () => {
    const editor = makeEditor(structuralContent());
    const descriptor = structuralDescriptor(editor, InteractionTargetKind.Region, "region-a");
    const target = descriptor.target;

    expect(alignmentTargetPort.setHorizontal(editor, target, "right")).toBe(true);
    expect(alignmentTargetPort.setHorizontal(editor, target, "right")).toBe(false);
    editor.view.dispatch(
      editor.state.tr.delete(descriptor.pos, descriptor.pos + descriptor.node.nodeSize),
    );
    expect(alignmentTargetPort.setHorizontal(editor, target, "left")).toBe(false);

    editor.destroy();
  });
});

function structuralContent(): JSONContent {
  const owned = [
    { type: "paragraph", attrs: { textAlign: "left" } },
    {
      type: RESIZABLE,
      attrs: {
        id: "owned-block",
        frame: { align: "end", widthMode: "fill", widthPercent: 100 },
      },
      content: [{ type: "paragraph" }],
    },
  ];

  return {
    type: "doc",
    content: [
      {
        type: "surface",
        attrs: {
          id: "surface-a",
          variant: "slide-cover",
          settings: { verticalPosition: "bottom" },
        },
        content: owned,
      },
      {
        type: "surface",
        attrs: { id: "surface-unavailable", variant: "page-default" },
        content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
      },
      {
        type: "region",
        attrs: { id: "region-a", verticalPosition: "bottom" },
        content: [
          ...owned,
          {
            type: "layout",
            attrs: { id: "bounded-tabs", variant: "tabs" },
            content: [
              {
                type: "section",
                attrs: { id: "bounded-section", verticalPosition: "bottom" },
                content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
              },
            ],
          },
          {
            type: "layout",
            attrs: { id: "bounded-accordion", variant: "accordion" },
            content: [
              {
                type: "section",
                attrs: { id: "accordion-section", verticalPosition: "bottom" },
                content: [{ type: "paragraph", attrs: { textAlign: "left" } }],
              },
            ],
          },
        ],
      },
      {
        type: "grid",
        attrs: { id: "grid-a" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell-a", verticalPosition: "middle" },
            content: owned,
          },
          {
            type: "cell",
            attrs: { id: "cell-b", verticalPosition: "bottom" },
            content: [{ type: "paragraph", attrs: { textAlign: "center" } }],
          },
        ],
      },
      {
        type: "layout",
        attrs: { id: "layout-a" },
        content: [{ type: "section", attrs: { id: "section-a" }, content: owned }],
      },
    ],
  };
}

function cellVerticalPositions(editor: Editor, gridPos: number): unknown[] {
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") throw new Error("expected Grid");
  return Array.from(
    { length: grid.childCount },
    (_, index) => grid.child(index).attrs["verticalPosition"],
  );
}
