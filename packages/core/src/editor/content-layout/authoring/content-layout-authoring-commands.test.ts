// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { NodeSelection, TextSelection, type Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  EmbeddedNodeIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { getDocumentTreeForEditor } from "@/document/authoring/document-tree/document-tree-storage";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";
import { readEditorSelectionTransactionMeta } from "@/document/authoring/editor-navigation/editor-selection-origin";
import { CONTENT_LAYOUT_ATTR } from "@/editor/content-layout/model/content-layout-attribute";
import { resolveStableNodeById } from "@/document/model/identity/resolve-stable-node";
import { ExtendedBlockquote } from "@/editor/rich-text/model/rich-text-blocks";
import { catalogIconValue } from "@/schemas/media/icon";
import { InteractionOwnerCommandKind } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-command-model";
import { readInteractionOwnerCommandMeta } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";

import {
  navigateAuthoringContentLayoutChild,
  readContentLayoutAuthoringNavigation,
  setAuthoringContentLayout,
} from "./content-layout-authoring-commands";

const FLOW = PresentationContentLayout.Flow;
const SEQUENCE = PresentationContentLayout.Sequence;

const IDS = Object.freeze({
  region: id("region000001"),
  first: id("para00000001"),
  second: id("para00000002"),
  layout: id("layout000001"),
  secondLayout: id("layout000002"),
  section: id("section00001"),
  secondSection: id("section00002"),
  nestedParagraph: id("para00000003"),
  callout: id("callout00001"),
  grid: id("grid00000001"),
  cell: id("cell00000001"),
  gridParagraph: id("para00000004"),
  blockquote: id("quote0000001"),
  blockquoteParagraph: id("para00000005"),
  slideTitle: id("slidetitle01"),
  surface: id("surface00001"),
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("content-layout authoring navigation", () => {
  it("derives boundary-aware Previous and Next targets without storing an ordinal", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });

    expect(readContentLayoutAuthoringNavigation(editor.state, IDS.region)).toEqual({
      kind: "ready",
      containerId: IDS.region,
      activeChildId: IDS.first,
      ordinal: 1,
      count: 2,
      previous: { kind: "disabled", reason: "start" },
      next: { kind: "available", childId: IDS.second },
    });
  });

  it("selects an exact rich-text child through semantic location metadata", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);

    const result = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: IDS.second,
    });

    expect(result.isOk()).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    const location = getDocumentTreeForEditor(editor)
      .getSnapshot().locationById.get(IDS.second);
    expect(location?.selectionTarget.kind).toBe("text");
    if (location?.selectionTarget.kind !== "text") return;
    expect(editor.state.selection.from).toBe(location.selectionTarget.from);
    expect(editor.state.selection.to).toBe(location.selectionTarget.to);
    expect(getEditorNavigationForEditor(editor).getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.second,
      selectionOrigin: "content-layout",
    });
    expect(readContentLayoutAuthoringNavigation(editor.state, IDS.region)).toEqual({
      kind: "ready",
      containerId: IDS.region,
      activeChildId: IDS.second,
      ordinal: 2,
      count: 2,
      previous: { kind: "available", childId: IDS.first },
      next: { kind: "disabled", reason: "end" },
    });
    expect(transactions).toHaveLength(2);
    expect(transactions.every((transaction) => transaction.steps.length === 0)).toBe(true);
  });

  it("applies an exact node target for selectable rich text", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [blockquote(IDS.blockquote, IDS.blockquoteParagraph)],
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);
    const location = getDocumentTreeForEditor(editor)
      .getSnapshot().locationById.get(IDS.blockquote);
    expect(location?.selectionTarget.kind).toBe("node");
    if (location?.selectionTarget.kind !== "node") return;

    const result = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: IDS.blockquote,
    });

    expect(result.isOk()).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(location.selectionTarget.pos);
    expect(readEditorSelectionTransactionMeta(transactions[0]!)).toEqual({
      intendedId: IDS.blockquote,
      origin: "content-layout",
    });
    expect(transactions.every((transaction) => transaction.steps.length === 0)).toBe(true);
  });

  it("applies an exact near target for non-selectable rich text", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [blockquote(IDS.blockquote, IDS.blockquoteParagraph)],
      nonSelectableBlockquote: true,
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);
    const location = getDocumentTreeForEditor(editor)
      .getSnapshot().locationById.get(IDS.blockquote);
    expect(location?.selectionTarget.kind).toBe("near");
    if (location?.selectionTarget.kind !== "near") return;
    const expectedSelection = TextSelection.near(
      editor.state.doc.resolve(location.selectionTarget.pos),
    );

    const result = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: IDS.blockquote,
    });

    expect(result.isOk()).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(expectedSelection.from);
    expect(editor.state.selection.to).toBe(expectedSelection.to);
    expect(readEditorSelectionTransactionMeta(transactions[0]!)).toEqual({
      intendedId: IDS.blockquote,
      origin: "content-layout",
    });
    expect(transactions.every((transaction) => transaction.steps.length === 0)).toBe(true);
  });

  it("rejects stale and nested child targets as reason-specific expected failures", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [
        layout(IDS.layout, IDS.section, [paragraph(IDS.nestedParagraph, "Nested")], SEQUENCE),
      ],
    });

    const missingChild = id("para99999999");
    const staleResult = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: missingChild,
    });
    expect(staleResult.isErr()).toBe(true);
    if (staleResult.isErr()) {
      expect(staleResult.error).toEqual({
        kind: "child-unavailable",
        containerId: IDS.region,
        childId: missingChild,
      });
    }

    const nestedResult = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: IDS.nestedParagraph,
    });
    expect(nestedResult.isErr()).toBe(true);
    if (nestedResult.isErr()) {
      expect(nestedResult.error).toEqual({
        kind: "child-not-direct",
        containerId: IDS.region,
        childId: IDS.nestedParagraph,
      });
    }

    const originalDocument = editor.state.doc;
    expect(
      navigateAuthoringContentLayoutChild({
        editor,
        containerId: IDS.region,
        childId: IDS.layout,
      }).isOk(),
    ).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(getEditorNavigationForEditor(editor).getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.layout,
      selectionOrigin: "content-layout",
    });

    expect(
      navigateAuthoringContentLayoutChild({
        editor,
        containerId: IDS.section,
        childId: IDS.nestedParagraph,
      }).isOk(),
    ).toBe(true);
    expect(getEditorNavigationForEditor(editor).getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.nestedParagraph,
      selectionOrigin: "content-layout",
    });
  });

  it("reports navigation as unavailable after its editor is destroyed", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First")],
    });
    editor.destroy();

    const result = navigateAuthoringContentLayoutChild({
      editor,
      containerId: IDS.region,
      childId: IDS.first,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({ kind: "navigation-unavailable", childId: IDS.first });
    }
  });

  it("retargets Block, Grid and Layout children through canonical interaction owners", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [
        callout(IDS.callout),
        grid(IDS.grid, IDS.cell, paragraph(IDS.gridParagraph, "Grid content")),
        layout(IDS.layout, IDS.section, [paragraph(IDS.nestedParagraph, "Layout content")]),
      ],
    });
    const transactions = observeTransactions(editor);
    const originalDocument = editor.state.doc;

    for (const expected of [
      {
        childId: IDS.callout,
        commandKind: InteractionOwnerCommandKind.SelectObjectTarget,
        targetKind: "block",
      },
      {
        childId: IDS.grid,
        commandKind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        targetKind: "grid",
      },
      {
        childId: IDS.layout,
        commandKind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        targetKind: "layout",
      },
    ] as const) {
      transactions.splice(0);
      const result = navigateAuthoringContentLayoutChild({
        editor,
        containerId: IDS.region,
        childId: expected.childId,
      });

      expect(result.isOk()).toBe(true);
      expect(editor.state.doc.eq(originalDocument)).toBe(true);
      expect(readInteractionOwnerCommandMeta(transactions[0]!)).toMatchObject({
        kind: expected.commandKind,
        target: { id: expected.childId, kind: expected.targetKind },
      });
      expect(transactions.every((transaction) => transaction.steps.length === 0)).toBe(true);
    }
  });
});

describe("content-layout authoring layout changes", () => {
  it("changes Flow to Sequence atomically and selects the first direct child", async () => {
    const editor = await createRegionEditor({
      contentLayout: FLOW,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);

    const result = setAuthoringContentLayout({
      editor,
      containerId: IDS.region,
      contentLayout: SEQUENCE,
    });

    expect(result.isOk()).toBe(true);
    expect(requireNode(editor, IDS.region).attrs[CONTENT_LAYOUT_ATTR]).toBe(SEQUENCE);
    expect(getEditorNavigationForEditor(editor).getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.first,
      selectionOrigin: "content-layout",
    });
    expect(transactions[0]?.steps).toHaveLength(1);
    expect(transactions.slice(1).every((transaction) => transaction.steps.length === 0)).toBe(true);

    expect(editor.commands.undo()).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
  });

  it("treats an unchanged layout as a successful no-op", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First")],
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);

    const result = setAuthoringContentLayout({
      editor,
      containerId: IDS.region,
      contentLayout: SEQUENCE,
    });

    expect(result.isOk()).toBe(true);
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(transactions).toHaveLength(0);
  });

  it("changes a compatible Sequence container back to ordinary Flow", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [paragraph(IDS.first, "First"), paragraph(IDS.second, "Second")],
    });

    const result = setAuthoringContentLayout({
      editor,
      containerId: IDS.region,
      contentLayout: FLOW,
    });

    expect(result.isOk()).toBe(true);
    expect(requireNode(editor, IDS.region).attrs[CONTENT_LAYOUT_ATTR]).toBe(FLOW);
    expect(readContentLayoutAuthoringNavigation(editor.state, IDS.region)).toEqual({
      kind: "unavailable",
      containerId: IDS.region,
    });
  });

  it("returns the checked Flow-placement rejection without dispatching", async () => {
    const editor = await createRegionEditor({
      contentLayout: SEQUENCE,
      children: [
        layout(IDS.layout, IDS.section, [paragraph(IDS.first, "First")]),
        layout(IDS.secondLayout, IDS.secondSection, [paragraph(IDS.second, "Second")]),
      ],
    });
    const originalDocument = editor.state.doc;
    const transactions = observeTransactions(editor);

    const result = setAuthoringContentLayout({
      editor,
      containerId: IDS.region,
      contentLayout: FLOW,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: "layout-change-rejected",
        issue: {
          code: "incompatible_flow_placement",
          containerId: IDS.region,
          blockingChildIds: [IDS.layout, IDS.secondLayout],
        },
      });
      expect(Object.isFrozen(result.error)).toBe(true);
      if (result.error.kind === "layout-change-rejected") {
        expect(Object.isFrozen(result.error.issue)).toBe(true);
        if (result.error.issue.code === "incompatible_flow_placement") {
          expect(Object.isFrozen(result.error.issue.blockingChildIds)).toBe(true);
        }
      }
    }
    expect(editor.state.doc.eq(originalDocument)).toBe(true);
    expect(transactions).toHaveLength(0);
  });

  it("changes an authoring-empty Flow container using its real empty paragraph", async () => {
    const editor = await createRegionEditor({
      contentLayout: FLOW,
      children: [paragraph(IDS.first)],
    });

    const result = setAuthoringContentLayout({
      editor,
      containerId: IDS.region,
      contentLayout: SEQUENCE,
    });

    expect(result.isOk()).toBe(true);
    expect(requireNode(editor, IDS.region).attrs[CONTENT_LAYOUT_ATTR]).toBe(SEQUENCE);
    expect(requireNode(editor, IDS.first).textContent).toBe("");
    expect(getEditorNavigationForEditor(editor).getSelectionSnapshot()).toMatchObject({
      selectedId: IDS.first,
      selectionOrigin: "content-layout",
    });
  });

  it("does not flatten a missing required editor extension into an expected failure", () => {
    const editor = new Editor({ extensions: [StarterKit], content: "<p>Unowned editor</p>" });
    editors.push(editor);

    expect(() =>
      setAuthoringContentLayout({
        editor,
        containerId: IDS.region,
        contentLayout: SEQUENCE,
      }),
    ).toThrow("Semantic Document Controller extension is not installed for this editor");
  });

  it("returns a reason-specific issue for a stale container ID", async () => {
    const editor = await createRegionEditor({
      contentLayout: FLOW,
      children: [paragraph(IDS.first, "First")],
    });
    const missingContainer = id("region999999");

    const result = setAuthoringContentLayout({
      editor,
      containerId: missingContainer,
      contentLayout: SEQUENCE,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toEqual({
        kind: "container-unavailable",
        containerId: missingContainer,
      });
    }

    const wrongKindResult = setAuthoringContentLayout({
      editor,
      containerId: IDS.first,
      contentLayout: SEQUENCE,
    });
    expect(wrongKindResult.isErr()).toBe(true);
    if (wrongKindResult.isErr()) {
      expect(wrongKindResult.error).toEqual({
        kind: "container-unavailable",
        containerId: IDS.first,
      });
    }
  });
});

async function createRegionEditor({
  contentLayout,
  children,
  nonSelectableBlockquote = false,
}: {
  readonly contentLayout: PresentationContentLayout;
  readonly children: readonly JSONContent[];
  readonly nonSelectableBlockquote?: boolean;
}): Promise<Editor> {
  const composition = createCoreScaffoldAuthoringComposition();
  const authoringExtensions = createCourseDocumentAuthoringExtensions({
    editable: true,
    composition,
  }).map((extension) =>
    nonSelectableBlockquote && extension.name === ExtendedBlockquote.name
      ? ExtendedBlockquote.extend({ selectable: false })
      : extension,
  );
  const editor = new Editor({
    editable: true,
    extensions: [...authoringExtensions, UndoRedo],
    content: createDocument({ contentLayout, children }),
  });
  editors.push(editor);
  await flushMicrotasks();
  return editor;
}

function createDocument({
  contentLayout,
  children,
}: {
  readonly contentLayout: PresentationContentLayout;
  readonly children: readonly JSONContent[];
}): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Content layout commands",
    mode: "slideshow",
    surfaceId: IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const courseSection = courseDocument?.content?.[0];
  if (!courseDocument || courseDocument.type !== "courseDocument" || !courseSection) {
    throw new Error("Expected a generated slideshow Course Document");
  }
  courseDocument.content = [
    courseSection,
    {
      type: "surface",
      attrs: {
        id: IDS.surface,
        settings: {
          footer: { enabled: false },
          header: { enabled: false },
          slideTitle: { enabled: true },
        },
        variant: "slide-content",
      },
      content: [
        { type: "slide_title", attrs: { id: IDS.slideTitle } },
        {
          type: "region",
          attrs: { contentLayout, id: IDS.region, role: "main" },
          content: [...children],
        },
      ],
    },
  ];
  return content;
}

function paragraph(id: EmbeddedNodeId, text = ""): JSONContent {
  return {
    type: "paragraph",
    attrs: { id },
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function blockquote(blockquoteId: EmbeddedNodeId, paragraphId: EmbeddedNodeId): JSONContent {
  return {
    type: "blockquote",
    attrs: { id: blockquoteId },
    content: [paragraph(paragraphId, "Quoted content")],
  };
}

function layout(
  layoutId: EmbeddedNodeId,
  sectionId: EmbeddedNodeId,
  children: readonly JSONContent[],
  contentLayout: PresentationContentLayout = FLOW,
): JSONContent {
  return {
    type: "layout",
    attrs: { id: layoutId, variant: "tabs" },
    content: [
      {
        type: "section",
        attrs: { contentLayout, id: sectionId, role: "tab-panel" },
        content: [...children],
      },
    ],
  };
}

function callout(calloutId: EmbeddedNodeId): JSONContent {
  return {
    type: "callout",
    attrs: {
      id: calloutId,
      data: {
        type: "callout",
        variant: "info",
        showIcon: true,
        icon: catalogIconValue("info"),
        headingLevel: 4,
      },
    },
    content: [
      {
        type: "callout_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Callout title" }] }],
      },
      {
        type: "callout_prompt",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Callout body" }] }],
      },
    ],
  };
}

function grid(gridId: EmbeddedNodeId, cellId: EmbeddedNodeId, child: JSONContent): JSONContent {
  return {
    type: "grid",
    attrs: { columnWidths: [1], id: gridId },
    content: [{ type: "cell", attrs: { id: cellId }, content: [child] }],
  };
}

function requireNode(editor: Editor, nodeId: EmbeddedNodeId) {
  const resolved = resolveStableNodeById(editor.state.doc, nodeId);
  if (resolved.status !== "ready") {
    throw new Error(`Expected one live node for "${nodeId}"`);
  }
  return resolved.node;
}

function observeTransactions(editor: Editor): Transaction[] {
  const transactions: Transaction[] = [];
  editor.on("transaction", ({ transaction, appendedTransactions }) => {
    transactions.push(transaction, ...appendedTransactions);
  });
  return transactions;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
