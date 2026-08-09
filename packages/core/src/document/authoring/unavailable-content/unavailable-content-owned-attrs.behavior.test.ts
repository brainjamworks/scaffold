// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import type { Fragment, Slice } from "@tiptap/pm/model";
import { EditorState, NodeSelection, Plugin, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { duplicateLayoutAt } from "@/editor/arrangements/layout/model/layout-commands";

const COMPATIBILITY_ID = "ownedRoot001";
const CAPABILITY_ID = "plus-layout";
const EMPTY_BLOCK_DUPLICATIONS = Object.freeze({
  getByNodeType: () => undefined,
  hasNodeType: () => false,
});

const UnavailableLayoutFixture = Node.create({
  name: "unavailable_layout",
  group: "block",
  atom: true,
  isolating: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-id"),
        renderHTML: ({ id }) => (id ? { "data-id": id } : {}),
      },
      capabilityId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-capability-id"),
        renderHTML: ({ capabilityId }) =>
          capabilityId ? { "data-capability-id": capabilityId } : {},
      },
      original: {
        default: null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-unavailable-layout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { "data-unavailable-layout": "", ...HTMLAttributes }];
  },

  addProseMirrorPlugins() {
    const refuseUnavailableClipboardContent = (view: Editor["view"], event: Event) => {
      if (!containsUnavailableLayout(view.state.selection.content())) return false;

      event.preventDefault();
      return true;
    };

    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            copy: refuseUnavailableClipboardContent,
            cut: refuseUnavailableClipboardContent,
          },
          handlePaste: (_view, _event, slice) => containsUnavailableLayout(slice),
        },
      }),
    ];
  },
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Tiptap 3.26 owned compatibility attrs", () => {
  it("serializes an owned deeply nested original independently of its source fixture", () => {
    const sourceOriginal = originalFixture();
    const expectedOriginal = structuredClone(sourceOriginal);
    const editor = makeEditor(sourceOriginal);

    expect(compatibilityItemJson(editor)).toEqual({
      type: "unavailable_layout",
      attrs: {
        id: COMPATIBILITY_ID,
        capabilityId: CAPABILITY_ID,
        original: expectedOriginal,
      },
    });

    mutateSourceFixture(sourceOriginal);

    expect(compatibilityItemJson(editor)?.attrs?.["original"]).toEqual(expectedOriginal);
  });

  it("restores the complete attrs through delete, undo, and redo", () => {
    const editor = makeEditor(originalFixture());
    const expectedItem = structuredClone(compatibilityItemJson(editor));
    selectCompatibilityItem(editor);

    expect(editor.commands.deleteSelection()).toBe(true);
    expect(compatibilityItems(editor)).toHaveLength(0);

    expect(editor.commands.undo()).toBe(true);
    expect(compatibilityItemJson(editor)).toEqual(expectedItem);

    expect(editor.commands.redo()).toBe(true);
    expect(compatibilityItems(editor)).toHaveLength(0);
  });

  it("retains the complete owned original when serialized JSON replaces editor state", () => {
    const editor = makeEditor(originalFixture());
    const serializedWorkingJson = structuredClone(editor.getJSON());

    editor.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Temporary" }] }],
    });
    expect(compatibilityItems(editor)).toHaveLength(0);

    editor.view.updateState(
      EditorState.create({
        schema: editor.schema,
        doc: editor.schema.nodeFromJSON(structuredClone(serializedWorkingJson)),
        plugins: editor.state.plugins,
      }),
    );

    expect(editor.getJSON()).toEqual(serializedWorkingJson);
    expect(compatibilityItemJson(editor)?.attrs?.["original"]).toEqual(
      originalFixture(),
    );
  });

  it("refuses a selected compatibility item before browser copy serialization", () => {
    const editor = makeEditor(originalFixture());
    selectCompatibilityItem(editor);
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "copy");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
    expect(compatibilityItems(editor)).toHaveLength(1);
  });

  it("refuses a complete compatibility item from browser paste before insertion", () => {
    const editor = makeEditor(originalFixture());
    setCursorAtDocumentEnd(editor);
    const before = editor.getJSON();

    dispatchClipboard(editor, "paste", {
      "text/html":
        '<div data-pm-slice="0 0 []" data-unavailable-layout data-id="copiedRoot01" data-capability-id="plus-layout"></div>',
      "text/plain": "Unavailable Layout: plus-layout",
    });

    expect(editor.getJSON()).toEqual(before);
    expect(compatibilityItems(editor)).toHaveLength(1);
  });

  it("is refused by the existing controlled Layout duplicate boundary", () => {
    const editor = makeEditor(originalFixture());
    const before = editor.getJSON();

    expect(
      duplicateLayoutAt(editor, compatibilityItemPosition(editor), EMPTY_BLOCK_DUPLICATIONS),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expect(compatibilityItems(editor)).toHaveLength(1);
  });
});

function originalFixture(): JSONContent {
  return {
    type: "plus_gallery",
    attrs: {
      id: COMPATIBILITY_ID,
      settings: {
        theme: {
          palette: ["#123456", "#abcdef"],
          typography: { heading: "Private Display", body: "Private Sans" },
        },
        records: [
          {
            id: "privateRow01",
            label: "Preserved private label",
            asset: { mediaId: "host-resource-42", crop: [0.1, 0.2, 0.8, 0.7] },
          },
        ],
      },
    },
    content: [
      {
        type: "plus_gallery_item",
        attrs: {
          id: "privateItem1",
          data: { recordId: "privateRow01", flags: [true, false, null] },
        },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Opaque private copy" }],
          },
        ],
      },
    ],
  };
}

function mutateSourceFixture(source: JSONContent): void {
  const settings = source.attrs?.["settings"] as {
    theme: { palette: string[] };
    records: Array<{ label: string }>;
  };
  settings.theme.palette[0] = "#ffffff";
  settings.records[0]!.label = "Externally mutated";
  source.content?.splice(0);
}

function makeEditor(sourceOriginal: JSONContent): Editor {
  // ProseMirror retains object-valued attrs shallowly, so establishment must
  // hand the editor an unretained owned clone rather than caller-owned JSON.
  const editor = new Editor({
    extensions: [StarterKit, UnavailableLayoutFixture],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Before" }] },
        {
          type: "unavailable_layout",
          attrs: {
            id: COMPATIBILITY_ID,
            capabilityId: CAPABILITY_ID,
            original: structuredClone(sourceOriginal),
          },
        },
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function compatibilityItems(editor: Editor): JSONContent[] {
  return (editor.getJSON().content ?? []).filter((node) => node.type === "unavailable_layout");
}

function compatibilityItemJson(editor: Editor): JSONContent | undefined {
  return compatibilityItems(editor)[0];
}

function compatibilityItemPosition(editor: Editor): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "unavailable_layout") return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error("Missing unavailable Layout fixture");
  return found;
}

function selectCompatibilityItem(editor: Editor): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, compatibilityItemPosition(editor)),
    ),
  );
}

function setCursorAtDocumentEnd(editor: Editor): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, editor.state.doc.content.size - 1),
    ),
  );
}

function containsUnavailableLayout(slice: Slice): boolean {
  return fragmentContainsUnavailableLayout(slice.content);
}

function fragmentContainsUnavailableLayout(fragment: Fragment): boolean {
  for (let index = 0; index < fragment.childCount; index += 1) {
    const node = fragment.child(index);
    if (node.type.name === "unavailable_layout") return true;
    if (fragmentContainsUnavailableLayout(node.content)) return true;
  }
  return false;
}

function dispatchClipboard(
  editor: Editor,
  type: "copy" | "paste",
  initial: Record<string, string> = {},
): { event: Event; written: Record<string, string> } {
  const written = { ...initial };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: () => {
        for (const key of Object.keys(written)) delete written[key];
      },
      getData: (format: string) => written[format] ?? "",
      setData: (format: string, value: string) => {
        written[format] = value;
      },
    },
  });
  editor.view.dom.dispatchEvent(event);
  return { event, written };
}
