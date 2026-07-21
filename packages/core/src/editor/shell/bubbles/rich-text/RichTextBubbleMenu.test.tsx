// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { AllSelection, NodeSelection } from "@tiptap/pm/state";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TextAlign from "@tiptap/extension-text-align";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { setIconCatalogForTests, type IconCatalog } from "@/ui/icons/catalog";
import { InlineIconAuthoringNode } from "@/editor/rich-text/inline-icon/authoring/InlineIconAuthoringNode";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { VocabularyTermAuthoringNode } from "@/editor/rich-text/vocabulary-term/authoring/VocabularyTermAuthoringNode";
import { setEditorResizeGestureActive } from "@/editor/interactions/gesture/editor-resize-gesture";

import { RichTextBubbleMenu, RichTextBubbleSurface } from "./RichTextBubbleMenu";
import { shouldShowRichTextBubbleMenu } from "./rich-text-bubble-state";

let editor: Editor | null = null;

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
    DOMRect.fromRect({
      height: 32,
      width: 96,
      x: 48,
      y: 48,
    }),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
    function mockClientRects(this: Element) {
      return [this.getBoundingClientRect()] as unknown as DOMRectList;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    function clientWidth(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 1024 : 96;
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
    function clientHeight(this: HTMLElement) {
      return this === document.documentElement || this === document.body ? 768 : 32;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function scrollWidth(this: HTMLElement) {
      return this.clientWidth;
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
    function scrollHeight(this: HTMLElement) {
      return this.clientHeight;
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  setIconCatalogForTests(null);
  editor?.destroy();
  editor = null;
});

const testIconCatalog: IconCatalog = {
  icons: {
    icons: {
      university: [["path", { d: "M2 20h20" }]],
    },
    categories: {
      buildings: {
        title: "Buildings",
        icon: "university",
        icons: ["university"],
      },
    },
  },
  emojis: { groups: [] },
};

function makeEditor(options: { editable?: boolean } = {}) {
  editor = new Editor({
    editable: options.editable ?? true,
    extensions: [
      StarterKit.configure({ link: false, underline: false }),
      TextStyle,
      Color.configure({ types: [TextStyle.name] }),
      FontSize.configure({ types: [TextStyle.name] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      MathInlineNode,
      InlineIconAuthoringNode,
      VocabularyTermAuthoringNode,
    ],
    content: "<p>Plain text</p>",
  });
  return editor;
}

function makeBasicEditor() {
  editor = new Editor({
    extensions: [StarterKit.configure({ link: false, underline: false })],
    content: "<p>Plain text</p>",
  });
  return editor;
}

function selectText(currentEditor: Editor, text: string) {
  let from: number | null = null;

  currentEditor.state.doc.descendants((node, pos) => {
    if (from !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    from = pos + index;
    return false;
  });

  if (from === null) throw new Error(`Text not found: ${text}`);
  currentEditor.commands.setTextSelection({ from, to: from + text.length });
}

function selectNodeByType(currentEditor: Editor, typeName: string) {
  let targetPos: number | null = null;

  currentEditor.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false;
    if (node.type.name === typeName) {
      targetPos = pos;
      return false;
    }
    return true;
  });

  if (targetPos === null) throw new Error(`Node not found: ${typeName}`);
  currentEditor.view.dispatch(
    currentEditor.state.tr.setSelection(NodeSelection.create(currentEditor.state.doc, targetPos)),
  );
}

function shouldShow(currentEditor: Editor) {
  return shouldShowRichTextBubbleMenu({
    editor: currentEditor,
    state: currentEditor.state,
  });
}

describe("RichTextBubbleMenu visibility", () => {
  it("appends the Tiptap bubble to the nearest ready authoring host", async () => {
    const currentEditor = makeEditor();
    const editorParent = document.createElement("div");
    const boundaryRoot = document.createElement("div");
    editorParent.append(currentEditor.view.dom);
    document.body.append(editorParent, boundaryRoot);
    currentEditor.view.focus();
    selectText(currentEditor, "Plain");

    render(
      <OverlayBoundary container={boundaryRoot} kind="contained">
        <RichTextBubbleMenu editor={currentEditor} pluginKey="testRichTextBoundaryBubble" />
      </OverlayBoundary>,
    );

    await waitFor(() => {
      const host = boundaryRoot.querySelector("[data-scaffold-overlay-host]");
      const bubble = boundaryRoot.querySelector("[data-rich-text-bubble]");
      expect(host).not.toBeNull();
      expect(bubble?.closest("[data-scaffold-overlay-host]")).toBe(host);
      expect(
        bubble
          ?.closest("[data-scaffold-bubble-placement-ready]")
          ?.getAttribute("data-scaffold-bubble-placement-ready"),
      ).toBe("true");
    });
  });

  it("does not register a Tiptap bubble while its authoring boundary is pending", () => {
    const currentEditor = makeEditor();
    const initialPluginCount = currentEditor.state.plugins.length;

    render(
      <OverlayBoundary container={null} kind="contained">
        <RichTextBubbleMenu editor={currentEditor} pluginKey="testPendingRichTextBubble" />
      </OverlayBoundary>,
    );

    expect(currentEditor.state.plugins).toHaveLength(initialPluginCount);
  });

  it("shows for a non-empty ProseMirror text selection", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    expect(shouldShow(currentEditor)).toBe(true);
  });

  it("hides for an empty text selection", () => {
    const currentEditor = makeEditor();
    currentEditor.commands.setTextSelection(2);

    expect(shouldShow(currentEditor)).toBe(false);
  });

  it("hides for node and all selections", () => {
    const currentEditor = makeEditor();

    currentEditor.view.dispatch(
      currentEditor.state.tr.setSelection(NodeSelection.create(currentEditor.state.doc, 0)),
    );
    expect(shouldShow(currentEditor)).toBe(false);

    currentEditor.view.dispatch(
      currentEditor.state.tr.setSelection(new AllSelection(currentEditor.state.doc)),
    );
    expect(shouldShow(currentEditor)).toBe(false);
  });

  it("shows for selected editable inline atom nodes", () => {
    const currentEditor = makeEditor();

    currentEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "vocabTerm",
              attrs: {
                term: "Plain",
                definition: "Ordinary text.",
              },
            },
          ],
        },
      ],
    });
    selectNodeByType(currentEditor, "vocabTerm");
    expect(shouldShow(currentEditor)).toBe(true);

    currentEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "inlineIcon",
              attrs: {
                size: "sm",
                value: { kind: "catalog", name: "university" },
              },
            },
          ],
        },
      ],
    });
    selectNodeByType(currentEditor, "inlineIcon");
    expect(shouldShow(currentEditor)).toBe(true);
  });

  it("hides for read-only editors", () => {
    const currentEditor = makeEditor({ editable: false });
    selectText(currentEditor, "Plain");

    expect(shouldShow(currentEditor)).toBe(false);
  });

  it("hides while a resize gesture is active", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    setEditorResizeGestureActive(currentEditor, true);
    expect(shouldShow(currentEditor)).toBe(false);

    setEditorResizeGestureActive(currentEditor, false);
    expect(shouldShow(currentEditor)).toBe(true);
  });
});

describe("RichTextBubbleSurface", () => {
  it("marks the bubble as preserved authoring chrome", () => {
    const currentEditor = makeEditor();
    render(<RichTextBubbleSurface editor={currentEditor} />);

    const bubble = screen.getByRole("toolbar", { name: "Text formatting" });

    expect(bubble?.getAttribute("contenteditable")).toBe("false");
    expect(bubble?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(bubble?.getAttribute("data-authoring-chrome")).toBe("bubble");
    expect(bubble?.hasAttribute("data-rich-text-bubble")).toBe(true);
    expect(bubble?.parentElement?.hasAttribute("data-scaffold-bubble-toolbar-frame")).toBe(true);
  });

  it("moves focus through toolbar controls with arrow, home, and end keys", () => {
    const currentEditor = makeEditor();
    render(<RichTextBubbleSurface editor={currentEditor} />);

    const toolbar = screen.getByRole("toolbar", { name: "Text formatting" });
    const buttons = within(toolbar).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(1);
    const revealSecondButton = vi.fn();
    buttons[1]!.scrollIntoView = revealSecondButton;
    Object.defineProperties(toolbar, {
      clientLeft: { configurable: true, value: 0 },
      clientWidth: { configurable: true, value: 160 },
      scrollLeft: { configurable: true, value: 0, writable: true },
    });
    toolbar.getBoundingClientRect = () => new DOMRect(100, 20, 160, 40);
    buttons[1]!.getBoundingClientRect = () => new DOMRect(240, 20, 48, 32);

    buttons[0]!.focus();
    fireEvent.keyDown(buttons[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[1]);
    expect(toolbar.scrollLeft).toBe(28);
    expect(revealSecondButton).not.toHaveBeenCalled();

    fireEvent.keyDown(buttons[1]!, { key: "End" });
    expect(document.activeElement).toBe(buttons.at(-1));

    fireEvent.keyDown(buttons.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(buttons[0]);

    fireEvent.keyDown(buttons[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons.at(-1));
  });

  it("skips disabled toolbar controls during arrow navigation", () => {
    const currentEditor = makeBasicEditor();
    render(<RichTextBubbleSurface editor={currentEditor} />);

    const toolbar = screen.getByRole("toolbar", { name: "Text formatting" });
    const bold = within(toolbar).getByRole("button", { name: "Bold" });
    const italic = within(toolbar).getByRole("button", { name: "Italic" });
    const underline = within(toolbar).getByRole("button", {
      name: "Underline",
    });
    const strike = within(toolbar).getByRole("button", {
      name: "Strikethrough",
    });
    expect(underline).toHaveProperty("disabled", true);

    bold.focus();
    fireEvent.keyDown(bold, { key: "ArrowRight" });
    expect(document.activeElement).toBe(italic);

    fireEvent.keyDown(italic, { key: "ArrowRight" });
    expect(document.activeElement).toBe(strike);
  });

  it("prevents mouse down from moving the editor text selection", () => {
    const currentEditor = makeEditor();
    render(<RichTextBubbleSurface editor={currentEditor} />);

    const bubble = screen.getByRole("button", { name: "Bold" }).closest("[data-rich-text-bubble]");
    if (!bubble) throw new Error("Expected rich text bubble");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    bubble.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("renders core inline mark controls from the shared command helpers", () => {
    const currentEditor = makeEditor();

    render(<RichTextBubbleSurface editor={currentEditor} />);

    for (const label of [
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Subscript",
      "Superscript",
      "Inline math",
      "Icon",
      "Vocabulary term",
      "Link",
      "Font size",
      "Text colour",
      "Highlight",
      "Text alignment",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("routes editor child popovers through the editor floating popover wrapper", async () => {
    const editorFloatingPopoverMock = {
      contentProps: [] as Array<Record<string, unknown>>,
    };

    vi.resetModules();
    vi.doMock("@/editor/interactions/floating/EditorFloatingPopover", async (importOriginal) => {
      const React = await import("react");
      const actual =
        await importOriginal<
          typeof import("@/editor/interactions/floating/EditorFloatingPopover")
        >();

      const Passthrough = ({ children }: { children?: React.ReactNode }) =>
        React.createElement(React.Fragment, null, children);
      const Content = React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
        function MockEditorFloatingPopoverContent({ children, ...props }, ref) {
          const contentProps = props as Record<string, unknown>;
          editorFloatingPopoverMock.contentProps.push(contentProps);
          return React.createElement(
            "div",
            {
              ref,
              "aria-label": contentProps["aria-label"] as string | undefined,
              role: "dialog",
            },
            children,
          );
        },
      );

      return {
        ...actual,
        EditorFloatingPopover: {
          ...actual.EditorFloatingPopover,
          Content,
          Portal: Passthrough,
          Root: Passthrough,
          Trigger: Passthrough,
        },
      };
    });

    try {
      const { RichTextBubbleSurface: MockedRichTextBubbleSurface } =
        await import("./RichTextBubbleMenu");
      const currentEditor = makeEditor();
      selectText(currentEditor, "Plain");

      render(<MockedRichTextBubbleSurface editor={currentEditor} />);

      const labels = editorFloatingPopoverMock.contentProps.map((props) => props["aria-label"]);
      expect(labels).toEqual(
        expect.arrayContaining([
          "Font size",
          "Text colour",
          "Highlight",
          "Text alignment",
          "Vocabulary term",
          "Link settings",
        ]),
      );

      for (const label of [
        "Font size",
        "Text colour",
        "Highlight",
        "Text alignment",
        "Vocabulary term",
        "Link settings",
      ]) {
        expect(editorFloatingPopoverMock.contentProps).toContainEqual(
          expect.objectContaining({
            "aria-label": label,
            align: "center",
            authoringChrome: true,
            collisionPadding: 12,
            side: "top",
            sideOffset: 12,
          }),
        );
      }
    } finally {
      vi.doUnmock("@/editor/interactions/floating/EditorFloatingPopover");
      vi.resetModules();
    }
  });

  it("applies core inline mark controls to the selected text", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(currentEditor.getHTML()).toContain("<strong>Plain</strong>");

    fireEvent.click(screen.getByRole("button", { name: "Underline" }));
    expect(currentEditor.getHTML()).toContain("<u>");

    fireEvent.click(screen.getByRole("button", { name: "Subscript" }));
    expect(currentEditor.getHTML()).toContain("<sub>");

    fireEvent.click(screen.getByRole("button", { name: "Subscript" }));
    fireEvent.click(screen.getByRole("button", { name: "Superscript" }));
    expect(currentEditor.getHTML()).toContain("<sup>");
  });

  it("applies inline math and vocabulary terms through the rich text bubble", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const inlineMathButton = screen.getByRole("button", {
      name: "Inline math",
    });
    expect(inlineMathButton.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(inlineMathButton);
    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: "inlineMath",
                attrs: expect.objectContaining({ latex: "Plain" }),
              }),
              expect.objectContaining({ text: " text" }),
            ],
          }),
        ],
      }),
    );
    expect(currentEditor.state.selection).toBeInstanceOf(NodeSelection);
    if (currentEditor.state.selection instanceof NodeSelection) {
      expect(currentEditor.state.selection.node.type.name).toBe("inlineMath");
    }

    currentEditor.commands.setContent("<p>Plain text</p>");
    selectText(currentEditor, "Plain");

    fireEvent.click(screen.getByRole("button", { name: "Vocabulary term" }));
    const termInput = await screen.findByLabelText("Term");
    expect((termInput as HTMLInputElement).value).toBe("Plain");

    fireEvent.change(screen.getByLabelText("Definition"), {
      target: { value: "Ordinary text inside a course document." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save term" }));

    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: "vocabTerm",
                attrs: {
                  term: "Plain",
                  definition: "Ordinary text inside a course document.",
                },
              }),
              expect.objectContaining({ text: " text" }),
            ],
          }),
        ],
      }),
    );
  });

  it("inserts inline icons through the rich text bubble", async () => {
    setIconCatalogForTests(testIconCatalog);
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const iconTrigger = screen.getByRole("button", { name: "Icon" });
    fireEvent.mouseDown(iconTrigger);
    fireEvent.click(iconTrigger);

    fireEvent.click(await screen.findByRole("button", { name: "Select University icon" }));

    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: "inlineIcon",
                attrs: {
                  size: "sm",
                  value: { kind: "catalog", name: "university" },
                },
              }),
              expect.objectContaining({ text: " text" }),
            ],
          }),
        ],
      }),
    );
  });

  it("changes the selected inline icon size through the rich text bubble", async () => {
    setIconCatalogForTests(testIconCatalog);
    const currentEditor = makeEditor();
    currentEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "inlineIcon",
              attrs: {
                size: "sm",
                value: { kind: "catalog", name: "university" },
              },
            },
            { type: "text", text: " text" },
          ],
        },
      ],
    });
    selectNodeByType(currentEditor, "inlineIcon");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    expect(screen.getByRole("group", { name: "Icon size" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Small icon" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Large icon" }));

    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: "inlineIcon",
                attrs: {
                  size: "lg",
                  value: { kind: "catalog", name: "university" },
                },
              }),
              expect.objectContaining({ text: " text" }),
            ],
          }),
        ],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Large icon" }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
  });

  it("opens vocabulary term as a labelled dialog with term focus and focus return", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const vocabularyTrigger = screen.getByRole("button", {
      name: "Vocabulary term",
    });
    expect(vocabularyTrigger.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(vocabularyTrigger);

    expect(await screen.findByRole("dialog", { name: "Vocabulary term" })).toBeInTheDocument();
    const termInput = screen.getByRole("textbox", { name: "Term" });
    expect((termInput as HTMLInputElement).value).toBe("Plain");
    expect(document.activeElement).toBe(termInput);
    const definitionInput = screen.getByRole("textbox", {
      name: "Definition",
    });
    const definitionMouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(definitionInput, definitionMouseDown);
    expect(definitionMouseDown.defaultPrevented).toBe(false);
    expect(definitionInput.getAttribute("aria-describedby")).toBe(
      "scaffold-rich-text-vocabulary-definition-count",
    );
    expect(
      document.getElementById("scaffold-rich-text-vocabulary-definition-count")?.textContent,
    ).toBe("240");
    const saveButton = screen.getByRole("button", { name: "Save term" });
    expect(saveButton.getAttribute("aria-describedby")).toBe(
      "scaffold-rich-text-vocabulary-submit-hint",
    );
    expect(document.getElementById("scaffold-rich-text-vocabulary-submit-hint")?.textContent).toBe(
      "Press Enter to save",
    );
    expect(saveButton).toHaveProperty("disabled", true);

    fireEvent.change(definitionInput, {
      target: { value: "Short definition." },
    });
    expect(
      document.getElementById("scaffold-rich-text-vocabulary-definition-count")?.textContent,
    ).toBe("223");
    expect(saveButton).toHaveProperty("disabled", false);

    fireEvent.keyDown(termInput, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Vocabulary term" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(vocabularyTrigger);
    });
  });

  it("edits and removes a selected vocabulary term through the rich text bubble", async () => {
    const currentEditor = makeEditor();
    currentEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "vocabTerm",
              attrs: {
                term: "Plain",
                definition: "Original definition.",
              },
            },
            { type: "text", text: " text" },
          ],
        },
      ],
    });
    selectNodeByType(currentEditor, "vocabTerm");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Vocabulary term" }));
    const termInput = await screen.findByRole("textbox", { name: "Term" });
    const definitionInput = screen.getByRole("textbox", {
      name: "Definition",
    });
    expect((termInput as HTMLInputElement).value).toBe("Plain");
    expect((definitionInput as HTMLTextAreaElement).value).toBe("Original definition.");

    fireEvent.change(definitionInput, {
      target: { value: "Updated definition." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save term" }));

    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: "vocabTerm",
                attrs: {
                  term: "Plain",
                  definition: "Updated definition.",
                },
              }),
              expect.objectContaining({ text: " text" }),
            ],
          }),
        ],
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Vocabulary term" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Remove vocabulary term",
      }),
    );

    expect(currentEditor.getJSON()).toEqual(
      expect.objectContaining({
        content: [
          expect.objectContaining({
            content: [expect.objectContaining({ text: "Plain text" })],
          }),
        ],
      }),
    );
  });

  it("disables vocabulary terms where the selection cannot contain a vocab node", () => {
    const currentEditor = makeEditor();
    currentEditor.commands.setContent("<pre><code>Plain text</code></pre>");
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    expect(screen.getByRole("button", { name: "Vocabulary term" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("applies and removes link marks through the rich text bubble", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.change(await screen.findByLabelText("URL"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply link" }));

    expect(currentEditor.getHTML()).toContain('href="https://example.com"');

    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove link" }));

    expect(currentEditor.getHTML()).not.toContain('href="https://example.com"');
  });

  it("opens the link popover as a labelled dialog with URL focus and focus return", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const linkTrigger = screen.getByRole("button", { name: "Link" });
    fireEvent.click(linkTrigger);

    expect(await screen.findByRole("dialog", { name: "Link settings" })).toBeInTheDocument();
    const urlInput = screen.getByRole("textbox", { name: "URL" });
    expect(document.activeElement).toBe(urlInput);
    expect(urlInput.getAttribute("aria-describedby")).toBe("scaffold-rich-text-link-input-hint");
    expect(document.getElementById("scaffold-rich-text-link-input-hint")?.textContent).toBe(
      "Press Enter to apply",
    );

    fireEvent.keyDown(urlInput, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Link settings" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(linkTrigger);
    });
  });

  it("applies author-facing style choices through the rich text bubble", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Font size" }));
    // Wheel options carry "{n} pixels" aria-labels for assistive tech.
    fireEvent.click(screen.getByRole("option", { name: "18 pixels" }));
    expect(currentEditor.getHTML()).toContain("font-size: 18px");

    fireEvent.click(screen.getByRole("button", { name: "Text colour" }));
    fireEvent.click(screen.getByLabelText("Navy text"));
    expect(currentEditor.getHTML()).toContain("color: #161D77");

    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));
    // Both text-colour and highlight palettes now include Yellow —
    // scope to the highlight group so we don't match the text-colour
    // swatch left visible by the previous open popover.
    const highlightGroup = screen.getByRole("group", {
      name: "Highlight colours",
    });
    fireEvent.click(within(highlightGroup).getByRole("button", { name: "Yellow highlight" }));
    // Highlight palette anchored to Notion's reference hex values.
    expect(currentEditor.getHTML()).toContain("background-color: #FBF3DB");
  });

  it("applies text alignment through the rich text bubble", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Text alignment" }));
    fireEvent.click(screen.getByRole("button", { name: "Align center" }));
    expect(currentEditor.getHTML()).toContain("text-align: center");

    fireEvent.click(screen.getByRole("button", { name: "Text alignment" }));
    fireEvent.click(screen.getByRole("button", { name: "Justify" }));
    expect(currentEditor.getHTML()).toContain("text-align: justify");
  });

  it("does not autofocus style popover options when opened", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");
    currentEditor.view.dom.focus();

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Font size" }));

    // The first preset chip ("12") stands in for the prior "Default"
    // probe — any popover-internal control should not steal focus.
    const previewButton = await screen.findByRole("option", {
      name: "12 pixels",
    });
    expect(previewButton).toBeInTheDocument();
    expect(document.activeElement).not.toBe(previewButton);
  });

  it("opens font size as a labelled dialog with labelled presets and focus return", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const fontSizeTrigger = screen.getByRole("button", { name: "Font size" });
    expect(fontSizeTrigger.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(fontSizeTrigger);

    expect(await screen.findByRole("dialog", { name: "Font size" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Font size presets" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Font size" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "Font size" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(fontSizeTrigger);
    });
  });

  it("moves focus through font size presets with arrow, home, and end keys", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Font size" }));

    const presetList = await screen.findByRole("listbox", {
      name: "Font size presets",
    });
    const options = within(presetList).getAllByRole("option");
    expect(options.length).toBeGreaterThan(1);

    options[0]!.focus();
    fireEvent.keyDown(options[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(options[1]!, { key: "End" });
    expect(document.activeElement).toBe(options.at(-1));

    fireEvent.keyDown(options.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(options[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(options.at(-1));
  });

  it("opens text colour as a labelled dialog with named swatches and focus return", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const textColourTrigger = screen.getByRole("button", {
      name: "Text colour",
    });
    expect(textColourTrigger.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(textColourTrigger);

    expect(await screen.findByRole("dialog", { name: "Text colour" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Quick colours" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Navy text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use default text colour" })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Text colour" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "Text colour" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(textColourTrigger);
    });
  });

  it("moves focus through text colour swatches with arrow, home, and end keys", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Text colour" }));

    const quickColours = await screen.findByRole("group", {
      name: "Quick colours",
    });
    const swatches = within(quickColours).getAllByRole("button");
    expect(swatches.length).toBeGreaterThan(1);

    swatches[0]!.focus();
    fireEvent.keyDown(swatches[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(swatches[1]);

    fireEvent.keyDown(swatches[1]!, { key: "End" });
    expect(document.activeElement).toBe(swatches.at(-1));

    fireEvent.keyDown(swatches.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(swatches[0]);

    fireEvent.keyDown(swatches[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(swatches.at(-1));
  });

  it("describes the custom text colour hex field", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Text colour" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Custom colour",
      }),
    );

    const hexField = screen.getByRole("textbox", { name: "Hex" });
    const describedBy = hexField.getAttribute("aria-describedby");
    expect(describedBy).toMatch(/\S/);
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Enter a hex colour, for example #161D77.",
    );
  });

  it("opens highlight as a labelled dialog with named swatches and focus return", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const highlightTrigger = screen.getByRole("button", {
      name: "Highlight",
    });
    expect(highlightTrigger.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(highlightTrigger);

    expect(await screen.findByRole("dialog", { name: "Highlight" })).toBeInTheDocument();
    const highlightGroup = screen.getByRole("group", {
      name: "Highlight colours",
    });
    expect(
      within(highlightGroup).getByRole("button", { name: "Yellow highlight" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove highlight" })).toBeInTheDocument();

    fireEvent.click(within(highlightGroup).getByRole("button", { name: "Yellow highlight" }));
    expect(
      within(highlightGroup)
        .getByRole("button", { name: "Yellow highlight" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Highlight" }), {
      key: "Escape",
    });

    expect(screen.queryByRole("dialog", { name: "Highlight" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(highlightTrigger);
    });
  });

  it("moves focus through highlight swatches with arrow, home, and end keys", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Highlight" }));

    const highlightGroup = await screen.findByRole("group", {
      name: "Highlight colours",
    });
    const swatches = within(highlightGroup).getAllByRole("button");
    expect(swatches.length).toBeGreaterThan(1);

    swatches[0]!.focus();
    fireEvent.keyDown(swatches[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(swatches[1]);

    fireEvent.keyDown(swatches[1]!, { key: "End" });
    expect(document.activeElement).toBe(swatches.at(-1));

    fireEvent.keyDown(swatches.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(swatches[0]);

    fireEvent.keyDown(swatches[0]!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(swatches.at(-1));
  });

  it("opens text alignment as a labelled dialog and keeps pressed state on options", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    const alignmentTrigger = screen.getByRole("button", {
      name: "Text alignment",
    });
    expect(alignmentTrigger.hasAttribute("aria-pressed")).toBe(false);

    fireEvent.click(alignmentTrigger);

    expect(await screen.findByRole("dialog", { name: "Text alignment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align left" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "Align center" }));

    expect(currentEditor.getHTML()).toContain("text-align: center");
    expect(screen.queryByRole("dialog", { name: "Text alignment" })).toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(alignmentTrigger);
    });
  });

  it("moves focus through text alignment options with arrow, home, and end keys", async () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    render(<RichTextBubbleSurface editor={currentEditor} />);

    fireEvent.click(screen.getByRole("button", { name: "Text alignment" }));

    const alignmentDialog = await screen.findByRole("dialog", {
      name: "Text alignment",
    });
    const options = [
      within(alignmentDialog).getByRole("button", { name: "Align left" }),
      within(alignmentDialog).getByRole("button", { name: "Align center" }),
      within(alignmentDialog).getByRole("button", { name: "Align right" }),
      within(alignmentDialog).getByRole("button", { name: "Justify" }),
    ];

    options[0]!.focus();
    fireEvent.keyDown(options[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(options[1]);

    fireEvent.keyDown(options[1]!, { key: "End" });
    expect(document.activeElement).toBe(options.at(-1));

    fireEvent.keyDown(options.at(-1)!, { key: "Home" });
    expect(document.activeElement).toBe(options[0]);

    fireEvent.keyDown(options[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(options.at(-1));
  });
});
