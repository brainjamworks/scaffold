import { Editor, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createSemanticDefinitionLookup } from "@/composition/model/semantic-definition-lookup";
import {
  createSemanticDocumentExtension,
  getSemanticDocumentControllerForEditor,
  SemanticHierarchyViewController,
} from "@/document/authoring/semantic-document";
import { createAuthoringSemanticNavigationEnvironment } from "@/document/authoring/semantic-document/authoring-semantic-navigation-environment";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  AccordionSectionPanelNode,
  AccordionSectionTitleNode,
} from "@/editor/arrangements/layout/accordion/accordion-section-nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { tabPanelId } from "@/editor/arrangements/layout/tabs/tabs-components";
import { AnnotatedFigureAuthoringExtension } from "@/editor/blocks/figure-composition/annotated-figure";
import { FlashcardAuthoringExtension } from "@/editor/blocks/presentation/flashcard";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { interactionOwnerPluginKey } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";
import { surfaceAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { createSurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createTestNodeIdentityExtension } from "@/editor/testing";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";

import { DocumentOutline, DocumentOutlineRowViewport } from "./DocumentOutline";

const IDS = {
  course: id("course000001"),
  courseSection: id("section00001"),
  firstSurface: id("surface00001"),
  secondSurface: id("surface00002"),
  firstRegion: id("region000001"),
  secondRegion: id("region000002"),
  prose: id("prose0000001"),
  grid: id("grid00000001"),
  firstCell: id("cell00000001"),
  secondCell: id("cell00000002"),
  tabs: id("tabs00000001"),
  firstTab: id("tabsect00001"),
  hiddenTab: id("tabsect00002"),
  hiddenProse: id("hiddenpara01"),
  accordion: id("accord000001"),
  firstAccordion: id("accsect00001"),
  secondAccordion: id("accsect00002"),
  flashcard: id("flashcard001"),
  firstFlashcardCard: id("flashcard101"),
  secondFlashcardCard: id("flashcard102"),
  annotationFigure: id("annotfig0001"),
  annotation: id("annotpin0001"),
  mcq: id("mcqblock0001"),
  outerTabs: id("outertabs001"),
  outerFirstTab: id("outertab0001"),
  outerHiddenTab: id("outertab0002"),
  innerTabs: id("innertabs001"),
  innerFirstTab: id("innertab0001"),
  innerHiddenTab: id("innertab0002"),
  nestedHiddenProse: id("nestedpara01"),
} as const;

const mounted: MountedOutlineHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) await mounted.pop()!.dispose();
  document.body.replaceChildren();
});

describe("Document Outline bidirectional navigation", () => {
  it("reveals editor text, tab and annotation component selections without stealing focus", async () => {
    await page.viewport(1280, 800);
    const harness = await mountOutline();
    mounted.push(harness);
    const controller = harness.controller;

    harness.editor.view.dom.focus();
    expect(document.activeElement).toBe(harness.editor.view.dom);
    const prosePosition = findNodePosition(harness.editor, IDS.prose) + 1;
    harness.editor.view.dispatch(
      harness.editor.state.tr.setSelection(
        TextSelection.create(harness.editor.state.doc, prosePosition),
      ),
    );

    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.prose);
    expect(selectedOutlineLabel()).toContain("Editor prose");
    expect(harness.editor.view.dom.contains(document.activeElement)).toBe(true);
    expect(harness.viewController.getSnapshot().expandedIds.has(IDS.firstSurface)).toBe(true);

    const hiddenTab = roleElement<HTMLButtonElement>("tab", "Hidden topic");
    hiddenTab.focus();
    hiddenTab.click();
    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.hiddenTab);
    expect(selectedOutlineLabel()).toContain("Hidden topic");
    expect(document.activeElement?.getAttribute("role")).toBe("tab");

    await expect.element(page.getByRole("button", { name: "Select annotation 1" })).toBeVisible();
    const annotationPin = roleElement<HTMLButtonElement>("button", "Select annotation 1");
    annotationPin.focus();
    annotationPin.click();
    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.annotation);
    expect(selectedOutlineLabel()).toContain("Annotation detail");
    expect(
      requiredElement<HTMLElement>(document.body, '[role="tree"]').contains(document.activeElement),
    ).toBe(false);

    const flashcard = controller.getSnapshot().semantics.itemById.get(IDS.flashcard);
    expect(flashcard?.children.map(({ id, label }) => ({ id, label }))).toEqual([
      { id: IDS.firstFlashcardCard, label: "Card 1" },
      { id: IDS.secondFlashcardCard, label: "Card 2" },
    ]);
    expect(treeText()).not.toContain("Private flashcard front");
    expect(treeText()).not.toContain("Private flashcard back");
  });

  it("reveals a hidden descendant while activating its Layout owner and retaining its semantic ID", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const controller = harness.controller;
    const target = controller.getSnapshot().semantics.itemById.get(IDS.hiddenProse);
    if (!target) throw new Error("Expected hidden prose semantic item");

    await expandAncestorsThroughOutline(harness, IDS.hiddenProse);
    const targetRow = treeItemForLabel(target.label);
    await userEvent.click(targetRow);

    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.hiddenProse);
    expect(controller.getSnapshot().selectionOrigin).toBe("document-outline");
    expect(targetRow.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(targetRow);
    expect(harness.editor.state.selection).toBeInstanceOf(TextSelection);
    expect(harness.editor.state.selection.empty).toBe(true);
    expect(interactionOwnerPluginKey.getState(harness.editor.state)?.explicitOwner).toMatchObject({
      id: IDS.tabs,
      kind: "layout",
    });
    expect(harness.revealedIds.at(-1)).toBe(IDS.hiddenProse);
    await expect
      .element(page.getByRole("tab", { name: "Hidden topic" }))
      .toHaveAttribute("aria-selected", "true");
  });

  it("activates a Grid for its Cell while keeping the clicked Cell selected in the Outline", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const controller = harness.controller;
    const cell = controller.getSnapshot().semantics.itemById.get(IDS.firstCell);
    if (!cell) throw new Error("Expected Grid Cell semantic item");

    await expandAncestorsThroughOutline(harness, IDS.firstCell);
    const cellRow = treeItemForLabel(cell.label);
    await userEvent.click(cellRow);

    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.firstCell);
    expect(interactionOwnerPluginKey.getState(harness.editor.state)?.explicitOwner).toMatchObject({
      id: IDS.grid,
      kind: "grid",
    });
    expect(harness.editor.state.selection).toBeInstanceOf(TextSelection);
    expect(harness.editor.state.selection).not.toBeInstanceOf(NodeSelection);
    expect(document.activeElement).toBe(cellRow);
  });

  it("selects the Figure Block for an annotation without replacing the annotation Outline ID", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const controller = harness.controller;
    const annotation = controller.getSnapshot().semantics.itemById.get(IDS.annotation);
    if (!annotation) throw new Error("Expected annotation semantic item");

    await expandAncestorsThroughOutline(harness, IDS.annotation);
    const annotationRow = treeItemForLabel(annotation.label);
    await userEvent.click(annotationRow);

    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.annotation);
    expect(harness.editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((harness.editor.state.selection as NodeSelection).node.attrs["id"]).toBe(
      IDS.annotationFigure,
    );
    expect(
      interactionOwnerPluginKey.getState(harness.editor.state)?.activationIntent,
    ).toMatchObject({
      kind: "object-shell",
      target: { id: IDS.annotationFigure, kind: "block" },
    });
    expect(document.activeElement).toBe(annotationRow);
  });

  it("reveals a Flashcard card while retaining its semantic ID and authored data", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const controller = harness.controller;
    const card = controller.getSnapshot().semantics.itemById.get(IDS.secondFlashcardCard);
    if (!card) throw new Error("Expected Flashcard card semantic item");

    const activityBefore = flashcardAuthoringState(harness.editor);
    expect(activityBefore).toMatchObject({
      currentCardId: IDS.firstFlashcardCard,
      flipped: "false",
      mastery: "unrated",
      ratingControlCount: 0,
      completionCount: 0,
    });

    await expandAncestorsThroughOutline(harness, IDS.secondFlashcardCard);
    const cardRow = treeItemForLabel(card.label);
    await userEvent.click(cardRow);

    await expect.poll(() => controller.getSnapshot().selectedId).toBe(IDS.secondFlashcardCard);
    expect(controller.getSnapshot().selectionOrigin).toBe("document-outline");
    expect(harness.editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((harness.editor.state.selection as NodeSelection).node.attrs["id"]).toBe(IDS.flashcard);
    expect(
      interactionOwnerPluginKey.getState(harness.editor.state)?.activationIntent,
    ).toMatchObject({
      kind: "object-shell",
      target: { id: IDS.flashcard, kind: "block" },
    });
    expect(cardRow.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(cardRow);
    expect(flashcardAuthoringState(harness.editor)).toMatchObject({
      currentCardId: IDS.secondFlashcardCard,
      flipped: "false",
      mastery: "unrated",
      ratingControlCount: 0,
      completionCount: 0,
      authoredData: activityBefore.authoredData,
    });
  });

  it("commits hidden outer and inner Layout Sections before resolving final scroll geometry", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const target = harness.controller.getSnapshot().semantics.itemById.get(IDS.nestedHiddenProse);
    if (!target) throw new Error("Expected nested hidden prose semantic item");
    const outerPanel = requiredElement<HTMLElement>(
      harness.editor.view.dom,
      `#${tabPanelId(IDS.outerTabs, IDS.outerHiddenTab)}`,
    );
    const innerPanel = requiredElement<HTMLElement>(
      harness.editor.view.dom,
      `#${tabPanelId(IDS.innerTabs, IDS.innerHiddenTab)}`,
    );
    const commitOrder: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type !== "attributes" || record.attributeName !== "hidden") continue;
        if (record.target === outerPanel && !outerPanel.hidden) commitOrder.push("outer");
        if (record.target === innerPanel && !innerPanel.hidden) commitOrder.push("inner");
      }
    });
    observer.observe(harness.editor.view.dom, {
      attributeFilter: ["hidden"],
      attributes: true,
      subtree: true,
    });
    const outerCommit = holdHiddenCommit(outerPanel);
    const innerCommit = holdHiddenCommit(innerPanel);

    await expandAncestorsThroughOutline(harness, IDS.nestedHiddenProse);
    const targetRow = treeItemForLabel(target.label);
    await userEvent.click(targetRow);

    await expect.poll(() => outerCommit.requested()).toBe(true);
    expect(harness.scrollVisibility).toEqual([]);
    outerCommit.release();
    await expect.poll(() => innerCommit.requested()).toBe(true);
    expect(commitOrder).toEqual(["outer"]);
    expect(harness.scrollVisibility).toEqual([]);
    innerCommit.release();
    await expect
      .poll(() => harness.controller.getSnapshot().selectedId)
      .toBe(IDS.nestedHiddenProse);
    expect(commitOrder).toEqual(["outer", "inner"]);
    expect(harness.scrollVisibility.at(-1)).toEqual({ inner: true, outer: true });
    expect(document.activeElement).toBe(targetRow);
    observer.disconnect();
  });
});

interface MountedOutlineHarness {
  readonly controller: ReturnType<typeof getSemanticDocumentControllerForEditor>;
  readonly editor: Editor;
  readonly rendered: RenderResult;
  readonly revealedIds: EmbeddedNodeId[];
  readonly scrollVisibility: Array<{ inner: boolean; outer: boolean }>;
  readonly viewController: SemanticHierarchyViewController;
  dispose(): Promise<void>;
}

async function mountOutline(): Promise<MountedOutlineHarness> {
  const semantics = createSemanticDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const capabilities = Object.freeze({
    blocks: Object.freeze({
      registry: builtInBlockRegistry,
      duplication: Object.freeze({
        getByNodeType: () => undefined,
        hasNodeType: (nodeType: string) =>
          builtInBlockRegistry.getByNodeType(nodeType) !== undefined,
      }),
    }),
    layouts: Object.freeze({ registry: builtInLayoutRegistry }),
    surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
    documentSemantics: semantics,
  });
  const editor = new Editor({
    editable: true,
    extensions: [
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(capabilities),
      createSemanticDocumentExtension(semantics),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      TestSurfaceAuthoringNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      FlashcardAuthoringExtension,
      AnnotatedFigureAuthoringExtension,
      TestMcqNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: representativeDocument(),
  });
  const controller = getSemanticDocumentControllerForEditor(editor);
  const viewport = new DocumentOutlineRowViewport();
  const viewController = new SemanticHierarchyViewController({
    controller,
    origin: "document-outline",
    viewport,
  });
  const host = document.createElement("div");
  const reactElement = document.createElement("div");
  host.append(reactElement);
  document.body.append(host);
  const rendered = await renderBrowserReact(
    <div className="sc-editor-shell" data-scroll-model="contained">
      <DocumentOutline
        controller={controller}
        viewController={viewController}
        viewport={viewport}
      />
      <ScaffoldServicesProvider ports={{ media: testMediaPort() }}>
        {createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, host)}
      </ScaffoldServicesProvider>
    </div>,
    { baseElement: host, container: reactElement },
  );
  const revealedIds: EmbeddedNodeId[] = [];
  const scrollVisibility: Array<{ inner: boolean; outer: boolean }> = [];
  const environment = createAuthoringSemanticNavigationEnvironment({
    blockDefinitions: builtInBlockRegistry,
    getSnapshot: () => controller.getSnapshot().semantics,
    root: host,
    view: editor.view,
  });
  controller.setNavigationEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus: () => editor.view.focus(),
  });
  controller.setNavigationEnvironment({
    createActivationTransaction: (location) => environment.createActivationTransaction(location),
    presentSurface: (surfaceId) => environment.presentSurface(surfaceId),
    async bringIntoView(location, behavior) {
      revealedIds.push(location.id);
      const outerPanel = document.getElementById(tabPanelId(IDS.outerTabs, IDS.outerHiddenTab));
      const innerPanel = document.getElementById(tabPanelId(IDS.innerTabs, IDS.innerHiddenTab));
      if (outerPanel instanceof HTMLElement && innerPanel instanceof HTMLElement) {
        scrollVisibility.push({ inner: !innerPanel.hidden, outer: !outerPanel.hidden });
      }
      await environment.bringIntoView(location, behavior);
    },
  });

  await expect
    .poll(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label^="Show structure for "]'),
    )
    .not.toBeNull();
  document.querySelector<HTMLButtonElement>('button[aria-label^="Show structure for "]')!.click();
  await expect.element(page.getByRole("tree", { name: /structure$/ })).toBeVisible();
  await expect
    .poll(() => controller.semanticActivations.resolve(IDS.tabs).kind === "resolved")
    .toBe(true);

  return {
    controller,
    editor,
    rendered,
    revealedIds,
    scrollVisibility,
    viewController,
    async dispose() {
      viewController.destroy();
      await rendered.unmount();
      editor.destroy();
      host.remove();
    },
  };
}

async function expandAncestorsThroughOutline(
  harness: MountedOutlineHarness,
  targetId: EmbeddedNodeId,
): Promise<void> {
  const snapshot = harness.controller.getSnapshot().semantics;
  const ancestors: EmbeddedNodeId[] = [];
  let parentId = snapshot.parentById.get(targetId) ?? null;
  while (parentId) {
    ancestors.unshift(parentId);
    parentId = snapshot.parentById.get(parentId) ?? null;
  }
  for (const id of ancestors) {
    const item = snapshot.itemById.get(id);
    if (!item || item.children.length === 0) continue;
    if (item.kind === "course-section" || item.kind === "surface") continue;
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.getAttribute("aria-label") === `Expand ${item.label}`,
    );
    const alreadyExpanded = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).some(
      (candidate) => candidate.getAttribute("aria-label") === `Collapse ${item.label}`,
    );
    if (!button && alreadyExpanded) continue;
    if (!button)
      throw new Error(`Expected disclosure for ${item.label}. Visible tree: ${treeText()}`);
    button.focus();
    button.click();
    await expect.poll(() => harness.viewController.getSnapshot().expandedIds.has(id)).toBe(true);
  }
}

function selectedOutlineLabel(): string {
  return (
    requiredElement<HTMLElement>(
      document.body,
      '[role="treeitem"][aria-selected="true"]',
    ).getAttribute("aria-label") ?? ""
  );
}

function treeText(): string {
  return requiredElement<HTMLElement>(document.body, '[role="tree"]').textContent ?? "";
}

function treeItemForLabel(label: string): HTMLElement {
  const row = Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
  if (!row) throw new Error(`Expected Outline row ${label}. Visible tree: ${treeText()}`);
  return row;
}

function findNodePosition(editor: Editor, id: string): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, position) => {
    if (node.attrs["id"] !== id) return true;
    found = position;
    return false;
  });
  if (found === null) throw new Error(`Expected mounted node ${id}`);
  return found;
}

function flashcardAuthoringState(editor: Editor) {
  const root = requiredElement<HTMLElement>(editor.view.dom, '[data-flashcard-mode="authoring"]');
  const current = requiredElement<HTMLElement>(
    root,
    '[data-flashcard-filmstrip-card][data-current="true"]',
  );
  const currentCard = requiredElement<HTMLElement>(
    root,
    `.sc-course-flashcard-card[data-id="${current.dataset["flashcardFilmstripCard"]}"]`,
  );
  let authoredData: unknown = null;
  editor.state.doc.descendants((node) => {
    if (node.attrs["id"] !== IDS.flashcard) return true;
    authoredData = node.attrs["data"];
    return false;
  });
  return {
    currentCardId: current.dataset["flashcardFilmstripCard"],
    flipped: currentCard.getAttribute("data-flashcard-flipped"),
    mastery: currentCard.getAttribute("data-flashcard-mastery"),
    ratingControlCount: root.querySelectorAll(".sc-course-flashcard-rating-button").length,
    completionCount: root.querySelectorAll(".sc-course-flashcard-mastered").length,
    authoredData,
  };
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

function roleElement<ElementType extends HTMLElement>(role: string, label: string): ElementType {
  const selector = role === "button" ? 'button,[role="button"]' : `[role="${role}"]`;
  const element = Array.from(document.querySelectorAll<ElementType>(selector)).find(
    (candidate) =>
      candidate.getAttribute("aria-label") === label || candidate.textContent === label,
  );
  if (!element) throw new Error(`Expected ${role} named ${label}`);
  return element;
}

function holdHiddenCommit(element: HTMLElement): {
  release(): void;
  requested(): boolean;
} {
  const removeAttribute = element.removeAttribute.bind(element);
  let requested = false;
  Object.defineProperty(element, "removeAttribute", {
    configurable: true,
    value(name: string) {
      if (name === "hidden") {
        requested = true;
        return;
      }
      removeAttribute(name);
    },
  });

  return {
    release() {
      Object.defineProperty(element, "removeAttribute", {
        configurable: true,
        value: removeAttribute,
      });
      removeAttribute("hidden");
    },
    requested: () => requested,
  };
}

const TestSurfaceAuthoringNode = createSurfaceNode().extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(
        HTMLAttributes,
        { "data-surface": "" },
        surfaceAuthoringFrameAttributes({
          ...(typeof node.attrs["variant"] === "string"
            ? { definition: node.attrs["variant"] }
            : {}),
          surfaceId: node.attrs["id"],
        }),
      ),
      0,
    ];
  },
});

const TestMcqNode = Node.create({
  name: "mcq",
  group: "block",
  atom: true,
  addAttributes() {
    return { id: { default: null }, assessment: { default: null } };
  },
  parseHTML() {
    return [{ tag: "article[data-test-mcq]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["article", { ...HTMLAttributes, "data-test-mcq": "" }, "Multiple choice"];
  },
});

function representativeDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: IDS.course, mode: "slideshow" },
        content: [
          { type: "courseSection", attrs: { id: IDS.courseSection, title: "Practice" } },
          {
            type: "surface",
            attrs: {
              id: IDS.firstSurface,
              settings: { slideTitle: { enabled: true } },
              variant: "slide-content",
            },
            content: [
              {
                type: "region",
                attrs: { id: IDS.firstRegion, role: "main" },
                content: [
                  paragraph(IDS.prose, "Editor prose"),
                  {
                    type: "grid",
                    attrs: { id: IDS.grid },
                    content: [
                      {
                        type: "cell",
                        attrs: { id: IDS.firstCell },
                        content: [tabsContent()],
                      },
                      {
                        type: "cell",
                        attrs: { id: IDS.secondCell },
                        content: [accordionContent()],
                      },
                    ],
                  },
                  flashcardContent(),
                  annotatedFigureContent(),
                  { type: "mcq", attrs: { id: IDS.mcq, assessment: {} } },
                  nestedTabsContent(),
                ],
              },
            ],
          },
          {
            type: "surface",
            attrs: {
              id: IDS.secondSurface,
              settings: { slideTitle: { enabled: true } },
              variant: "slide-content",
            },
            content: [
              {
                type: "region",
                attrs: { id: IDS.secondRegion, role: "main" },
                content: [paragraph("secondpara01", "Second surface")],
              },
            ],
          },
        ],
      },
    ],
  };
}

function nestedTabsContent(): JSONContent {
  return {
    type: "layout",
    attrs: { id: IDS.outerTabs, variant: "tabs", options: { label: "Outer topics" } },
    content: [
      {
        type: "section",
        attrs: {
          id: IDS.outerFirstTab,
          label: "Outer visible",
          options: { label: "Outer visible" },
        },
        content: [paragraph("outerpara001", "Outer visible prose")],
      },
      {
        type: "section",
        attrs: {
          id: IDS.outerHiddenTab,
          label: "Outer hidden",
          options: { label: "Outer hidden" },
        },
        content: [
          {
            type: "layout",
            attrs: { id: IDS.innerTabs, variant: "tabs", options: { label: "Inner topics" } },
            content: [
              {
                type: "section",
                attrs: {
                  id: IDS.innerFirstTab,
                  label: "Inner visible",
                  options: { label: "Inner visible" },
                },
                content: [paragraph("innerpara001", "Inner visible prose")],
              },
              {
                type: "section",
                attrs: {
                  id: IDS.innerHiddenTab,
                  label: "Inner hidden",
                  options: { label: "Inner hidden" },
                },
                content: [paragraph(IDS.nestedHiddenProse, "Deep hidden prose")],
              },
            ],
          },
        ],
      },
    ],
  };
}

function tabsContent(): JSONContent {
  return {
    type: "layout",
    attrs: { id: IDS.tabs, variant: "tabs", options: { label: "Topic tabs" } },
    content: [
      {
        type: "section",
        attrs: { id: IDS.firstTab, label: "Visible topic", options: { label: "Visible topic" } },
        content: [paragraph("visiblepara1", "Visible topic prose")],
      },
      {
        type: "section",
        attrs: { id: IDS.hiddenTab, label: "Hidden topic", options: { label: "Hidden topic" } },
        content: [paragraph(IDS.hiddenProse, "Hidden topic prose")],
      },
    ],
  };
}

function accordionContent(): JSONContent {
  return {
    type: "layout",
    attrs: {
      id: IDS.accordion,
      variant: "accordion",
      options: { label: "Details", allowMultiple: false },
    },
    content: [
      {
        type: "section",
        attrs: { id: IDS.firstAccordion, options: { defaultOpen: true } },
        content: [
          { type: "accordion_section_title", content: [paragraph(undefined, "First detail")] },
          { type: "accordion_section_panel", content: [paragraph("accpara00001", "First panel")] },
        ],
      },
      {
        type: "section",
        attrs: { id: IDS.secondAccordion, options: { defaultOpen: false } },
        content: [
          { type: "accordion_section_title", content: [paragraph(undefined, "Second detail")] },
          { type: "accordion_section_panel", content: [paragraph("accpara00002", "Second panel")] },
        ],
      },
    ],
  };
}

function flashcardContent(): JSONContent {
  return {
    type: "flashcard",
    attrs: { id: IDS.flashcard, data: { type: "flashcard", shuffle: false } },
    content: [
      {
        type: "flashcard_card",
        attrs: { id: IDS.firstFlashcardCard },
        content: [
          {
            type: "flashcard_card_front",
            content: [paragraph("flashfront01", "Private flashcard front")],
          },
          {
            type: "flashcard_card_back",
            content: [paragraph("flashback001", "Private flashcard back")],
          },
        ],
      },
      {
        type: "flashcard_card",
        attrs: { id: IDS.secondFlashcardCard },
        content: [
          {
            type: "flashcard_card_front",
            content: [paragraph("flashfront02", "Private flashcard front")],
          },
          {
            type: "flashcard_card_back",
            content: [paragraph("flashback002", "Private flashcard back")],
          },
        ],
      },
    ],
  };
}

function annotatedFigureContent(): JSONContent {
  return {
    type: "annotated_figure",
    attrs: {
      id: IDS.annotationFigure,
      data: {
        type: "annotated_figure",
        source: { mode: "managed", mediaId: "outline-test-image" },
        alt: "Architecture diagram",
        captionDisplay: "list",
      },
    },
    content: [
      { type: "annotated_figure_canvas" },
      {
        type: "annotated_figure_legend",
        content: [
          {
            type: "annotated_figure_annotation",
            attrs: { id: IDS.annotation, title: "Annotation detail", x: 50, y: 50 },
            content: [paragraph("annotpara001", "Public annotation caption")],
          },
        ],
      },
    ],
  };
}

function paragraph(id: string | undefined, text: string): JSONContent {
  return {
    type: "paragraph",
    ...(id ? { attrs: { id } } : {}),
    content: [{ type: "text", text }],
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}

function testMediaPort(): MediaPort {
  return {
    resolve: async () => "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
    upload: async () => {
      throw new Error("Uploads are unavailable in this browser fixture.");
    },
  };
}
