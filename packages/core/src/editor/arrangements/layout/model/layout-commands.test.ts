// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import { TabsIcon as Tabs } from "@phosphor-icons/react";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  CourseSelectionMode,
  resolveCourseSelectionFacts,
} from "@/editor/selection/selection-facts";
import { setNodeSelectionInTransaction } from "@/editor/selection/selection-transactions";
import { SECTION_ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

import { LayoutAuthoringNode, SectionAuthoringNode } from "../authoring/layout-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "../accordion/accordion-section-nodes";
import { builtInLayoutDefinitions } from "./built-in-layout-definitions";
import {
  appendLayoutSectionAt,
  canAppendLayoutSectionAt,
  createLayoutTemplate,
  deleteLayoutAt,
  deleteLayoutSectionAt,
  duplicateLayoutAt,
  duplicateLayoutSectionAt,
  reorderLayoutSectionAt,
  setLayoutSectionVerticalPositionAt,
  setLayoutSectionVerticalPositionInTransaction,
} from "./layout-commands";
import type { LayoutDefinition } from "./layout-definition";
import { createLayoutRegistry } from "./layout-registry";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

const missingIdsLayoutDefinition = {
  id: "test-missing-layout-ids",
  title: "Missing layout ids",
  description: "Invalid layout fixture",
  icon: Tabs,
  createContent: () => ({
    type: "layout",
    attrs: { variant: "test-missing-layout-ids" },
    content: [
      {
        type: "section",
        attrs: { role: "test" },
        content: [{ type: "paragraph" }],
      },
    ],
  }),
  section: {
    label: "Test section",
    addLabel: "Add test section",
    create: () => ({
      type: "section",
      attrs: { role: "test" },
      content: [{ type: "paragraph" }],
    }),
  },
} satisfies LayoutDefinition;

const placeholderLayoutDefinition = {
  id: "test-layout-placeholders",
  title: "Layout placeholders",
  description: "Layout-owned placeholder fixture",
  icon: Tabs,
  placeholders: {
    test_layout_field: "Owned by the layout",
  },
  createContent: () => ({
    type: "layout",
    attrs: { variant: "test-layout-placeholders" },
    content: [{ type: "section", content: [{ type: "paragraph" }] }],
  }),
} satisfies LayoutDefinition;

const testLayoutRegistry = createLayoutRegistry([
  ...builtInLayoutDefinitions,
  missingIdsLayoutDefinition,
  placeholderLayoutDefinition,
]);

const TestBlockNode = Node.create({
  name: "test_block",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-id"),
        renderHTML: (attrs: { id?: unknown }) =>
          typeof attrs.id === "string" ? { "data-id": attrs.id } : {},
      },
      horizontalAlignment: { default: "left" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-test-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-test-block": "" }];
  },
});

const TestSectionArrangementNode = Node.create({
  name: "test_section_arrangement",
  group: SECTION_ARRANGEMENT_CONTENT,
  content: "paragraph+",

  parseHTML() {
    return [{ tag: "div[data-test-section-arrangement]" }];
  },

  renderHTML() {
    return ["div", { "data-test-section-arrangement": "" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      TestSectionArrangementNode,
    ],
  });
}

function makeCourseEditor(content: JSONContent[]) {
  return new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      TestBlockNode,
      TestSectionArrangementNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-1", variant: "page-default" },
              content,
            },
          ],
        },
      ],
    },
  });
}

function block(id: string): JSONContent {
  return { type: "test_block", attrs: { id } };
}

function section(id: string, content: JSONContent[]): JSONContent {
  return { type: "section", attrs: { id, role: "column" }, content };
}

function layout(content: JSONContent[], options: Record<string, unknown> = {}) {
  return {
    type: "layout",
    attrs: {
      variant: "columns",
      options: { columns: content.length, ...options },
    },
    content,
  };
}

function nodePos(editor: Editor, type: string, id?: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (id !== undefined && node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });

  if (found === null) {
    throw new Error(`Could not find ${type}${id ? `:${id}` : ""}`);
  }

  return found;
}

function layoutAt(editor: Editor, layoutIndex = 0): JSONContent {
  const surface = editor.getJSON().content?.[0]?.content?.[0] as JSONContent | undefined;
  const layouts = (surface?.content ?? []).filter((node) => node.type === "layout");
  const layoutNode = layouts[layoutIndex];
  if (!layoutNode) throw new Error(`Could not find layout:${layoutIndex}`);
  return layoutNode;
}

function surfaceChildren(editor: Editor): JSONContent[] {
  const surface = editor.getJSON().content?.[0]?.content?.[0] as JSONContent | undefined;
  return surface?.content ?? [];
}

function sectionIds(layoutNode: JSONContent): string[] {
  return (layoutNode.content ?? [])
    .map((node) => node.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function sectionBlockIds(sectionNode: JSONContent): string[] {
  return (sectionNode.content ?? [])
    .map((node) => node.attrs?.["id"])
    .filter((id): id is string => typeof id === "string");
}

function expectLayoutAndSectionIds(node: JSONContent | null | undefined) {
  expect(node?.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
  for (const child of node?.content ?? []) {
    if (child.type !== "section") continue;
    expect(child.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
  }
}

describe("layout command templates", () => {
  it("does not create removed placeholder layout templates", () => {
    const editor = makeEditor();

    expect(createLayoutTemplate(editor.schema, "basic", testLayoutRegistry)).toBeNull();
    expect(createLayoutTemplate(editor.schema, "columns", testLayoutRegistry)).toBeNull();
    expect(createLayoutTemplate(editor.schema, "media", testLayoutRegistry)).toBeNull();
    editor.destroy();
  });

  it("creates a tabs layout with section-backed panels", () => {
    const editor = makeEditor();

    const template = createLayoutTemplate(editor.schema, "tabs", testLayoutRegistry, {
      variant: "pills",
      label: "Lesson sections",
      tabs: 2,
      labels: ["Overview", "Practice"],
    });

    expect(template?.toJSON()).toMatchObject({
      type: "layout",
      attrs: {
        variant: "tabs",
        options: { variant: "pills", label: "Lesson sections" },
      },
      content: [
        {
          type: "section",
          attrs: {
            role: "tab-panel",
            label: "Overview",
            options: { label: "Overview" },
          },
          content: [{ type: "paragraph" }],
        },
        {
          type: "section",
          attrs: {
            role: "tab-panel",
            label: "Practice",
            options: { label: "Practice" },
          },
        },
      ],
    });
    expectLayoutAndSectionIds(template?.toJSON());
    editor.destroy();
  });

  it("creates an accordion layout with section-backed panels", () => {
    const editor = makeEditor();

    const template = createLayoutTemplate(editor.schema, "accordion", testLayoutRegistry, {
      variant: "borderless",
      allowMultiple: true,
      label: "Topics",
      sections: 2,
      labels: ["Before class", "After class"],
    });

    expect(template?.toJSON()).toMatchObject({
      type: "layout",
      attrs: {
        variant: "accordion",
        options: {
          variant: "borderless",
          allowMultiple: true,
          label: "Topics",
        },
      },
      content: [
        {
          type: "section",
          attrs: {
            role: "accordion-panel",
            options: { defaultOpen: true },
          },
          content: [
            {
              type: "accordion_section_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Before class" }],
                },
              ],
            },
            {
              type: "accordion_section_panel",
              content: [{ type: "paragraph" }],
            },
          ],
        },
        {
          type: "section",
          attrs: {
            role: "accordion-panel",
            options: { defaultOpen: false },
          },
          content: [
            {
              type: "accordion_section_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "After class" }],
                },
              ],
            },
            {
              type: "accordion_section_panel",
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    expectLayoutAndSectionIds(template?.toJSON());
    editor.destroy();
  });

  it("rejects layout templates missing stable layout or section ids", () => {
    const editor = makeEditor();

    expect(
      createLayoutTemplate(editor.schema, "test-missing-layout-ids", testLayoutRegistry),
    ).toBeNull();

    editor.destroy();
  });
});

describe("bounded Section vertical position commands", () => {
  it("updates an active handoff Section while preserving attrs and content", () => {
    const editor = makeCourseEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "layout",
            attrs: { id: "layout-tabs", variant: "tabs" },
            content: [
              {
                type: "section",
                attrs: { id: "section-a", role: "tab-panel", label: "Overview" },
                content: [
                  {
                    type: "test_block",
                    attrs: { id: "block-a", horizontalAlignment: "right" },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const sectionPos = nodePos(editor, "section", "section-a");

    expect(
      setLayoutSectionVerticalPositionAt(editor, sectionPos, "middle", builtInBlockRegistry),
    ).toBe(true);
    expect(editor.state.doc.nodeAt(sectionPos)?.attrs).toMatchObject({
      id: "section-a",
      label: "Overview",
      role: "tab-panel",
      verticalPosition: "middle",
    });
    expect(editor.state.doc.nodeAt(sectionPos)?.firstChild?.attrs).toMatchObject({
      horizontalAlignment: "right",
      id: "block-a",
    });

    const tr = setLayoutSectionVerticalPositionInTransaction(
      editor.state.tr,
      sectionPos,
      "bottom",
      builtInBlockRegistry,
    );
    expect(tr?.doc.nodeAt(sectionPos)?.attrs["verticalPosition"]).toBe("bottom");
    expect(editor.state.doc.nodeAt(sectionPos)?.attrs["verticalPosition"]).toBe("middle");

    editor.destroy();
  });

  it("rejects natural-flow, stale, invalid, and no-op Section writes", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: { id: "layout-tabs", variant: "tabs" },
        content: [section("section-a", [block("block-a")])],
      },
    ]);
    const sectionPos = nodePos(editor, "section", "section-a");

    expect(
      setLayoutSectionVerticalPositionAt(editor, sectionPos, "middle", builtInBlockRegistry),
    ).toBe(false);
    expect(setLayoutSectionVerticalPositionAt(editor, 999, "middle", builtInBlockRegistry)).toBe(
      false,
    );
    expect(
      setLayoutSectionVerticalPositionAt(
        editor,
        sectionPos,
        "stretch" as never,
        builtInBlockRegistry,
      ),
    ).toBe(false);

    const boundedEditor = makeCourseEditor([
      {
        type: "region",
        attrs: { id: "region-a" },
        content: [
          {
            type: "layout",
            attrs: { id: "layout-tabs", variant: "tabs" },
            content: [section("section-b", [block("block-b")])],
          },
        ],
      },
    ]);
    expect(
      setLayoutSectionVerticalPositionAt(
        boundedEditor,
        nodePos(boundedEditor, "section", "section-b"),
        "top",
        builtInBlockRegistry,
      ),
    ).toBe(false);

    editor.destroy();
    boundedEditor.destroy();
  });
});

describe("layout definition registry", () => {
  it("keeps placeholder copy on the owning layout definition", () => {
    expect(
      testLayoutRegistry.resolvePlaceholder(
        "test-layout-placeholders",
        "test_layout_field",
        {} as never,
      ),
    ).toBe("Owned by the layout");
  });

  it("resolves the built-in layout definitions by id", () => {
    expect(testLayoutRegistry.getById("basic")).toBeUndefined();
    expect(testLayoutRegistry.getById("columns")).toBeUndefined();
    expect(testLayoutRegistry.getById("media")).toBeUndefined();
    expect(testLayoutRegistry.getById("timeline")).toBeUndefined();
    expect(testLayoutRegistry.getById("tabs")).toMatchObject({
      id: "tabs",
      nodeType: "layout",
      title: "Tabs",
      quickMenu: {
        attr: "options",
        controls: [{ kind: "select", name: "variant" }],
      },
      settingsSheet: {
        nodeType: "layout",
        attr: "options",
        title: "Tabs settings",
      },
      section: {
        label: "Tab",
        addLabel: "Add tab",
        settingsSheet: {
          nodeType: "section",
          attr: "options",
          title: "Tab settings",
        },
      },
    });
    expect(testLayoutRegistry.getById("accordion")).toMatchObject({
      id: "accordion",
      nodeType: "layout",
      title: "Accordion",
      quickMenu: {
        attr: "options",
        controls: expect.arrayContaining([
          expect.objectContaining({ kind: "boolean", name: "allowMultiple" }),
        ]),
      },
      settingsSheet: {
        nodeType: "layout",
        attr: "options",
        title: "Accordion settings",
      },
      section: {
        label: "Accordion section",
        addLabel: "Add section",
        settingsSheet: {
          nodeType: "section",
          attr: "options",
          title: "Accordion section settings",
        },
      },
    });
  });
});

describe("layout section reorder commands", () => {
  it("rejects appended sections missing stable ids", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: {
          id: "layout-invalid-section-create",
          variant: "test-missing-layout-ids",
        },
        content: [
          {
            type: "section",
            attrs: { id: "section-a", role: "test" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const before = editor.getJSON();

    expect(
      appendLayoutSectionAt(
        editor,
        nodePos(editor, "layout", "layout-invalid-section-create"),
        testLayoutRegistry,
      ),
    ).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("rejects appending sections to layouts without stable ids", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: { variant: "tabs", options: { variant: "default" } },
        content: [
          {
            type: "section",
            attrs: {
              id: "section-a",
              role: "tab-panel",
              options: { label: "Tab 1" },
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const layoutPos = nodePos(editor, "layout");
    const before = editor.getJSON();

    expect(canAppendLayoutSectionAt(editor, layoutPos, testLayoutRegistry)).toBe(false);
    expect(appendLayoutSectionAt(editor, layoutPos, testLayoutRegistry)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("appends tabs through the tabs layout definition", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: {
          id: "layout-tabs",
          variant: "tabs",
          options: { variant: "default" },
        },
        content: [
          {
            type: "section",
            attrs: {
              id: "tab-a",
              role: "tab-panel",
              options: { label: "Tab 1" },
            },
            content: [{ type: "paragraph" }],
          },
          {
            type: "section",
            attrs: {
              id: "tab-b",
              role: "tab-panel",
              options: { label: "Tab 2" },
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);

    const layoutPos = nodePos(editor, "layout", "layout-tabs");

    expect(canAppendLayoutSectionAt(editor, layoutPos, testLayoutRegistry)).toBe(true);
    expect(appendLayoutSectionAt(editor, layoutPos, testLayoutRegistry)).toBe(true);

    const tabs = layoutAt(editor);
    expect(tabs.content).toHaveLength(3);
    expect(tabs.content?.[2]).toMatchObject({
      type: "section",
      attrs: {
        role: "tab-panel",
        label: "Tab 3",
        options: { label: "Tab 3" },
      },
      content: [{ type: "paragraph" }],
    });
    expect(tabs.content?.[2]?.attrs?.["id"]).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    expect(resolveCourseSelectionFacts(editor.state.selection).selectionMode).not.toBe(
      CourseSelectionMode.NodeSelection,
    );

    editor.destroy();
  });

  it("does not preserve a stale object selection when appending a tab", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: {
          id: "layout-tabs",
          variant: "tabs",
          options: { variant: "default" },
        },
        content: [
          {
            type: "section",
            attrs: {
              id: "tab-a",
              role: "tab-panel",
              options: { label: "Tab 1" },
            },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ]);
    const layoutPos = nodePos(editor, "layout", "layout-tabs");
    const tr = editor.state.tr;
    expect(setNodeSelectionInTransaction(tr, layoutPos)).toBe(true);
    editor.view.dispatch(tr);

    expect(appendLayoutSectionAt(editor, layoutPos, testLayoutRegistry)).toBe(true);

    const facts = resolveCourseSelectionFacts(editor.state.selection);
    expect(facts.selectionMode).toBe(CourseSelectionMode.TextCaret);
    expect(editor.state.selection.from).toBeGreaterThan(
      nodePos(editor, "section", sectionIds(layoutAt(editor))[1]!),
    );

    editor.destroy();
  });

  it("duplicates a whole layout with fresh layout and section ids", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: {
          id: "layout-a",
          variant: "tabs",
          options: { variant: "default" },
        },
        content: [
          {
            type: "section",
            attrs: {
              id: "section-a",
              role: "tab-panel",
              options: { label: "Tab 1" },
            },
            content: [block("a")],
          },
        ],
      },
    ]);

    expect(duplicateLayoutAt(editor, nodePos(editor, "layout", "layout-a"))).toBe(true);

    const children = surfaceChildren(editor);
    expect(children).toHaveLength(2);
    expect(children[0]?.attrs?.["id"]).toBe("layout-a");
    expect(children[1]?.type).toBe("layout");
    expect(children[1]?.attrs?.["id"]).not.toBe("layout-a");
    expect(children[1]?.attrs).toMatchObject({
      variant: "tabs",
      options: { variant: "default" },
    });
    expect(children[1]?.content?.[0]?.attrs?.["id"]).not.toBe("section-a");

    editor.destroy();
  });

  it("duplicates a section with fresh section and child block ids", () => {
    const editor = makeCourseEditor([
      layout([section("section-a", [block("a")]), section("section-b", [block("b")])]),
    ]);

    expect(duplicateLayoutSectionAt(editor, nodePos(editor, "section", "section-a"))).toBe(true);

    const sections = layoutAt(editor).content ?? [];
    expect(sections).toHaveLength(3);
    expect(sections[0]?.attrs?.["id"]).toBe("section-a");
    expect(sections[1]?.attrs?.["id"]).not.toBe("section-a");
    expect(sections[2]?.attrs?.["id"]).toBe("section-b");

    editor.destroy();
  });

  it("deletes a whole layout and all contained authored content", () => {
    const editor = makeCourseEditor([
      {
        type: "layout",
        attrs: { id: "layout-a", variant: "tabs" },
        content: [section("section-a", [block("a")])],
      },
    ]);

    expect(deleteLayoutAt(editor, nodePos(editor, "layout", "layout-a"))).toBe(true);
    expect(surfaceChildren(editor).map((node) => node.type)).toEqual(["paragraph"]);

    editor.destroy();
  });

  it("deletes a section and removes the layout when it was the final section", () => {
    const editor = makeCourseEditor([
      layout([section("section-a", [block("a")]), section("section-b", [block("b")])]),
      {
        type: "layout",
        attrs: { id: "layout-single", variant: "tabs" },
        content: [section("section-c", [block("c")])],
      },
    ]);

    expect(deleteLayoutSectionAt(editor, nodePos(editor, "section", "section-a"))).toBe(true);
    expect(sectionIds(layoutAt(editor))).toEqual(["section-b"]);

    expect(deleteLayoutSectionAt(editor, nodePos(editor, "section", "section-c"))).toBe(true);
    expect(surfaceChildren(editor).filter((node) => node.type === "layout")).toHaveLength(1);

    editor.destroy();
  });

  it("reorders sections inside one layout and preserves ids, content, and attrs", () => {
    const editor = makeCourseEditor([
      layout(
        [
          section("section-a", [block("a")]),
          section("section-b", [block("b")]),
          section("section-c", [block("c")]),
        ],
        { gap: "wide" },
      ),
    ]);

    expect(
      reorderLayoutSectionAt(
        editor,
        nodePos(editor, "section", "section-a"),
        nodePos(editor, "layout"),
        2,
      ),
    ).toBe(true);

    const reordered = layoutAt(editor);
    expect(reordered.attrs).toMatchObject({
      variant: "columns",
      options: { columns: 3, gap: "wide" },
    });
    expect(sectionIds(reordered)).toEqual(["section-b", "section-c", "section-a"]);
    expect((reordered.content ?? []).map(sectionBlockIds)).toEqual([["b"], ["c"], ["a"]]);

    editor.destroy();
  });

  it("rejects moving a section outside its owning layout", () => {
    const editor = makeCourseEditor([
      layout([section("section-a", [block("a")])]),
      layout([section("section-b", [block("b")])]),
    ]);
    const before = editor.getJSON();
    const sourceSectionPos = nodePos(editor, "section", "section-a");
    const targetLayoutPos = (() => {
      let count = 0;
      let found: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (node.type.name !== "layout") return true;
        count += 1;
        if (count === 2) {
          found = pos;
          return false;
        }
        return true;
      });

      if (found === null) throw new Error("Could not find second layout");
      return found;
    })();

    expect(reorderLayoutSectionAt(editor, sourceSectionPos, targetLayoutPos, 0)).toBe(false);
    expect(editor.getJSON()).toEqual(before);

    editor.destroy();
  });

  it("does not create grid columns while reordering sections", () => {
    const editor = makeCourseEditor([
      layout([section("section-a", [block("a")]), section("section-b", [block("b")])]),
    ]);

    expect(
      reorderLayoutSectionAt(
        editor,
        nodePos(editor, "section", "section-b"),
        nodePos(editor, "layout"),
        0,
      ),
    ).toBe(true);

    expect(JSON.stringify(editor.getJSON())).not.toContain("columnWidths");
    expect(sectionIds(layoutAt(editor))).toEqual(["section-b", "section-a"]);

    editor.destroy();
  });
});
