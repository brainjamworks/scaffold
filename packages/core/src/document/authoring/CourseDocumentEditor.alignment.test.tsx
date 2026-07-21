// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { collectOwnedHorizontalParticipants } from "@/editor/interactions/alignment/owned-content-alignment";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { resolveStructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { AlignmentControls } from "@/editor/shell/bubbles/interaction/AlignmentControls";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { insertCatalogItemChecked } from "@/editor/insertion/checked-insertion";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";

import { CourseDocumentEditor } from "./CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "./initialize-authoring-document";

const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: builtInBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CourseDocumentEditor unified alignment", () => {
  it("discovers common axes across real block and structural owners", async () => {
    const editor = await mountEditor(
      pageDocument([
        paragraph("Surface text", "left"),
        callout("surface-block", "end"),
        region("region-a", "bottom", [
          paragraph("Region text", "left"),
          callout("region-block", "end"),
        ]),
        grid("grid-a", [
          cell("cell-a", "top", [paragraph("Cell A", "left")]),
          cell("cell-b", "bottom", [paragraph("Cell B", "right")]),
        ]),
        layout("layout-tabs", "tabs", [
          section("tab-a", "tab-panel", [paragraph("Tab content", "center")]),
        ]),
        layout("layout-accordion", "accordion", [
          section("accordion-a", "accordion-item", [paragraph("Panel content", "left")]),
        ]),
      ]),
    );

    expect(snapshot(editor, InteractionTargetKind.Block, "surface-block")).toMatchObject({
      horizontal: { kind: "value", value: "right" },
      vertical: { kind: "unavailable" },
    });
    expect(snapshot(editor, InteractionTargetKind.Surface, "surface-page")).toMatchObject({
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical: { kind: "unavailable" },
    });
    expect(snapshot(editor, InteractionTargetKind.Region, "region-a")).toMatchObject({
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical: { kind: "value", value: "bottom" },
    });
    expect(snapshot(editor, InteractionTargetKind.Cell, "cell-a")).toMatchObject({
      horizontal: { kind: "value", value: "left" },
      vertical: { kind: "value", value: "top" },
    });
    expect(snapshot(editor, InteractionTargetKind.Grid, "grid-a")).toMatchObject({
      horizontal: { kind: "unavailable" },
      vertical: { kind: "indeterminate", reason: "mixed" },
    });
    expect(snapshot(editor, InteractionTargetKind.Layout, "layout-tabs")).toMatchObject({
      horizontal: { kind: "unavailable" },
      vertical: { kind: "unavailable" },
    });
    expect(snapshot(editor, InteractionTargetKind.Section, "tab-a")).toMatchObject({
      horizontal: { kind: "value", value: "center" },
      vertical: { kind: "unavailable" },
    });
    expect(snapshot(editor, InteractionTargetKind.Section, "accordion-a")).toMatchObject({
      horizontal: { kind: "value", value: "left" },
      vertical: { kind: "unavailable" },
    });
  });

  it("gates vertical controls to capable Surfaces and bounded Sections", async () => {
    const editor = await mountEditor(slideshowAlignmentDocument());

    expect(snapshot(editor, InteractionTargetKind.Surface, "surface-cover")).toMatchObject({
      horizontal: { kind: "indeterminate", reason: "mixed" },
      vertical: { kind: "value", value: "bottom" },
    });
    expect(snapshot(editor, InteractionTargetKind.Section, "bounded-tab")).toMatchObject({
      horizontal: { kind: "value", value: "left" },
      vertical: { kind: "value", value: "top" },
    });
  });

  it("projects mixed and Justify-only states into the common accessible control", async () => {
    const editor = await mountEditor(
      pageDocument([
        region("mixed-region", "top", [paragraph("Left", "left"), paragraph("Right", "right")]),
        region("justify-region", "top", [paragraph("Justified", "justify")]),
      ]),
    );
    const callbacks = {
      onHorizontalChange: vi.fn(),
      onVerticalChange: vi.fn(),
    };

    const mixed = render(
      <AlignmentControls
        snapshot={snapshot(editor, InteractionTargetKind.Region, "mixed-region")}
        {...callbacks}
      />,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Horizontal alignment (mixed)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Mixed" })).toBeNull();
    mixed.unmount();

    render(
      <AlignmentControls
        snapshot={snapshot(editor, InteractionTargetKind.Region, "justify-region")}
        {...callbacks}
      />,
    );

    expect(
      screen.getByRole("radiogroup", {
        name: "Horizontal alignment (outside available options)",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Justify" })).toBeNull();
  });

  it("applies one undoable bulk change without crossing nested or sibling owners", async () => {
    const editor = await mountEditor(
      pageDocument([
        grid("owner-grid", [
          cell("target-cell", "top", [
            paragraph("Owned text", "left"),
            callout("owned-block", "end"),
            layout("nested-layout", "tabs", [
              section("nested-section", "tab-panel", [paragraph("Nested A", "right")]),
            ]),
          ]),
          cell("sibling-cell", "top", [paragraph("Sibling text", "right")]),
        ]),
      ]),
    );
    const descriptor = structuralDescriptor(editor, InteractionTargetKind.Cell, "target-cell");
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(alignmentTargetPort.setHorizontal(editor, descriptor.target, "center")).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, descriptor.pos, builtInBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "center" }),
      expect.objectContaining({ kind: "frame", value: "center" }),
    ]);
    expect(nodeById(editor, "owned-block").attrs["frame"]).toMatchObject({
      align: "center",
      widthMode: "fill",
    });
    expect(textAlignment(editor, "Nested A")).toBe("right");
    expect(textAlignment(editor, "Sibling text")).toBe("right");

    expect(editor.commands.undo()).toBe(true);
    expect(
      collectOwnedHorizontalParticipants(editor.state.doc, descriptor.pos, builtInBlockRegistry),
    ).toEqual([
      expect.objectContaining({ kind: "textblock", value: "left" }),
      expect.objectContaining({ kind: "frame", value: "right" }),
    ]);
  });

  it("inherits alignment through the checked direct-insertion path", async () => {
    const editor = await mountEditor(pageDocument([paragraph("Replace me", "right")]));
    const item = builtInInsertCatalog.getById("callout");
    if (!item) throw new Error("Callout catalog item is not registered");
    const range = textRange(editor, "Replace me");

    expect(
      insertCatalogItemChecked(
        editor,
        item,
        builtInBlockRegistry,
        builtInSurfaceVariantRegistry,
        range,
      ),
    ).toBe(true);

    const inserted = firstNodeOfType(editor, "callout");
    expect(inserted.attrs["frame"]).toMatchObject({ align: "end" });
  });

  it("projects the same persisted alignment in authoring and runtime", async () => {
    const content = pageDocument([
      region("parity-region", "bottom", [
        paragraph("Parity text", "right"),
        callout("parity-callout", "center"),
      ]),
    ]);
    const document = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(document, content);
    const onAuthoringReady = vi.fn();
    const onRuntimeReady = vi.fn();

    const view = render(
      <div>
        <div data-testid="parity-authoring">
          <CourseDocumentEditor document={document} onReady={onAuthoringReady} />
        </div>
        <div data-testid="parity-runtime">
          <CourseDocumentRuntimeRenderer
            artifactId="artifact-parity"
            initialContent={content}
            onReady={onRuntimeReady}
          />
        </div>
      </div>,
    );

    await waitFor(() => {
      expect(onAuthoringReady).toHaveBeenCalledTimes(1);
      expect(onRuntimeReady).toHaveBeenCalledTimes(1);
    });

    const authoring = view.getByTestId("parity-authoring");
    const runtime = view.getByTestId("parity-runtime");
    const authoringRegion = requiredElement(authoring, '[data-vertical-content-position="bottom"]');
    const runtimeRegion = requiredElement(runtime, '[data-vertical-content-position="bottom"]');
    const authoringText = requiredElement(authoring, '[data-text-align="right"]');
    const runtimeText = requiredElement(runtime, '[data-text-align="right"]');
    const authoringFrame = requiredElement(
      authoring,
      '[data-authoring-frame="block"][data-id="parity-callout"]',
    );
    const runtimeFrame = requiredElement(
      runtime,
      '[data-runtime-frame="block"][data-id="parity-callout"]',
    );
    const authoringGeometry = authoringFrame.closest("[data-authoring-frame-wrapper]");
    if (!(authoringGeometry instanceof HTMLElement)) {
      throw new Error("Missing authoring frame geometry wrapper");
    }

    expect(runtimeRegion.getAttribute("data-vertical-content-position")).toBe(
      authoringRegion.getAttribute("data-vertical-content-position"),
    );
    expect(runtimeText.getAttribute("data-text-align")).toBe(
      authoringText.getAttribute("data-text-align"),
    );
    expect(runtimeFrame.style.width).toBe(authoringGeometry.style.width);
    expect(runtimeFrame.style.marginLeft).toBe(authoringGeometry.style.marginLeft);
    expect(runtimeFrame.style.marginRight).toBe(authoringGeometry.style.marginRight);
  });
});

async function mountEditor(content: JSONContent): Promise<Editor> {
  const document = new Y.Doc();
  initializeAuthoringCourseDocumentFragment(document, content);
  const onReady = vi.fn();
  render(createElement(CourseDocumentEditor, { document, onReady }));

  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  const editor = onReady.mock.calls[0]?.[0];
  if (!editor) throw new Error("CourseDocumentEditor did not provide an editor");
  await waitFor(() => expect(editor.getJSON().content?.[0]?.type).toBe("courseDocument"));
  return editor;
}

function snapshot(
  editor: Editor,
  kind: Parameters<typeof structuralDescriptor>[1] | typeof InteractionTargetKind.Block,
  id: string,
) {
  const descriptor =
    kind === InteractionTargetKind.Block
      ? resolveBlockChromeTargetDescriptor(editor.state, { id, kind }, builtInBlockRegistry)
      : structuralDescriptor(editor, kind, id);
  if (!descriptor) throw new Error(`Missing ${kind} descriptor for ${id}`);
  return alignmentTargetPort.snapshot(editor.state, descriptor);
}

function structuralDescriptor(
  editor: Editor,
  kind:
    | typeof InteractionTargetKind.Surface
    | typeof InteractionTargetKind.Region
    | typeof InteractionTargetKind.Cell
    | typeof InteractionTargetKind.Grid
    | typeof InteractionTargetKind.Layout
    | typeof InteractionTargetKind.Section,
  id: string,
) {
  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, { id, kind });
  if (!descriptor) throw new Error(`Missing ${kind} descriptor for ${id}`);
  return descriptor;
}

function pageDocument(content: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "page",
          surfaceSize: "fluid",
          overflowMode: "grow",
        },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-page", variant: "page-default" },
            content,
          },
        ],
      },
    ],
  };
}

function slideshowAlignmentDocument(): JSONContent {
  const cover = slideCoverSurfaceDefinition.createSurface({ surfaceId: "surface-cover" });
  const coverTitle = cover.content?.[0] as JSONContent | undefined;
  const coverSubtitle = cover.content?.[1]?.content?.[0] as JSONContent | undefined;
  if (!coverTitle || !coverSubtitle) throw new Error("Expected slide cover fields");
  cover.attrs = {
    ...cover.attrs,
    settings: { ...cover.attrs?.["settings"], verticalPosition: "bottom" },
  };
  coverTitle.attrs = { ...coverTitle.attrs, textAlign: "right" };
  coverTitle.content = [{ type: "text", text: "Cover title" }];
  coverSubtitle.attrs = { ...coverSubtitle.attrs, textAlign: "left" };
  coverSubtitle.content = [{ type: "text", text: "Cover subtitle" }];

  const contentSurface = slideContentSurfaceDefinition.createSurface({
    surfaceId: "surface-content",
  });
  const mainRegion = contentSurface.content?.[1];
  if (!mainRegion) throw new Error("Expected slide content Region");
  mainRegion.attrs = { ...mainRegion.attrs, id: "bounded-region", verticalPosition: "top" };
  mainRegion.content = [
    layout("bounded-layout", "tabs", [
      section("bounded-tab", "tab-panel", [paragraph("Bounded tab", "left")]),
    ]),
  ];

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
        },
        content: [cover, contentSurface],
      },
    ],
  };
}

function paragraph(text: string, textAlign: "left" | "center" | "right" | "justify"): JSONContent {
  return {
    type: "paragraph",
    attrs: { textAlign },
    content: [{ type: "text", text }],
  };
}

function callout(id: string, align: "start" | "center" | "end"): JSONContent {
  const item = builtInInsertCatalog.getById("callout");
  if (!item) throw new Error("Callout catalog item is not registered");
  const content = item.content() as JSONContent;
  return {
    ...content,
    attrs: {
      ...content.attrs,
      id,
      frame: { align, widthMode: "fill", widthPercent: 100 },
    },
  };
}

function region(id: string, verticalPosition: "top" | "middle" | "bottom", content: JSONContent[]) {
  return { type: "region", attrs: { id, verticalPosition }, content } satisfies JSONContent;
}

function grid(id: string, content: JSONContent[]) {
  return { type: "grid", attrs: { id }, content } satisfies JSONContent;
}

function cell(id: string, verticalPosition: "top" | "middle" | "bottom", content: JSONContent[]) {
  return { type: "cell", attrs: { id, verticalPosition }, content } satisfies JSONContent;
}

function layout(id: string, variant: "tabs" | "accordion", content: JSONContent[]) {
  return { type: "layout", attrs: { id, variant }, content } satisfies JSONContent;
}

function section(id: string, role: "tab-panel" | "accordion-item", content: JSONContent[]) {
  return {
    type: "section",
    attrs: { id, role, verticalPosition: "top" },
    content,
  } satisfies JSONContent;
}

function nodeById(editor: Editor, id: string) {
  let resultPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] === id) {
      resultPos = pos;
      return false;
    }
    return resultPos < 0;
  });
  const result = resultPos < 0 ? null : editor.state.doc.nodeAt(resultPos);
  if (!result) throw new Error(`Missing node ${id}`);
  return result;
}

function firstNodeOfType(editor: Editor, type: string) {
  let resultPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === type) {
      resultPos = pos;
      return false;
    }
    return resultPos < 0;
  });
  const result = resultPos < 0 ? null : editor.state.doc.nodeAt(resultPos);
  if (!result) throw new Error(`Missing ${type} node`);
  return result;
}

function textAlignment(editor: Editor, text: string): unknown {
  let result: unknown = null;
  editor.state.doc.descendants((node) => {
    if (node.isTextblock && node.textContent === text) {
      result = node.attrs["textAlign"];
      return false;
    }
    return result === null;
  });
  return result;
}

function textRange(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range || !node.isText || node.text !== text) return range === null;
    range = { from: pos, to: pos + text.length };
    return false;
  });
  if (!range) throw new Error(`Missing text ${text}`);
  return range;
}

function requiredElement(root: HTMLElement, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing element ${selector}`);
  return element;
}
