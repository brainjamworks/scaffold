// @vitest-environment happy-dom

import { CircleIcon } from "@phosphor-icons/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { z } from "zod";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { createCourseStructureCommandsExtension } from "@/document/authoring/course-structure-commands";
import type { ContentIdentityRewrite } from "@/document/model/identity/clone-with-new-ids";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import {
  AUTHORING_FRAME_EDITABLE_ATTR,
  authoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import type { StructuralFragmentCarrierLimits } from "./structural-clipboard/structural-fragment-carrier";
import {
  SCAFFOLD_STRUCTURAL_FRAGMENT_MIME,
  encodeStructuralFragment,
  type StructuralFragmentContent,
} from "./structural-clipboard/structural-fragment-codec";
import { createStructuralClipboardPolicy } from "./structural-clipboard-policy";

const CoreBlockNode = clipboardNode("core_block", "div[data-core-block]");
const ContributedBlockNode = clipboardNode(
  "contributed_block",
  "div[data-contributed-block]",
  true,
);
const QuizOwnerNode = clipboardNode("quiz_owner", "div[data-quiz-owner]", false, "block+");
const QuizChildNode = clipboardNode("quiz_child", "div[data-quiz-child]");
const HostBlockNode = clipboardNode("host_block", "div[data-host-block]", false, "block+");
const UnavailableBlockNode = Node.create({
  name: "unavailable_block",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => ({
    capabilityId: { default: null },
    original: { default: null },
  }),
  renderHTML: ({ HTMLAttributes }) => ["div", HTMLAttributes],
});
const LayoutNode = structuralVariantNode("layout", "section[data-layout]", "block+");
const SectionNode = structuralContainerNode("section", "section[data-section]");
const AccordionPanelNode = structuralContainerNode(
  "accordion_section_panel",
  "div[data-accordion-panel]",
);
const RegionNode = structuralContainerNode("region", "div[data-region]");
const GridNode = structuralContainerNode("grid", "div[data-grid]", "cell+");
const CellNode = structuralContainerNode("cell", "div[data-cell]");
const FlashcardNode = structuralContainerNode(
  "flashcard",
  "section[data-flashcard]",
  "flashcard_card+",
);
const FlashcardCardNode = structuralContainerNode(
  "flashcard_card",
  "div[data-flashcard-card]",
  "flashcard_card_front flashcard_card_back",
);
const FlashcardCardFrontNode = structuralContainerNode(
  "flashcard_card_front",
  "div[data-flashcard-front]",
);
const FlashcardCardBackNode = structuralContainerNode(
  "flashcard_card_back",
  "div[data-flashcard-back]",
);
const SurfaceNode = structuralVariantNode("surface", "article[data-surface]");
const CourseDocumentClipboardNode = Node.create({
  name: "courseDocument",
  group: "block",
  content: "surface+",
  addAttributes: () => ({ mode: { default: "slideshow" } }),
  renderHTML: ({ HTMLAttributes }) => ["main", HTMLAttributes, 0],
});
const CourseSurfaceClipboardNode = Node.create({
  name: "surface",
  group: "block",
  content: "block+",
  selectable: false,
  addAttributes: () => ({
    variant: { default: null },
    settings: { default: {} },
  }),
  renderHTML: ({ HTMLAttributes }) => ["article", HTMLAttributes, 0],
});

const coreBlockDefinition = defineBlock({ nodeType: "core_block", title: "Core block" });
const flashcardBlockDefinition = defineBlock({ nodeType: "flashcard", title: "Flashcards" });
const quizOwnerDefinition = defineBlock({
  nodeType: "quiz_owner",
  title: "Quiz owner",
  interaction: { embeddedChildSelection: "delegate-to-parent" },
});
const quizChildDefinition = defineBlock({ nodeType: "quiz_child", title: "Quiz child" });
const hostBlockDefinition = defineBlock({ nodeType: "host_block", title: "Host block" });
const contributedBlockDefinition = {
  ...defineBlock({ nodeType: "contributed_block", title: "Contributed block" }),
  attrSchemas: {
    data: z.object({ paragraphId: z.string(), mediaRef: z.string().optional() }).strict(),
  },
};
const layoutDefinitions = createLayoutRegistry([
  {
    id: "core-layout",
    title: "Core layout",
    description: "Core layout",
    icon: CircleIcon,
    createContent: () => ({ type: "layout", attrs: { variant: "core-layout" } }),
  },
  {
    id: "contributed-layout",
    title: "Contributed layout",
    description: "Contributed layout",
    icon: CircleIcon,
    createContent: () => ({ type: "layout", attrs: { variant: "contributed-layout" } }),
  },
]);
const surfaceVariants = createSurfaceVariantRegistry([
  {
    id: "core-surface",
    modes: ["slideshow"],
    defaultForModes: ["slideshow"],
    title: "Core surface",
    description: "Core surface",
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "core-surface", settings: {} },
      content: [],
    }),
  },
  {
    id: "contributed-surface",
    modes: ["slideshow"],
    title: "Contributed surface",
    description: "Contributed surface",
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "contributed-surface", settings: {} },
      content: [],
    }),
  },
  {
    id: "page-surface",
    modes: ["page"],
    defaultForModes: ["page"],
    title: "Page surface",
    description: "Page surface",
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "page-surface", settings: {} },
      content: [],
    }),
  },
  {
    id: "fixed-surface",
    modes: ["slideshow"],
    title: "Fixed surface",
    description: "Fixed surface",
    structurePolicy: { fixedChildren: [{ type: "core_block" }] },
    createSurface: ({ surfaceId }) => ({
      type: "surface",
      attrs: { id: surfaceId, variant: "fixed-surface", settings: {} },
      content: [],
    }),
  },
]);
const carrierLimits: StructuralFragmentCarrierLimits = {
  maxCarrierBytes: 128_000,
  fragmentDecodeLimits: {
    maxEncodedBytes: 64_000,
    maxNestingDepth: 32,
    maxVisitedValues: 4_000,
    maxArrayLength: 1_000,
    maxObjectPropertyCount: 100,
    maxStringBytes: 32_000,
  },
};

const contributedIdentityRewrite = vi.fn(({ content, nodeIdChanges }) => {
  const data = content.attrs?.["data"];
  const paragraphId =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)["paragraphId"]
      : undefined;
  const repairedId =
    typeof paragraphId === "string" ? nodeIdChanges.get(paragraphId as never) : null;
  if (!repairedId) return content;
  return {
    ...content,
    attrs: {
      ...content.attrs,
      data: { ...(data as Record<string, unknown>), paragraphId: repairedId },
    },
  };
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
  vi.clearAllMocks();
});

describe("structural clipboard policy", () => {
  it("copies one exact mounted Core Block as a structural fragment without mutation", () => {
    const editor = makeEditor();
    const blockPos = nodePositionById(editor, "core-block-a");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blockPos)),
    );
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "copy");

    expect(event.defaultPrevented).toBe(true);
    expect(JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null")).toMatchObject({
      rootKind: "block",
      content: block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
    });
    expect(editor.getJSON()).toEqual(before);
    expect(written["text/plain"]).toBe("Block: Core block");
    expect(written["text/plain"]).not.toContain('{"');
  });

  it("captures structural Copy before a NodeView can isolate the DOM event", () => {
    const editor = makeEditor();
    selectNode(editor, "core-block-a");
    const editable = editableFrameFor(editor, "core-block-a");
    editable.addEventListener("copy", (event) => event.stopPropagation(), { once: true });

    const { event, written } = dispatchClipboard(editor, "copy", {}, editable);

    expect(event.defaultPrevented).toBe(true);
    expect(written["text/plain"]).toBe("Block: Core block");
    expect(JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null")).toMatchObject({
      rootKind: "block",
      content: { type: "core_block", attrs: { id: "core-block-a" } },
    });
  });

  it("leaves clipboard events from a nested editable owner untouched", () => {
    const editor = makeEditor();
    selectNode(editor, "core-block-a");
    const nestedEditor = document.createElement("div");
    nestedEditor.contentEditable = "true";
    editableFrameFor(editor, "core-block-a").append(nestedEditor);
    nestedEditor.addEventListener("copy", (event) => event.stopPropagation(), { once: true });

    const { event, written } = dispatchClipboard(editor, "copy", {}, nestedEditor);

    expect(event.defaultPrevented).toBe(false);
    expect(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]).toBeUndefined();
  });

  it.each([
    ["contributed Block", "contrib-blk1", "block", "contributed_block"],
    ["Layout", "layout-root1", "layout", "layout"],
  ] as const)(
    "copies one exact mounted %s through the same structural carrier",
    (_label, sourceId, rootKind, type) => {
      const editor = makeEditor();
      selectNode(editor, sourceId);
      const before = editor.getJSON();

      const { event, written } = dispatchClipboard(editor, "copy");
      const envelope = JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null");

      expect(event.defaultPrevented).toBe(true);
      expect(envelope).toMatchObject({ rootKind, content: { type, attrs: { id: sourceId } } });
      expect(editor.getJSON()).toEqual(before);
      expect(written["text/plain"]).not.toContain(envelope.content.attrs.id);
      expect(written["text/html"]).not.toContain(envelope.content.attrs.id);
    },
  );

  it("copies the delegated parent owner from a text caret inside a nested assessment Block", () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          {
            type: "quiz_owner",
            attrs: { id: "quiz-owner01" },
            content: [block("quiz_child", "quiz-child01", "quiz-para001", "Nested question")],
          },
          block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        ],
      },
    });
    setCursorAtEnd(editor, "quiz-para001");

    const { event, written } = dispatchClipboard(editor, "copy");

    expect(event.defaultPrevented).toBe(true);
    expect(JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null")).toMatchObject({
      rootKind: "block",
      content: { type: "quiz_owner", attrs: { id: "quiz-owner01" } },
    });
  });

  it("captures structural Paste before a NodeView can isolate the DOM event", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    selectNode(editor, "core-block-a");
    const copied = dispatchClipboard(editor, "copy").written;
    selectNode(editor, "core-block-b");
    const editable = editableFrameFor(editor, "core-block-b");
    editable.addEventListener("paste", (event) => event.stopPropagation(), { once: true });
    generateID.mockClear();

    const { event } = dispatchClipboard(editor, "paste", copied, editable);

    expect(event.defaultPrevented).toBe(true);
    expect(topLevelNodeAfter(editor, "core-block-b")?.type.name).toBe("core_block");
    expect(generateID).not.toHaveBeenCalled();
  });

  it.each([
    ["Block", "core-block-a", "para-alpha-a", "block", "core_block"],
    ["Layout", "layout-root1", "layout-para1", "layout", "layout"],
  ] as const)(
    "copies the active mounted %s while its ProseMirror selection remains a text caret",
    (_label, sourceId, textId, rootKind, type) => {
      const editor = makeEditor();
      activateMountedRootWithTextCaret(editor, sourceId, textId);
      const before = editor.getJSON();

      const { event, written } = dispatchClipboard(editor, "copy");

      expect(event.defaultPrevented).toBe(true);
      expect(JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null")).toMatchObject({
        rootKind,
        content: { type, attrs: { id: sourceId } },
      });
      expect(editor.getJSON()).toEqual(before);
    },
  );

  it.each([
    ["Block", "core-block-a", "para-alpha-a", "block", "core_block"],
    ["Layout", "layout-root1", "layout-para1", "layout", "layout"],
  ] as const)(
    "copies the nearest mounted %s from its text caret without interaction chrome state",
    (_label, sourceId, textId, rootKind, type) => {
      const editor = makeEditor();
      setCursorAtEnd(editor, textId);
      const before = editor.getJSON();

      const { event, written } = dispatchClipboard(editor, "copy");

      expect(event.defaultPrevented).toBe(true);
      expect(JSON.parse(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME] ?? "null")).toMatchObject({
        rootKind,
        content: { type, attrs: { id: sourceId } },
      });
      expect(editor.getJSON()).toEqual(before);
    },
  );

  it("keeps a non-empty text range ordinary even while its Block remains active", () => {
    const editor = makeEditor();
    activateMountedRootWithTextCaret(editor, "core-block-a", "para-alpha-a");
    const range = textRange(editor, "Alpha text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)),
    );

    const { written } = dispatchClipboard(editor, "copy");

    expect(written[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]).toBeUndefined();
    expect(written["text/plain"]).toBe("Alpha");
  });

  it.each([
    ["Core Block", "core-block-a", ["core-block-a", "para-alpha-a"]],
    ["contributed Block", "contrib-blk1", ["contrib-blk1", "contrib-par1"]],
    ["Layout", "layout-root1", ["layout-root1", "layout-para1"]],
  ] as const)(
    "pastes one copied %s adjacent to the selected destination with one remap and dispatch",
    (_label, sourceId, sourceIds) => {
      const generateID = vi.fn(() => createEmbeddedNodeId());
      const editor = makeEditor({
        generateID,
        includeContributed: sourceId !== "core-block-a",
      });
      selectNode(editor, sourceId);
      const copied = dispatchClipboard(editor, "copy").written;
      const payloadSnapshot = { ...copied };
      selectNode(editor, "core-block-b");
      generateID.mockClear();
      contributedIdentityRewrite.mockClear();
      const dispatch = vi.spyOn(editor.view, "dispatch");

      const { event } = dispatchClipboard(editor, "paste", copied);
      const inserted = topLevelNodeAfter(editor, "core-block-b");

      expect(event.defaultPrevented).toBe(true);
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(generateID).not.toHaveBeenCalled();
      expect(copied).toEqual(payloadSnapshot);
      expect(inserted).not.toBeNull();
      const insertedJson = inserted?.toJSON() ?? {};
      const insertedIds = idsInJson(insertedJson);
      expect(insertedIds).toHaveLength(sourceIds.length);
      for (const sourceIdValue of sourceIds) expect(insertedIds).not.toContain(sourceIdValue);
      expect(new Set(allNodeIds(editor)).size).toBe(allNodeIds(editor).length);

      if (sourceId === "contrib-blk1") {
        expect(contributedIdentityRewrite).toHaveBeenCalledTimes(1);
        expect(insertedJson.attrs?.["data"]).toEqual({
          paragraphId: insertedJson.content?.[0]?.attrs?.["id"],
        });
      } else {
        expect(contributedIdentityRewrite).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    ["Block", "core-block-b", "para-bravo-b", "adjacent"],
    ["Layout", "layout-root1", "layout-para1", "inside"],
  ] as const)(
    "pastes a structural Block at the nearest legal container from an active %s text caret",
    (_label, destinationId, textId, expectedPlacement) => {
      const generateID = vi.fn(() => createEmbeddedNodeId());
      const editor = makeEditor({ generateID });
      activateMountedRootWithTextCaret(editor, destinationId, textId);
      generateID.mockClear();
      const dispatch = vi.spyOn(editor.view, "dispatch");

      const { event } = dispatchClipboard(editor, "paste", {
        [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
          rootKind: "block",
          content: block(
            "core_block",
            "source-blk01",
            "source-par01",
            "Copied through active owner",
          ) as StructuralFragmentContent,
        }),
      });

      expect(event.defaultPrevented).toBe(true);
      if (expectedPlacement === "inside") {
        const destination = editor.state.doc.nodeAt(nodePositionById(editor, destinationId));
        expect(destination?.maybeChild(1)?.type.name).toBe("core_block");
      } else {
        expect(topLevelNodeAfter(editor, destinationId)?.type.name).toBe("core_block");
      }
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(generateID).not.toHaveBeenCalled();
    },
  );

  it("pastes adjacent to the nearest mounted Block from its text caret without chrome state", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    setCursorAtEnd(editor, "para-bravo-b");
    generateID.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", {
      [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
        rootKind: "block",
        content: block(
          "core_block",
          "source-blk01",
          "source-par01",
          "Copied without chrome state",
        ) as StructuralFragmentContent,
      }),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(topLevelNodeAfter(editor, "core-block-b")?.type.name).toBe("core_block");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes a copied Block into the exact empty Surface insertion row", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeSurfaceEditor({ generateID });
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: "course-doc01", mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "dest-surf001", settings: {}, variant: "core-surface" },
              content: [
                block("core_block", "source-blk01", "source-par01", "Copied block"),
                { type: "paragraph", attrs: { id: "empty-row001" } },
              ],
            },
          ],
        },
      ],
    });
    selectNode(editor, "source-blk01");
    const copied = dispatchClipboard(editor, "copy").written;
    const emptyRowPos = nodePositionById(editor, "empty-row001");
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, emptyRowPos + 1)),
    );
    generateID.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", copied);
    const surface = editor.state.doc.firstChild?.firstChild;
    const mountedBlocks: JSONContent[] = [];
    surface?.forEach((child) => {
      if (child.type.name === "core_block") mountedBlocks.push(child.toJSON());
    });

    expect(event.defaultPrevented).toBe(true);
    expect(mountedBlocks).toHaveLength(2);
    expect(mountedBlocks[1]?.attrs?.["id"]).not.toBe("source-blk01");
    expect(idsInJson(mountedBlocks[1] ?? {})).not.toContain("source-par01");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes a copied Block after the rich-text list containing the empty destination caret", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeSurfaceEditor({ generateID });
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: { id: "course-doc01", mode: "slideshow" },
          content: [
            {
              type: "surface",
              attrs: { id: "dest-surf001", settings: {}, variant: "core-surface" },
              content: [
                block("core_block", "source-blk01", "source-par01", "Copied block"),
                {
                  type: "bulletList",
                  attrs: { id: "list-root001" },
                  content: [
                    {
                      type: "listItem",
                      attrs: { id: "list-item001" },
                      content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    selectNode(editor, "source-blk01");
    const copied = dispatchClipboard(editor, "copy").written;
    setCursorAtEnd(editor, "target-par01");
    generateID.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", copied);
    const surface = editor.state.doc.firstChild?.firstChild;

    expect(event.defaultPrevented).toBe(true);
    expect(surface?.childCount).toBe(3);
    expect(surface?.child(1).type.name).toBe("bulletList");
    expect(surface?.child(2).type.name).toBe("core_block");
    expect(surface?.child(2).attrs["id"]).not.toBe("source-blk01");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes a copied Block inside the Accordion panel containing the empty caret", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          block("core_block", "source-blk01", "source-par01", "Copied block"),
          {
            type: "layout",
            attrs: { id: "layout-panel1", variant: "core-layout" },
            content: [
              {
                type: "section",
                attrs: { id: "section00001" },
                content: [
                  {
                    type: "accordion_section_panel",
                    attrs: { id: "panel0000001" },
                    content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
                  },
                ],
              },
            ],
          },
          {
            type: "paragraph",
            attrs: { id: "tail-para001" },
            content: [{ type: "text", text: "Tail" }],
          },
        ],
      },
      generateID,
    });
    expect(editor.state.doc.childCount).toBe(3);
    selectNode(editor, "source-blk01");
    const copied = dispatchClipboard(editor, "copy").written;
    setCursorAtEnd(editor, "target-par01");
    generateID.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", copied);
    const panel = editor.state.doc.nodeAt(nodePositionById(editor, "panel0000001"));

    expect(event.defaultPrevented).toBe(true);
    expect(panel?.childCount).toBe(1);
    expect(panel?.firstChild?.type.name).toBe("core_block");
    expect(panel?.firstChild?.attrs["id"]).not.toBe("source-blk01");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(
      Array.from(
        { length: editor.state.doc.childCount },
        (_, index) => editor.state.doc.child(index).type.name,
      ),
    ).toEqual(["core_block", "layout", "paragraph"]);
    expect(generateID).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "Region",
      destinationId: "region000001",
      container: {
        type: "region",
        attrs: { id: "region000001" },
        content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
      },
    },
    {
      label: "Grid cell",
      destinationId: "cell00000001",
      container: {
        type: "grid",
        attrs: { id: "grid00000001" },
        content: [
          {
            type: "cell",
            attrs: { id: "cell00000001" },
            content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
          },
        ],
      },
    },
    {
      label: "Flashcard face",
      destinationId: "front0000001",
      container: {
        type: "flashcard",
        attrs: { id: "flash0000001" },
        content: [
          {
            type: "flashcard_card",
            attrs: { id: "card00000001" },
            content: [
              {
                type: "flashcard_card_front",
                attrs: { id: "front0000001" },
                content: [{ type: "paragraph", attrs: { id: "target-par01" } }],
              },
              {
                type: "flashcard_card_back",
                attrs: { id: "back00000001" },
                content: [
                  {
                    type: "paragraph",
                    attrs: { id: "back-para001" },
                    content: [{ type: "text", text: "Back" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ])("pastes a copied Block into the nearest $label container", ({ container, destinationId }) => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          block("core_block", "source-blk01", "source-par01", "Copied block"),
          container,
          {
            type: "paragraph",
            attrs: { id: "tail-para001" },
            content: [{ type: "text", text: "Tail" }],
          },
        ],
      },
      generateID,
    });
    selectNode(editor, "source-blk01");
    const copied = dispatchClipboard(editor, "copy").written;
    setCursorAtEnd(editor, "target-par01");
    generateID.mockClear();

    const { event } = dispatchClipboard(editor, "paste", copied);
    const destination = editor.state.doc.nodeAt(nodePositionById(editor, destinationId));

    expect(event.defaultPrevented).toBe(true);
    expect(destination?.childCount).toBe(1);
    expect(destination?.firstChild?.type.name).toBe("core_block");
    expect(destination?.firstChild?.attrs["id"]).not.toBe("source-blk01");
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes a copied Block after existing text inside a Flashcard face", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          block("core_block", "source-blk01", "source-par01", "Copied block"),
          {
            type: "flashcard",
            attrs: { id: "flash0000001" },
            content: [
              {
                type: "flashcard_card",
                attrs: { id: "card00000001" },
                content: [
                  {
                    type: "flashcard_card_front",
                    attrs: { id: "front0000001" },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "target-par01" },
                        content: [{ type: "text", text: "Existing front text" }],
                      },
                    ],
                  },
                  {
                    type: "flashcard_card_back",
                    attrs: { id: "back00000001" },
                    content: [
                      {
                        type: "paragraph",
                        attrs: { id: "back-para001" },
                        content: [{ type: "text", text: "Back" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: "paragraph",
            attrs: { id: "tail-para001" },
            content: [{ type: "text", text: "Tail" }],
          },
        ],
      },
      generateID,
    });
    selectNode(editor, "source-blk01");
    const copied = dispatchClipboard(editor, "copy").written;
    setCursorAtEnd(editor, "target-par01");
    generateID.mockClear();

    const { event } = dispatchClipboard(editor, "paste", copied);
    const front = editor.state.doc.nodeAt(nodePositionById(editor, "front0000001"));

    expect(event.defaultPrevented).toBe(true);
    expect(front?.childCount).toBe(2);
    expect(front?.child(0).textContent).toBe("Existing front text");
    expect(front?.child(1).type.name).toBe("core_block");
    expect(front?.child(1).attrs["id"]).not.toBe("source-blk01");
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes one repaired slideshow Surface after the selected destination exactly once", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeSurfaceEditor({ generateID });
    const source = surface("source-surf1", "contributed-surface", contributedBlockWithReferences());
    const encoded = encodeStructuralFragment({
      rootKind: "surface",
      content: source as StructuralFragmentContent,
    });
    const payload = { [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encoded };
    const sourceSnapshot = structuredClone(source);
    const payloadSnapshot = { ...payload };
    setCursorAtEnd(editor, "dest-para001");
    generateID.mockClear();
    contributedIdentityRewrite.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", payload);

    const courseDocument = editor.state.doc.firstChild;
    expect(event.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(generateID).not.toHaveBeenCalled();
    expect(contributedIdentityRewrite).toHaveBeenCalledTimes(1);
    expect(courseDocument?.childCount).toBe(3);
    expect(courseDocument?.child(0).attrs["id"]).toBe("dest-surf001");
    expect(courseDocument?.child(2).attrs["id"]).toBe("dest-surf002");

    const inserted = courseDocument?.child(1);
    const insertedJson = inserted?.toJSON();
    expect(inserted?.type.name).toBe("surface");
    expect(inserted?.attrs["id"]).not.toBe("source-surf1");
    expect(insertedJson?.content?.[0]?.attrs?.["id"]).not.toBe("source-blk01");
    expect(insertedJson?.content?.[0]?.content?.[0]?.attrs?.["id"]).not.toBe("source-par01");
    expect(insertedJson?.content?.[0]?.attrs?.["data"]).toEqual({
      mediaRef: "media://asset-1",
      paragraphId: insertedJson?.content?.[0]?.content?.[0]?.attrs?.["id"],
    });
    expect(source).toEqual(sourceSnapshot);
    expect(payload).toEqual(payloadSnapshot);
  });

  it.each([
    ["page destination mode", "core-surface", "page"],
    ["page-only source variant", "page-surface", "slideshow"],
  ] as const)(
    "atomically refuses a Surface with an incompatible %s",
    (_reason, sourceVariant, destinationMode) => {
      const generateID = vi.fn(() => createEmbeddedNodeId());
      const editor = makeSurfaceEditor({ generateID, mode: destinationMode });
      setCursorAtEnd(editor, "dest-para001");
      generateID.mockClear();
      const before = editor.getJSON();
      const dispatch = vi.spyOn(editor.view, "dispatch");

      const { event } = dispatchClipboard(editor, "paste", {
        [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
          rootKind: "surface",
          content: surface(
            "source-surf1",
            sourceVariant,
            block("core_block", "source-blk01", "source-par01", "Copied Surface"),
          ) as StructuralFragmentContent,
        }),
      });

      expect(event.defaultPrevented).toBe(true);
      expect(editor.getJSON()).toEqual(before);
      expect(dispatch).not.toHaveBeenCalled();
      expect(generateID).not.toHaveBeenCalled();
    },
  );

  it("atomically refuses unavailable nested Plus content when pasting a Surface into Core", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeSurfaceEditor({ generateID, includeContributed: false });
    setCursorAtEnd(editor, "dest-para001");
    generateID.mockClear();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", {
      [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
        rootKind: "surface",
        content: surface(
          "source-surf1",
          "contributed-surface",
          contributedBlockWithReferences(),
        ) as StructuralFragmentContent,
      }),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
  });

  it("atomically refuses a Surface that violates its fixed-child structure", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeSurfaceEditor({ generateID });
    setCursorAtEnd(editor, "dest-para001");
    generateID.mockClear();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", {
      [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
        rootKind: "surface",
        content: surface(
          "source-surf1",
          "fixed-surface",
          contributedBlockWithReferences(),
        ) as StructuralFragmentContent,
      }),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
    expect(contributedIdentityRewrite).not.toHaveBeenCalled();
  });

  it("keeps the document atomic and exposes a thrown owner rewrite defect", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const failedRepair = vi.fn(() => {
      throw new Error("repair failed");
    });
    const editor = makeSurfaceEditor({ identityRewrite: failedRepair, generateID });
    setCursorAtEnd(editor, "dest-para001");
    generateID.mockClear();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    expect(() =>
      dispatchClipboard(editor, "paste", {
        [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
          rootKind: "surface",
          content: surface(
            "source-surf1",
            "contributed-surface",
            contributedBlockWithReferences(),
          ) as StructuralFragmentContent,
        }),
      }),
    ).toThrow("repair failed");
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
    expect(failedRepair).toHaveBeenCalledTimes(1);
  });

  it("revalidates repaired private attrs and refuses an invalid owner result atomically", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const invalidRepair = vi.fn(({ content }: Parameters<ContentIdentityRewrite>[0]) => ({
      ...content,
      attrs: {
        ...content.attrs,
        data: { paragraphId: 42 },
      },
    }));
    const editor = makeSurfaceEditor({ identityRewrite: invalidRepair, generateID });
    setCursorAtEnd(editor, "dest-para001");
    generateID.mockClear();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", {
      [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: encodeStructuralFragment({
        rootKind: "surface",
        content: surface(
          "source-surf1",
          "contributed-surface",
          contributedBlockWithReferences(),
        ) as StructuralFragmentContent,
      }),
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
    expect(invalidRepair).toHaveBeenCalledTimes(1);
  });

  it("consumes a recognized invalid structural payload without mutation", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    selectNode(editor, "core-block-b");
    generateID.mockClear();
    const before = editor.getJSON();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", {
      [SCAFFOLD_STRUCTURAL_FRAGMENT_MIME]: "{",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
  });

  it("pastes from the inert HTML carrier when the custom MIME format is unavailable", () => {
    const generateID = vi.fn(() => createEmbeddedNodeId());
    const editor = makeEditor({ generateID });
    selectNode(editor, "core-block-a");
    const copied = dispatchClipboard(editor, "copy").written;
    delete copied[SCAFFOLD_STRUCTURAL_FRAGMENT_MIME];
    selectNode(editor, "core-block-b");
    generateID.mockClear();
    const dispatch = vi.spyOn(editor.view, "dispatch");

    const { event } = dispatchClipboard(editor, "paste", copied);

    expect(event.defaultPrevented).toBe(true);
    expect(topLevelNodeAfter(editor, "core-block-b")?.type.name).toBe("core_block");
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(generateID).not.toHaveBeenCalled();
  });

  it("atomically refuses a contributed descendant when pasting a Layout into Core", () => {
    const plusEditor = makeEditor({
      content: {
        type: "doc",
        content: [
          layout([contributedBlock()]),
          block("core_block", "plus-dest001", "plus-para001", "Destination"),
        ],
      },
    });
    selectNode(plusEditor, "layout-root1");
    const copied = dispatchClipboard(plusEditor, "copy").written;

    const generateID = vi.fn(() => createEmbeddedNodeId());
    const coreEditor = makeEditor({ includeContributed: false, generateID });
    selectNode(coreEditor, "core-block-b");
    generateID.mockClear();
    const before = coreEditor.getJSON();
    const dispatch = vi.spyOn(coreEditor.view, "dispatch");

    const { event } = dispatchClipboard(coreEditor, "paste", copied);

    expect(event.defaultPrevented).toBe(true);
    expect(coreEditor.getJSON()).toEqual(before);
    expect(dispatch).not.toHaveBeenCalled();
    expect(generateID).not.toHaveBeenCalled();
  });

  it("blocks copying an unavailable compatibility item", () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          block("unavailable_block", "unavail-blk1", "unavail-par1", "Unavailable"),
          block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        ],
      },
    });
    selectNode(editor, "unavail-blk1");
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "copy");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    [
      "Block",
      {
        type: "host_block",
        attrs: { id: "host-block01" },
        content: [unavailableBlockWithPrivatePayload()],
      },
      "host-block01",
    ],
    [
      "Layout",
      {
        type: "layout",
        attrs: { id: "host-layout1", variant: "core-layout" },
        content: [unavailableBlockWithPrivatePayload()],
      },
      "host-layout1",
    ],
  ] as const)(
    "refuses to copy an available %s containing unavailable content",
    (_label, root, id) => {
      const editor = makeEditor({
        content: {
          type: "doc",
          content: [
            structuredClone(root) as unknown as JSONContent,
            block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
          ],
        },
      });
      selectNode(editor, id);
      const before = editor.getJSON();

      const { event, written } = dispatchClipboard(editor, "copy");

      expect(event.defaultPrevented).toBe(true);
      expect(written).toEqual({});
      expect(editor.getJSON()).toEqual(before);
    },
  );

  it("keeps NodeSelection Surface copy blocked in favor of the explicit action", () => {
    const editor = makeEditor({
      content: {
        type: "doc",
        content: [
          {
            type: "surface",
            attrs: { id: "surface-copy", variant: "core-surface" },
            content: [
              {
                type: "paragraph",
                attrs: { id: "surface-para" },
                content: [{ type: "text", text: "Surface" }],
              },
            ],
          },
          block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        ],
      },
    });
    selectNode(editor, "surface-copy");

    const { event, written } = dispatchClipboard(editor, "copy");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
  });

  it("allows a real rich-text paste and leaves pasted node identity to UniqueID", () => {
    const editor = makeEditor();
    const beforeIds = allNodeIds(editor);
    setCursorAtEnd(editor, "paste-target");

    dispatchClipboard(editor, "paste", {
      "text/html":
        '<p data-pm-slice="0 0 []" data-id="foreignPara1"><strong>Rich</strong></p><p data-id="foreignPara2">paste</p>',
      "text/plain": "Rich\npaste",
    });

    const richText = findTextJson(editor.getJSON(), "Rich");
    const afterIds = allNodeIds(editor);
    expect(editor.state.doc.textContent).toContain("TargetRichpaste");
    expect(richText?.marks).toEqual([{ type: "bold" }]);
    expect(afterIds).not.toContain("foreignPara1");
    expect(afterIds.filter((id) => !beforeIds.includes(id))).toHaveLength(2);
  });

  it("allows a real partial-text paste when the slice carries open Block wrappers", () => {
    const editor = makeEditor();
    const firstText = textRange(editor, "Alpha text", 2, 10);
    const secondText = textRange(editor, "Bravo text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(
        TextSelection.create(editor.state.doc, firstText.from, secondText.to),
      ),
    );
    const selectedSlice = editor.state.selection.content();

    expect(selectedSlice.openStart).toBeGreaterThan(0);
    expect(selectedSlice.openEnd).toBeGreaterThan(0);
    expect(selectedSlice.content.firstChild?.type.name).toBe("core_block");
    expect(selectedSlice.content.lastChild?.type.name).toBe("core_block");

    const copied = dispatchClipboard(editor, "copy").written;
    const before = editor.state.doc.textContent;
    setCursorAtEnd(editor, "paste-target");
    dispatchClipboard(editor, "paste", copied);

    expect(copied["text/plain"]).toContain("pha text");
    expect(editor.state.doc.textContent).not.toBe(before);
    expect(editor.state.doc.textContent).toContain("pha text");
    expect(editor.state.doc.textContent).toContain("Bravo");
  });

  it.each([
    [
      "Core Block",
      '<div data-pm-slice="0 0 []" data-core-block data-id="pasteCore001"><p data-id="pastePara001">Blocked</p></div>',
    ],
    [
      "contributed Block",
      '<div data-pm-slice="0 0 []" data-contributed-block data-id="pasteHost001"><p data-id="pastePara002">Blocked</p></div>',
    ],
    [
      "Core Layout",
      '<section data-pm-slice="0 0 []" data-layout data-variant="core-layout" data-id="pasteLayout1"><p data-id="pastePara003">Blocked</p></section>',
    ],
    [
      "contributed Layout",
      '<section data-pm-slice="0 0 []" data-layout data-variant="contributed-layout" data-id="pasteLayout2"><p data-id="pastePara004">Blocked</p></section>',
    ],
    [
      "Core Surface",
      '<article data-pm-slice="0 0 []" data-surface data-variant="core-surface" data-id="pasteSurfac1"><p data-id="pastePara005">Blocked</p></article>',
    ],
    [
      "contributed Surface",
      '<article data-pm-slice="0 0 []" data-surface data-variant="contributed-surface" data-id="pasteSurfac2"><p data-id="pastePara006">Blocked</p></article>',
    ],
  ])("refuses a complete mounted %s from a real paste before insertion", (_label, html) => {
    const editor = makeEditor();
    const before = editor.getJSON();
    setCursorAtEnd(editor, "paste-target");

    dispatchClipboard(editor, "paste", { "text/html": html, "text/plain": "Blocked" });

    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    ["Block", "core-block-a"],
    ["Layout", "layout-root1"],
  ])("refuses a structurally selected %s cut before deletion", (_label, nodeId) => {
    const editor = makeEditor();
    selectNode(editor, nodeId);
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "cut");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps complete structural Cut blocked for an active Block with a text caret", () => {
    const editor = makeEditor();
    activateMountedRootWithTextCaret(editor, "core-block-a", "para-alpha-a");
    const before = editor.getJSON();

    const { event, written } = dispatchClipboard(editor, "cut");

    expect(event.defaultPrevented).toBe(true);
    expect(written).toEqual({});
    expect(editor.getJSON()).toEqual(before);
  });

  it("allows an ordinary text cut through the real clipboard lifecycle", () => {
    const editor = makeEditor();
    const range = textRange(editor, "Alpha text", 0, 5);
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, range.from, range.to)),
    );

    const { written } = dispatchClipboard(editor, "cut");

    expect(written["text/plain"]).toBe("Alpha");
    expect(editor.state.doc.textContent).not.toContain("Alpha text");
  });
});

function makeEditor(
  input: {
    readonly includeContributed?: boolean;
    readonly content?: JSONContent;
    readonly generateID?: () => string;
  } = {},
): Editor {
  const includeContributed = input.includeContributed ?? true;
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: [
      { definition: coreBlockDefinition },
      { definition: flashcardBlockDefinition },
      { definition: quizOwnerDefinition },
      { definition: quizChildDefinition },
      { definition: hostBlockDefinition },
      ...(includeContributed ? [{ definition: contributedBlockDefinition }] : []),
    ],
    layoutDefinitions: layoutDefinitions.definitions,
    surfaceDefinitions: surfaceVariants.definitions,
    identityRewriteRegistrations: includeContributed
      ? [
          {
            nodeType: contributedBlockDefinition.nodeType,
            rewrite: contributedIdentityRewrite,
          },
        ]
      : [],
  });
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      StarterKit.configure({ undoRedo: false }),
      CoreBlockNode,
      QuizOwnerNode,
      QuizChildNode,
      HostBlockNode,
      ...(includeContributed ? [ContributedBlockNode] : []),
      UnavailableBlockNode,
      LayoutNode,
      SectionNode,
      AccordionPanelNode,
      RegionNode,
      GridNode,
      CellNode,
      FlashcardNode,
      FlashcardCardNode,
      FlashcardCardFrontNode,
      FlashcardCardBackNode,
      SurfaceNode,
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        generateID: input.generateID ?? (() => createEmbeddedNodeId()),
      }),
      createScaffoldInteractionOwnerExtension(capabilities.blocks.registry),
      createStructuralClipboardPolicy({
        blockDefinitions: capabilities.blocks.registry,
        identityRewrites: capabilities.contentIdentity.rewrites,
        carrierLimits,
        layoutDefinitions: capabilities.layouts.registry,
        surfaceVariants: capabilities.surfaces.registry,
      }),
    ],
    content: input.content ?? {
      type: "doc",
      content: [
        block("core_block", "core-block-a", "para-alpha-a", "Alpha text"),
        block("core_block", "core-block-b", "para-bravo-b", "Bravo text"),
        ...(includeContributed ? [contributedBlock()] : []),
        layout(),
        {
          type: "paragraph",
          attrs: { id: "paste-target" },
          content: [{ type: "text", text: "Target" }],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function makeSurfaceEditor(
  input: {
    readonly identityRewrite?: ContentIdentityRewrite;
    readonly generateID?: () => string;
    readonly includeContributed?: boolean;
    readonly mode?: "page" | "slideshow";
  } = {},
): Editor {
  const includeContributed = input.includeContributed ?? true;
  const capabilities = resolveScaffoldCapabilities({
    blockCapabilities: [
      { definition: coreBlockDefinition },
      ...(includeContributed
        ? [
            {
              definition: contributedBlockDefinition,
              identityRewrites: [
                {
                  nodeType: contributedBlockDefinition.nodeType,
                  rewrite: input.identityRewrite ?? contributedIdentityRewrite,
                },
              ],
            },
          ]
        : []),
    ],
    layoutDefinitions: layoutDefinitions.definitions,
    surfaceDefinitions: surfaceVariants.definitions,
    // The contributed Block's rewrite is registered once, through its own Block
    // capability above. Registering it again here as a standalone registration
    // is what `be53b2ce` began rejecting as a duplicate.
  });
  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(capabilities),
      StarterKit.configure({ undoRedo: false }),
      CoreBlockNode,
      ...(includeContributed ? [ContributedBlockNode] : []),
      CourseDocumentClipboardNode,
      CourseSurfaceClipboardNode,
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        generateID: input.generateID ?? (() => createEmbeddedNodeId()),
      }),
      createCourseStructureCommandsExtension(),
      createStructuralClipboardPolicy({
        blockDefinitions: capabilities.blocks.registry,
        identityRewrites: capabilities.contentIdentity.rewrites,
        carrierLimits,
        layoutDefinitions: capabilities.layouts.registry,
        surfaceVariants: capabilities.surfaces.registry,
      }),
    ],
    content: surfaceDocument(input.mode ?? "slideshow"),
  });
  editors.push(editor);
  return editor;
}

function clipboardNode(name: string, tag: string, withData = false, content = "paragraph+") {
  return Node.create({
    name,
    group: "block",
    content,
    addAttributes: () =>
      withData
        ? {
            data: { default: null, rendered: false },
          }
        : {},
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes, node }) => [
      tag.slice(0, tag.indexOf("[")),
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: "block",
          id: node.attrs["id"],
          nodeType: name,
        }),
      },
      ["div", { [AUTHORING_FRAME_EDITABLE_ATTR]: "" }, 0],
    ],
  });
}

function structuralVariantNode(name: "layout" | "surface", tag: string, content = "paragraph+") {
  return Node.create({
    name,
    group: "block",
    content,
    addAttributes: () => ({
      variant: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-variant"),
        renderHTML: ({ variant }) => (variant ? { "data-variant": variant } : {}),
      },
    }),
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes, node }) => [
      tag.slice(0, tag.indexOf("[")),
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: name,
          id: node.attrs["id"],
          nodeType: name,
        }),
      },
      ["div", { [AUTHORING_FRAME_EDITABLE_ATTR]: "" }, 0],
    ],
  });
}

function structuralContainerNode(name: string, tag: string, content = "block+") {
  return Node.create({
    name,
    group: "block",
    content,
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag.slice(0, tag.indexOf("[")), HTMLAttributes, 0],
  });
}

function block(type: string, id: string, paragraphId: string, text: string): JSONContent {
  return {
    type,
    attrs: { id },
    content: [
      {
        type: "paragraph",
        attrs: { id: paragraphId },
        content: [{ type: "text", text }],
      },
    ],
  };
}

function contributedBlock(): JSONContent {
  return {
    ...block("contributed_block", "contrib-blk1", "contrib-par1", "Contributed text"),
    attrs: { id: "contrib-blk1", data: { paragraphId: "contrib-par1" } },
  };
}

function contributedBlockWithReferences(): JSONContent {
  return {
    ...block("contributed_block", "source-blk01", "source-par01", "Copied Surface"),
    attrs: {
      id: "source-blk01",
      data: { mediaRef: "media://asset-1", paragraphId: "source-par01" },
    },
  };
}

function unavailableBlockWithPrivatePayload(): JSONContent {
  return {
    type: "unavailable_block",
    attrs: {
      id: "unavail0001",
      capabilityId: "plus-secret",
      original: {
        type: "plus_secret",
        attrs: { id: "unavail0001", answer: "private-answer" },
      },
    },
  };
}

function surface(id: string, variant: string, child: JSONContent): JSONContent {
  return {
    type: "surface",
    attrs: { id, settings: {}, variant },
    content: [child],
  };
}

function surfaceDocument(mode: "page" | "slideshow"): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "course-doc01", mode },
        content: [
          surface(
            "dest-surf001",
            mode === "page" ? "page-surface" : "core-surface",
            block("core_block", "dest-block01", "dest-para001", "First Surface"),
          ),
          ...(mode === "slideshow"
            ? [
                surface(
                  "dest-surf002",
                  "core-surface",
                  block("core_block", "dest-block02", "dest-para002", "Second Surface"),
                ),
              ]
            : []),
        ],
      },
    ],
  };
}

function layout(
  content: JSONContent[] = [
    {
      type: "paragraph",
      attrs: { id: "layout-para1" },
      content: [{ type: "text", text: "Layout text" }],
    },
  ],
): JSONContent {
  return {
    type: "layout",
    attrs: { id: "layout-root1", variant: "core-layout" },
    content,
  };
}

function dispatchClipboard(
  editor: Editor,
  type: "copy" | "cut" | "paste",
  initial: Record<string, string> = {},
  target: EventTarget = editor.view.dom,
): { event: Event; written: Record<string, string> } {
  const written = { ...initial };
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      clearData: (format?: string) => {
        if (format) {
          delete written[format];
          return;
        }
        for (const key of Object.keys(written)) delete written[key];
      },
      getData: (format: string) => written[format] ?? "",
      setData: (format: string, value: string) => {
        written[format] = value;
      },
      get types() {
        return Object.keys(written);
      },
    },
  });
  target.dispatchEvent(event);
  return { event, written };
}

function editableFrameFor(editor: Editor, id: string): HTMLElement {
  const frame = editor.view.dom.querySelector(`[data-authoring-frame][data-id="${id}"]`);
  const editable = frame?.querySelector(`[${AUTHORING_FRAME_EDITABLE_ATTR}]`);
  if (!(editable instanceof HTMLElement)) throw new Error(`Missing editable frame for ${id}`);
  return editable;
}

function nodePositionById(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Missing node ${id}`);
  return found;
}

function selectNode(editor: Editor, id: string): void {
  editor.view.dispatch(
    editor.state.tr.setSelection(
      NodeSelection.create(editor.state.doc, nodePositionById(editor, id)),
    ),
  );
}

function activateMountedRootWithTextCaret(editor: Editor, rootId: string, textId: string): void {
  const frame = editor.view.dom.querySelector(`[data-authoring-frame][data-id="${rootId}"]`);
  const editable = frame?.querySelector(`[${AUTHORING_FRAME_EDITABLE_ATTR}]`);
  if (!editable) throw new Error(`Missing editable frame for ${rootId}`);
  editable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  setCursorAtEnd(editor, textId);
  expect(editor.state.selection).toBeInstanceOf(TextSelection);
  expect(editor.state.selection.empty).toBe(true);
}

function topLevelNodeAfter(editor: Editor, id: string) {
  for (let index = 0; index < editor.state.doc.childCount - 1; index += 1) {
    const node = editor.state.doc.child(index);
    if (node.attrs["id"] === id) return editor.state.doc.child(index + 1);
  }
  return null;
}

function idsInJson(content: JSONContent): string[] {
  const ids: string[] = [];
  const pending = [content];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    if (typeof current.attrs?.["id"] === "string") ids.push(current.attrs["id"]);
    for (const child of current.content ?? []) pending.push(child);
  }
  return ids;
}

function textRange(
  editor: Editor,
  text: string,
  fromOffset: number,
  toOffset: number,
): { from: number; to: number } {
  let start: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || node.text !== text) return true;
    start = pos;
    return false;
  });
  if (start === null) throw new Error(`Missing text ${text}`);
  return { from: start + fromOffset, to: start + toOffset };
}

function setCursorAtEnd(editor: Editor, paragraphId: string): void {
  const paragraphPos = nodePositionById(editor, paragraphId);
  const paragraph = editor.state.doc.nodeAt(paragraphPos);
  if (!paragraph) throw new Error(`Missing paragraph ${paragraphId}`);
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, paragraphPos + paragraph.nodeSize - 1),
    ),
  );
}

function allNodeIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs["id"] === "string") ids.push(node.attrs["id"]);
    return true;
  });
  return ids;
}

function findTextJson(content: JSONContent, text: string): JSONContent | undefined {
  if (content.text === text) return content;
  return content.content?.map((child) => findTextJson(child, text)).find(Boolean);
}
