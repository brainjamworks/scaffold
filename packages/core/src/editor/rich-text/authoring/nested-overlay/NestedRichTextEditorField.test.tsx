// @vitest-environment happy-dom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createContext, StrictMode, useContext } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { NestedRichTextEditorTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import type { ScaffoldRichTextDocument } from "@/schemas/rich-text";

import { NestedRichTextEditorField } from "./NestedRichTextEditorField";

const nestedRichTextBubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");
  const { createPortal } = await import("react-dom");

  return {
    RichTextBubbleMenu(props: RichTextBubbleMenuProps) {
      nestedRichTextBubbleMenuMock.props.push(props);
      const menuElementRef = React.useRef(document.createElement("div"));

      React.useEffect(() => {
        const appendTarget = props.appendTo?.();
        const menuElement = menuElementRef.current;
        if (!appendTarget) return;

        appendTarget.append(menuElement);
        return () => menuElement.remove();
      }, [props]);

      return createPortal(
        React.createElement("div", {
          "data-plugin-key": props.pluginKey,
          "data-testid": "rich-text-bubble-menu",
        }),
        menuElementRef.current,
      );
    },
  };
});

const TestOverlayAttrNode = Node.create({
  name: "test_overlay_attr",
  group: "block",
  content: "block*",
  addAttributes() {
    return {
      document: {
        default: null,
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-test-overlay-attr]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-attr": "" }, 0];
  },
});

const NestedEditorContext = createContext("missing-context");

function ContextReadingNodeView() {
  const contextValue = useContext(NestedEditorContext);
  return (
    <NodeViewWrapper as="span" data-testid="nested-react-node-view">
      {contextValue}
    </NodeViewWrapper>
  );
}

const TestReactContextNode = Node.create({
  name: "test_react_context",
  group: "inline",
  inline: true,
  atom: true,
  parseHTML() {
    return [{ tag: "span[data-test-react-context]" }];
  },
  renderHTML() {
    return ["span", { "data-test-react-context": "" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ContextReadingNodeView);
  },
});

const TestOverlayContentNode = Node.create({
  name: "test_overlay_content",
  group: "block",
  content: "block+",
  parseHTML() {
    return [{ tag: "div[data-test-overlay-content]" }];
  },
  renderHTML() {
    return ["div", { "data-test-overlay-content": "" }, 0];
  },
});

const outerEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  nestedRichTextBubbleMenuMock.props.length = 0;
  while (outerEditors.length > 0) {
    const editor = outerEditors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("NestedRichTextEditorField", () => {
  it("keeps its EditorContent wrapper mounted before an editor is available", () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));

    render(
      <NestedRichTextEditorField
        ariaLabel="Feedback editor"
        bubbleMenuPluginKey="feedback-wrapper-bubble"
        extensions={makeNestedExtensions()}
        mountClassName="stable-wrapper"
        outerEditor={outerEditor}
        target={null}
      />,
    );

    const wrapper = document.querySelector<HTMLElement>(
      "[data-scaffold-nested-rich-text-editor-field]",
    );
    expect(wrapper?.classList.contains("stable-wrapper")).toBe(true);
    expect(wrapper?.querySelector(".ProseMirror")).toBe(null);
  });

  it("renders React NodeViews with context from the surrounding React tree", async () => {
    const outerEditor = makeContentOuterEditor();

    render(
      <NestedEditorContext.Provider value="inherited-context">
        <NestedRichTextEditorField
          ariaLabel="Supporting material editor"
          bubbleMenuPluginKey="supporting-material-bubble"
          extensions={makeNestedExtensions()}
          outerEditor={outerEditor}
          target={contentTarget(outerEditor)}
        />
      </NestedEditorContext.Provider>,
    );

    expect((await screen.findByTestId("nested-react-node-view")).textContent).toBe(
      "inherited-context",
    );
  });

  it("reconnects a content target safely during StrictMode passive-effect replay", async () => {
    const outerEditor = makeContentOuterEditor();
    const target = contentTarget(outerEditor);

    render(
      <StrictMode>
        <NestedRichTextEditorField
          ariaLabel="Strict mode content editor"
          bubbleMenuPluginKey="strict-mode-content-bubble"
          extensions={makeNestedExtensions()}
          outerEditor={outerEditor}
          syncKey={target.node}
          target={target}
        />
      </StrictMode>,
    );

    expect((await screen.findByTestId("nested-react-node-view")).textContent).toBe(
      "missing-context",
    );
    const editor = await latestNestedEditor();
    expect(editor.isDestroyed).toBe(false);
    expect(
      document.querySelectorAll("[data-scaffold-nested-rich-text-editor-field] .ProseMirror"),
    ).toHaveLength(1);
  });

  it("mounts an attr target with field semantics, writeback, autofocus, and a custom bubble target", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const write = vi.fn((nextDocument: ScaffoldRichTextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });

    render(
      <section data-testid="authoring-container">
        <div data-testid="custom-bubble-target" />
        <NestedRichTextEditorField
          ariaLabel="Feedback editor"
          autoFocus
          bubbleMenuAppendTo={() => screen.queryByTestId("custom-bubble-target")}
          bubbleMenuPluginKey="feedback-field-bubble"
          className="custom-editor-class"
          extensions={makeNestedExtensions()}
          fieldKey="choice:a:feedback"
          mountClassName="custom-editor-mount"
          outerEditor={outerEditor}
          placeholder="Add feedback"
          target={{
            kind: "attr",
            read: () => attrDocument(outerEditor),
            write,
          }}
        />
      </section>,
    );

    const nestedEditor = await latestNestedEditor();
    const mount = screen
      .getByTestId("authoring-container")
      .querySelector<HTMLElement>("[data-scaffold-nested-rich-text-editor-field]");

    expect(mount).toBeInstanceOf(HTMLElement);
    expect(mount?.classList.contains("custom-editor-mount")).toBe(true);
    expect(mount?.contains(nestedEditor.view.dom)).toBe(true);
    expect(nestedEditor.isFocused).toBe(true);
    expect(nestedEditor.view.dom.getAttribute("aria-label")).toBe("Feedback editor");
    expect(nestedEditor.view.dom.getAttribute("data-placeholder")).toBe("Add feedback");
    expect(nestedEditor.view.dom.getAttribute("data-attr-rich-text-field")).toBe(
      "choice:a:feedback",
    );
    expect(nestedEditor.view.dom.classList.contains("custom-editor-class")).toBe(true);
    const bubbleMenu = screen.getByTestId("rich-text-bubble-menu");
    expect(bubbleMenu.getAttribute("data-plugin-key")).toBe("feedback-field-bubble");
    expect(screen.getByTestId("custom-bubble-target").contains(bubbleMenu)).toBe(true);

    nestedEditor.commands.setTextSelection("feedback".length + 1);
    nestedEditor.commands.insertContent(" saved");

    expect(write).toHaveBeenLastCalledWith(richTextDoc("feedback saved"));
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
  });

  it("resyncs a stable target through syncKey without echoing a write", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("before"));
    const extensions = makeNestedExtensions();
    const write = vi.fn((nextDocument: ScaffoldRichTextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });
    const target = attrTarget(outerEditor, write);
    const renderField = (syncKey: string) => (
      <NestedRichTextEditorField
        ariaLabel="Feedback editor"
        bubbleMenuPluginKey="feedback-sync-bubble"
        extensions={extensions}
        outerEditor={outerEditor}
        syncKey={syncKey}
        target={target}
      />
    );
    const { rerender } = render(renderField("before"));
    const initialEditor = await latestNestedEditor();

    writeAttrDocument(outerEditor, richTextDoc("outside"));
    rerender(renderField("outside"));

    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("outside");
    });
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(initialEditor);
    expect(write).not.toHaveBeenCalled();
  });

  it("routes keyboard undo and redo through the outer editor history", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const extensions = makeNestedExtensions();
    const target = attrTarget(outerEditor, (nextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });
    const renderField = (syncKey: string) => (
      <NestedRichTextEditorField
        ariaLabel="Feedback editor"
        bubbleMenuPluginKey="feedback-history-bubble"
        extensions={extensions}
        outerEditor={outerEditor}
        syncKey={syncKey}
        target={target}
      />
    );
    const { rerender } = render(renderField("feedback"));
    const nestedEditor = await latestNestedEditor();

    nestedEditor.commands.setTextSelection("feedback".length + 1);
    nestedEditor.commands.insertContent(" saved");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
    rerender(renderField("feedback saved"));
    await waitFor(() => {
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBe(nestedEditor);
    });

    await userEvent.click(nestedEditor.view.dom);
    await userEvent.keyboard("{Control>}z{/Control}");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback"));
    rerender(renderField("feedback"));
    await waitFor(() => expect(nestedEditor.getText()).toBe("feedback"));

    await userEvent.click(nestedEditor.view.dom);
    await userEvent.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
    rerender(renderField("feedback saved"));
    await waitFor(() => expect(nestedEditor.getText()).toBe("feedback saved"));
  });

  it("keeps autofocus optional and falls back to the editor parent for bubble placement", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));

    render(
      <section data-testid="authoring-container">
        <NestedRichTextEditorField
          ariaLabel="Feedback editor"
          bubbleMenuAppendTo={() => null}
          bubbleMenuPluginKey="feedback-fallback-bubble"
          extensions={makeNestedExtensions()}
          outerEditor={outerEditor}
          target={attrTarget(outerEditor, () => undefined)}
        />
      </section>,
    );

    const nestedEditor = await latestNestedEditor();
    const bubbleMenu = screen.getByTestId("rich-text-bubble-menu");

    expect(nestedEditor.isFocused).toBe(false);
    expect(nestedEditor.view.dom.parentElement?.contains(bubbleMenu)).toBe(true);
    expect(screen.getByTestId("authoring-container").contains(bubbleMenu)).toBe(true);
  });

  it("does not refocus a mounted editor when field semantics change", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("feedback"));
    const extensions = makeNestedExtensions();
    const target = attrTarget(outerEditor, () => undefined);
    const renderField = (ariaLabel: string) => (
      <section>
        <button type="button">Outside control</button>
        <NestedRichTextEditorField
          ariaLabel={ariaLabel}
          autoFocus
          bubbleMenuPluginKey="feedback-focus-bubble"
          extensions={extensions}
          outerEditor={outerEditor}
          target={target}
        />
      </section>
    );
    const { rerender } = render(renderField("Feedback editor"));
    const nestedEditor = await latestNestedEditor();

    await waitFor(() => expect(nestedEditor.isFocused).toBe(true));
    const outsideControl = screen.getByRole("button", { name: "Outside control" });
    await userEvent.click(outsideControl);
    expect(document.activeElement).toBe(outsideControl);

    rerender(renderField("Renamed feedback editor"));
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    expect(document.activeElement).toBe(outsideControl);
  });

  it("recreates an autofocused editor when its target and field semantics change together", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("outer"));
    const extensions = makeNestedExtensions();
    const firstTarget = staticAttrTarget("first");
    const secondTarget = staticAttrTarget("second");
    const renderField = (target: NestedRichTextEditorTarget, fieldKey: string) => (
      <NestedRichTextEditorField
        ariaLabel={fieldKey + " editor"}
        autoFocus
        bubbleMenuPluginKey="feedback-target-focus-bubble"
        extensions={extensions}
        fieldKey={fieldKey}
        outerEditor={outerEditor}
        target={target}
      />
    );
    const { rerender } = render(renderField(firstTarget, "first"));
    const firstEditor = await latestNestedEditor();

    rerender(renderField(secondTarget, "second"));

    await waitFor(() => {
      expect(firstEditor.isDestroyed).toBe(true);
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("second");
    });
    const secondEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!secondEditor) throw new Error("Expected replacement editor");

    expect(secondEditor.isFocused).toBe(true);
    expect(secondEditor.view.dom.getAttribute("aria-label")).toBe("second editor");
    expect(secondEditor.view.dom.getAttribute("data-attr-rich-text-field")).toBe("second");
  });

  it("recreates the editor for a replacement target and destroys it on unmount", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("outer"));
    const extensions = makeNestedExtensions();
    const firstTarget = staticAttrTarget("first");
    const secondTarget = staticAttrTarget("second");
    const renderField = (target: NestedRichTextEditorTarget) => (
      <NestedRichTextEditorField
        ariaLabel="Feedback editor"
        bubbleMenuPluginKey="feedback-target-bubble"
        extensions={extensions}
        outerEditor={outerEditor}
        target={target}
      />
    );
    const { rerender, unmount } = render(renderField(firstTarget));
    const firstEditor = await latestNestedEditor();

    rerender(renderField(secondTarget));

    await waitFor(() => {
      expect(firstEditor.isDestroyed).toBe(true);
      expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor?.getText()).toBe("second");
    });
    const secondEditor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
    if (!secondEditor) throw new Error("Expected replacement editor");

    unmount();

    expect(secondEditor.isDestroyed).toBe(true);
  });
});

async function latestNestedEditor(): Promise<Editor> {
  await waitFor(() => {
    expect(nestedRichTextBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
  });
  const editor = nestedRichTextBubbleMenuMock.props.at(-1)?.editor;
  if (!editor) throw new Error("Expected nested editor");
  return editor;
}

function makeNestedExtensions(): Extensions {
  return [StarterKit.configure({ undoRedo: false }), TestReactContextNode];
}

function makeContentOuterEditor(): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TestOverlayContentNode, TestReactContextNode],
    content: {
      type: "doc",
      content: [
        {
          type: "test_overlay_content",
          content: [
            {
              type: "paragraph",
              content: [{ type: "test_react_context" }],
            },
          ],
        },
      ],
    },
  });
  outerEditors.push(editor);
  return editor;
}

function makeOuterEditor(document: ScaffoldRichTextDocument): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TestOverlayAttrNode],
    content: outerAttrDoc(document),
  });
  outerEditors.push(editor);
  return editor;
}

function attrTarget(
  editor: Editor,
  write: (nextDocument: ScaffoldRichTextDocument) => void,
): NestedRichTextEditorTarget {
  return {
    kind: "attr",
    read: () => attrDocument(editor),
    write,
  };
}

function staticAttrTarget(text: string): NestedRichTextEditorTarget {
  return {
    kind: "attr",
    read: () => richTextDoc(text),
    write: vi.fn(),
  };
}

function contentTarget(editor: Editor): Extract<NestedRichTextEditorTarget, { kind: "content" }> {
  const pos = findNodePos(editor, "test_overlay_content");
  const node = editor.state.doc.nodeAt(pos);
  if (!node) throw new Error("Missing content target");

  return {
    kind: "content",
    getPos: () => pos,
    node,
  };
}

function outerAttrDoc(document: ScaffoldRichTextDocument): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_overlay_attr",
        attrs: { document },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}

function richTextDoc(text: string): ScaffoldRichTextDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function attrDocument(editor: Editor): ScaffoldRichTextDocument | null | undefined {
  const pos = findNodePos(editor, "test_overlay_attr");
  return editor.state.doc.nodeAt(pos)?.attrs["document"] as
    | ScaffoldRichTextDocument
    | null
    | undefined;
}

function writeAttrDocument(editor: Editor, document: ScaffoldRichTextDocument): void {
  const pos = findNodePos(editor, "test_overlay_attr");
  const node = editor.state.doc.nodeAt(pos);
  if (!node) throw new Error("Missing attr target");

  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      document,
    }),
  );
}

function findNodePos(editor: Editor, typeName: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing ${typeName}`);
  return found;
}
