// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type { SemanticNavigationOptions } from "@/document/authoring/semantic-document/semantic-navigation";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";
import { DocumentOutlineRowViewport } from "../SemanticSubtreeOutline";
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
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigator
        controller={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    const disclosure = screen.getByRole("button", { name: "Section 1" });
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toBeVisible();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Select Surface Introduction" })).toBeNull();

    await user.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toBeVisible();
  });

  it("routes an external descendant selection into its owning Surface Structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const callout = item("callout", "block", "Callout", [heading]);
    const introduction = item("surface-1", "surface", "Introduction", [callout]);
    const section = item("section-1", "course-section", "Section 1", [introduction]);
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        controller={controller}
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
    expect(controller.getSnapshot().selectedId).toBe(heading.id);
    expect(controller.selectCalls).toEqual([]);
  });

  it("follows a new external descendant selection into another Surface Structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const introduction = item("surface-1", "surface", "Introduction", [heading]);
    const paragraph = item("paragraph", "rich-text", "Summary paragraph");
    const summary = item("surface-2", "surface", "Summary", [paragraph]);
    const section = item("section-1", "course-section", "Section 1", [introduction, summary]);
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        controller={controller}
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
    expect(controller.getSnapshot().selectedId).toBe(paragraph.id);
    expect(controller.selectCalls).toEqual([]);
  });

  it("requires a new external selection to reopen Structure after Back", async () => {
    const user = userEvent.setup();
    const heading = item("heading", "rich-text", "Heading");
    const paragraph = item("paragraph", "rich-text", "Paragraph");
    const introduction = item("surface-1", "surface", "Introduction", [heading, paragraph]);
    const section = item("section-1", "course-section", "Section 1", [introduction]);
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        controller={controller}
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
    expect(controller.getSnapshot().selectedId).toBe(heading.id);

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
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        controller={controller}
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
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentNavigatorHarness
        controller={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    expect(screen.getByRole("heading", { name: "Section 1" })).toBeInTheDocument();
    expect(screen.getAllByTestId("course-surface-placeholder")).toHaveLength(2);
    expect(screen.queryByRole("treeitem", { name: "Heading" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select Surface Introduction" }));
    expect(controller.selectCalls.at(-1)).toEqual({
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
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });
    const structureAuthoring = {
      createCourseSection: vi.fn(() => ({ ok: true as const })),
      canMoveSurface: vi.fn(() => false),
      renameCourseSection: vi.fn(() => ({ ok: true as const })),
      duplicateCourseSection: vi.fn(() => ({ ok: true as const })),
      deleteCourseSection: vi.fn(() => ({ ok: true as const })),
      moveSurface: vi.fn(() => ({ ok: true as const })),
    };
    const surfaceActions = {
      openSettings: vi.fn(() => true),
      duplicateSurface: vi.fn(() => true),
      deleteSurface: vi.fn(() => true),
    };

    render(
      <DocumentNavigator
        controller={controller}
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
  kind: SemanticItem["kind"],
  label: string,
  children: readonly SemanticItem[] = [],
): SemanticItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    children,
  };
}

function snapshotFromRoots(roots: readonly SemanticItem[]): SemanticDocumentSnapshot {
  const itemById = new Map<EmbeddedNodeId, SemanticItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const visit = (entry: SemanticItem, parentId: EmbeddedNodeId | null) => {
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

class FakeSemanticDocumentController {
  readonly selectCalls: Array<{ id: EmbeddedNodeId; options: SemanticNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  #snapshot: SemanticDocumentControllerSnapshot;

  constructor(semantics: SemanticDocumentSnapshot) {
    this.#snapshot = { semantics, selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  selectFromEditor(itemId: EmbeddedNodeId) {
    this.#snapshot = { ...this.#snapshot, selectedId: itemId, selectionOrigin: "editor" };
    for (const listener of this.#listeners) listener();
  }

  selectFromComponent(itemId: EmbeddedNodeId) {
    this.#snapshot = { ...this.#snapshot, selectedId: itemId, selectionOrigin: "component" };
    for (const listener of this.#listeners) listener();
  }

  replaceSemantics(semantics: SemanticDocumentSnapshot) {
    this.#snapshot = { ...this.#snapshot, semantics };
    for (const listener of this.#listeners) listener();
  }

  async select(itemId: EmbeddedNodeId, options: SemanticNavigationOptions) {
    this.selectCalls.push({ id: itemId, options });
    this.#snapshot = { ...this.#snapshot, selectedId: itemId, selectionOrigin: options.origin };
    for (const listener of this.#listeners) listener();
    return { kind: "reached" as const, id: itemId };
  }
}
