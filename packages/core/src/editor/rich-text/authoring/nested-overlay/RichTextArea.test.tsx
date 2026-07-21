// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import type { ScaffoldRichTextDocument } from "@/schemas/rich-text";

import { RichTextArea } from "./RichTextArea";

const bubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");
  const { createPortal } = await import("react-dom");

  return {
    RichTextBubbleMenu(props: RichTextBubbleMenuProps) {
      bubbleMenuMock.props.push(props);
      const menuElementRef = React.useRef(document.createElement("div"));

      React.useEffect(() => {
        const appendTarget = props.appendTo?.();
        const menuElement = menuElementRef.current;
        if (!appendTarget) return;

        appendTarget.append(menuElement);
        return () => menuElement.remove();
      }, [props]);

      return createPortal(
        React.createElement("div", { "data-testid": "rich-text-bubble-menu" }),
        menuElementRef.current,
      );
    },
  };
});

const TestAttrNode = Node.create({
  name: "test_rich_text_area_attr",
  group: "block",
  content: "block*",
  addAttributes() {
    return { document: { default: null } };
  },
  parseHTML() {
    return [{ tag: "div[data-test-rich-text-area-attr]" }];
  },
  renderHTML() {
    return ["div", { "data-test-rich-text-area-attr": "" }, 0];
  },
});

const outerEditors: Editor[] = [];

afterEach(() => {
  cleanup();
  bubbleMenuMock.props.length = 0;
  while (outerEditors.length > 0) {
    const editor = outerEditors.pop();
    if (editor && !editor.isDestroyed) editor.destroy();
  }
});

describe("RichTextArea", () => {
  it("presents the nested attr editor as an accessible multiline textbox without taking focus", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("Initial feedback"));
    const write = vi.fn((nextDocument: ScaffoldRichTextDocument) => {
      writeAttrDocument(outerEditor, nextDocument);
    });

    render(
      <section data-testid="authoring-container">
        <label id="feedback-label">Shown after submitting</label>
        <div data-testid="bubble-target" />
        <RichTextArea
          ariaLabel="Feedback"
          ariaLabelledBy="feedback-label"
          bubbleMenuAppendTo={() => screen.queryByTestId("bubble-target")}
          bubbleMenuPluginKey="rich-text-area-bubble"
          extensions={makeNestedExtensions()}
          fieldKey="feedback:field"
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

    const textbox = await screen.findByRole("textbox", { name: "Shown after submitting" });
    const nestedEditor = await latestNestedEditor();

    expect(textbox).toBe(nestedEditor.view.dom);
    expect(textbox.getAttribute("contenteditable")).toBe("true");
    expect(textbox.getAttribute("aria-multiline")).toBe("true");
    expect(textbox.getAttribute("aria-labelledby")).toBe("feedback-label");
    expect(textbox.getAttribute("data-placeholder")).toBe("Add feedback");
    expect(textbox.getAttribute("data-attr-rich-text-field")).toBe("feedback:field");
    expect(nestedEditor.isFocused).toBe(false);
    expect(
      screen.getByTestId("bubble-target").contains(screen.getByTestId("rich-text-bubble-menu")),
    ).toBe(true);

    nestedEditor.commands.setTextSelection("Initial feedback".length + 1);
    nestedEditor.commands.insertContent(" saved");

    expect(write).toHaveBeenLastCalledWith(richTextDoc("Initial feedback saved"));
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("Initial feedback saved"));
  });

  it("forwards content targets through the shared nested editor lifecycle", async () => {
    const outerEditor = makeOuterEditor(richTextDoc("Initial content"));
    const targetPos = findNodePos(outerEditor);
    const targetNode = outerEditor.state.doc.nodeAt(targetPos);
    if (!targetNode) throw new Error("Missing content target");

    render(
      <RichTextArea
        ariaLabel="Content feedback"
        bubbleMenuPluginKey="rich-text-area-content-bubble"
        extensions={makeNestedExtensions()}
        outerEditor={outerEditor}
        target={{
          kind: "content",
          getPos: () => targetPos,
          node: targetNode,
        }}
      />,
    );

    await screen.findByRole("textbox", { name: "Content feedback" });
    const nestedEditor = await latestNestedEditor();
    nestedEditor.commands.setTextSelection("Initial content".length + 1);
    nestedEditor.commands.insertContent(" saved");

    expect(outerEditor.state.doc.nodeAt(targetPos)?.textContent).toBe("Initial content saved");
  });
});

async function latestNestedEditor(): Promise<Editor> {
  await waitFor(() => expect(bubbleMenuMock.props.at(-1)?.editor).toBeDefined());
  const editor = bubbleMenuMock.props.at(-1)?.editor;
  if (!editor) throw new Error("Expected nested editor");
  return editor;
}

function makeNestedExtensions(): Extensions {
  return [StarterKit.configure({ undoRedo: false })];
}

function makeOuterEditor(document: ScaffoldRichTextDocument): Editor {
  const editor = new Editor({
    extensions: [StarterKit, TestAttrNode],
    content: outerAttrDoc(document),
  });
  outerEditors.push(editor);
  return editor;
}

function outerAttrDoc(document: ScaffoldRichTextDocument): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "test_rich_text_area_attr",
        attrs: { document },
        content: document.content ?? [{ type: "paragraph" }],
      },
    ],
  };
}

function richTextDoc(text: string): ScaffoldRichTextDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function attrDocument(editor: Editor): ScaffoldRichTextDocument | null | undefined {
  return editor.state.doc.nodeAt(findNodePos(editor))?.attrs["document"] as
    | ScaffoldRichTextDocument
    | null
    | undefined;
}

function writeAttrDocument(editor: Editor, document: ScaffoldRichTextDocument): void {
  const pos = findNodePos(editor);
  const node = editor.state.doc.nodeAt(pos);
  if (!node) throw new Error("Missing attr target");
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, document }));
}

function findNodePos(editor: Editor): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "test_rich_text_area_attr") return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error("Missing attr target");
  return found;
}
