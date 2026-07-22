// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { expect, it, vi } from "vite-plus/test";

import { createCourseDocumentInlineContentExtensions } from "@/composition/model/create-document-composition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { InlineIconRuntimeNode } from "@/editor/rich-text/inline-icon/runtime/InlineIconRuntimeNode";
import { MathInlineRuntimeNode } from "@/editor/rich-text/math/runtime/MathInlineRuntime";
import { VocabularyTermRuntimeNode } from "@/editor/rich-text/vocabulary-term/runtime/VocabularyTermRuntimeNode";
import { describeBlockContract } from "@/editor/testing";
import { AnnotatedFigureAuthoringExtension } from "./annotated-figure-authoring-extension";
import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";
import { AnnotatedFigureRuntimeExtension } from "./annotated-figure-runtime-extension";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";
import { emptyAnnotatedFigureData } from "./content";
import "./annotated-figure-definition";

function annotatedFigureFixture(
  data: Record<string, unknown> = {
    type: "annotated_figure",
    source: {
      mode: "external",
      src: "https://example.com/figure.jpg",
    },
    alt: "Annotated diagram",
    captionDisplay: "list",
  },
  annotations: Array<{
    id: string;
    x: number;
    y: number;
    caption?: string;
    captionContent?: JSONContent[];
  }> = [],
): JSONContent {
  return {
    type: "annotated_figure",
    attrs: {
      id: "annotated-figure-proof",
      data,
    },
    content: [
      { type: "annotated_figure_canvas" },
      {
        type: "annotated_figure_legend",
        content: annotations.map((annotation) => ({
          type: "annotated_figure_annotation",
          attrs: { id: annotation.id, x: annotation.x, y: annotation.y },
          content: [
            {
              type: "paragraph",
              ...(annotation.captionContent
                ? { content: annotation.captionContent }
                : annotation.caption
                  ? { content: [{ type: "text", text: annotation.caption }] }
                  : {}),
            },
          ],
        })),
      },
    ],
  };
}

function renderAnnotatedFigureRuntime(content: JSONContent) {
  const editor = new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ link: false, underline: false, undoRedo: false }),
      ...createCourseDocumentInlineContentExtensions({
        inlineIconNode: InlineIconRuntimeNode,
        mathInlineNode: MathInlineRuntimeNode,
        vocabularyTermNode: VocabularyTermRuntimeNode,
      }),
      AnnotatedFigureRuntimeExtension,
    ],
    content: { type: "doc", content: [content] },
  });
  render(createElement(EditorContent, { editor }));
  return editor;
}

function renderAnnotatedFigureEditor(
  content: JSONContent | JSONContent[] = annotatedFigureFixture(),
  { undoRedo = false }: { undoRedo?: boolean } = {},
) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false }),
      AnnotatedFigureAuthoringExtension,
    ],
    content: {
      type: "doc",
      content: Array.isArray(content) ? content : [content],
    },
  });

  render(createElement(EditorContent, { editor }));

  return editor;
}

function setCanvasRect(canvas: HTMLElement) {
  canvas.getBoundingClientRect = () =>
    ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

function makePointerCapturable(pin: HTMLElement) {
  Object.defineProperties(pin, {
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: () => undefined },
    setPointerCapture: { configurable: true, value: () => undefined },
  });
}

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "annotated_figure",
  catalogId: "annotated-figure",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("declares annotation children as stable identities", () => {
  expect(builtInBlockRegistry.stableIdNodeTypes).toContain("annotated_figure_annotation");
});

it("derives List and Pin popovers into both Annotated Figure configuration surfaces", () => {
  const definition = builtInBlockRegistry.getByNodeType("annotated_figure");

  expect(definition?.quickMenu).toMatchObject({
    attr: "data",
    controls: [
      {
        kind: "select",
        name: "captionDisplay",
        label: "Caption display",
        presentation: "segmented",
        options: [
          { value: "list", label: "List" },
          { value: "popover", label: "Pin popovers" },
        ],
      },
    ],
  });
  expect(definition?.settingsSheet).toMatchObject({
    attr: "data",
    sections: [
      {
        id: "image",
        fields: [{ kind: "text", name: "alt", label: "Alt text" }],
      },
      {
        id: "presentation",
        fields: [{ kind: "select", name: "captionDisplay", label: "Caption display" }],
      },
    ],
  });
  expect(definition?.quickMenu?.schema.parse({ source: null, alt: "" })).toMatchObject({
    captionDisplay: "list",
  });
});

it("uses compact over-image actions without legacy canvas prompts", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor();

  const stage = await screen.findByRole("group", {
    name: "Annotated figure image",
  });
  const toolbar = within(stage).getByRole("toolbar", {
    name: "Annotated figure image tools",
  });

  expect(stage.getAttribute("aria-describedby")).toBeNull();
  expect(screen.getByRole("img", { name: "Annotated diagram" })).toBeInTheDocument();
  expect(screen.queryByText("Click image or use Add pin")).toBeNull();
  expect(within(stage).queryByRole("button", { name: "Add pin" })).toBeNull();
  expect(
    within(toolbar)
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label")),
  ).toEqual(["Replace image", "Add annotation", "Edit annotated figure in expanded workspace"]);
  expect(screen.queryByText("Replace image")).toBeNull();

  await user.click(within(toolbar).getByRole("button", { name: "Add annotation" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Remove pin 1" })).toBeInTheDocument();
  });

  const figure = editor.state.doc.firstChild;
  const model = figure ? resolveAnnotatedFigureModel({ node: figure, pos: 0 }) : null;
  expect(figure?.attrs["data"]).not.toHaveProperty("pins");
  expect(model?.annotations).toMatchObject([{ x: 50, y: 50, number: 1 }]);
  expect(model?.annotations[0]?.captionNode.toJSON()).toEqual({ type: "paragraph" });

  editor.destroy();
});

it("renders authoring captions as a valid ordered list", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "First semantic caption" },
      { id: "annotation-two", x: 65, y: 70, caption: "Second semantic caption" },
    ]),
  );

  await screen.findByText("First semantic caption");
  const list = screen.getByRole("list");
  const listItems = within(list).getAllByRole("listitem");

  expect(list.tagName).toBe("OL");
  expect(listItems).toHaveLength(2);
  expect(listItems.every((item) => item.parentElement === list)).toBe(true);
  editor.destroy();
});

it("keeps the compact image actions together over the resolved image", async () => {
  const editor = renderAnnotatedFigureEditor();

  const actions = await screen.findByRole("group", {
    name: "Annotated figure image actions",
  });
  const toolbar = within(actions).getByRole("toolbar", {
    name: "Annotated figure image tools",
  });

  expect(within(toolbar).getByRole("button", { name: "Replace image" })).toBeInTheDocument();
  expect(within(toolbar).getByRole("button", { name: "Add annotation" })).toBeInTheDocument();
  expect(
    within(toolbar).getByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  ).toBeInTheDocument();
  expect(actions.children).toHaveLength(1);
  expect(actions.firstElementChild).toBe(toolbar);
  editor.destroy();
});

it("keeps editor activation out of direct image-click annotation creation", async () => {
  const editor = renderAnnotatedFigureEditor();
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  let transactionCount = 0;
  editor.on("transaction", () => {
    transactionCount += 1;
  });

  fireEvent.click(
    screen.getByRole("button", { name: "Edit annotated figure in expanded workspace" }),
    { clientX: 100, clientY: 50 },
  );

  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
  ).toHaveLength(0);
  expect(transactionCount).toBe(0);
  editor.destroy();
});

it("adds a complete annotation at the clicked image-relative position", async () => {
  const editor = renderAnnotatedFigureEditor();
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  canvas.getBoundingClientRect = () =>
    ({
      bottom: 120,
      height: 100,
      left: 10,
      right: 210,
      top: 20,
      width: 200,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;

  fireEvent.click(canvas, { clientX: 60, clientY: 95 });

  await waitFor(() => {
    const figure = editor.state.doc.firstChild;
    const annotation = figure
      ? resolveAnnotatedFigureModel({ node: figure, pos: 0 })?.annotations[0]
      : null;
    expect(annotation).toMatchObject({ x: 25, y: 75 });
    expect(annotation?.captionNode.toJSON()).toEqual({ type: "paragraph" });
  });
  editor.destroy();
});

it("previews a pin drag locally and commits it once without activating the pin", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Drag this caption" },
    ]),
  );
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);

  const pin = await screen.findByRole("button", { name: "Select annotation 1" });
  makePointerCapturable(pin);
  let transactionCount = 0;
  editor.on("transaction", () => {
    transactionCount += 1;
  });

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 7 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 7 });

  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "45%",
    );
  });
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
  ).toMatchObject({ x: 25, y: 30 });
  expect(transactionCount).toBe(0);

  fireEvent.pointerUp(pin, { clientX: 90, clientY: 80, pointerId: 7 });
  fireEvent.click(pin);

  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
    ).toMatchObject({ x: 45, y: 60 });
  });
  expect(transactionCount).toBe(1);
  editor.destroy();
});

it("discards a moved pin preview when the pointer is cancelled", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Cancel this drag" },
    ]),
  );
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = await screen.findByRole("button", { name: "Select annotation 1" });
  makePointerCapturable(pin);
  let transactionCount = 0;
  editor.on("transaction", () => {
    transactionCount += 1;
  });

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 9 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 9 });
  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "45%",
    );
  });

  fireEvent.pointerCancel(pin, { clientX: 90, clientY: 80, pointerId: 9 });

  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "25%",
    );
  });
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
  ).toMatchObject({ x: 25, y: 30 });
  expect(transactionCount).toBe(0);
  editor.destroy();
});

it("discards a moved pin preview when pointer capture is lost", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Lose this capture" },
    ]),
  );
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = await screen.findByRole("button", { name: "Select annotation 1" });
  makePointerCapturable(pin);
  let transactionCount = 0;
  editor.on("transaction", () => {
    transactionCount += 1;
  });

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 12 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 12 });
  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "45%",
    );
  });

  fireEvent.lostPointerCapture(pin, { pointerId: 12 });

  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "25%",
    );
  });
  expect(transactionCount).toBe(0);
  editor.destroy();
});

it("restores a committed pin position with undo", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Undo this drag" },
    ]),
    { undoRedo: true },
  );
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = await screen.findByRole("button", { name: "Select annotation 1" });
  makePointerCapturable(pin);

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 10 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 10 });
  fireEvent.pointerUp(pin, { clientX: 90, clientY: 80, pointerId: 10 });
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
    ).toMatchObject({ x: 45, y: 60 });
  });

  expect(editor.commands.undo()).toBe(true);
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
  ).toMatchObject({ x: 25, y: 30 });
  editor.destroy();
});

it("selects and reveals a caption row when its pin is activated", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Reveal this caption" },
    ]),
  );
  const row = (await screen.findByText("Reveal this caption")).closest<HTMLElement>(
    '[data-annotation-id="annotation-one"]',
  );
  if (!row) throw new Error("Expected annotation row.");
  const scrollIntoView = vi.fn();
  row.scrollIntoView = scrollIntoView;
  const stage = screen.getByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = screen.getByRole("button", { name: "Select annotation 1" });
  makePointerCapturable(pin);

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 11 });
  fireEvent.pointerMove(pin, { clientX: 52, clientY: 52, pointerId: 11 });
  fireEvent.pointerUp(pin, { clientX: 52, clientY: 52, pointerId: 11 });
  fireEvent.click(pin);

  await waitFor(() =>
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    }),
  );
  const annotation = resolveAnnotatedFigureModel({
    node: editor.state.doc.firstChild!,
    pos: 0,
  })?.annotations[0];
  expect(editor.state.selection.from).toBeGreaterThan(annotation?.pos ?? 0);
  expect(editor.state.selection.to).toBeLessThan(
    (annotation?.pos ?? 0) + (annotation?.node.nodeSize ?? 0),
  );
  expect(annotation).toMatchObject({ x: 25, y: 30 });
  editor.destroy();
});

it("normalizes an outer caption selection before hiding the List presentation", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Hide this caption" },
    ]),
  );
  const row = (await screen.findByText("Hide this caption")).closest<HTMLElement>(
    '[data-annotation-id="annotation-one"]',
  );
  const figure = editor.state.doc.firstChild;
  const annotation = figure
    ? resolveAnnotatedFigureModel({ node: figure, pos: 0 })?.annotations[0]
    : null;
  if (!row || !annotation) throw new Error("Expected annotation row and model");
  const annotationBeforeDisplayChange = annotation.node.toJSON();
  editor.commands.setTextSelection(annotation.pos + 2);

  setCaptionDisplay(editor, "popover");

  await waitFor(() => {
    const currentFigure = editor.state.doc.firstChild;
    const model = currentFigure
      ? resolveAnnotatedFigureModel({ node: currentFigure, pos: 0 })
      : null;
    const selection = editor.state.selection;
    expect(
      Boolean(
        model &&
        selection.from >= model.legend.pos + 1 &&
        selection.to <= model.legend.pos + model.legend.node.nodeSize - 1,
      ),
    ).toBe(false);
  });
  expect(document.querySelector(".sc-annotated-figure__content")).toHaveAttribute(
    "data-caption-display",
    "popover",
  );
  expect(
    resolveAnnotatedFigureModel({
      node: editor.state.doc.firstChild!,
      pos: 0,
    })?.annotations[0]?.node.toJSON(),
  ).toEqual(annotationBeforeDisplayChange);
  editor.destroy();
});

it("moves a cross-boundary selection out of captions before hiding the List presentation", async () => {
  const editor = renderAnnotatedFigureEditor([
    { type: "paragraph", content: [{ type: "text", text: "Before figure" }] },
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Partially selected caption" },
    ]),
    { type: "paragraph", content: [{ type: "text", text: "After figure" }] },
  ]);
  await screen.findByText("Partially selected caption");
  let figurePos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "annotated_figure") return true;
    figurePos = pos;
    return false;
  });
  if (figurePos === null) throw new Error("Expected Annotated Figure");
  const resolvedFigurePos = figurePos;
  const figure = editor.state.doc.nodeAt(resolvedFigurePos);
  const model = figure
    ? resolveAnnotatedFigureModel({ node: figure, pos: resolvedFigurePos })
    : null;
  const annotation = model?.annotations[0];
  if (!model || !annotation) throw new Error("Expected annotation model");
  editor.commands.setTextSelection({ from: 1, to: annotation.pos + 2 });
  expect(editor.state.selection.from).toBeLessThan(model.legend.pos + 1);
  expect(editor.state.selection.to).toBeGreaterThanOrEqual(model.legend.pos + 1);

  setCaptionDisplay(editor, "popover", resolvedFigurePos);

  await waitFor(() => {
    const currentFigure = editor.state.doc.nodeAt(resolvedFigurePos);
    const currentModel = currentFigure
      ? resolveAnnotatedFigureModel({ node: currentFigure, pos: resolvedFigurePos })
      : null;
    if (!currentModel) throw new Error("Expected current annotation model");
    const selection = editor.state.selection;
    expect(selection.from).toBe(resolvedFigurePos);
    expect(selection.to).toBe(resolvedFigurePos + currentModel.owner.node.nodeSize);
  });
  editor.destroy();
});

it("edits one live caption field, switches targets, resyncs externally, and restores pin focus", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 25, y: 30, caption: "First caption" },
      { id: "annotation-two", x: 65, y: 70, caption: "Second caption" },
    ]),
    { undoRedo: true },
  );
  const firstPin = await screen.findByRole("button", { name: "Edit annotation 1 caption" });
  const secondPin = screen.getByRole("button", { name: "Edit annotation 2 caption" });

  await user.click(firstPin);
  const firstEditor = await screen.findByLabelText("Annotation 1 caption");
  expect(screen.getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);
  expect(firstEditor.textContent).toBe("First caption");

  await user.click(secondPin);
  const secondEditor = await screen.findByLabelText("Annotation 2 caption");
  expect(screen.getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);
  expect(secondEditor.textContent).toBe("Second caption");

  secondEditor.focus();
  await user.keyboard(" updated");
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[1]
        ?.captionNode.textContent,
    ).toBe("Second caption updated");
  });
  expect(editor.commands.undo()).toBe(true);
  await waitFor(() => expect(secondEditor.textContent).toBe("Second caption"));

  const annotation = resolveAnnotatedFigureModel({
    node: editor.state.doc.firstChild!,
    pos: 0,
  })?.annotations[1];
  if (!annotation) throw new Error("Expected second annotation");
  editor.commands.insertContentAt(annotation.pos + 2, "External ");
  await waitFor(() => expect(secondEditor.textContent).toBe("External Second caption"));

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByLabelText("Annotation 2 caption")).toBeNull();
  });
  expect(document.activeElement).toBe(secondPin);
  editor.destroy();
});

it("opens a new empty caption in popover mode and deletes it before restoring canvas focus", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(annotatedFigureFixture(popoverFigureData()));

  const toolbar = await screen.findByRole("toolbar", {
    name: "Annotated figure image tools",
  });
  await user.click(within(toolbar).getByRole("button", { name: "Add annotation" }));
  expect(await screen.findByLabelText("Annotation 1 caption")).toBeInTheDocument();
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
  ).toHaveLength(1);

  fireEvent.click(screen.getByText("Delete annotation 1"));

  await waitFor(() => {
    expect(screen.queryByLabelText("Annotation 1 caption")).toBeNull();
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
    ).toHaveLength(0);
  });
  expect(document.activeElement).toBe(document.querySelector(".sc-annotated-figure__canvas"));
  editor.destroy();
});

it("closes the compact editor on display change, outside press, and target loss", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 25, y: 30, caption: "Disposable caption" },
    ]),
  );
  const pin = await screen.findByRole("button", { name: "Edit annotation 1 caption" });

  await user.click(pin);
  expect(await screen.findByLabelText("Annotation 1 caption")).toBeInTheDocument();
  setCaptionDisplay(editor, "list");
  await waitFor(() => {
    expect(screen.queryByLabelText("Annotation 1 caption")).toBeNull();
  });
  expect(screen.getByText("Disposable caption")).toBeVisible();

  setCaptionDisplay(editor, "popover");
  await user.click(await screen.findByRole("button", { name: "Edit annotation 1 caption" }));
  expect(await screen.findByLabelText("Annotation 1 caption")).toBeInTheDocument();
  await user.click(document.body);
  await waitFor(() => {
    expect(screen.queryByLabelText("Annotation 1 caption")).toBeNull();
  });

  await user.click(await screen.findByRole("button", { name: "Edit annotation 1 caption" }));
  expect(await screen.findByLabelText("Annotation 1 caption")).toBeInTheDocument();
  const annotation = resolveAnnotatedFigureModel({
    node: editor.state.doc.firstChild!,
    pos: 0,
  })?.annotations[0];
  if (!annotation) throw new Error("Expected annotation");
  editor.view.dispatch(
    editor.state.tr.delete(annotation.pos, annotation.pos + annotation.node.nodeSize),
  );
  await waitFor(() => {
    expect(screen.queryByLabelText("Annotation 1 caption")).toBeNull();
    expect(document.activeElement).toBe(document.querySelector(".sc-annotated-figure__canvas"));
  });
  editor.destroy();
});

it("converts an activated popover pin into a drag without opening its caption", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 25, y: 30, caption: "Do not open while dragging" },
    ]),
  );
  const stage = await screen.findByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = screen.getByRole("button", { name: "Edit annotation 1 caption" });
  makePointerCapturable(pin);

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 17 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 17 });
  fireEvent.pointerUp(pin, { clientX: 90, clientY: 80, pointerId: 17 });
  fireEvent.click(pin);

  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
    ).toMatchObject({ x: 45, y: 60 });
  });
  expect(screen.queryByLabelText("Annotation 1 caption")).toBeNull();
  editor.destroy();
});

it("opens one workspace canvas and selected caption field, then restores editor focus on close", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 25, y: 30, caption: "First workspace caption" },
      { id: "annotation-two", x: 65, y: 70, caption: "Second workspace caption" },
    ]),
  );

  await user.click(await screen.findByRole("button", { name: "Edit annotation 2 caption" }));
  expect(await screen.findByLabelText("Annotation 2 caption")).toBeInTheDocument();

  const editTrigger = screen.getByRole("button", {
    name: "Edit annotated figure in expanded workspace",
  });
  await user.click(editTrigger);

  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const captionList = within(dialog).getByRole("region", { name: "Caption management" });
  expect(within(dialog).getAllByRole("group", { name: "Annotated figure image" })).toHaveLength(1);
  expect(document.querySelectorAll(".sc-annotated-figure__stage")).toHaveLength(2);
  expect(editTrigger.isConnected).toBe(true);
  expect(within(captionList).getByText("First workspace caption")).toBeInTheDocument();
  const captionEditor = within(captionList).getByLabelText("Annotation 2 caption");
  expect(captionEditor.textContent).toBe("Second workspace caption");
  expect(captionEditor.classList.contains("sc-rich-text-area")).toBe(true);
  expect(captionEditor.classList.contains("sc-textarea")).toBe(true);
  expect(captionEditor.getAttribute("aria-multiline")).toBe("true");
  expect(within(captionList).getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);
  expect(document.querySelector(".sc-annotated-figure__caption-popover")).toBeNull();

  await user.keyboard("{Escape}");

  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Edit annotated figure" })).toBeNull(),
  );
  const restoredEdit = screen.getByRole("button", {
    name: "Edit annotated figure in expanded workspace",
  });
  expect(screen.queryByLabelText("Annotation 2 caption")).toBeNull();
  expect(restoredEdit).toBe(editTrigger);
  expect(document.activeElement).toBe(editTrigger);
  editor.destroy();
});

it("renders workspace actions as icon-only dialog toolbar chrome", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const toolbar = within(dialog).getByRole("toolbar", { name: "Image tools" });
  const canvas = within(dialog).getByRole("group", { name: "Annotated figure image" });
  const replaceImage = within(toolbar).getByRole("button", {
    name: "Replace annotated figure image",
  });
  const addAnnotation = within(toolbar).getByRole("button", { name: "Add annotation" });

  expect(toolbar.parentElement).toBe(dialog);
  expect(toolbar.previousElementSibling?.tagName).toBe("HEADER");
  expect(toolbar.nextElementSibling?.contains(canvas)).toBe(true);
  expect(replaceImage.textContent).toBe("");
  expect(addAnnotation.textContent).toBe("");
  expect(replaceImage.querySelector("svg")).not.toBeNull();
  expect(addAnnotation.querySelector("svg")).not.toBeNull();
  expect(replaceImage.getAttribute("data-size")).toBe(addAnnotation.getAttribute("data-size"));
  expect(replaceImage.getAttribute("data-variant")).toBe(
    addAnnotation.getAttribute("data-variant"),
  );
  expect(
    within(canvas).queryByRole("button", { name: "Replace annotated figure image" }),
  ).toBeNull();
  editor.destroy();
});

it("opens image replacement from the workspace toolbar", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const toolbar = within(dialog).getByRole("toolbar", { name: "Image tools" });
  await user.click(within(toolbar).getByRole("button", { name: "Replace annotated figure image" }));

  expect(await screen.findByRole("dialog", { name: "Replace image" })).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Replace image" })).toBeNull();
  });
  editor.destroy();
});

it("adds a centred annotation from the workspace toolbar", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor();

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );

  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const toolbar = within(dialog).getByRole("toolbar", { name: "Image tools" });
  await user.click(within(toolbar).getByRole("button", { name: "Add annotation" }));

  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
    ).toMatchObject([{ x: 50, y: 50, number: 1 }]);
  });
  expect(
    within(dialog).getByRole("button", { name: "Select pin for annotation 1 caption" }),
  ).toBeInTheDocument();
  editor.destroy();
});

it("edits a workspace caption and routes undo and redo through outer history", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 10, y: 20, caption: "First managed caption" },
    ]),
    { undoRedo: true },
  );

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const captionList = within(dialog).getByRole("region", { name: "Caption management" });
  const firstEditor = await within(captionList).findByLabelText("Annotation 1 caption");

  await user.click(firstEditor);
  expect(firstEditor).toHaveFocus();
  await user.type(firstEditor, " updated", { skipClick: true });
  expect(firstEditor).toHaveTextContent("First managed caption updated");
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0]
        ?.captionNode.textContent,
    ).toBe("First managed caption updated");
  });

  expect(editor.commands.undo()).toBe(true);
  await waitFor(() => {
    expect(firstEditor).toHaveTextContent("First managed caption");
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0]
        ?.captionNode.textContent,
    ).toBe("First managed caption");
  });

  expect(editor.commands.redo()).toBe(true);
  await waitFor(() => {
    expect(firstEditor).toHaveTextContent("First managed caption updated");
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0]
        ?.captionNode.textContent,
    ).toBe("First managed caption updated");
  });
  editor.destroy();
});

it("switches, resyncs, reorders, and deletes stable workspace caption targets", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 10, y: 20, caption: "First managed caption" },
      { id: "annotation-two", x: 30, y: 40, caption: "Second managed caption" },
      { id: "annotation-three", x: 50, y: 60, caption: "Third managed caption" },
    ]),
  );

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const captionList = within(dialog).getByRole("region", { name: "Caption management" });
  expect(await within(captionList).findByLabelText("Annotation 1 caption")).toHaveTextContent(
    "First managed caption",
  );

  await user.click(
    within(captionList).getByRole("button", { name: "Select annotation 2 caption" }),
  );
  expect(within(captionList).getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);
  const secondEditor = within(captionList).getByLabelText("Annotation 2 caption");
  expect(secondEditor.textContent).toBe("Second managed caption");
  expect(within(captionList).getByText("First managed caption")).toBeInTheDocument();

  const secondAnnotation = resolveAnnotatedFigureModel({
    node: editor.state.doc.firstChild!,
    pos: 0,
  })?.annotations[1];
  if (!secondAnnotation) throw new Error("Expected second workspace annotation");
  editor.commands.insertContentAt(secondAnnotation.pos + 2, "External ");
  await waitFor(() => expect(secondEditor.textContent).toBe("External Second managed caption"));

  await user.click(
    within(captionList).getByRole("button", { name: "Move workspace annotation 2 previous" }),
  );
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations.map(
        ({ id }) => id,
      ),
    ).toEqual(["annotation-two", "annotation-one", "annotation-three"]);
    expect(within(captionList).getByLabelText("Annotation 1 caption").textContent).toBe(
      "External Second managed caption",
    );
  });

  let selectedFieldUnmountedBeforeDelete = false;
  const observeSelectedDelete = () => {
    selectedFieldUnmountedBeforeDelete =
      within(captionList).queryByLabelText("Annotation 1 caption") === null;
  };
  editor.on("transaction", observeSelectedDelete);
  await user.click(
    within(captionList).getByRole("button", { name: "Delete workspace annotation 1" }),
  );
  editor.off("transaction", observeSelectedDelete);
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations.map(
        ({ id }) => id,
      ),
    ).toEqual(["annotation-one", "annotation-three"]);
    expect(within(captionList).getByLabelText("Annotation 1 caption").textContent).toBe(
      "First managed caption",
    );
  });
  expect(selectedFieldUnmountedBeforeDelete).toBe(true);
  expect(within(captionList).getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);

  const externallyDeletedAnnotation = resolveAnnotatedFigureModel({
    node: editor.state.doc.firstChild!,
    pos: 0,
  })?.annotations[0];
  if (!externallyDeletedAnnotation) throw new Error("Expected selected annotation for deletion");
  editor.view.dispatch(
    editor.state.tr.delete(
      externallyDeletedAnnotation.pos,
      externallyDeletedAnnotation.pos + externallyDeletedAnnotation.node.nodeSize,
    ),
  );
  await waitFor(() => {
    expect(within(captionList).getByLabelText("Annotation 1 caption").textContent).toBe(
      "Third managed caption",
    );
  });
  editor.destroy();
});

it("keeps the workspace caption list present in popover mode and selects a newly added row", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(annotatedFigureFixture(popoverFigureData()));

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const captionList = within(dialog).getByRole("region", { name: "Caption management" });
  expect(within(captionList).getByText("No annotations yet")).toBeInTheDocument();
  expect(
    within(captionList).getByText("Add an annotation to create its caption."),
  ).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Add annotation" }));

  expect(await within(captionList).findByLabelText("Annotation 1 caption")).toBeInTheDocument();
  expect(within(captionList).getAllByLabelText(/Annotation \d+ caption/)).toHaveLength(1);
  expect(document.querySelector(".sc-annotated-figure__caption-popover")).toBeNull();
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
  ).toHaveLength(1);
  editor.destroy();
});

it("shares pin drag preview, cancellation, commit, and workspace-close teardown", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Workspace drag caption" },
    ]),
  );

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );
  const dialog = await screen.findByRole("dialog", { name: "Edit annotated figure" });
  const stage = within(dialog).getByRole("group", { name: "Annotated figure image" });
  const canvas = stage.querySelector<HTMLElement>(".sc-annotated-figure__canvas");
  if (!canvas) throw new Error("Expected workspace Annotated Figure canvas.");
  setCanvasRect(canvas);
  const pin = within(dialog).getByRole("button", {
    name: "Select pin for annotation 1 caption",
  });
  makePointerCapturable(pin);
  let transactionCount = 0;
  editor.on("transaction", () => {
    transactionCount += 1;
  });

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 31 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 31 });
  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "45%",
    );
  });
  fireEvent.pointerCancel(pin, { clientX: 90, clientY: 80, pointerId: 31 });
  await waitFor(() => {
    expect(canvas.querySelector<HTMLElement>('[data-pin="annotation-one"]')?.style.left).toBe(
      "25%",
    );
  });
  expect(transactionCount).toBe(0);

  fireEvent.pointerDown(pin, { button: 0, clientX: 50, clientY: 50, pointerId: 32 });
  fireEvent.pointerMove(pin, { clientX: 90, clientY: 80, pointerId: 32 });
  fireEvent.pointerUp(pin, { clientX: 90, clientY: 80, pointerId: 32 });
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
    ).toMatchObject({ x: 45, y: 60 });
  });
  expect(transactionCount).toBe(1);

  fireEvent.pointerDown(pin, { button: 0, clientX: 90, clientY: 80, pointerId: 33 });
  fireEvent.pointerMove(pin, { clientX: 130, clientY: 90, pointerId: 33 });
  await user.click(
    within(dialog).getByRole("button", { name: "Close annotated figure workspace" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Edit annotated figure" })).toBeNull(),
  );
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations[0],
  ).toMatchObject({ x: 45, y: 60 });
  expect(transactionCount).toBe(1);
  editor.destroy();
});

it("fails the open workspace closed when its Annotated Figure owner is removed", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Owner-bound caption" },
    ]),
  );

  await user.click(
    await screen.findByRole("button", {
      name: "Edit annotated figure in expanded workspace",
    }),
  );
  expect(await screen.findByRole("dialog", { name: "Edit annotated figure" })).toBeInTheDocument();
  const figure = editor.state.doc.firstChild;
  if (!figure) throw new Error("Expected Annotated Figure owner");
  editor.view.dispatch(editor.state.tr.delete(0, figure.nodeSize));

  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Edit annotated figure" })).toBeNull();
    expect(screen.queryByLabelText(/Annotation \d+ caption/)).toBeNull();
  });
  editor.destroy();
});

it("reveals a new caption row after keyboard pin creation and undoes the addition", async () => {
  const user = userEvent.setup();
  const scrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView",
  );
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  const editor = renderAnnotatedFigureEditor(annotatedFigureFixture(), { undoRedo: true });

  try {
    const toolbar = await screen.findByRole("toolbar", {
      name: "Annotated figure image tools",
    });
    await user.click(within(toolbar).getByRole("button", { name: "Add annotation" }));
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
    ).toHaveLength(1);
    expect(editor.commands.undo()).toBe(true);
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
    ).toHaveLength(0);
  } finally {
    if (scrollIntoViewDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoViewDescriptor);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
    editor.destroy();
  }
});

it("restores a removed complete annotation with undo", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Restore this caption" },
    ]),
    { undoRedo: true },
  );

  await user.click(await screen.findByRole("button", { name: "Remove annotation 1" }));
  await waitFor(() => {
    expect(
      resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations,
    ).toHaveLength(0);
  });
  expect(editor.commands.undo()).toBe(true);
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations.map(
      ({ id, x, y, captionNode }) => ({ id, x, y, caption: captionNode.textContent }),
    ),
  ).toEqual([{ id: "annotation-one", x: 25, y: 30, caption: "Restore this caption" }]);
  editor.destroy();
});

it("moves a complete annotation with accessible controls and restores the order with undo", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 10, y: 20, caption: "First caption" },
      { id: "annotation-two", x: 30, y: 40, caption: "Second caption" },
      { id: "annotation-three", x: 50, y: 60, caption: "Third caption" },
    ]),
    { undoRedo: true },
  );

  const movePrevious = await screen.findByRole("button", {
    name: "Move annotation 2 previous",
  });
  await user.click(movePrevious);

  await waitFor(() => {
    const model = resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 });
    expect(
      model?.annotations.map(({ id, number, x, y, captionNode }) => ({
        id,
        number,
        x,
        y,
        caption: captionNode.textContent,
      })),
    ).toEqual([
      { id: "annotation-two", number: 1, x: 30, y: 40, caption: "Second caption" },
      { id: "annotation-one", number: 2, x: 10, y: 20, caption: "First caption" },
      { id: "annotation-three", number: 3, x: 50, y: 60, caption: "Third caption" },
    ]);
  });
  expect(
    document.activeElement?.closest("[data-annotation-id]")?.getAttribute("data-annotation-id"),
  ).toBe("annotation-two");

  expect(editor.commands.undo()).toBe(true);
  expect(
    resolveAnnotatedFigureModel({ node: editor.state.doc.firstChild!, pos: 0 })?.annotations.map(
      ({ id, number }) => ({ id, number }),
    ),
  ).toEqual([
    { id: "annotation-one", number: 1 },
    { id: "annotation-two", number: 2 },
    { id: "annotation-three", number: 3 },
  ]);
  editor.destroy();
});

it("keeps annotated figure missing, loading, and error states semantic", () => {
  const { rerender } = render(
    createElement(AnnotatedFigureSurface, {
      data: emptyAnnotatedFigureData(),
      annotations: [],
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("No image");
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add pin" })).toBeNull();

  rerender(
    createElement(AnnotatedFigureSurface, {
      data: emptyAnnotatedFigureData({
        source: {
          mode: "managed",
          mediaId: "annotated-image",
        },
      }),
      annotations: [],
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("status").textContent).toBe("Loading image...");

  rerender(
    createElement(AnnotatedFigureSurface, {
      data: emptyAnnotatedFigureData({
        source: {
          mode: "managed",
          mediaId: "annotated-image",
        },
      }),
      annotations: [],
      errorMessage: "Annotated image unavailable",
      fileUrl: null,
    }),
  );

  expect(screen.getByRole("alert").textContent).toBe("Annotated image unavailable");
});

it("removes complete annotations from a pin", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(
      {
        type: "annotated_figure",
        source: {
          mode: "external",
          src: "https://example.com/figure.jpg",
        },
        alt: "Annotated diagram",
        captionDisplay: "list",
      },
      [{ id: "pin-one", x: 25, y: 30, caption: "First caption" }],
    ),
  );

  fireEvent.click(await screen.findByRole("button", { name: "Remove pin 1" }));

  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "Remove pin 1" })).toBeNull();
  });

  const figure = editor.state.doc.firstChild;
  expect(figure && resolveAnnotatedFigureModel({ node: figure, pos: 0 })?.annotations).toEqual([]);

  editor.destroy();
});

it("does not expose pin controls until an annotated figure image exists", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture({
      type: "annotated_figure",
      source: null,
      alt: "",
      captionDisplay: "list",
    }),
  );

  expect(
    await screen.findByRole("button", {
      name: "Add annotated figure image",
    }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add pin" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Edit annotated figure in expanded workspace" }),
  ).toBeNull();

  editor.destroy();
});

it("removes complete annotations from the caption row", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Caption to remove" },
    ]),
  );

  fireEvent.click(await screen.findByRole("button", { name: "Remove annotation 1" }));

  await waitFor(() => {
    expect(screen.queryByText("Caption to remove")).toBeNull();
  });
  const figure = editor.state.doc.firstChild;
  expect(figure && resolveAnnotatedFigureModel({ node: figure, pos: 0 })?.annotations).toEqual([]);
  editor.destroy();
});

it("keeps annotation captions as editable outer document paragraphs", async () => {
  const editor = renderAnnotatedFigureEditor(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 25, y: 30, caption: "Original caption" },
    ]),
  );
  expect(await screen.findByText("Original caption")).toBeInTheDocument();

  const figure = editor.state.doc.firstChild;
  const annotation = figure
    ? resolveAnnotatedFigureModel({ node: figure, pos: 0 })?.annotations[0]
    : null;
  expect(annotation).toBeDefined();
  editor.commands.insertContentAt((annotation?.pos ?? 0) + 2, "Edited ");
  expect(editor.state.doc.textContent).toContain("Edited Original caption");
  editor.destroy();
});

it("renders the same ordered annotations without authoring controls at runtime", async () => {
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 20, y: 30, caption: "First caption" },
      { id: "annotation-two", x: 70, y: 80, caption: "Second caption" },
    ]),
  );

  expect(await screen.findByRole("img", { name: "Annotated diagram" })).toBeInTheDocument();
  expect(screen.getByText("First caption")).toBeInTheDocument();
  expect(screen.getByText("Second caption")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Expand annotated figure" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add pin" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Replace annotated figure image" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
  editor.destroy();
});

it("renders List presentation as one visible semantic ordered caption tray", async () => {
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 20, y: 30, caption: "First caption" },
      { id: "annotation-two", x: 70, y: 80, caption: "Second caption" },
    ]),
  );

  const list = await screen.findByRole("list", { name: "Annotations" });
  const captions = within(list)
    .getAllByRole("listitem")
    .map((item) => item.querySelector(".sc-annotated-figure__annotation-caption")?.textContent);

  expect(list.tagName).toBe("OL");
  expect(list.getAttribute("data-visual")).toBe("true");
  expect(list.classList.contains("sc-annotated-figure__legend")).toBe(true);
  expect(captions).toEqual(["First caption", "Second caption"]);
  expect(screen.queryByRole("button", { name: /View annotation/ })).toBeNull();
  editor.destroy();
});

it("keeps empty Popover captions noninteractive and retains an ordered semantic fallback", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 20, y: 30, caption: "Readable caption" },
      { id: "annotation-empty", x: 70, y: 80 },
    ]),
  );

  const fallback = await screen.findByRole("list", { name: "Annotations" });
  const captionPin = screen.getByRole("button", { name: "View annotation 1" });
  const emptyPin = document.querySelector('[data-pin="annotation-empty"]');

  expect(fallback.getAttribute("data-visual")).toBe("false");
  expect(fallback.classList.contains("sc-sr-only")).toBe(true);
  expect(fallback.classList.contains("sc-annotated-figure__legend")).toBe(false);
  expect(within(fallback).getAllByRole("listitem")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "View annotation 2" })).toBeNull();
  expect(emptyPin?.querySelector("button")).toBeNull();
  expect(emptyPin?.querySelector(".sc-annotated-figure__pin-number")?.textContent).toBe("2");

  await user.click(captionPin);
  await waitFor(() => {
    expect(document.querySelector(".sc-annotated-figure__caption-popover")).not.toBeNull();
  });
  const popover = document.querySelector<HTMLElement>(".sc-annotated-figure__caption-popover");
  if (!popover) throw new Error("Expected a runtime caption popover");
  expect(popover.querySelector('[data-tone="neutral"]')).not.toBeNull();
  expect(within(popover).getByText("Readable caption")).toBeInTheDocument();

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(document.querySelector(".sc-annotated-figure__caption-popover")).toBeNull();
    expect(document.activeElement).toBe(captionPin);
  });
  editor.destroy();
});

it("projects rich runtime captions without mounting authoring editor DOM", async () => {
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(undefined, [
      {
        id: "annotation-rich",
        x: 50,
        y: 50,
        captionContent: [
          { type: "text", text: "Underlined", marks: [{ type: "underline" }] },
          { type: "hardBreak" },
          {
            type: "text",
            text: "Course link",
            marks: [{ type: "link", attrs: { href: "/course" } }],
          },
          { type: "inlineMath", attrs: { latex: "x^2" } },
          {
            type: "vocabTerm",
            attrs: { term: "schema", definition: "A structural content contract." },
          },
        ],
      },
    ]),
  );

  const underlined = await screen.findByText("Underlined");
  const link = screen.getByRole("link", { name: "Course link" });
  const term = screen.getByText("schema");

  expect(underlined.tagName).toBe("U");
  expect(underlined.parentElement?.querySelector("br")).not.toBeNull();
  expect(link.getAttribute("href")).toBe("/course");
  expect(document.querySelector('[data-type="inline-math"]')).not.toBeNull();
  expect(term.getAttribute("data-vocab-definition")).toBe("A structural content contract.");
  expect(document.querySelector("[data-scaffold-nested-rich-text-editor-field]")).toBeNull();
  expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  editor.destroy();
});

it("keeps inline and Lightbox Popover state independent with child-first focus restoration", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(popoverFigureData(), [
      { id: "annotation-one", x: 50, y: 50, caption: "Expanded caption" },
    ]),
  );

  const inlinePin = await screen.findByRole("button", { name: "View annotation 1" });
  const expandButton = screen.getByRole("button", { name: "Expand annotated figure" });
  await user.click(expandButton);

  const dialog = await screen.findByRole("dialog", { name: "Annotated figure viewer" });
  const composition = dialog.querySelector(
    '.sc-annotated-figure__runtime-lightbox-composition[data-caption-display="popover"]',
  );
  const expandedStage = within(dialog).getByRole("group", { name: "Annotated figure image" });
  const expandedPin = within(dialog).getByRole("button", { name: "View annotation 1" });
  const fallback = within(dialog).getByRole("list", { name: "Annotations", hidden: true });

  expect(composition).not.toBeNull();
  expect(expandedStage.getAttribute("data-presentation")).toBe("lightbox");
  expect(fallback.getAttribute("data-visual")).toBe("false");
  expect(inlinePin.getAttribute("aria-expanded")).toBe("false");

  await user.click(expandedPin);
  await waitFor(() => {
    expect(dialog.querySelector(".sc-annotated-figure__caption-popover")).not.toBeNull();
  });
  expect(expandedPin.getAttribute("aria-expanded")).toBe("true");
  expect(inlinePin.getAttribute("aria-expanded")).toBe("false");

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(dialog.querySelector(".sc-annotated-figure__caption-popover")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Annotated figure viewer" })).toBe(dialog);
    expect(document.activeElement).toBe(expandedPin);
  });

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Annotated figure viewer" })).toBeNull();
    expect(document.activeElement).toBe(expandButton);
  });
  editor.destroy();
});

it("uses the saved List presentation inside the custom Lightbox composition", async () => {
  const user = userEvent.setup();
  const editor = renderAnnotatedFigureRuntime(
    annotatedFigureFixture(undefined, [
      { id: "annotation-one", x: 20, y: 30, caption: "First expanded caption" },
      { id: "annotation-two", x: 70, y: 80, caption: "Second expanded caption" },
    ]),
  );
  const expandButton = await screen.findByRole("button", { name: "Expand annotated figure" });

  await user.click(expandButton);
  const dialog = await screen.findByRole("dialog", { name: "Annotated figure viewer" });
  const list = within(dialog).getByRole("list", { name: "Annotations" });

  expect(
    dialog.querySelector(
      '.sc-annotated-figure__runtime-lightbox-composition[data-caption-display="list"]',
    ),
  ).not.toBeNull();
  expect(list.getAttribute("data-visual")).toBe("true");
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  expect(within(dialog).queryByRole("button", { name: /View annotation/ })).toBeNull();

  await user.keyboard("{Escape}");
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: "Annotated figure viewer" })).toBeNull();
    expect(document.activeElement).toBe(expandButton);
  });
  editor.destroy();
});

function popoverFigureData(): Record<string, unknown> {
  return {
    type: "annotated_figure",
    source: {
      mode: "external",
      src: "https://example.com/figure.jpg",
    },
    alt: "Annotated diagram",
    captionDisplay: "popover",
  };
}

function setCaptionDisplay(
  editor: Editor,
  captionDisplay: "list" | "popover",
  figurePos = 0,
): void {
  const figure = editor.state.doc.nodeAt(figurePos);
  if (!figure) throw new Error("Expected Annotated Figure");
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(figurePos, undefined, {
      ...figure.attrs,
      data: { ...figure.attrs["data"], captionDisplay },
    }),
  );
}
