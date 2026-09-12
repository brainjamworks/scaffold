import { Editor, mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { createDocumentTreeDefinitionLookup } from "@/composition/model/document-tree-definition-lookup";
import {
  createDocumentAuthoringExtension,
  getDocumentTreeForEditor,
  getEditorNavigationForEditor,
  DocumentTreeViewController,
} from "@/document/authoring";
import { createAuthoringEditorNavigationEnvironment } from "@/document/authoring/editor-navigation/authoring-editor-navigation-environment";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { CourseDocumentNode, createCourseSectionNode, DocumentNode } from "@/document/model/nodes";
import { LayerNode } from "@/document/model/layers/layer-node";
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
import { emptyGalleryData } from "@/editor/blocks/figure-composition/gallery/content";
import { GalleryAuthoringExtension } from "@/editor/blocks/figure-composition/gallery/gallery-authoring-extension";
import { FlashcardAuthoringExtension } from "@/editor/blocks/presentation/flashcard";
import { createProcessFlowContent } from "@/editor/blocks/presentation/process-flow/content";
import { ProcessFlowAuthoringExtension } from "@/editor/blocks/presentation/process-flow/process-flow-authoring-extension";
import {
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "@/editor/blocks/presentation/roadmap/content";
import { RoadmapAuthoringExtension } from "@/editor/blocks/presentation/roadmap/roadmap-authoring-extension";
import { createTimelineContent } from "@/editor/blocks/presentation/timeline/content";
import { TimelineAuthoringExtension } from "@/editor/blocks/presentation/timeline/timeline-authoring-extension";
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
  gallery: id("gallery00001"),
  firstGalleryItem: id("galleryitem1"),
  secondGalleryItem: id("galleryitem2"),
  processFlow: id("procflow0001"),
  firstProcessFlowStep: id("flowstep0001"),
  secondProcessFlowStep: id("flowstep0002"),
  roadmap: id("roadmap00001"),
  firstRoadmapMilestone: id("milestone001"),
  secondRoadmapMilestone: id("milestone002"),
  timeline: id("timeline0001"),
  firstTimelineEntry: id("timelineitm1"),
  secondTimelineEntry: id("timelineitm2"),
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

    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.prose);
    expect(selectedOutlineLabel()).toContain("Editor prose");
    expect(harness.editor.view.dom.contains(document.activeElement)).toBe(true);
    expect(harness.viewController.getSnapshot().expandedIds.has(IDS.firstSurface)).toBe(true);

    const hiddenTab = roleElement<HTMLButtonElement>("tab", "Hidden topic");
    hiddenTab.focus();
    hiddenTab.click();
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.hiddenTab);
    expect(selectedOutlineLabel()).toContain("Hidden topic");
    expect(document.activeElement?.getAttribute("role")).toBe("tab");

    await expect.element(page.getByRole("button", { name: "Select annotation 1" })).toBeVisible();
    const annotationPin = roleElement<HTMLButtonElement>("button", "Select annotation 1");
    annotationPin.focus();
    annotationPin.click();
    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.annotation);
    expect(selectedOutlineLabel()).toContain("Annotation detail");
    expect(
      requiredElement<HTMLElement>(document.body, '[role="tree"]').contains(document.activeElement),
    ).toBe(false);

    const flashcard = harness.tree.getSnapshot().itemById.get(IDS.flashcard);
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
    const target = harness.tree.getSnapshot().itemById.get(IDS.hiddenProse);
    if (!target) throw new Error("Expected hidden prose semantic item");

    await expandAncestorsThroughOutline(harness, IDS.hiddenProse);
    const targetRow = treeItemForLabel(target.label);
    await userEvent.click(targetRow);

    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.hiddenProse);
    expect(controller.getSelectionSnapshot().selectionOrigin).toBe("document-outline");
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
    const cell = harness.tree.getSnapshot().itemById.get(IDS.firstCell);
    if (!cell) throw new Error("Expected Grid Cell semantic item");

    await expandAncestorsThroughOutline(harness, IDS.firstCell);
    const cellRow = treeItemForLabel(cell.label);
    await userEvent.click(cellRow);

    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.firstCell);
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
    const annotation = harness.tree.getSnapshot().itemById.get(IDS.annotation);
    if (!annotation) throw new Error("Expected annotation semantic item");

    await expandAncestorsThroughOutline(harness, IDS.annotation);
    const annotationRow = treeItemForLabel(annotation.label);
    await userEvent.click(annotationRow);

    await expect.poll(() => controller.getSelectionSnapshot().selectedId).toBe(IDS.annotation);
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
    const card = harness.tree.getSnapshot().itemById.get(IDS.secondFlashcardCard);
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

    await expect
      .poll(() => controller.getSelectionSnapshot().selectedId)
      .toBe(IDS.secondFlashcardCard);
    expect(controller.getSelectionSnapshot().selectionOrigin).toBe("document-outline");
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

  it("reaches Gallery, Process Flow, Roadmap and Timeline children through their mounted owners", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const cases = [
      {
        ownerId: IDS.gallery,
        targetId: IDS.secondGalleryItem,
        scrollOwnerSelector: null,
        targetSelector: null,
      },
      {
        ownerId: IDS.processFlow,
        targetId: IDS.secondProcessFlowStep,
        scrollOwnerSelector: ".sc-course-process-flow__scrollport",
        targetSelector: `[data-process-flow-step-id="${IDS.secondProcessFlowStep}"]`,
      },
      {
        ownerId: IDS.roadmap,
        targetId: IDS.secondRoadmapMilestone,
        scrollOwnerSelector: ".sc-course-roadmap",
        targetSelector: `[data-roadmap-milestone-id="${IDS.secondRoadmapMilestone}"]`,
      },
      {
        ownerId: IDS.timeline,
        targetId: IDS.secondTimelineEntry,
        scrollOwnerSelector: ".sc-course-timeline__track",
        targetSelector: `[data-timeline-entry-id="${IDS.secondTimelineEntry}"]`,
      },
    ] as const;

    for (const testCase of cases) {
      const target = harness.tree.getSnapshot().itemById.get(testCase.targetId);
      if (!target) throw new Error(`Expected semantic target ${testCase.targetId}`);
      let ownedScroll: ReturnType<typeof installHorizontalRevealGeometry> | null = null;
      if (testCase.scrollOwnerSelector && testCase.targetSelector) {
        const ownerFrame = requiredElement<HTMLElement>(
          harness.editor.view.dom,
          `[data-authoring-frame="block"][data-id="${testCase.ownerId}"]`,
        );
        ownedScroll = installHorizontalRevealGeometry(
          requiredElement(ownerFrame, testCase.scrollOwnerSelector),
          requiredElement(ownerFrame, testCase.targetSelector),
        );
      }

      await expandAncestorsThroughOutline(harness, testCase.targetId);
      const targetRow = treeItemForLabel(target.label);
      await userEvent.click(targetRow);

      await expect
        .poll(() => harness.controller.getSelectionSnapshot().selectedId)
        .toBe(testCase.targetId);
      expect(harness.controller.getSelectionSnapshot().selectionOrigin).toBe("document-outline");
      expect(targetRow.getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(targetRow);
      expect(harness.editor.state.selection).toBeInstanceOf(NodeSelection);
      expect((harness.editor.state.selection as NodeSelection).node.attrs["id"]).toBe(
        testCase.ownerId,
      );
      expect(
        interactionOwnerPluginKey.getState(harness.editor.state)?.activationIntent,
      ).toMatchObject({
        kind: "object-shell",
        target: { id: testCase.ownerId, kind: "block" },
      });
      expect(harness.revealedIds.at(-1)).toBe(testCase.ownerId);
      if (ownedScroll) {
        expect(ownedScroll).toHaveBeenCalledWith({ behavior: "smooth", left: 260 });
      }
    }

    await expect.element(page.getByRole("img", { name: "Second outline image" })).toBeVisible();
    expect(page.getByRole("dialog", { name: "Gallery viewer" }).elements()).toHaveLength(0);
  });

  it("suppresses a stale mounted authoring finish while preserving the latest Outline request", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const staleTarget = harness.tree.getSnapshot().itemById.get(IDS.secondGalleryItem);
    const currentTarget = harness.tree.getSnapshot().itemById.get(IDS.secondFlashcardCard);
    if (!staleTarget || !currentTarget) throw new Error("Expected mounted stale-request targets");
    await expandAncestorsThroughOutline(harness, IDS.secondGalleryItem);
    await expandAncestorsThroughOutline(harness, IDS.secondFlashcardCard);
    const staleRow = treeItemForLabel(staleTarget.label);
    const currentRow = treeItemForLabel(currentTarget.label);
    const heldScroll = harness.holdNextAuthoringScroll();

    await userEvent.click(staleRow);
    await expect.poll(() => heldScroll.requested()).toBe(true);
    await userEvent.click(currentRow);

    await expect
      .poll(() => harness.controller.getSelectionSnapshot().selectedId)
      .toBe(IDS.secondFlashcardCard);
    expect(harness.controller.getSelectionSnapshot().selectionOrigin).toBe("document-outline");
    expect(document.activeElement).toBe(currentRow);
    heldScroll.release();
    await Promise.resolve();

    expect(harness.controller.getSelectionSnapshot().selectedId).toBe(IDS.secondFlashcardCard);
    expect(document.activeElement).toBe(currentRow);
    expect(staleRow.getAttribute("aria-selected")).toBe("false");
    expect(currentRow.getAttribute("aria-selected")).toBe("true");
  });

  it("commits hidden outer and inner Layout Sections before resolving final scroll geometry", async () => {
    const harness = await mountOutline();
    mounted.push(harness);
    const target = harness.tree.getSnapshot().itemById.get(IDS.nestedHiddenProse);
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
      .poll(() => harness.controller.getSelectionSnapshot().selectedId)
      .toBe(IDS.nestedHiddenProse);
    expect(commitOrder).toEqual(["outer", "inner"]);
    expect(harness.scrollVisibility.at(-1)).toEqual({ inner: true, outer: true });
    expect(document.activeElement).toBe(targetRow);
    observer.disconnect();
  });
});

interface MountedOutlineHarness {
  readonly controller: ReturnType<typeof getEditorNavigationForEditor>;
  readonly tree: ReturnType<typeof getDocumentTreeForEditor>;
  readonly editor: Editor;
  readonly rendered: RenderResult;
  readonly revealedIds: EmbeddedNodeId[];
  readonly scrollVisibility: Array<{ inner: boolean; outer: boolean }>;
  readonly viewController: DocumentTreeViewController;
  holdNextAuthoringScroll(): { readonly requested: () => boolean; readonly release: () => void };
  dispose(): Promise<void>;
}

async function mountOutline(): Promise<MountedOutlineHarness> {
  const semantics = createDocumentTreeDefinitionLookup({
    blocks: builtInBlockRegistry,
    layouts: builtInLayoutRegistry,
    surfaces: builtInSurfaceVariantRegistry,
  });
  const capabilities = Object.freeze({
    blocks: Object.freeze({
      registry: builtInBlockRegistry,
    }),
    layouts: Object.freeze({ registry: builtInLayoutRegistry }),
    surfaces: Object.freeze({ registry: builtInSurfaceVariantRegistry }),
    contentIdentity: Object.freeze({
      rewrites: Object.freeze({ getByNodeType: () => undefined, hasNodeType: () => false }),
    }),
    documentTree: semantics,
  });
  const editor = new Editor({
    editable: true,
    extensions: [
      createTestNodeIdentityExtension(),
      createScaffoldCapabilitiesStorageExtension(capabilities),
      createDocumentAuthoringExtension(semantics),
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      createCourseSectionNode(),
      TestSurfaceAuthoringNode,
      RegionNode,
      LayerNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      AccordionSectionTitleNode,
      AccordionSectionPanelNode,
      FlashcardAuthoringExtension,
      GalleryAuthoringExtension,
      ProcessFlowAuthoringExtension,
      RoadmapAuthoringExtension,
      TimelineAuthoringExtension,
      AnnotatedFigureAuthoringExtension,
      TestMcqNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: representativeDocument(),
  });
  const tree = getDocumentTreeForEditor(editor);
  const controller = getEditorNavigationForEditor(editor);
  const viewport = new DocumentOutlineRowViewport();
  const viewController = new DocumentTreeViewController({
    tree,
    navigation: controller,
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
        tree={tree}
        navigation={controller}
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
  let heldAuthoringScroll: {
    readonly gate: Deferred<void>;
    readonly markRequested: () => void;
  } | null = null;
  const environment = createAuthoringEditorNavigationEnvironment({
    blockDefinitions: builtInBlockRegistry,
    getDocumentTree: () => tree.getSnapshot(),
    root: host,
    view: editor.view,
  });
  controller.setEditor({
    dispatch: (transaction) => editor.view.dispatch(transaction),
    focus: () => editor.view.focus(),
  });
  controller.setEnvironment({
    createActivationTransaction: (location) => environment.createActivationTransaction(location),
    presentSurface: (surfaceId) => environment.presentSurface(surfaceId),
    async bringIntoView(location, behavior) {
      revealedIds.push(location.id);
      const heldScroll = heldAuthoringScroll;
      heldAuthoringScroll = null;
      if (heldScroll) {
        heldScroll.markRequested();
        await heldScroll.gate.promise;
      }
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
    .poll(
      () =>
        getSemanticTargetInteractionEnvironmentForEditor(editor).registry.resolve(IDS.tabs).kind ===
        "resolved",
    )
    .toBe(true);

  return {
    tree,
    controller,
    editor,
    rendered,
    revealedIds,
    scrollVisibility,
    viewController,
    holdNextAuthoringScroll() {
      if (heldAuthoringScroll) throw new Error("An authoring scroll is already held");
      const gate = deferred<void>();
      let requested = false;
      heldAuthoringScroll = {
        gate,
        markRequested: () => {
          requested = true;
        },
      };
      return { requested: () => requested, release: () => gate.resolve(undefined) };
    },
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
  const snapshot = harness.tree.getSnapshot();
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

function installHorizontalRevealGeometry(scrollOwner: HTMLElement, target: HTMLElement) {
  Object.defineProperty(scrollOwner, "clientWidth", { configurable: true, value: 200 });
  scrollOwner.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: 160, width: 200, x: 20, y: 20 });
  target.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: 80, width: 80, x: 340 - scrollOwner.scrollLeft, y: 50 });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (typeof options.left === "number") scrollOwner.scrollLeft = options.left;
  });
  Object.defineProperty(scrollOwner, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>["resolve"];
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
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
  group: "block assessment_question",
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
                  galleryContent(),
                  processFlowContent(),
                  roadmapContent(),
                  timelineContent(),
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

function galleryContent(): JSONContent {
  return {
    type: "gallery",
    attrs: {
      id: IDS.gallery,
      data: emptyGalleryData({ layout: "carousel" }),
    },
    content: [
      galleryItem(IDS.firstGalleryItem, "First outline image"),
      galleryItem(IDS.secondGalleryItem, "Second outline image"),
    ],
  };
}

function galleryItem(itemId: EmbeddedNodeId, alt: string): JSONContent {
  return {
    type: "gallery_item",
    attrs: {
      id: itemId,
      data: {
        image: { mode: "external", src: `https://example.com/${itemId}.jpg`, alt },
        caption: { type: "doc", content: [{ type: "paragraph" }] },
      },
    },
  };
}

function processFlowContent(): JSONContent {
  const processFlow = createProcessFlowContent({ orientation: "horizontal" });
  processFlow.attrs = { ...processFlow.attrs, id: IDS.processFlow };
  processFlow.content = (processFlow.content ?? []).slice(0, 2).map((step, index) => ({
    ...step,
    attrs: {
      ...step.attrs,
      id: index === 0 ? IDS.firstProcessFlowStep : IDS.secondProcessFlowStep,
    },
  }));
  return processFlow;
}

function roadmapContent(): JSONContent {
  return {
    type: "roadmap",
    attrs: { id: IDS.roadmap, data: emptyRoadmapData({ orientation: "horizontal" }) },
    content: [
      {
        type: "roadmap_milestone",
        attrs: { id: IDS.firstRoadmapMilestone, status: "done" },
        content: roadmapMilestoneContent("First milestone", "First milestone body"),
      },
      {
        type: "roadmap_milestone",
        attrs: { id: IDS.secondRoadmapMilestone, status: "current" },
        content: roadmapMilestoneContent("Second milestone", "Second milestone body"),
      },
    ],
  };
}

function timelineContent(): JSONContent {
  const timeline = createTimelineContent({ presentation: "carousel" });
  timeline.attrs = { ...timeline.attrs, id: IDS.timeline };
  timeline.content = (timeline.content ?? []).slice(0, 2).map((entry, index) => ({
    ...entry,
    attrs: {
      ...entry.attrs,
      id: index === 0 ? IDS.firstTimelineEntry : IDS.secondTimelineEntry,
    },
  }));
  return timeline;
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
