// @vitest-environment happy-dom

import { Editor, Node, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { EmptyScaffoldRichTextDocument, type ScaffoldRichTextDocument } from "@/schemas/rich-text";

import {
  createNestedRichTextEditor,
  type CreateNestedRichTextEditorOptions,
} from "./create-nested-rich-text-editor";
import {
  mapInnerTransactionToOuter,
  NESTED_RICH_TEXT_EXTERNAL_SYNC_META,
} from "./map-inner-transaction-to-outer";

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

function makeExtensions({ undoRedo = false }: { undoRedo?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({ undoRedo: undoRedo ? {} : false }),
    TestOverlayContentNode,
    TestOverlayAttrNode,
  ];
}

function makeEditor(content?: JSONContent, options: { undoRedo?: boolean } = {}) {
  return new Editor({
    extensions: makeExtensions(options),
    ...(content ? { content } : {}),
  });
}

function outerDoc(fieldText = "hint"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "before" }],
      },
      {
        type: "test_overlay_content",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: fieldText }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "after" }],
      },
    ],
  };
}

function innerDocFromContentTarget(editor: Editor, fieldPos: number): JSONContent {
  const node = editor.state.doc.nodeAt(fieldPos);
  if (!node) throw new Error("Missing test overlay content node");
  return {
    type: "doc",
    content: node.content.toJSON() as JSONContent[],
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

function outerAttrDoc(document: ScaffoldRichTextDocument | null = richTextDoc("feedback")) {
  return {
    type: "doc",
    content: [
      {
        type: "test_overlay_attr",
        attrs: { document },
        content: [{ type: "paragraph" }],
      },
    ],
  } satisfies JSONContent;
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

function fieldText(editor: Editor): string {
  const fieldPos = findNodePos(editor, "test_overlay_content");
  return editor.state.doc.nodeAt(fieldPos)?.textContent ?? "";
}

function attrDocument(editor: Editor): ScaffoldRichTextDocument | null | undefined {
  const attrPos = findNodePos(editor, "test_overlay_attr");
  return editor.state.doc.nodeAt(attrPos)?.attrs["document"] as
    | ScaffoldRichTextDocument
    | null
    | undefined;
}

function writeAttrDocument(editor: Editor, document: ScaffoldRichTextDocument): void {
  const attrPos = findNodePos(editor, "test_overlay_attr");
  const node = editor.state.doc.nodeAt(attrPos);
  if (!node) throw new Error("Missing attr node");
  editor.view.dispatch(
    editor.state.tr.setNodeMarkup(attrPos, undefined, {
      ...node.attrs,
      document,
    }),
  );
}

function makeFieldNode(editor: Editor, text: string) {
  const paragraphType = editor.state.schema.nodes["paragraph"];
  const fieldType = editor.state.schema.nodes["test_overlay_content"];
  if (!paragraphType || !fieldType) throw new Error("Missing test schema nodes");
  return fieldType.create(null, paragraphType.create(null, editor.state.schema.text(text)));
}

describe("mapInnerTransactionToOuter", () => {
  it("maps an inner insertion into the target node content", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const innerEditor = makeEditor(innerDocFromContentTarget(outerEditor, fieldPos));
    const innerTransaction = innerEditor.state.tr.insertText(" text", 5);

    const result = mapInnerTransactionToOuter({
      getPos: () => fieldPos,
      innerTransaction,
      outerState: outerEditor.state,
    });

    expect(result.status).toBe("mapped");
    if (result.status !== "mapped") return;
    outerEditor.view.dispatch(result.transaction);
    expect(outerEditor.getJSON()).toEqual(outerDoc("hint text"));
  });

  it("maps an inner mark change into the target node content", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const innerEditor = makeEditor(innerDocFromContentTarget(outerEditor, fieldPos));
    const boldMark = innerEditor.state.schema.marks["bold"];
    if (!boldMark) throw new Error("Missing bold mark");
    const innerTransaction = innerEditor.state.tr.addMark(1, 5, boldMark.create());

    const result = mapInnerTransactionToOuter({
      getPos: () => fieldPos,
      innerTransaction,
      outerState: outerEditor.state,
    });

    expect(result.status).toBe("mapped");
    if (result.status !== "mapped") return;
    outerEditor.view.dispatch(result.transaction);
    const paragraph = outerEditor.state.doc.nodeAt(fieldPos)?.child(0);
    const text = paragraph?.child(0);
    expect(text?.marks.map((mark) => mark.type.name)).toEqual(["bold"]);
  });

  it("ignores transactions tagged as external synchronization", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const innerEditor = makeEditor(innerDocFromContentTarget(outerEditor, fieldPos));
    const innerTransaction = innerEditor.state.tr
      .insertText(" text", 5)
      .setMeta(NESTED_RICH_TEXT_EXTERNAL_SYNC_META, true);

    const result = mapInnerTransactionToOuter({
      getPos: () => fieldPos,
      innerTransaction,
      outerState: outerEditor.state,
    });

    expect(result).toEqual({
      reason: "externalSync",
      status: "ignored",
    });
  });

  it("returns a typed failure when getPos is stale", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const innerEditor = makeEditor(innerDocFromContentTarget(outerEditor, fieldPos));
    const innerTransaction = innerEditor.state.tr.insertText(" text", 5);

    const result = mapInnerTransactionToOuter({
      getPos: () => undefined,
      innerTransaction,
      outerState: outerEditor.state,
    });

    expect(result).toEqual({
      reason: "stalePosition",
      status: "failed",
    });
  });
});

describe("createNestedRichTextEditor content target", () => {
  it("keeps React element ownership outside the detached controller", () => {
    type HasElementOption = "element" extends keyof CreateNestedRichTextEditorOptions
      ? true
      : false;
    expectTypeOf<HasElementOption>().toEqualTypeOf<false>();

    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    expect(document.body.contains(nested.editor.view.dom)).toBe(false);
    nested.destroy();
  });

  it("maps inner document changes into the outer target content", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");

    expect(fieldText(outerEditor)).toBe("hint text");
    nested.destroy();
  });

  it("delegates undo commands to the outer history with one undo", () => {
    const outerEditor = makeEditor(outerDoc(), { undoRedo: true });
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");

    expect(nested.editor.commands.undo()).toBe(true);
    expect(fieldText(outerEditor)).toBe("hint");
    nested.destroy();
  });

  it("reports outer undo availability without consuming outer history", () => {
    const outerEditor = makeEditor(outerDoc(), { undoRedo: true });
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");

    expect(nested.editor.can().undo()).toBe(true);
    expect(fieldText(outerEditor)).toBe("hint text");
    nested.destroy();
  });

  it("delegates redo commands to the outer history", () => {
    const outerEditor = makeEditor(outerDoc(), { undoRedo: true });
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");
    outerEditor.commands.undo();

    expect(nested.editor.commands.redo()).toBe(true);
    expect(fieldText(outerEditor)).toBe("hint text");
    nested.destroy();
  });

  it("routes keyboard undo to the outer editor history", () => {
    const outerEditor = makeEditor(outerDoc(), { undoRedo: true });
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");
    expect(fieldText(outerEditor)).toBe("hint text");

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
    });
    const handled = nested.editor.view.someProp("handleKeyDown", (handleKeyDown) =>
      handleKeyDown(nested.editor.view, event),
    );

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(fieldText(outerEditor)).toBe("hint");
    nested.destroy();
  });

  it("routes keyboard redo to the outer editor history", () => {
    const outerEditor = makeEditor(outerDoc(), { undoRedo: true });
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    nested.editor.commands.setTextSelection(5);
    nested.editor.commands.insertContent(" text");
    outerEditor.commands.undo();

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
      shiftKey: true,
    });
    const handled = nested.editor.view.someProp("handleKeyDown", (handleKeyDown) =>
      handleKeyDown(nested.editor.view, event),
    );

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(fieldText(outerEditor)).toBe("hint text");
    nested.destroy();
  });

  it("leaves unavailable outer history commands unhandled", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
    });
    let handled = true;
    nested.editor.view.someProp("handleKeyDown", (handleKeyDown) => {
      handled = handleKeyDown(nested.editor.view, event) === true;
      return true;
    });

    expect(nested.editor.commands.undo()).toBe(false);
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    nested.destroy();
  });

  it("syncs external target changes without echoing them back to the outer editor", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });

    const originalDispatch = outerEditor.view.dispatch.bind(outerEditor.view);
    let outerDispatches = 0;
    outerEditor.view.dispatch = (transaction) => {
      outerDispatches += 1;
      originalDispatch(transaction);
    };

    const updatedFieldNode = makeFieldNode(outerEditor, "changed");
    outerEditor.view.dispatch(
      outerEditor.state.tr.replaceWith(fieldPos, fieldPos + fieldNode.nodeSize, updatedFieldNode),
    );

    nested.syncFromTarget({
      kind: "content",
      node: updatedFieldNode,
    });

    expect(nested.editor.getText()).toBe("changed");
    expect(outerDispatches).toBe(1);
    nested.destroy();
  });

  it("ignores synchronization and dispatch after idempotent destruction", () => {
    const outerEditor = makeEditor(outerDoc());
    const fieldPos = findNodePos(outerEditor, "test_overlay_content");
    const fieldNode = outerEditor.state.doc.nodeAt(fieldPos);
    if (!fieldNode) throw new Error("Missing field node");

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "content",
        getPos: () => fieldPos,
        node: fieldNode,
      },
    });
    const innerTransaction = nested.editor.state.tr.insertText(" changed", 5);
    const dispatchInner = nested.editor.view.dispatch.bind(nested.editor.view);
    const updatedFieldNode = makeFieldNode(outerEditor, "outside");

    nested.destroy();

    expect(() => {
      nested.syncFromTarget({ kind: "content", node: updatedFieldNode });
      dispatchInner(innerTransaction);
      nested.destroy();
    }).not.toThrow();
    expect(fieldText(outerEditor)).toBe("hint");
  });
});

describe("createNestedRichTextEditor attr target", () => {
  it("initializes from read() and falls back to an empty rich-text document", () => {
    const outerEditor = makeEditor(outerAttrDoc(null));
    let writes = 0;

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "attr",
        read: () => null,
        write: () => {
          writes += 1;
        },
      },
    });

    expect(nested.editor.getJSON()).toEqual(EmptyScaffoldRichTextDocument);
    expect(writes).toBe(0);
    nested.destroy();
  });

  it("serializes inner document edits through the caller-owned write callback", () => {
    const outerEditor = makeEditor(outerAttrDoc(richTextDoc("feedback")));
    const writes: ScaffoldRichTextDocument[] = [];

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "attr",
        read: () => attrDocument(outerEditor),
        write: (nextDoc) => {
          writes.push(nextDoc);
          writeAttrDocument(outerEditor, nextDoc);
        },
      },
    });

    nested.editor.commands.setTextSelection("feedback".length + 1);
    nested.editor.commands.insertContent(" saved");

    expect(writes[writes.length - 1]).toEqual(richTextDoc("feedback saved"));
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));
    nested.destroy();
  });

  it("routes keyboard undo to the outer editor history for attr writes", () => {
    const outerEditor = makeEditor(outerAttrDoc(richTextDoc("feedback")), { undoRedo: true });

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "attr",
        read: () => attrDocument(outerEditor),
        write: (nextDoc) => {
          writeAttrDocument(outerEditor, nextDoc);
        },
      },
    });

    nested.editor.commands.setTextSelection("feedback".length + 1);
    nested.editor.commands.insertContent(" saved");
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback saved"));

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "z",
      metaKey: true,
    });
    const handled = nested.editor.view.someProp("handleKeyDown", (handleKeyDown) =>
      handleKeyDown(nested.editor.view, event),
    );

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("feedback"));
    nested.destroy();
  });

  it("syncs external attr changes without echoing them back through write", () => {
    const outerEditor = makeEditor(outerAttrDoc(richTextDoc("feedback")));
    let writes = 0;

    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "attr",
        read: () => attrDocument(outerEditor),
        write: (nextDoc) => {
          writes += 1;
          writeAttrDocument(outerEditor, nextDoc);
        },
      },
    });

    writeAttrDocument(outerEditor, richTextDoc("outside"));
    nested.syncFromTarget({ kind: "attr" });

    expect(nested.editor.getText()).toBe("outside");
    expect(writes).toBe(0);
    nested.destroy();
  });

  it("ignores synchronization and dispatch after idempotent destruction", () => {
    const outerEditor = makeEditor(outerAttrDoc(richTextDoc("feedback")));
    const writes: ScaffoldRichTextDocument[] = [];
    const nested = createNestedRichTextEditor({
      extensions: makeExtensions(),
      outerEditor,
      target: {
        kind: "attr",
        read: () => attrDocument(outerEditor),
        write: (nextDoc) => {
          writes.push(nextDoc);
          writeAttrDocument(outerEditor, nextDoc);
        },
      },
    });
    const innerTransaction = nested.editor.state.tr.insertText(" changed", 9);
    const dispatchInner = nested.editor.view.dispatch.bind(nested.editor.view);

    nested.destroy();
    writeAttrDocument(outerEditor, richTextDoc("outside"));

    expect(() => {
      nested.syncFromTarget({ kind: "attr" });
      dispatchInner(innerTransaction);
      nested.destroy();
    }).not.toThrow();
    expect(writes).toEqual([]);
    expect(attrDocument(outerEditor)).toEqual(richTextDoc("outside"));
  });
});
