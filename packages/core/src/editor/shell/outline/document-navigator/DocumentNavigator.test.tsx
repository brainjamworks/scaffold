// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { Result } from "better-result";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DocumentTreeViewController } from "@/document/authoring/document-tree/document-tree-view-controller";
import type { EditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import type { EditorNavigationOptions } from "@/document/authoring/editor-navigation/editor-navigation";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";
import { DocumentOutlineRowViewport } from "../DocumentTreeSubtreeOutline";
import { DocumentNavigator, type DocumentNavigatorNavigation } from "./DocumentNavigator";

const scrollIntoView = vi.fn();

describe("DocumentNavigator", () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it("expands Course Sections by default and lets authors collapse their nested Surfaces", async () => {
    const user = userEvent.setup();
    const surface = item("surface-1", "surface", "Introduction");
    const section = item("section-1", "course-section", "Section 1", [surface]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigator
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    const disclosure = screen.getByRole("button", { name: "Collapse Section 1" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(viewController.getSnapshot().expandedIds.has(section.id)).toBe(true);
    expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toBeVisible();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(viewController.getSnapshot().expandedIds.has(section.id)).toBe(false);
    expect(screen.queryByRole("button", { name: "Select Surface Introduction" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Expand Section 1" }));
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(viewController.getSnapshot().expandedIds.has(section.id)).toBe(true);
    expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toBeVisible();
  });

  it("selects an empty Course Section without changing its disclosure state", async () => {
    const user = userEvent.setup();
    const section = item("section-1", "course-section", "Empty Section");
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigator
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    const disclosure = screen.getByRole("button", { name: "Collapse Empty Section" });
    await user.click(disclosure);
    await user.click(screen.getByRole("button", { name: "Select Course Section Empty Section" }));

    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Select Course Section Empty Section" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(controller.componentSelectionCalls).toEqual([section.id]);
    expect(controller.showTargetCalls).toEqual([]);
  });

  it("returns to Overview, expands, and reveals an externally selected Course Section", async () => {
    const user = userEvent.setup();
    const heading = item("heading", "rich-text", "Heading");
    const surface = item("surface-1", "surface", "Introduction", [heading]);
    const section = item("section-1", "course-section", "Section 1", [surface]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    act(() => controller.selectFromEditor(heading.id));
    expect(await screen.findByRole("tree", { name: "Introduction structure" })).toBeVisible();

    act(() => viewController.setExpanded(section.id, false));
    expect(viewController.getSnapshot().expandedIds.has(section.id)).toBe(false);
    scrollIntoView.mockClear();

    act(() => controller.selectFromComponent(section.id));

    const disclosure = await screen.findByRole("button", { name: "Collapse Section 1" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(viewController.getSnapshot().expandedIds.has(section.id)).toBe(true);
    expect(screen.getByRole("button", { name: "Select Course Section Section 1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(controller.showTargetCalls).toEqual([]);

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps a collapsed Course Section available as a Surface drop destination", async () => {
    const user = userEvent.setup();
    const section = item("section-1", "course-section", "Empty Section");
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });
    const structureAuthoring = {
      createCourseSection: vi.fn(() => Result.ok()),
      canMoveSurface: vi.fn(() => true),
      renameCourseSection: vi.fn(() => Result.ok()),
      duplicateCourseSection: vi.fn(() => Result.ok()),
      deleteCourseSection: vi.fn(() => Result.ok()),
      moveSurface: vi.fn(() => Result.ok()),
    };

    render(
      <DocumentNavigator
        tree={controller}
        navigation={controller}
        structureAuthoring={structureAuthoring}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Collapse Empty Section" }));

    expect(document.querySelector(`[data-destination="section:${section.id}:end"]`)).not.toBeNull();
  });

  it("routes an external descendant selection into its owning Surface Structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const callout = item("callout", "block", "Callout", [heading]);
    const introduction = item("surface-1", "surface", "Introduction", [callout]);
    const section = item("section-1", "course-section", "Section 1", [introduction]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    act(() => controller.selectFromEditor(heading.id));

    const structure = await screen.findByRole("tree", { name: "Introduction structure" });
    expect(within(structure).getByRole("treeitem", { name: "Callout" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(within(structure).getByRole("treeitem", { name: "Heading" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(controller.getSelectionSnapshot().selectedId).toBe(heading.id);
    expect(controller.showTargetCalls).toEqual([]);
  });

  it("follows a new external descendant selection into another Surface Structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const introduction = item("surface-1", "surface", "Introduction", [heading]);
    const paragraph = item("paragraph", "rich-text", "Summary paragraph");
    const summary = item("surface-2", "surface", "Summary", [paragraph]);
    const section = item("section-1", "course-section", "Section 1", [introduction, summary]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    act(() => controller.selectFromEditor(heading.id));
    expect(await screen.findByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();

    act(() => controller.selectFromComponent(paragraph.id));

    const structure = await screen.findByRole("tree", { name: "Summary structure" });
    expect(screen.queryByRole("tree", { name: "Introduction structure" })).toBeNull();
    expect(within(structure).getByRole("treeitem", { name: "Summary paragraph" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(controller.getSelectionSnapshot().selectedId).toBe(paragraph.id);
    expect(controller.showTargetCalls).toEqual([]);
  });

  it("requires a new external selection to reopen Structure after Back", async () => {
    const user = userEvent.setup();
    const heading = item("heading", "rich-text", "Heading");
    const paragraph = item("paragraph", "rich-text", "Paragraph");
    const introduction = item("surface-1", "surface", "Introduction", [heading, paragraph]);
    const section = item("section-1", "course-section", "Section 1", [introduction]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    act(() => controller.selectFromEditor(heading.id));
    expect(await screen.findByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Course overview" }));
    expect(
      await screen.findByRole("button", { name: "Select Surface Introduction" }),
    ).toBeVisible();

    act(() => controller.replaceSemantics(snapshotFromRoots([section])));

    await waitFor(() =>
      expect(screen.queryByRole("tree", { name: "Introduction structure" })).toBeNull(),
    );
    expect(controller.getSelectionSnapshot().selectedId).toBe(heading.id);

    act(() => controller.selectFromComponent(paragraph.id));
    const structure = await screen.findByRole("tree", { name: "Introduction structure" });
    expect(within(structure).getByRole("treeitem", { name: "Paragraph" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows Overview for external Surface and Course Section selections", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const introduction = item("surface-1", "surface", "Introduction", [heading]);
    const section = item("section-1", "course-section", "Section 1", [introduction]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    act(() => controller.selectFromEditor(heading.id));
    expect(await screen.findByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();

    act(() => controller.selectFromEditor(introduction.id));
    expect(
      await screen.findByRole("button", { name: "Select Surface Introduction" }),
    ).toHaveAttribute("aria-pressed", "true");

    act(() => controller.selectFromEditor(heading.id));
    expect(await screen.findByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();

    act(() => controller.selectFromEditor(section.id));
    expect(await screen.findByRole("heading", { name: "Section 1" })).toBeInTheDocument();
    expect(screen.queryByRole("tree", { name: "Introduction structure" })).toBeNull();
  });

  it("keeps Surface selection separate from manual Structure routing", async () => {
    const user = userEvent.setup();
    const heading = item("heading", "rich-text", "Heading");
    const introduction = item("surface-1", "surface", "Introduction", [heading]);
    const summary = item("surface-2", "surface", "Summary");
    const section = item("section-1", "course-section", "Section 1", [introduction, summary]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    expect(screen.getByRole("heading", { name: "Section 1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("document-navigator-surface-placeholder")).toHaveLength(2);
    expect(screen.queryByRole("treeitem", { name: "Heading" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select Surface Introduction" }));
    expect(controller.showTargetCalls.at(-1)).toEqual({
      id: introduction.id,
      options: { origin: "document-outline", focusEditor: false },
    });
    expect(screen.queryByRole("treeitem", { name: "Heading" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show structure for Introduction" }));
    expect(screen.getByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Heading" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Select Surface Summary" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Back to Course overview" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toHaveFocus(),
    );
  });

  it("exposes Section lifecycle and stable-ID Surface actions from the overview", async () => {
    const user = userEvent.setup();
    const surface = item("surface-1", "surface", "Introduction");
    const section = item("section-1", "course-section", "Section 1", [surface]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });
    const structureAuthoring = {
      createCourseSection: vi.fn(() => Result.ok()),
      canMoveSurface: vi.fn(() => false),
      renameCourseSection: vi.fn(() => Result.ok()),
      duplicateCourseSection: vi.fn(() => Result.ok()),
      deleteCourseSection: vi.fn(() => Result.ok()),
      moveSurface: vi.fn(() => Result.ok()),
    };
    const surfaceActions = {
      openSettings: vi.fn(() => true),
      duplicateSurface: vi.fn(() => true),
      deleteSurface: vi.fn(() => true),
    };

    render(
      <DocumentNavigator
        tree={controller}
        navigation={controller}
        structureAuthoring={structureAuthoring}
        surfaceActions={surfaceActions}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    expect(screen.getByRole("button", { name: "Add Course Section" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open settings for Introduction" }));
    expect(surfaceActions.openSettings).toHaveBeenCalledWith(surface.id);

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate Surface" }));
    expect(surfaceActions.duplicateSurface).toHaveBeenCalledWith(surface.id);

    await user.click(screen.getByRole("button", { name: "More actions for Section 1" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate Course Section" }));
    expect(structureAuthoring.duplicateCourseSection).toHaveBeenCalledWith(section.id);
  });
});

function DocumentNavigatorHarness(props: ComponentProps<typeof DocumentNavigator>) {
  const [navigation, setNavigation] = useState<DocumentNavigatorNavigation>({ kind: "overview" });

  return (
    <>
      {navigation.kind === "surface-structure" ? (
        <button
          aria-label="Back to Course overview"
          type="button"
          onClick={navigation.returnToOverview}
        >
          Course overview
        </button>
      ) : null}
      <DocumentNavigator {...props} onNavigationChange={setNavigation} />
    </>
  );
}

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function item(
  value: string,
  kind: DocumentTreeItem["kind"],
  label: string,
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children,
  };
}

function snapshotFromRoots(roots: readonly DocumentTreeItem[]): DocumentTreeSnapshot {
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const visit = (entry: DocumentTreeItem, parentId: EmbeddedNodeId | null) => {
    itemById.set(entry.id, entry);
    parentById.set(entry.id, parentId);
    entry.children.forEach((child) => visit(child, entry.id));
  };
  roots.forEach((root) => visit(root, null));
  return {
    revision: 1,
    mode: "slideshow",
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

class FakeDocumentOwners {
  readonly showTargetCalls: Array<{ id: EmbeddedNodeId; options: EditorNavigationOptions }> = [];
  readonly componentSelectionCalls: EmbeddedNodeId[] = [];
  readonly #listeners = new Set<() => void>();
  #tree: DocumentTreeSnapshot;
  #selection: EditorSelectionSnapshot;

  constructor(semantics: DocumentTreeSnapshot) {
    this.#tree = semantics;
    this.#selection = { selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#tree;
  getSelectionSnapshot = () => this.#selection;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  subscribeSelection = this.subscribe;

  selectFromEditor(itemId: EmbeddedNodeId) {
    this.#selection = { selectedId: itemId, selectionOrigin: "editor" };
    for (const listener of this.#listeners) listener();
  }

  selectFromComponent(itemId: EmbeddedNodeId) {
    this.#selection = { selectedId: itemId, selectionOrigin: "component" };
    for (const listener of this.#listeners) listener();
  }

  replaceSemantics(semantics: DocumentTreeSnapshot) {
    this.#tree = semantics;
    for (const listener of this.#listeners) listener();
  }

  reportComponentSelection(itemId: EmbeddedNodeId) {
    this.componentSelectionCalls.push(itemId);
    this.selectFromComponent(itemId);
  }

  async showTarget(itemId: EmbeddedNodeId, options: EditorNavigationOptions) {
    this.showTargetCalls.push({ id: itemId, options });
    this.#selection = { selectedId: itemId, selectionOrigin: options.origin };
    for (const listener of this.#listeners) listener();
    return { kind: "reached" as const, id: itemId };
  }
}
