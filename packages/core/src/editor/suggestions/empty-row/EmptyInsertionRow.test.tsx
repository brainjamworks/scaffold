// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { isSlashCommandActive } from "@/editor/suggestions/slash/SlashCommand";

import {
  resolveEmptyInsertionTarget as resolveEmptyInsertionTargetWithLookup,
  setEmptyInsertionRowMovementDragActive,
} from "./EmptyInsertionRowExtension";

const resolveEmptyInsertionTarget = (
  state: Parameters<typeof resolveEmptyInsertionTargetWithLookup>[0],
) => resolveEmptyInsertionTargetWithLookup(state, builtInSurfaceVariantRegistry);

const ownedEditors = new Map<Editor, HTMLElement | null>();

function makeEditor(content = createScaffoldDocumentContent({ mode: "page" }), appendView = true) {
  const editor = new Editor({
    extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
    content,
  });
  const ownedElement = appendView ? editor.view.dom : null;
  if (ownedElement) document.body.append(ownedElement);
  ownedEditors.set(editor, ownedElement);
  return editor;
}

function makeEditorWithRegisteredBlocks(content = createScaffoldDocumentContent({ mode: "page" })) {
  return makeEditor(content);
}

function setCursorInFirstEmptyParagraph(editor: Editor) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos) => {
    if (pos !== null) return false;
    if (node.type.name !== "paragraph" || node.content.size > 0) return true;
    pos = nodePos + 1;
    return false;
  });

  if (pos === null) throw new Error("expected an empty paragraph");
  editor.commands.setTextSelection(pos);
}

function nodePos(editor: Editor, type: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`expected ${type} node`);
  return found;
}

function nodeElement(editor: Editor, pos: number): HTMLElement {
  const element = editor.view.nodeDOM(pos);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`expected HTMLElement at ${pos}`);
  }
  return element;
}

function stubRect(
  element: HTMLElement,
  rect: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  },
) {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      ...rect,
      height: rect.bottom - rect.top,
      toJSON: () => rect,
      width: rect.right - rect.left,
      x: rect.left,
      y: rect.top,
    }),
  });
}

function calloutJSON(): JSONContent {
  return {
    type: "callout",
    content: [
      {
        type: "callout_title",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Info title" }],
          },
        ],
      },
      {
        type: "callout_prompt",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Callout body" }],
          },
        ],
      },
    ],
  };
}

function accordionJSON(extraSectionContent: JSONContent[] = []): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: "surface-accordion", variant: "page-default" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-accordion", variant: "accordion" },
                content: [
                  {
                    type: "section",
                    attrs: {
                      id: "accordion-section-a",
                      options: { defaultOpen: true },
                    },
                    content: [
                      {
                        type: "accordion_section_title",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Section 1" }],
                          },
                        ],
                      },
                      {
                        type: "accordion_section_panel",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Panel body" }],
                          },
                        ],
                      },
                      ...extraSectionContent,
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function setCursorInEmptyParagraphOwnedBy(editor: Editor, parentType: string) {
  let pos: number | null = null;
  editor.state.doc.descendants((node, nodePos, parent) => {
    if (pos !== null) return false;
    if (parent?.type.name !== parentType) return true;
    if (node.type.name !== "paragraph" || node.content.size > 0) return true;
    pos = nodePos + 1;
    return false;
  });

  if (pos === null) {
    throw new Error(`expected an empty paragraph owned by ${parentType}`);
  }
  editor.commands.setTextSelection(pos);
}

function firstCellContentTypes(editor: Editor): string[] {
  let types: string[] | null = null;

  editor.state.doc.descendants((node) => {
    if (types !== null) return false;
    if (node.type.name !== "cell") return true;
    types = [];
    node.forEach((child) => {
      types?.push(child.type.name);
    });
    return false;
  });

  return types ?? [];
}

function surfaceContentTypes(editor: Editor): string[] {
  const json = editor.getJSON() as JSONContent;
  const surfaceContent: JSONContent[] = json.content?.[0]?.content?.[0]?.content ?? [];
  return surfaceContent.map((node) => node.type ?? "");
}

function firstAccordionSectionContentTypes(editor: Editor): string[] {
  let types: string[] | null = null;

  editor.state.doc.descendants((node) => {
    if (types !== null) return false;
    if (node.type.name !== "section") return true;
    if (node.firstChild?.type.name !== "accordion_section_title") return true;

    const sectionTypes: string[] = [];
    node.forEach((child) => {
      sectionTypes.push(child.type.name);
    });
    types = sectionTypes;
    return false;
  });

  if (types === null) throw new Error("expected an accordion section");
  return types;
}

afterEach(() => {
  for (const [editor, ownedElement] of ownedEditors) {
    if (!editor.isDestroyed) editor.destroy();
    ownedElement?.remove();
  }
  ownedEditors.clear();
});

describe("EmptyInsertionRow", () => {
  it("renders for the active empty paragraph in a structural surface", async () => {
    const editor = makeEditor();

    setCursorInFirstEmptyParagraph(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });
    expect(document.body.textContent).toContain("Start typing or add a block");
    expect(document.body.querySelectorAll("[data-empty-insertion-action]")).toHaveLength(1);
    expect(
      document.body.querySelector('[data-empty-insertion-action="add-block"] svg'),
    ).not.toBeNull();
    expect(document.body.querySelector("p.is-empty")?.getAttribute("data-placeholder")).toBe("");

    editor.destroy();
  });

  it("does not render for a direct empty paragraph in a surface variant with root insertion disabled", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-slide-cover", variant: "slide-cover" },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });

    setCursorInFirstEmptyParagraph(editor);

    await waitFor(() => {
      expect(editor.state.selection.empty).toBe(true);
    });
    expect(resolveEmptyInsertionTarget(editor.state)).toBeNull();
    expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();

    editor.destroy();
  });

  it("still renders inside nested grid cells on a surface variant with root insertion disabled", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-slide-grid", variant: "slide-cover" },
              content: [
                { type: "heading", attrs: { level: 1 } },
                {
                  type: "slide_cover_subtitle",
                  content: [{ type: "paragraph" }],
                },
                {
                  type: "grid",
                  content: [
                    {
                      type: "cell",
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInEmptyParagraphOwnedBy(editor, "cell");

    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "cell",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("renders inside surface regions on a surface variant with root insertion disabled", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-slide-content", variant: "slide-content" },
              content: [
                {
                  type: "region",
                  attrs: { id: "region-a", role: "main" },
                  content: [{ type: "paragraph" }],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInEmptyParagraphOwnedBy(editor, "region");

    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "region",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("exposes the empty insertion row and add action with accessible context", async () => {
    const editor = makeEditor();

    setCursorInFirstEmptyParagraph(editor);

    const insertionRow = await waitFor(() =>
      screen.getByRole("group", { name: "Empty insertion line" }),
    );
    const addBlockAction = screen.getByRole("button", { name: "Add a block" });

    expect(insertionRow.hasAttribute("data-empty-insertion-row")).toBe(true);
    expect(addBlockAction.getAttribute("aria-describedby")).toBe("sc-empty-insertion-row-prompt");
    expect(document.getElementById("sc-empty-insertion-row-prompt")?.textContent).toBe(
      "Start typing or add a block",
    );

    editor.destroy();
  });

  it("does not render inside field-owned paragraphs", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-field", variant: "page-default" },
              content: [
                {
                  type: "callout",
                  content: [
                    {
                      type: "callout_title",
                      content: [{ type: "paragraph" }],
                    },
                    {
                      type: "callout_prompt",
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInFirstEmptyParagraph(editor);

    await waitFor(() => {
      expect(editor.state.selection.empty).toBe(true);
    });
    expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();

    editor.destroy();
  });

  it("does not render for direct empty paragraphs in wrapper sections with child insertion hosts", async () => {
    const editor = makeEditor(
      accordionJSON([
        {
          type: "paragraph",
        },
      ]),
    );

    setCursorInEmptyParagraphOwnedBy(editor, "section");

    await waitFor(() => {
      expect(editor.state.selection.empty).toBe(true);
    });
    expect(resolveEmptyInsertionTarget(editor.state)).toBeNull();
    expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();

    editor.destroy();
  });

  it("uses the mark button to start slash insertion", async () => {
    const editor = makeEditor();
    setCursorInFirstEmptyParagraph(editor);

    const addBlockAction = await waitFor(() => {
      const button = document.body.querySelector<HTMLButtonElement>(
        '[data-empty-insertion-action="add-block"]',
      );
      if (!button) throw new Error("expected add-block action");
      return button;
    });

    fireEvent.mouseDown(addBlockAction);
    fireEvent.click(addBlockAction);

    expect(editor.getText().trim()).toBe("/");

    editor.destroy();
  });

  it("opens slash insertion from the empty row add action", async () => {
    const editor = makeEditorWithRegisteredBlocks();
    setCursorInFirstEmptyParagraph(editor);

    const addBlockAction = await waitFor(() => screen.getByRole("button", { name: "Add a block" }));

    fireEvent.click(addBlockAction);

    expect(editor.getText().trim()).toBe("/");

    expect(isSlashCommandActive(editor.state)).toBe(true);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    await waitFor(() => {
      expect(isSlashCommandActive(editor.state)).toBe(false);
    });

    expect(editor.view.hasFocus()).toBe(true);

    editor.destroy();
  });

  it("activates the add action from native keyboard button semantics", async () => {
    const editor = makeEditor();
    setCursorInFirstEmptyParagraph(editor);

    const addBlockAction = await waitFor(() => screen.getByRole("button", { name: "Add a block" }));

    addBlockAction.focus();
    await userEvent.keyboard("{Enter}");

    expect(editor.getText().trim()).toBe("/");

    editor.destroy();
  });

  it("suppresses stale rows while a grid menu target is active", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-grid", variant: "page-default" },
              content: [
                { type: "paragraph" },
                {
                  type: "grid",
                  content: [
                    {
                      type: "cell",
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInFirstEmptyParagraph(editor);
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).openMenu({
      kind: InteractionTargetKind.Grid,
      pos: nodePos(editor, "grid"),
    });

    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();
    });

    editor.destroy();
  });

  it("keeps the row visible while an empty cell is structurally active", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-active-cell", variant: "page-default" },
              content: [
                {
                  type: "grid",
                  content: [
                    {
                      type: "cell",
                      content: [{ type: "paragraph" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInEmptyParagraphOwnedBy(editor, "cell");
    createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).activateStructuralTarget({
      kind: InteractionTargetKind.Cell,
      pos: nodePos(editor, "cell"),
    });

    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "cell",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("suppresses stale rows during structure movement", async () => {
    const editor = makeEditor();
    setCursorInFirstEmptyParagraph(editor);
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    setEmptyInsertionRowMovementDragActive(editor, true);

    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();
    });

    setEmptyInsertionRowMovementDragActive(editor, false);

    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("clears a grid menu target when clicking field content", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: "surface-grid-field", variant: "page-default" },
                content: [
                  {
                    type: "grid",
                    content: [
                      {
                        type: "cell",
                        content: [calloutJSON()],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    expect(
      createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry).openMenu({
        kind: InteractionTargetKind.Cell,
        pos: nodePos(editor, "cell"),
      }),
    ).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
      kind: InteractionTargetKind.Cell,
    });

    const field = await waitFor(() => {
      const element = document.body.querySelector('[data-slot="callout-prompt"]');
      if (!element) throw new Error("expected callout prompt field");
      return element;
    });

    fireEvent.mouseDown(field);

    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toBeNull();
    editor.destroy();
  });

  it("removes an active empty insertion line before a block on Backspace", async () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-grid", variant: "page-default" },
              content: [
                {
                  type: "grid",
                  content: [
                    {
                      type: "cell",
                      content: [{ type: "paragraph" }, calloutJSON()],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    setCursorInFirstEmptyParagraph(editor);
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

    expect(firstCellContentTypes(editor)).toEqual(["callout"]);
    editor.destroy();
  });

  it("keeps the final empty insertion line in an otherwise empty region", async () => {
    const editor = makeEditor();
    setCursorInFirstEmptyParagraph(editor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

    expect(surfaceContentTypes(editor)).toEqual(["paragraph"]);
    expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    editor.destroy();
  });

  it("creates an empty insertion line when blank surface space after a final layout is clicked", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: "surface-layout", variant: "page-default" },
                content: [
                  {
                    type: "layout",
                    attrs: { id: "layout-tabs", variant: "tabs" },
                    content: [
                      {
                        type: "section",
                        attrs: { id: "tab-a", role: "tab-panel" },
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    const surfaceElement = await waitFor(() => nodeElement(editor, nodePos(editor, "surface")));
    const layoutElement = nodeElement(editor, nodePos(editor, "layout"));
    stubRect(surfaceElement, { bottom: 500, left: 0, right: 500, top: 0 });
    stubRect(layoutElement, { bottom: 120, left: 24, right: 476, top: 24 });

    fireEvent.mouseDown(surfaceElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(surfaceContentTypes(editor)).toEqual(["layout", "paragraph"]);
    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "surface",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("does not create an empty insertion line from blank root space on a surface variant with root insertion disabled", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: "surface-slide-layout", variant: "slide-cover" },
                content: [
                  { type: "heading", attrs: { level: 1 } },
                  {
                    type: "slide_cover_subtitle",
                    content: [{ type: "paragraph" }],
                  },
                  {
                    type: "layout",
                    attrs: { id: "layout-slide", variant: "tabs" },
                    content: [
                      {
                        type: "section",
                        attrs: { id: "slide-section-a", role: "tab-panel" },
                        content: [{ type: "paragraph" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    const surfaceElement = await waitFor(() => nodeElement(editor, nodePos(editor, "surface")));
    const layoutElement = nodeElement(editor, nodePos(editor, "layout"));
    stubRect(surfaceElement, { bottom: 500, left: 0, right: 500, top: 0 });
    stubRect(layoutElement, { bottom: 120, left: 24, right: 476, top: 24 });

    fireEvent.mouseDown(surfaceElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(surfaceContentTypes(editor)).toEqual(["heading", "slide_cover_subtitle", "layout"]);
    expect(resolveEmptyInsertionTarget(editor.state)).toBeNull();
    expect(document.body.querySelector("[data-empty-insertion-row]")).toBeNull();

    editor.destroy();
  });

  it("does not create a direct section paragraph after a nested insertion host", async () => {
    const editor = makeEditor(accordionJSON(), false);
    render(<EditorContent editor={editor} />);

    const sectionElement = await waitFor(() => nodeElement(editor, nodePos(editor, "section")));
    const panelElement = nodeElement(editor, nodePos(editor, "accordion_section_panel"));
    stubRect(sectionElement, { bottom: 420, left: 0, right: 500, top: 0 });
    stubRect(panelElement, { bottom: 160, left: 24, right: 476, top: 64 });

    fireEvent.mouseDown(sectionElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(firstAccordionSectionContentTypes(editor)).toEqual([
      "accordion_section_title",
      "accordion_section_panel",
    ]);
    editor.destroy();
  });

  it("does not create a second paragraph when blank surface space follows a textblock", () => {
    const editor = makeEditor(undefined, false);
    render(<EditorContent editor={editor} />);

    const surfaceElement = nodeElement(editor, nodePos(editor, "surface"));
    const paragraphElement = nodeElement(editor, nodePos(editor, "paragraph"));
    stubRect(surfaceElement, { bottom: 500, left: 0, right: 500, top: 0 });
    stubRect(paragraphElement, { bottom: 48, left: 24, right: 476, top: 24 });

    fireEvent.mouseDown(surfaceElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(surfaceContentTypes(editor)).toEqual(["paragraph"]);
    editor.destroy();
  });

  it("creates an empty insertion line in blank cell space after a final nested layout", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: "surface-grid-layout", variant: "page-default" },
                content: [
                  {
                    type: "grid",
                    attrs: { id: "grid-a" },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: "cell-a" },
                        content: [
                          {
                            type: "layout",
                            attrs: { id: "layout-a", variant: "basic" },
                            content: [
                              {
                                type: "section",
                                attrs: { id: "section-a" },
                                content: [{ type: "paragraph" }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    const cellElement = await waitFor(() => nodeElement(editor, nodePos(editor, "cell")));
    const layoutElement = nodeElement(editor, nodePos(editor, "layout"));
    stubRect(cellElement, { bottom: 420, left: 0, right: 420, top: 0 });
    stubRect(layoutElement, { bottom: 140, left: 16, right: 404, top: 16 });

    fireEvent.mouseDown(cellElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(firstCellContentTypes(editor)).toEqual(["layout", "paragraph"]);
    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "cell",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("creates an empty insertion line after a fill layout in a page-flow cell", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: { id: "surface-grid-tabs", variant: "page-default" },
                content: [
                  {
                    type: "grid",
                    attrs: { id: "grid-a" },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: "cell-a" },
                        content: [
                          {
                            type: "layout",
                            attrs: { id: "layout-tabs", variant: "tabs" },
                            content: [
                              {
                                type: "section",
                                attrs: { id: "section-a", role: "tab-panel" },
                                content: [{ type: "paragraph" }],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    const cellElement = await waitFor(() => nodeElement(editor, nodePos(editor, "cell")));
    const layoutElement = nodeElement(editor, nodePos(editor, "layout"));
    stubRect(cellElement, { bottom: 420, left: 0, right: 420, top: 0 });
    stubRect(layoutElement, { bottom: 140, left: 16, right: 404, top: 16 });

    fireEvent.mouseDown(cellElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(firstCellContentTypes(editor)).toEqual(["layout", "paragraph"]);
    expect(resolveEmptyInsertionTarget(editor.state)).toMatchObject({
      parentType: "cell",
    });
    await waitFor(() => {
      expect(document.body.querySelector("[data-empty-insertion-row]")).not.toBeNull();
    });

    editor.destroy();
  });

  it("does not create an empty insertion line after an active bounded fill layout in a cell", async () => {
    const editor = makeEditor(
      {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            content: [
              {
                type: "surface",
                attrs: {
                  id: "surface-region-grid-tabs",
                  variant: "page-default",
                },
                content: [
                  {
                    type: "region",
                    attrs: { id: "region-a", role: "main" },
                    content: [
                      {
                        type: "grid",
                        attrs: { id: "grid-a" },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: "cell-a" },
                            content: [
                              {
                                type: "layout",
                                attrs: { id: "layout-tabs", variant: "tabs" },
                                content: [
                                  {
                                    type: "section",
                                    attrs: {
                                      id: "section-a",
                                      role: "tab-panel",
                                    },
                                    content: [{ type: "paragraph" }],
                                  },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    );
    render(<EditorContent editor={editor} />);

    const cellElement = await waitFor(() => nodeElement(editor, nodePos(editor, "cell")));
    const layoutElement = nodeElement(editor, nodePos(editor, "layout"));
    stubRect(cellElement, { bottom: 420, left: 0, right: 420, top: 0 });
    stubRect(layoutElement, { bottom: 140, left: 16, right: 404, top: 16 });

    fireEvent.mouseDown(cellElement, {
      button: 0,
      clientX: 80,
      clientY: 260,
    });

    expect(firstCellContentTypes(editor)).toEqual(["layout"]);
    expect(resolveEmptyInsertionTarget(editor.state)?.parentType).not.toBe("cell");

    editor.destroy();
  });
});
