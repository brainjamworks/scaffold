// @vitest-environment jsdom

import { Editor, getSchema, type JSONContent } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";

import {
  UNAVAILABLE_CONTENT_NODE_NAMES,
  createUnavailableContentAuthoringExtensions,
} from "./unavailable-content-extensions";

const PRIVATE_TEXT = "private original text that must never escape";
const SAFE_CAPABILITY_ID = "plus-safe-capability";
const COMPATIBILITY_ID = "compatRoot01";
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const editors: Editor[] = [];

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("unavailable content authoring extensions", () => {
  it("defines exactly three atomic, isolating, selectable compatibility nodes", () => {
    const extensions = createUnavailableContentAuthoringExtensions();

    expect(extensions.map(({ name }) => name)).toEqual([
      ...UNAVAILABLE_CONTENT_NODE_NAMES,
      "scaffoldUnavailableContentClipboardPolicy",
    ]);

    const schema = getSchema(
      createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: coreAuthoringComposition,
      }),
    );
    for (const name of UNAVAILABLE_CONTENT_NODE_NAMES) {
      expect(schema.nodes[name]?.spec).toMatchObject({
        atom: true,
        isolating: true,
        selectable: true,
        draggable: false,
      });
      expect(schema.nodes[name]?.isLeaf).toBe(true);
    }
  });

  it.each([
    ["unavailable_block", blockDocument()],
    ["unavailable_layout", layoutDocument()],
    ["unavailable_surface", surfaceDocument()],
  ] as const)("accepts %s in its legal kind position", (_name, document) => {
    expect(() => checkedAuthoringDocument(document)).not.toThrow();
  });

  it.each([
    ["an unavailable Block at the course root", illegalBlockAtCourseRootDocument()],
    ["an unavailable Layout inside a Layout section", illegalLayoutInSectionDocument()],
    ["an unavailable Surface inside another Surface", illegalNestedSurfaceDocument()],
  ])("rejects %s", (_label, document) => {
    expect(() => checkedAuthoringDocument(document)).toThrow();
  });

  it.each([
    ["id", "short"],
    ["capabilityId", "   "],
    ["original", { type: "plus_private", attrs: { invalid: undefined } }],
  ])("rejects an invalid %s attr", (attr, value) => {
    const document = blockDocument({ [attr]: value });

    expect(() => checkedAuthoringDocument(document)).toThrow();
  });

  it("renders actionable user-facing copy without exposing internal or owned data", async () => {
    const editor = makeAuthoringEditor(blockDocument());

    render(createElement(EditorContent, { editor }));

    await waitFor(() => {
      const view = document.body.querySelector("[data-unavailable-content-kind='block']");
      expect(view).not.toBeNull();
      expect(view).toHaveClass("sc-app-unavailable-content");
      expect(view?.textContent).toContain("Plus safe capability");
      expect(view?.textContent).toContain(
        "This block isn’t available in this application. You can keep it or delete it.",
      );
      expect(view?.textContent).not.toContain(SAFE_CAPABILITY_ID);
    });

    expect(
      screen.getByRole("button", { name: "Delete unavailable block: Plus safe capability" }),
    ).toHaveClass("sc-button", "sc-app-unavailable-content__delete");
    expect(document.body.textContent).not.toContain(PRIVATE_TEXT);
    expect(document.body.innerHTML).not.toContain(PRIVATE_TEXT);
    expect(editor.getHTML()).not.toContain(PRIVATE_TEXT);
    expect(editor.getHTML()).not.toContain("original");
  });

  it("selects an unavailable item through its rendered placeholder", async () => {
    const editor = makeAuthoringEditor(blockAndParagraphDocument());
    const position = firstNodePosition(editor, "unavailable_block");
    const textPosition = firstNodePosition(editor, "paragraph") + 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, textPosition)),
    );

    render(createElement(EditorContent, { editor }));

    const placeholder = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        "[data-unavailable-content-kind='block']",
      );
      expect(element).not.toBeNull();
      return element!;
    });
    expect(placeholder).not.toHaveAttribute("data-selected");
    fireEvent.mouseDown(placeholder, { button: 0 });

    await waitFor(() => {
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);
      expect(editor.state.selection.from).toBe(position);
      expect(placeholder).toHaveAttribute("data-selected", "true");
    });
  });

  it("deletes an unavailable item through its rendered placeholder", async () => {
    const editor = makeAuthoringEditor(blockDocument());

    render(createElement(EditorContent, { editor }));

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete unavailable block: Plus safe capability",
      }),
    );

    expect(nodeTypes(editor)).not.toContain("unavailable_block");
  });

  it("refuses compatibility copy without changing ordinary rich-text copy", () => {
    const editor = makeAuthoringEditor(blockAndParagraphDocument());
    const position = firstNodePosition(editor, "unavailable_block");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, position)),
    );

    const refused = dispatchCopy(editor);

    expect(refused.event.defaultPrevented).toBe(true);
    expect(refused.written).toEqual({});

    const textPosition = firstNodePosition(editor, "paragraph") + 1;
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, textPosition, textPosition + 4),
      ),
    );

    const ordinary = dispatchCopy(editor);

    expect(ordinary.written["text/plain"]).toBe("Safe");
  });
});

function checkedAuthoringDocument(document: JSONContent) {
  const schema = getSchema(
    createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    }),
  );
  const node = schema.nodeFromJSON(document);
  node.check();
  return node;
}

function makeAuthoringEditor(content: JSONContent): Editor {
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: coreAuthoringComposition,
    }),
    content,
  });
  editors.push(editor);
  return editor;
}

function compatibilityItem(
  type: (typeof UNAVAILABLE_CONTENT_NODE_NAMES)[number],
  overrides: Record<string, unknown> = {},
): JSONContent {
  return {
    type,
    attrs: {
      id: COMPATIBILITY_ID,
      capabilityId: SAFE_CAPABILITY_ID,
      original: {
        type: "plus_private",
        attrs: { id: COMPATIBILITY_ID, privateText: PRIVATE_TEXT },
      },
      ...overrides,
    },
  };
}

function doc(courseContent: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseDoc001", mode: "page" },
        content: courseContent,
      },
    ],
  };
}

function surface(content: JSONContent[]): JSONContent {
  return {
    type: "surface",
    attrs: { id: "surface00001", variant: "page-default" },
    content,
  };
}

function layout(content: JSONContent[]): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layoutRoot01", variant: "tabs" },
    content,
  };
}

function section(content: JSONContent[]): JSONContent {
  return { type: "section", attrs: { id: "section00001" }, content };
}

function blockDocument(overrides: Record<string, unknown> = {}): JSONContent {
  return doc([surface([compatibilityItem("unavailable_block", overrides)])]);
}

function blockAndParagraphDocument(): JSONContent {
  return doc([
    surface([
      compatibilityItem("unavailable_block"),
      { type: "paragraph", content: [{ type: "text", text: "Safe paragraph" }] },
    ]),
  ]);
}

function layoutDocument(): JSONContent {
  return doc([surface([compatibilityItem("unavailable_layout")])]);
}

function surfaceDocument(): JSONContent {
  return doc([compatibilityItem("unavailable_surface")]);
}

function illegalBlockAtCourseRootDocument(): JSONContent {
  return doc([compatibilityItem("unavailable_block")]);
}

function illegalLayoutInSectionDocument(): JSONContent {
  return doc([surface([layout([section([compatibilityItem("unavailable_layout")])])])]);
}

function illegalNestedSurfaceDocument(): JSONContent {
  return doc([surface([compatibilityItem("unavailable_surface")])]);
}

function firstNodePosition(editor: Editor, type: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== type) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Missing ${type} fixture.`);
  return found;
}

function nodeTypes(editor: Editor): string[] {
  const types: string[] = [];
  editor.state.doc.descendants((node) => {
    types.push(node.type.name);
  });
  return types;
}

function dispatchCopy(editor: Editor): {
  event: Event;
  written: Record<string, string>;
} {
  const written: Record<string, string> = {};
  const event = new Event("copy", { bubbles: true, cancelable: true });
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
