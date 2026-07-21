// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  normalizeBlockFrame,
  resizeBlockFrame,
  resolveBlockFrameSize,
  resolveBlockFrameViewStyle,
  setBlockFrameHorizontalAlignmentInTransaction,
} from "./block-frame";

const TestFrameNode = Node.create({
  name: "test_frame_node",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      frame: { default: null },
      id: { default: null },
      metadata: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-frame-node]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-frame-node": "" }];
  },
});

function makeFrameEditor(align: "start" | "center" | "end" = "start"): Editor {
  return new Editor({
    extensions: [StarterKit, TestFrameNode],
    content: {
      type: "doc",
      content: [
        {
          type: "test_frame_node",
          attrs: {
            frame: {
              align,
              aspectRatio: 2,
              heightPx: 120,
              widthMode: "percent",
              widthPercent: 50,
            },
            id: "block-1",
            metadata: { source: "test" },
          },
        },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    },
  });
}

describe("block frame contract", () => {
  it("normalizes missing or invalid frame attrs to fill width", () => {
    expect(normalizeBlockFrame(null)).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: null,
      widthMode: "fill",
      widthPercent: 100,
    });
    expect(
      normalizeBlockFrame({
        align: "sideways",
        aspectRatio: -1,
        widthMode: "percent",
        widthPercent: Number.NaN,
      }),
    ).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 100,
    });
  });

  it("persists relative width values while clamping to the parent region", () => {
    const resized = resizeBlockFrame(
      { widthMode: "fill", widthPercent: 100 },
      { desiredWidthPx: 240, parentWidthPx: 400 },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 60,
    });
    expect(resized.size).toEqual({ widthPx: 240 });
    expect(resized.attrs).not.toHaveProperty("widthPx");

    expect(
      resizeBlockFrame(
        { widthMode: "percent", widthPercent: 40 },
        { desiredWidthPx: 800, parentWidthPx: 400 },
      ).attrs,
    ).toMatchObject({ widthMode: "percent", widthPercent: 100 });
  });

  it("computes aspect-ratio height from relative width", () => {
    const frame = normalizeBlockFrame({
      aspectRatio: 16 / 9,
      widthMode: "percent",
      widthPercent: 50,
    });

    expect(resolveBlockFrameSize(frame, { parentWidthPx: 320 })).toEqual({
      heightPx: 90,
      widthPx: 160,
    });
  });

  it("uses an explicitly supplied aspect ratio during resize", () => {
    const resized = resizeBlockFrame(
      { widthMode: "fill", widthPercent: 100 },
      {
        aspectRatio: 2,
        desiredWidthPx: 200,
        parentWidthPx: 400,
        preserveAspectRatio: true,
      },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: 2,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 50,
    });
    expect(resized.size).toEqual({
      heightPx: 100,
      widthPx: 200,
    });
  });

  it("uses the registry-declared aspect ratio during resize when preserving ratio", () => {
    const resized = resizeBlockFrame(
      { widthMode: "fill", widthPercent: 100 },
      {
        definition: {
          aspectRatio: 16 / 9,
          preserveAspectRatio: true,
          resizeMode: "responsive",
        },
        desiredWidthPx: 360,
        parentWidthPx: 720,
        preserveAspectRatio: true,
      },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: 16 / 9,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 50,
    });
    expect(resized.size).toEqual({
      heightPx: 202.5,
      widthPx: 360,
    });
  });

  it("does not invent an aspect ratio when none is supplied", () => {
    const resized = resizeBlockFrame(
      { aspectRatio: null, widthMode: "fill", widthPercent: 100 },
      {
        desiredWidthPx: 200,
        parentWidthPx: 400,
        preserveAspectRatio: true,
      },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 50,
    });
    expect(resized.size).toEqual({
      widthPx: 200,
    });
  });

  it("drops a stored aspect ratio when resizing without preserved ratio", () => {
    const resized = resizeBlockFrame(
      {
        aspectRatio: 2,
        widthMode: "percent",
        widthPercent: 50,
      },
      {
        desiredWidthPx: 240,
        parentWidthPx: 400,
        preserveAspectRatio: false,
      },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: null,
      widthMode: "percent",
      widthPercent: 60,
    });
    expect(resized.size).toEqual({
      widthPx: 240,
    });
  });

  it("keeps alignment independent from width math", () => {
    const resized = resizeBlockFrame(
      { align: "end", widthMode: "percent", widthPercent: 30 },
      { desiredWidthPx: 200, parentWidthPx: 400 },
    );

    expect(resized.attrs).toMatchObject({
      align: "end",
      widthPercent: 50,
    });
  });

  it("uses the registry aspect ratio when one exists", () => {
    expect(
      resolveBlockFrameViewStyle(
        {
          aspectRatio: 2,
          widthMode: "percent",
          widthPercent: 50,
        },
        { aspectRatio: 16 / 9, preserveAspectRatio: true, resizeMode: "responsive" },
      ).rootStyle,
    ).toMatchObject({
      aspectRatio: String(16 / 9),
      width: "50%",
    });
  });

  it("preserves an outer ratio in responsive mode without scaling content", () => {
    expect(
      resolveBlockFrameViewStyle(
        {
          aspectRatio: 4,
          widthMode: "percent",
          widthPercent: 50,
        },
        { preserveAspectRatio: true, resizeMode: "responsive" },
      ),
    ).toEqual({
      resizeMode: "responsive",
      rootStyle: {
        aspectRatio: "4",
        marginLeft: "0",
        marginRight: "auto",
        maxWidth: "100%",
        minWidth: "0",
        width: "50%",
      },
    });
  });

  it("persists explicit height only for freeform resize mode", () => {
    const resized = resizeBlockFrame(
      { widthMode: "fill", widthPercent: 100 },
      {
        definition: { resizeMode: "freeform" },
        desiredHeightPx: 180,
        desiredWidthPx: 240,
        parentWidthPx: 400,
      },
    );

    expect(resized.attrs).toEqual({
      align: "start",
      aspectRatio: null,
      heightPx: 180,
      widthMode: "percent",
      widthPercent: 60,
    });
    expect(resized.size).toEqual({ heightPx: 180, widthPx: 240 });
    expect(
      resolveBlockFrameViewStyle(resized.attrs, {
        resizeMode: "freeform",
      }).rootStyle,
    ).toMatchObject({
      height: "180px",
      width: "60%",
    });
  });

  it("projects an explicit live pixel width without changing persisted attrs", () => {
    expect(
      resolveBlockFrameViewStyle(
        {
          widthMode: "percent",
          widthPercent: 50,
        },
        { resizeMode: "responsive" },
        { widthPx: 240 },
      ).rootStyle,
    ).toMatchObject({
      maxWidth: "100%",
      width: "240px",
    });
  });

  it.each([
    ["left", "start"],
    ["center", "center"],
    ["right", "end"],
  ] as const)("maps %s alignment into native frame value %s", (alignment, nativeAlign) => {
    const editor = makeFrameEditor(nativeAlign === "start" ? "center" : "start");
    const tr = editor.state.tr;

    expect(setBlockFrameHorizontalAlignmentInTransaction(tr, 0, alignment)).toBe(tr);
    expect(tr.doc.nodeAt(0)?.attrs).toEqual({
      frame: {
        align: nativeAlign,
        aspectRatio: 2,
        heightPx: 120,
        widthMode: "percent",
        widthPercent: 50,
      },
      id: "block-1",
      metadata: { source: "test" },
    });
    editor.destroy();
  });

  it("rejects invalid positions, node types, values, and no-op mutations", () => {
    const editor = makeFrameEditor();

    expect(setBlockFrameHorizontalAlignmentInTransaction(editor.state.tr, -1, "center")).toBeNull();
    expect(setBlockFrameHorizontalAlignmentInTransaction(editor.state.tr, 2, "center")).toBeNull();
    expect(
      setBlockFrameHorizontalAlignmentInTransaction(editor.state.tr, 0, "top" as "left"),
    ).toBeNull();
    expect(setBlockFrameHorizontalAlignmentInTransaction(editor.state.tr, 0, "left")).toBeNull();
    editor.destroy();
  });

  it("preserves latent alignment for fill frames and projects narrowed margins", () => {
    const editor = makeFrameEditor();
    const initial = editor.state.doc.nodeAt(0);
    if (!initial) throw new Error("test frame node not found");
    const tr = editor.state.tr.setNodeMarkup(0, undefined, {
      ...initial.attrs,
      frame: { ...initial.attrs["frame"], widthMode: "fill", widthPercent: 100 },
    });

    expect(setBlockFrameHorizontalAlignmentInTransaction(tr, 0, "right")).toBe(tr);
    const frame = tr.doc.nodeAt(0)?.attrs["frame"];
    expect(frame).toMatchObject({ align: "end", widthMode: "fill", widthPercent: 100 });
    expect(resolveBlockFrameViewStyle(frame).rootStyle).toMatchObject({
      marginLeft: "auto",
      marginRight: "0",
      minWidth: "0",
      width: "100%",
    });
    editor.destroy();
  });
});
