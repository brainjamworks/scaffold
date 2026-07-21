// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";

import { NestedRichTextBubbleMenuHost } from "./NestedRichTextBubbleMenuHost";

const richTextBubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");

  return {
    RichTextBubbleMenu({ appendTo, editor, pluginKey }: RichTextBubbleMenuProps) {
      const appendTarget = appendTo?.();
      richTextBubbleMenuMock.props.push({
        editor,
        pluginKey,
        ...(appendTo ? { appendTo } : {}),
      });

      return React.createElement("div", {
        "data-append-target": appendTarget?.getAttribute("data-testid") ?? "",
        "data-plugin-key": pluginKey,
        "data-testid": "rich-text-bubble-menu",
      });
    },
  };
});

const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  richTextBubbleMenuMock.props.length = 0;

  while (editors.length > 0) {
    const editor = editors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("NestedRichTextBubbleMenuHost", () => {
  it("renders the rich-text bubble menu when the editor is available", () => {
    const editor = makeEditor();

    render(
      <NestedRichTextBubbleMenuHost
        editor={editor}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => document.body}
      />,
    );

    const menu = screen.getByTestId("rich-text-bubble-menu");

    expect(menu.getAttribute("data-plugin-key")).toBe("nested-rich-text-bubble");
    expect(richTextBubbleMenuMock.props.at(-1)).toEqual(
      expect.objectContaining({
        editor,
        pluginKey: "nested-rich-text-bubble",
      }),
    );
  });

  it("renders nothing when the editor is unavailable, destroyed, or missing a plugin key", () => {
    const editor = makeEditor();
    const { rerender } = render(
      <NestedRichTextBubbleMenuHost
        editor={null}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => document.body}
      />,
    );

    expect(screen.queryByTestId("rich-text-bubble-menu")).toBeNull();

    editor.destroy();
    rerender(
      <NestedRichTextBubbleMenuHost
        editor={editor}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => document.body}
      />,
    );

    expect(screen.queryByTestId("rich-text-bubble-menu")).toBeNull();

    const availableEditor = makeEditor();
    rerender(
      <NestedRichTextBubbleMenuHost
        editor={availableEditor}
        pluginKey=""
        appendTo={() => document.body}
      />,
    );

    expect(screen.queryByTestId("rich-text-bubble-menu")).toBeNull();
  });

  it("renders nothing when the editor lacks a schema or view", () => {
    const schemaSourceEditor = makeEditor();
    const missingViewEditor = {
      isDestroyed: false,
      schema: schemaSourceEditor.schema,
    } as unknown as Editor;
    const missingSchemaEditor = {
      isDestroyed: false,
      view: schemaSourceEditor.view,
    } as unknown as Editor;
    const { rerender } = render(
      <NestedRichTextBubbleMenuHost
        editor={missingViewEditor}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => document.body}
      />,
    );

    expect(screen.queryByTestId("rich-text-bubble-menu")).toBeNull();

    rerender(
      <NestedRichTextBubbleMenuHost
        editor={missingSchemaEditor}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => document.body}
      />,
    );

    expect(screen.queryByTestId("rich-text-bubble-menu")).toBeNull();
  });

  it("passes the append target to the rich-text bubble menu", () => {
    const editor = makeEditor();
    const appendTarget = document.createElement("div");
    appendTarget.setAttribute("data-testid", "overlay-body");
    document.body.appendChild(appendTarget);

    render(
      <NestedRichTextBubbleMenuHost
        editor={editor}
        pluginKey="nested-rich-text-bubble"
        appendTo={() => appendTarget}
      />,
    );

    const menu = screen.getByTestId("rich-text-bubble-menu");

    expect(menu.getAttribute("data-append-target")).toBe("overlay-body");
    expect(richTextBubbleMenuMock.props.at(-1)?.appendTo?.()).toBe(appendTarget);
  });
});

function makeEditor() {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: "<p>Nested rich text text</p>",
  });
  editors.push(editor);
  return editor;
}
