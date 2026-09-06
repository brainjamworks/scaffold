import { Editor, Node, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextSelection } from "@tiptap/pm/state";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { SemanticLabel } from "@/composition/model/semantic-label-extension";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createDocumentTreeDefinitionLookup } from "@/composition/model/document-tree-definition-lookup";
import {
  createDocumentAuthoringExtension,
  getDocumentTreeForEditor,
  getEditorNavigationForEditor,
  DocumentTreeViewController,
} from "@/document/authoring";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";
import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { MAX_SEMANTIC_LABEL_LENGTH } from "@/document/model/document-tree/semantic-labels";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import {
  moveAnnotatedFigureAnnotationChecked,
  removeAnnotatedFigureAnnotationChecked,
} from "@/editor/blocks/figure-composition/annotated-figure/annotated-figure-authoring-commands";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";

import {
  DocumentOutlineRowViewport,
  DocumentTreeSubtreeOutline,
  type DocumentOutlineAuthoringPort,
} from "./DocumentTreeSubtreeOutline";
import { createDocumentOutlineAuthoringPort } from "./DocumentOutlineHost";

const IDS = {
  course: id("livecourse01"),
  surface: id("livesurface1"),
  region: id("liveregion01"),
  alpha: id("livealpha001"),
  beta: id("livebeta0001"),
  inserted: id("liveinsert01"),
  duplicate: id("livedupl0001"),
  figure: id("livefigure01"),
  firstPin: id("livepin00001"),
  secondPin: id("livepin00002"),
  thirdPin: id("livepin00003"),
  grid: id("livegrid0001"),
  cell: id("livecell0001"),
  cellParagraph: id("cellprose001"),
} as const;

const mounted: MountedLiveOutline[] = [];

afterEach(async () => {
  while (mounted.length > 0) await mounted.pop()!.dispose();
  document.body.replaceChildren();
});

describe("Document Outline live mounted updates", () => {
  it("reconciles insert, label edit, move, duplicate and delete transactions without stale rows", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { controller, tree, editor } = harness;

    selectTextNode(editor, IDS.alpha);
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.alpha);
    const alphaNode = requireNode(editor, IDS.alpha);
    const insertedNode = editor.schema.nodeFromJSON(paragraph(IDS.inserted, "Inserted paragraph"));
    editor.view.dispatch(
      editor.state.tr.insert(alphaNode.pos + alphaNode.node.nodeSize, insertedNode),
    );

    await expect
      .poll(() => semanticChildIds(tree, IDS.region))
      .toEqual([IDS.alpha, IDS.inserted, IDS.beta, IDS.figure]);
    expect(outlineLabelCount("Inserted paragraph")).toBe(1);

    const inserted = requireNode(editor, IDS.inserted);
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        inserted.pos + 1,
        inserted.pos + inserted.node.nodeSize - 1,
        editor.schema.text("Renamed paragraph"),
      ),
    );
    await expect.poll(() => semanticLabel(tree, IDS.inserted)).toBe("Renamed paragraph");
    expect(outlineLabelCount("Inserted paragraph")).toBe(0);
    expect(outlineLabelCount("Renamed paragraph")).toBe(1);

    moveNodeAfter(editor, IDS.inserted, IDS.figure);
    await expect
      .poll(() => semanticChildIds(tree, IDS.region))
      .toEqual([IDS.alpha, IDS.beta, IDS.figure, IDS.inserted]);

    const cloned = cloneJsonWithNewStableIds(requireNode(editor, IDS.inserted).node.toJSON(), {
      identityRewrites: {
        getByNodeType: () => undefined,
        hasNodeType: () => false,
      },
      createId: () => IDS.duplicate,
    });
    const duplicateNode = editor.schema.nodeFromJSON(cloned);
    const insertedAfterMove = requireNode(editor, IDS.inserted);
    editor.view.dispatch(
      editor.state.tr.insert(
        insertedAfterMove.pos + insertedAfterMove.node.nodeSize,
        duplicateNode,
      ),
    );
    await expect
      .poll(() => semanticChildIds(tree, IDS.region))
      .toEqual([IDS.alpha, IDS.beta, IDS.figure, IDS.inserted, IDS.duplicate]);
    expect(semanticLabel(tree, IDS.inserted)).toBe("Renamed paragraph 1");
    expect(semanticLabel(tree, IDS.duplicate)).toBe("Renamed paragraph 2");
    expect(outlineLabelCount("Renamed paragraph 1")).toBe(1);
    expect(outlineLabelCount("Renamed paragraph 2")).toBe(1);

    selectTextNode(editor, IDS.duplicate);
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.duplicate);
    deleteNode(editor, IDS.duplicate);
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.inserted);
    expect(semanticChildIds(tree, IDS.region)).not.toContain(IDS.duplicate);
    expect(outlineLabelCount("Renamed paragraph")).toBe(1);
    expect(new Set(semanticChildIds(tree, IDS.region)).size).toBe(
      semanticChildIds(tree, IDS.region).length,
    );
  });

  it("tracks paragraph split/join and annotation reorder/removal while preserving mounted selection", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { controller, tree, editor } = harness;
    const initialRegionIds = semanticChildIds(tree, IDS.region);

    const alpha = requireNode(editor, IDS.alpha);
    editor.commands.setTextSelection(alpha.pos + 6);
    expect(editor.commands.splitBlock()).toBe(true);
    await expect
      .poll(() => semanticChildIds(tree, IDS.region).length)
      .toBe(initialRegionIds.length + 1);
    const splitIds = semanticChildIds(tree, IDS.region);
    expect(new Set(splitIds).size).toBe(splitIds.length);

    const splitSecondId = splitIds.find((candidate) => !initialRegionIds.includes(candidate));
    if (!splitSecondId) throw new Error("Expected split paragraph identity");
    const splitSecond = requireNode(editor, splitSecondId);
    editor.commands.setTextSelection(splitSecond.pos + 1);
    expect(editor.commands.joinBackward()).toBe(true);
    await expect
      .poll(() => semanticChildIds(tree, IDS.region).length)
      .toBe(initialRegionIds.length);

    controller.reportComponentSelection(IDS.secondPin);
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.secondPin);
    const moveResult = moveAnnotatedFigureAnnotationChecked({
      tr: editor.state.tr,
      target: requireFigureTarget(editor),
      annotationId: IDS.thirdPin,
      direction: "before",
      relativeToId: IDS.firstPin,
    });
    expect(moveResult.ok).toBe(true);
    if (moveResult.ok) editor.view.dispatch(moveResult.tr);
    await expect
      .poll(() => semanticChildIds(tree, IDS.figure))
      .toEqual([IDS.thirdPin, IDS.firstPin, IDS.secondPin]);
    expect(controller.getSelectionSnapshot().selectedId).toBe(IDS.secondPin);

    const removeResult = removeAnnotatedFigureAnnotationChecked({
      tr: editor.state.tr,
      target: requireFigureTarget(editor),
      annotationId: IDS.secondPin,
    });
    expect(removeResult.ok).toBe(true);
    if (removeResult.ok) editor.view.dispatch(removeResult.tr);
    await expect
      .poll(() => semanticChildIds(tree, IDS.figure))
      .toEqual([IDS.thirdPin, IDS.firstPin]);
    expect(controller.getSelectionSnapshot().selectedId).toBe(IDS.figure);
    expect(outlineLabelCount("Second annotation")).toBe(0);
  });

  it("renders direct Grid Cell prose as a live child of the expandable Cell", async () => {
    const harness = await mountLiveOutline(gridCellDocument());
    mounted.push(harness);
    const { tree, editor, viewController } = harness;

    expect(semanticChildIds(tree, IDS.cell)).toEqual([IDS.cellParagraph]);
    expect(tree.getSnapshot().parentById.get(IDS.cellParagraph)).toBe(IDS.cell);

    for (const ancestorId of [IDS.surface, IDS.region, IDS.grid]) {
      viewController.setExpanded(ancestorId, true);
    }
    viewController.setExpanded(IDS.cell, false);
    const cellRow = page.getByRole("treeitem", { name: "Cell 1" });
    await expect.element(cellRow).toBeVisible();
    await expect.element(cellRow).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Expand Cell 1" }).click();

    const proseRow = page.getByRole("treeitem", { name: "Direct Cell prose" });
    await expect.element(proseRow).toBeVisible();
    await expect.element(proseRow).toHaveAttribute("aria-level", "5");

    const prose = requireNode(editor, IDS.cellParagraph);
    editor.view.dispatch(
      editor.state.tr.replaceWith(
        prose.pos + 1,
        prose.pos + prose.node.nodeSize - 1,
        editor.schema.text("Current Cell prose"),
      ),
    );

    await expect.poll(() => semanticLabel(tree, IDS.cellParagraph)).toBe("Current Cell prose");
    await expect.element(page.getByRole("treeitem", { name: "Current Cell prose" })).toBeVisible();
    expect(outlineLabelCount("Direct Cell prose")).toBe(0);
  });

  it("preserves the disclosure hit area and adds a logical label gap for branches and leaves", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { tree, viewController } = harness;

    viewController.setExpanded(IDS.surface, true);
    viewController.setExpanded(IDS.region, true);
    await expect.element(page.getByRole("treeitem", { name: "Alpha paragraph" })).toBeVisible();

    const surfaceLabel = semanticLabel(tree, IDS.surface);
    if (!surfaceLabel) throw new Error("Expected Surface semantic label");
    expectOutlineLabelGap(requireOutlineRow(surfaceLabel), ".sc-document-outline-disclosure");
    expectOutlineLabelGap(
      requireOutlineRow("Alpha paragraph"),
      ".sc-document-outline-disclosure-placeholder",
    );
  });

  it("renames inline with F2, isolates input events, resets the override and preserves undo history", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { controller, tree, editor, viewController } = harness;

    viewController.setExpanded(IDS.surface, true);
    viewController.setExpanded(IDS.region, true);
    selectTextNode(editor, IDS.beta);
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.beta);

    const alphaRow = requireOutlineRow("Alpha paragraph");
    alphaRow.focus();
    await userEvent.keyboard("{F2}");
    const input = requireElement<HTMLInputElement>('input[aria-label="Rename Alpha paragraph"]');
    expect(document.activeElement).toBe(input);
    expect(input.maxLength).toBe(MAX_SEMANTIC_LABEL_LENGTH);

    await userEvent.clear(input);
    await userEvent.type(input, "  Author   overview  ");
    expect(controller.getSelectionSnapshot().selectedId).toBe(IDS.beta);
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => semanticLabel(tree, IDS.alpha)).toBe("Author overview");
    expect(requireNode(editor, IDS.alpha).node.attrs["semanticLabel"]).toBe("Author overview");
    expect(requireNode(editor, IDS.alpha).node.textContent).toBe("Alpha paragraph");
    expect(document.activeElement).toBe(requireOutlineRow("Author overview"));
    const successStatus = requireElement<HTMLElement>('[role="status"]');
    expect(successStatus).toHaveTextContent("Outline label updated.");
    expect(successStatus).toHaveClass("sc-document-outline-status--visually-hidden");

    expect(editor.commands.undo()).toBe(true);
    await expect.poll(() => semanticLabel(tree, IDS.alpha)).toBe("Alpha paragraph");
    expect(editor.commands.redo()).toBe(true);
    await expect.poll(() => semanticLabel(tree, IDS.alpha)).toBe("Author overview");

    const renamedRow = requireOutlineRow("Author overview");
    renamedRow.focus();
    await userEvent.keyboard("{F2}");
    const resetInput = requireElement<HTMLInputElement>(
      'input[aria-label="Rename Author overview"]',
    );
    await userEvent.clear(resetInput);
    await userEvent.keyboard("{Enter}");

    await expect.poll(() => semanticLabel(tree, IDS.alpha)).toBe("Alpha paragraph");
    expect(requireNode(editor, IDS.alpha).node.attrs["semanticLabel"]).toBeNull();
    expect(document.activeElement).toBe(requireOutlineRow("Alpha paragraph"));
  });

  it("cancels an inline rename with Escape and commits it on blur", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { tree, editor, viewController } = harness;

    viewController.setExpanded(IDS.surface, true);
    viewController.setExpanded(IDS.region, true);
    const alphaRow = requireOutlineRow("Alpha paragraph");
    alphaRow.focus();
    await userEvent.keyboard("{F2}");
    const cancelledInput = requireElement<HTMLInputElement>(
      'input[aria-label="Rename Alpha paragraph"]',
    );
    await userEvent.clear(cancelledInput);
    await userEvent.type(cancelledInput, "Cancelled label");
    await userEvent.keyboard("{Escape}");

    expect(requireNode(editor, IDS.alpha).node.attrs["semanticLabel"]).toBeNull();
    expect(document.activeElement).toBe(requireOutlineRow("Alpha paragraph"));

    await userEvent.keyboard("{F2}");
    const blurredInput = requireElement<HTMLInputElement>(
      'input[aria-label="Rename Alpha paragraph"]',
    );
    await userEvent.clear(blurredInput);
    await userEvent.type(blurredInput, "Blurred label");
    blurredInput.blur();

    await expect.poll(() => semanticLabel(tree, IDS.alpha)).toBe("Blurred label");
    expect(requireNode(editor, IDS.alpha).node.attrs["semanticLabel"]).toBe("Blurred label");
    expect(document.activeElement).toBe(requireOutlineRow("Blurred label"));
  });

  it("resolves moved structural, Block and rich-text targets through their current stable IDs", async () => {
    const harness = await mountLiveOutline();
    mounted.push(harness);
    const { authoring, tree, editor } = harness;
    const beta = tree.getSnapshot().itemById.get(IDS.beta);
    if (!beta) throw new Error("Expected the Beta paragraph semantic item");

    moveNodeAfter(editor, IDS.beta, IDS.figure);

    for (const [itemId, label] of [
      [IDS.surface, "Author surface"],
      [IDS.figure, "Author figure"],
      [IDS.alpha, "Author prose"],
    ] as const) {
      const item = tree.getSnapshot().itemById.get(itemId);
      if (!item) throw new Error(`Expected semantic item ${itemId}`);
      expect(authoring.write(item, label)).toEqual({ ok: true });
      expect(semanticLabel(tree, itemId)).toBe(label);
      expect(requireNode(editor, itemId).node.attrs["semanticLabel"]).toBe(label);
    }

    expect(authoring.write(beta, "Moved prose")).toEqual({ ok: true });
    expect(semanticLabel(tree, IDS.beta)).toBe("Moved prose");
    expect(requireNode(editor, IDS.beta).node.attrs["semanticLabel"]).toBe("Moved prose");
  });

  it("announces a stale rename failure without activating an unavailable tree item", async () => {
    const harness = await mountLiveOutline(liveDocument(), (editor) => {
      const authoring = createDocumentOutlineAuthoringPort(editor);
      return {
        read(item) {
          return authoring.read(item);
        },
        write(item, value) {
          deleteNode(editor, item.id);
          return authoring.write(item, value);
        },
      };
    });
    mounted.push(harness);
    harness.viewController.setExpanded(IDS.surface, true);
    harness.viewController.setExpanded(IDS.region, true);

    const alphaRow = requireOutlineRow("Alpha paragraph");
    alphaRow.focus();
    await userEvent.keyboard("{F2}");
    const input = requireElement<HTMLInputElement>('input[aria-label="Rename Alpha paragraph"]');
    await userEvent.clear(input);
    await userEvent.type(input, "Unavailable prose");
    await userEvent.keyboard("{Enter}");

    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("The authoring target no longer exists.");
    expect(requireElement<HTMLElement>('[role="status"]')).toHaveClass(
      "sc-document-outline-status--visually-hidden",
    );
    expect(harness.tree.getSnapshot().itemById.has(IDS.alpha)).toBe(false);
  });
});

interface MountedLiveOutline {
  readonly authoring: DocumentOutlineAuthoringPort;
  readonly controller: ReturnType<typeof getEditorNavigationForEditor>;
  readonly tree: ReturnType<typeof getDocumentTreeForEditor>;
  readonly editor: Editor;
  readonly rendered: RenderResult;
  readonly viewController: DocumentTreeViewController;
  dispose(): Promise<void>;
}

async function mountLiveOutline(
  content: JSONContent = liveDocument(),
  createAuthoringPort: (
    editor: Editor,
  ) => DocumentOutlineAuthoringPort = createDocumentOutlineAuthoringPort,
): Promise<MountedLiveOutline> {
  const semantics = createDocumentTreeDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const editor = new Editor({
    editable: true,
    extensions: [
      UniqueID.configure({
        attributeName: "id",
        types: "all",
        updateDocument: true,
        generateID: () => createEmbeddedNodeId(),
      }),
      createScaffoldCapabilitiesStorageExtension(
        Object.freeze({
          blocks: Object.freeze({
            registry: builtInBlockRegistry,
          }),
          layouts: Object.freeze({ registry: builtInLayoutRegistry }),
          surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
          contentIdentity: Object.freeze({
            rewrites: Object.freeze({ getByNodeType: () => undefined, hasNodeType: () => false }),
          }),
          documentTree: semantics,
        }),
      ),
      createDocumentAuthoringExtension(semantics),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      UndoRedo,
      SemanticLabel,
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      TestArrangementNode,
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      AnnotatedFigureNode,
      AnnotatedFigureCanvasNode,
      AnnotatedFigureLegendNode,
      AnnotatedFigureAnnotationNode,
    ],
    content,
  });
  const tree = getDocumentTreeForEditor(editor);
  const controller = getEditorNavigationForEditor(editor);
  const authoring = createAuthoringPort(editor);
  const viewport = new DocumentOutlineRowViewport();
  const viewController = new DocumentTreeViewController({
    tree,
    navigation: controller,
    origin: "document-outline",
    viewport,
  });
  const rendered = await renderBrowserReact(
    <div>
      <DocumentTreeSubtreeOutline
        authoring={authoring}
        tree={tree}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />
      <EditorContent editor={editor} />
    </div>,
  );
  await expect.element(page.getByRole("tree", { name: "Document outline" })).toBeVisible();

  return {
    authoring,
    tree,
    controller,
    editor,
    rendered,
    viewController,
    async dispose() {
      viewController.destroy();
      await rendered.unmount();
      editor.destroy();
    },
  };
}

function selectTextNode(editor: Editor, nodeId: EmbeddedNodeId): void {
  const target = requireNode(editor, nodeId);
  editor.view.dom.focus();
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, target.pos + 1)),
  );
}

function moveNodeAfter(editor: Editor, sourceId: EmbeddedNodeId, targetId: EmbeddedNodeId): void {
  const source = requireNode(editor, sourceId);
  const target = requireNode(editor, targetId);
  const transaction = editor.state.tr.delete(source.pos, source.pos + source.node.nodeSize);
  const targetEnd = transaction.mapping.map(target.pos + target.node.nodeSize);
  transaction.insert(targetEnd, source.node);
  editor.view.dispatch(transaction);
}

function deleteNode(editor: Editor, nodeId: EmbeddedNodeId): void {
  const target = requireNode(editor, nodeId);
  editor.view.dispatch(editor.state.tr.delete(target.pos, target.pos + target.node.nodeSize));
}

function requireNode(editor: Editor, nodeId: EmbeddedNodeId) {
  const resolved = resolveStableNode(editor.state.doc, {
    id: nodeId,
    nodeType: findNodeType(editor, nodeId),
  });
  if (resolved.status !== "ready") throw new Error(`Expected current node ${nodeId}`);
  return resolved;
}

function requireFigureTarget(editor: Editor) {
  const resolved = resolveStableNode(editor.state.doc, {
    id: IDS.figure,
    nodeType: "annotated_figure",
  });
  if (resolved.status !== "ready") throw new Error("Expected current Annotated Figure");
  return resolved;
}

function findNodeType(editor: Editor, nodeId: EmbeddedNodeId): string {
  let nodeType: string | null = null;
  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] !== nodeId) return true;
    nodeType = node.type.name;
    return false;
  });
  if (!nodeType) throw new Error(`Expected node type for ${nodeId}`);
  return nodeType;
}

function semanticChildIds(
  tree: ReturnType<typeof getDocumentTreeForEditor>,
  parentId: EmbeddedNodeId,
): EmbeddedNodeId[] {
  return [...(tree.getSnapshot().itemById.get(parentId)?.children ?? [])].map(
    ({ id: childId }) => childId,
  );
}

function semanticLabel(
  tree: ReturnType<typeof getDocumentTreeForEditor>,
  nodeId: EmbeddedNodeId,
): string | undefined {
  return tree.getSnapshot().itemById.get(nodeId)?.label;
}

function outlineLabelCount(label: string): number {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter(
    (row) => row.getAttribute("aria-label") === label,
  ).length;
}

function requireOutlineRow(label: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
  if (!row) throw new Error(`Expected Outline row ${label}`);
  return row;
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function expectOutlineLabelGap(row: HTMLElement, leadingSelector: string): void {
  const leading = row.querySelector<HTMLElement>(leadingSelector);
  const copy = row.querySelector<HTMLElement>(".sc-document-outline-row-copy");
  if (!leading || !copy) throw new Error(`Expected row geometry for ${row.ariaLabel}`);

  expect(getComputedStyle(leading).width).toBe("32px");
  expect(getComputedStyle(copy).marginInlineStart).toBe("4px");
  expect(copy.getBoundingClientRect().left - leading.getBoundingClientRect().right).toBeCloseTo(4);
}

const AnnotatedFigureNode = Node.create({
  name: "annotated_figure",
  group: "block",
  content: "annotated_figure_canvas annotated_figure_legend",
  addAttributes: () => ({ id: { default: null }, data: { default: null } }),
  parseHTML: () => [{ tag: "figure[data-live-figure]" }],
  renderHTML: ({ HTMLAttributes }) => ["figure", { ...HTMLAttributes, "data-live-figure": "" }, 0],
});

const TestArrangementNode = Node.create({
  name: "live_test_arrangement",
  group: "arrangement cell_arrangement",
  atom: true,
});

const AnnotatedFigureCanvasNode = Node.create({
  name: "annotated_figure_canvas",
  atom: true,
  parseHTML: () => [{ tag: "div[data-live-canvas]" }],
  renderHTML: () => ["div", { "data-live-canvas": "" }],
});

const AnnotatedFigureLegendNode = Node.create({
  name: "annotated_figure_legend",
  content: "annotated_figure_annotation*",
  parseHTML: () => [{ tag: "ol[data-live-legend]" }],
  renderHTML: () => ["ol", { "data-live-legend": "" }, 0],
});

const AnnotatedFigureAnnotationNode = Node.create({
  name: "annotated_figure_annotation",
  content: "paragraph",
  addAttributes: () => ({
    id: { default: null },
    title: { default: "" },
    x: { default: 50 },
    y: { default: 50 },
  }),
  parseHTML: () => [{ tag: "li[data-live-annotation]" }],
  renderHTML: ({ HTMLAttributes }) => ["li", { ...HTMLAttributes, "data-live-annotation": "" }, 0],
});

function liveDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: IDS.surface, variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: IDS.region, role: "main" },
                content: [
                  paragraph(IDS.alpha, "Alpha paragraph"),
                  paragraph(IDS.beta, "Beta paragraph"),
                  {
                    type: "annotated_figure",
                    attrs: {
                      id: IDS.figure,
                      data: { type: "annotated_figure", alt: "Live figure" },
                    },
                    content: [
                      { type: "annotated_figure_canvas" },
                      {
                        type: "annotated_figure_legend",
                        content: [
                          annotation(IDS.firstPin, "First annotation"),
                          annotation(IDS.secondPin, "Second annotation"),
                          annotation(IDS.thirdPin, "Third annotation"),
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
  };
}

function gridCellDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: IDS.surface, variant: "page-default" },
            content: [
              {
                type: "region",
                attrs: { id: IDS.region, role: "main" },
                content: [
                  {
                    type: "grid",
                    attrs: { id: IDS.grid },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: IDS.cell },
                        content: [paragraph(IDS.cellParagraph, "Direct Cell prose")],
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
  };
}

function annotation(annotationId: EmbeddedNodeId, title: string): JSONContent {
  return {
    type: "annotated_figure_annotation",
    attrs: { id: annotationId, title, x: 50, y: 50 },
    content: [paragraph(undefined, `${title} caption`)],
  };
}

function paragraph(paragraphId: EmbeddedNodeId | undefined, text: string): JSONContent {
  return {
    type: "paragraph",
    ...(paragraphId ? { attrs: { id: paragraphId } } : {}),
    content: [{ type: "text", text }],
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
