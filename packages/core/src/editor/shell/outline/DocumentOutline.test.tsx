// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Result } from "better-result";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { DocumentTreeViewController } from "@/document/authoring/document-tree/document-tree-view-controller";
import type { EditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import type {
  EditorNavigationOptions,
  EditorNavigationResult,
} from "@/document/authoring/editor-navigation/editor-navigation";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";
import type { CourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";

import { DocumentOutline, DocumentOutlineRowViewport } from "./DocumentOutline";
import { DocumentTreeSubtreeOutline } from "./DocumentTreeSubtreeOutline";

const scrollIntoView = vi.fn();

describe("DocumentOutline", () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it("routes a Slideshow to Section groups and Surface cards instead of the full tree", () => {
    const surface = item("surface", "surface", "Introduction", null, [
      item("heading", "rich-text", "Heading", null),
    ]);
    const section = item("section", "course-section", "Section 1", null, [surface]);
    const fixture = createFixtureFromRoots([section], "slideshow");

    render(<DocumentOutline {...fixture.props} structureAuthoring={createStructurePort()} />);

    expect(screen.getByRole("heading", { name: "Section 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Surface Introduction" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "Heading" })).toBeNull();
  });

  it("routes a Page through one ungrouped Surface card and the shared Structure view", async () => {
    const user = userEvent.setup();
    const surface = item("surface", "surface", "Page", null, [
      item("heading", "rich-text", "Heading", null),
    ]);
    const fixture = createFixtureFromRoots([surface], "page");
    const authoring = {
      read: vi.fn(() => ({ ok: true as const, value: null })),
      write: vi.fn(() => ({ ok: true as const })),
    };
    const surfaceActions = {
      openSettings: vi.fn(() => true),
      duplicateSurface: vi.fn(() => true),
      deleteSurface: vi.fn(() => true),
    };

    render(
      <DocumentOutline {...fixture.props} authoring={authoring} surfaceActions={surfaceActions} />,
    );

    expect(screen.getByRole("button", { name: "Select Surface Page" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Course Section" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Surface Page" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "Heading" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Open settings for Page" }));
    expect(surfaceActions.openSettings).toHaveBeenCalledWith(surface.id);

    await user.click(screen.getByRole("button", { name: "More actions for Page" }));
    expect(screen.getByRole("menuitem", { name: "Rename Surface" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Duplicate Surface" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Delete Surface" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Show structure for Page" }));
    const structure = screen.getByRole("tree", { name: "Page structure" });
    expect(within(structure).getByRole("treeitem", { name: "Heading" })).toBeInTheDocument();
  });

  it("uses mode-neutral hooks for shared Document Navigator UI", () => {
    const surface = item("surface", "surface", "Page", null);
    const fixture = createFixtureFromRoots([surface], "page");

    const { container } = render(<DocumentOutline {...fixture.props} />);

    expect(container.querySelector(".sc-document-navigator")).not.toBeNull();
    expect(container.querySelector(".sc-document-navigator-overview")).not.toBeNull();
    expect(container.querySelector(".sc-document-navigator-surface-card")).not.toBeNull();
    expect(
      container.querySelector(".sc-course-navigator, .sc-course-overview, .sc-course-surface-card"),
    ).toBeNull();
  });

  it("renders nested public items, supplied labels and payload-safe diagnostics", () => {
    const fixture = createFixture();
    fixture.view.setExpanded(id("surface"), true);
    fixture.view.setExpanded(id("region"), true);

    render(<DocumentTreeSubtreeOutline {...fixture.props} />);

    const tree = screen.getByRole("tree", { name: "Document outline" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(5);
    expect(screen.getByRole("treeitem", { name: "Overview" })).toHaveAttribute("aria-level", "1");
    expect(screen.getByRole("treeitem", { name: /Main content/ })).toHaveAttribute(
      "aria-level",
      "2",
    );
    expect(screen.getByRole("treeitem", { name: /Paragraph/ })).toHaveAttribute("aria-level", "3");
    expect(screen.getByText("2 outline items could not be included.")).toBeInTheDocument();
    expect(screen.queryByText("must-not-render")).toBeNull();
  });

  it("expands Course Section roots when first observed without expanding member Surfaces", () => {
    const paragraph = item("paragraph", "rich-text", "Paragraph", null);
    const surface = item("surface", "surface", "Overview", null, [paragraph]);
    const section = item("section", "course-section", "Introduction", null, [surface]);
    const fixture = createFixtureFromRoots([section]);

    render(<DocumentTreeSubtreeOutline {...fixture.props} />);

    expect(screen.getByRole("treeitem", { name: "Introduction" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("treeitem", { name: "Overview" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("treeitem", { name: "Paragraph" })).toBeNull();
  });

  it("shows an empty Course Section as a quiet, accessible Surface destination", () => {
    const section = item("section", "course-section", "Practice", null);
    const fixture = createFixtureFromRoots([section], "slideshow");

    render(<DocumentOutline {...fixture.props} structureAuthoring={createStructurePort()} />);

    expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
    const emptyMessage = screen.getByText("No slides yet");
    const destination = emptyMessage.closest('[role="listitem"]');
    expect(destination).not.toBeNull();
    expect(destination).toHaveAttribute("data-destination", "section:section00000:end");
    expect(screen.getByText("Add a slide to get started.")).toBeInTheDocument();
    expect(screen.queryByText("Drag a slide here to move it into this section.")).toBeNull();
  });

  it("offers an empty Course Section as a move destination when another slide is movable", () => {
    const introduction = item("section-1", "course-section", "Introduction", null, [
      item("surface-1", "surface", "Welcome", null),
    ]);
    const practice = item("section-2", "course-section", "Practice", null);
    const fixture = createFixtureFromRoots([introduction, practice], "slideshow");
    const structure = createStructurePort();
    structure.canMoveSurface.mockReturnValue(true);

    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    const emptyMessage = screen.getByText("No slides yet");
    const destination = emptyMessage.closest('[role="listitem"]');
    expect(destination).not.toBeNull();
    expect(screen.getByText("Drag a slide here to move it into this section.")).toBeInTheDocument();
    expect(screen.queryByText("Add a slide to get started.")).toBeNull();
  });

  it("preserves an explicit Course Section collapse across snapshot replacements", async () => {
    const user = userEvent.setup();
    const surface = item("surface", "surface", "Overview", null);
    const section = item("section", "course-section", "Introduction", null, [surface]);
    const fixture = createFixtureFromRoots([section]);
    render(<DocumentTreeSubtreeOutline {...fixture.props} />);

    await user.click(screen.getByRole("button", { name: "Collapse Introduction" }));
    fixture.controller.replace(snapshotFromRoots([section]), null, null);

    expect(screen.getByRole("treeitem", { name: "Introduction" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("treeitem", { name: "Overview" })).toBeNull();
  });

  it("expands a newly inserted Course Section root", async () => {
    const first = item("section", "course-section", "Introduction", null, [
      item("surface", "surface", "Overview", null),
    ]);
    const fixture = createFixtureFromRoots([first]);
    render(<DocumentTreeSubtreeOutline {...fixture.props} />);
    const second = item("section-2", "course-section", "Practice", null, [
      item("surface-2", "surface", "Exercise", null),
    ]);

    fixture.controller.replace(snapshotFromRoots([first, second]), null, null);

    expect(await screen.findByRole("treeitem", { name: "Exercise" })).toHaveAttribute(
      "aria-level",
      "2",
    );
  });

  it("adds a default-named Course Section immediately from the Outline-level action", async () => {
    const user = userEvent.setup();
    const fixture = createFixtureFromRoots(
      [item("surface", "surface", "Overview", null)],
      "slideshow",
    );
    const structure = createStructurePort();

    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);
    await user.click(screen.getByRole("button", { name: "Add Course Section" }));

    expect(structure.createCourseSection).toHaveBeenCalledWith();
    expect(screen.queryByRole("dialog", { name: "Add Course Section" })).toBeNull();
    expect(screen.getByText("Course Section added.")).toHaveClass(
      "sc-document-outline-status",
      "sc-document-outline-status--visually-hidden",
    );
    expect(screen.queryByRole("button", { name: "More actions for Overview" })).toBeNull();
  });

  it("offers canonical title, duplicate and remove actions only on Course Section rows", async () => {
    const user = userEvent.setup();
    const section = item("section", "course-section", "Introduction", null, [
      item("surface", "surface", "Overview", null),
    ]);
    const fixture = createFixtureFromRoots([section], "slideshow");
    const structure = createStructurePort();
    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit Course Section title" }));
    const title = screen.getByRole("textbox", { name: "Course Section title" });
    await user.clear(title);
    await user.type(title, "Foundations");
    await user.click(screen.getByRole("button", { name: "Save Course Section title" }));
    expect(structure.renameCourseSection).toHaveBeenCalledWith({
      courseSectionId: id("section"),
      title: "Foundations",
    });

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate Course Section" }));
    expect(structure.duplicateCourseSection).toHaveBeenCalledWith(id("section"));

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete Course Section" }));
    expect(screen.getByRole("alertdialog", { name: "Delete Course Section" })).toHaveAttribute(
      "data-intent",
      "danger",
    );
    expect(screen.getByRole("list", { name: "Related Surfaces" })).toHaveTextContent("Overview");
    const deleteButton = screen.getByRole("button", { name: "Delete Course Section" });
    expect(deleteButton).toHaveAttribute("data-variant", "danger");
    await user.click(deleteButton);
    expect(structure.deleteCourseSection).toHaveBeenCalledWith({
      courseSectionId: id("section"),
      expectedSurfaceIds: [id("surface")],
    });
  });

  it("refreshes a stale deletion dialog before the author can confirm the new scope", async () => {
    const user = userEvent.setup();
    const overview = item("surface", "surface", "Overview", null);
    const section = item("section", "course-section", "Introduction", null, [overview]);
    const fixture = createFixtureFromRoots([section], "slideshow");
    const structure = createStructurePort();
    structure.deleteCourseSection.mockImplementationOnce(
      () =>
        Result.err({
          code: "course_section_membership_changed",
          courseSectionId: section.id,
          expectedSurfaceIds: [overview.id],
          actualSurfaceIds: [overview.id, id("practice")],
        }) as never,
    );
    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete Course Section" }));

    const practice = item("practice", "surface", "Practice", null);
    fixture.controller.replace(
      snapshotFromRoots([{ ...section, children: [overview, practice] }], "slideshow"),
      null,
      null,
    );
    await user.click(screen.getByRole("button", { name: "Delete Course Section" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This Course Section changed while the dialog was open. Review the updated related Surfaces, then try again.",
    );
    expect(screen.getByRole("list", { name: "Related Surfaces" })).toHaveTextContent("Practice");

    await user.click(screen.getByRole("button", { name: "Delete Course Section" }));
    expect(structure.deleteCourseSection).toHaveBeenLastCalledWith({
      courseSectionId: section.id,
      expectedSurfaceIds: [overview.id, practice.id],
    });
  });

  it("explains why the final Course Section cannot be deleted", async () => {
    const user = userEvent.setup();
    const overview = item("surface", "surface", "Overview", null);
    const section = item("section", "course-section", "Introduction", null, [overview]);
    const fixture = createFixtureFromRoots([section], "slideshow");
    const structure = createStructurePort();
    structure.deleteCourseSection.mockImplementationOnce(
      () =>
        Result.err({
          code: "cannot_delete_final_course_section",
          courseSectionId: section.id,
        }) as never,
    );
    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    await user.click(screen.getByRole("button", { name: "More actions for Introduction" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete Course Section" }));
    await user.click(screen.getByRole("button", { name: "Delete Course Section" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "The final Course Section cannot be deleted. Add another Course Section first.",
    );
  });

  it("renders drag handles only for eligible Surface rows", () => {
    const section = item("section", "course-section", "Introduction", null, [
      item("surface", "surface", "Overview", null, [
        item("region", "region", "Main content", null),
      ]),
      item("surface-2", "surface", "Practice", null),
    ]);
    const fixture = createFixtureFromRoots([section], "slideshow");
    const structure = createStructurePort();
    structure.canMoveSurface.mockReturnValue(true);

    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    expect(screen.getByRole("button", { name: "Move Surface Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Surface Practice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move Surface Introduction/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Move Surface Main content/ })).toBeNull();
  });

  it("keeps a one-Surface Page free of Section actions and movement", () => {
    const fixture = createFixtureFromRoots([item("surface", "surface", "Page", null)]);
    const structure = createStructurePort();
    structure.canMoveSurface.mockReturnValue(true);

    render(<DocumentOutline {...fixture.props} structureAuthoring={structure} />);

    expect(screen.queryByRole("button", { name: "More actions for Page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move Surface Page" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Course Section" })).toBeNull();
  });

  it("supports roving tree focus, expansion and selection from the keyboard", async () => {
    const user = userEvent.setup();
    const fixture = createFixture();
    render(<DocumentTreeSubtreeOutline {...fixture.props} />);

    const surface = screen.getByRole("treeitem", { name: "Overview" });
    surface.focus();
    await user.keyboard("{ArrowRight}");
    expect(surface).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("treeitem", { name: /Main content/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: /Untitled/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("treeitem", { name: /Overview 2/ })).toHaveFocus();
    await user.keyboard("{Home}{Enter}");

    expect(fixture.controller.showTargetCalls.at(-1)).toEqual({
      id: id("surface"),
      options: { origin: "document-outline", focusEditor: false },
    });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it("reveals an external editor selection without taking editor focus", async () => {
    const fixture = createFixture();

    render(
      <>
        <input aria-label="Editor content" />
        <DocumentOutline {...fixture.props} />
      </>,
    );
    const editorInput = screen.getByRole("textbox", { name: "Editor content" });
    editorInput.focus();

    fixture.controller.replace(fixture.snapshot, id("paragraph"), "editor");

    await waitFor(() => {
      expect(screen.getByRole("treeitem", { name: /Paragraph/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(editorInput).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it("queues one reveal until a newly expanded row mounts", async () => {
    const viewport = new DocumentOutlineRowViewport();
    const row = document.createElement("div");

    const revealed = viewport.reveal(id("paragraph"));
    expect(scrollIntoView).not.toHaveBeenCalled();

    viewport.register(id("paragraph"), row);
    await revealed;

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("announces unavailable and nearest-owner navigation outcomes", async () => {
    const user = userEvent.setup();
    const fixture = createFixture();
    fixture.view.setExpanded(id("surface"), true);
    fixture.controller.nextResult = { kind: "missing", id: id("region") };
    render(<DocumentTreeSubtreeOutline {...fixture.props} />);

    await user.click(screen.getByRole("treeitem", { name: /Main content/ }));
    expect(screen.getByRole("status")).toHaveTextContent("This item is no longer available.");

    fixture.controller.nextResult = {
      kind: "reached-owner",
      requestedId: id("region"),
      ownerId: id("surface"),
      reason: "child-missing",
    };
    await user.click(screen.getByRole("treeitem", { name: /Main content/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Opened the nearest available item");
  });

  it("shows a clear empty state", () => {
    const controller = new FakeDocumentOwners(emptySnapshot());
    const viewport = new DocumentOutlineRowViewport();
    const view = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentOutline
        tree={controller}
        navigation={controller}
        viewController={view}
        viewport={viewport}
      />,
    );

    expect(screen.getByText("This document has no outline items yet.")).toBeInTheDocument();
  });

  it("consumes only the snapshot/controller seam and never requests editor traversal state", () => {
    const fixture = createFixtureFromRoots([
      item("surface", "surface", "Page", null, [item("paragraph", "rich-text", "Paragraph", null)]),
    ]);
    const controller = new Proxy(fixture.controller, {
      get(target, property, receiver) {
        if (property === "editor" || property === "state" || property === "doc") {
          throw new Error(`Outline requested forbidden traversal property ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const viewport = new DocumentOutlineRowViewport();
    const view = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentOutline
        tree={controller}
        navigation={controller}
        viewController={view}
        viewport={viewport}
      />,
    );

    expect(screen.getByRole("button", { name: "Select Surface Page" })).toBeInTheDocument();
    expect(screen.queryByRole("tree", { name: "Document outline" })).toBeNull();
    view.destroy();
  });
});

function createFixture() {
  const paragraph = item("paragraph", "rich-text", "Paragraph", "A useful introduction");
  const untitled = item("untitled", "rich-text", "Untitled", null);
  const region = item("region", "region", "Main content", null, [paragraph]);
  const surface = item("surface", "surface", "Overview", null, [region, untitled]);
  const repeatedSurface = item("surface-2", "surface", "Overview 2", null);
  const snapshot = snapshotFromRoots([surface, repeatedSurface]);
  const unsafeDiagnostics = [
    {
      code: "definition-callback-failed" as const,
      ownerId: id("surface"),
      candidateId: null,
      ownerNodeType: "surface",
      candidateNodeType: null,
      privatePayload: "must-not-render",
    },
    {
      code: "invalid-published-candidate" as const,
      ownerId: id("region"),
      candidateId: id("private"),
      ownerNodeType: "region",
      candidateNodeType: "private_answer",
    },
  ];
  const snapshotWithDiagnostics = { ...snapshot, diagnostics: unsafeDiagnostics };
  const controller = new FakeDocumentOwners(snapshotWithDiagnostics);
  const viewport = new DocumentOutlineRowViewport();
  const view = new DocumentTreeViewController({
    tree: controller,
    navigation: controller,
    origin: "document-outline",
    viewport,
  });
  return {
    controller,
    tree: controller,
    navigation: controller,
    snapshot: snapshotWithDiagnostics,
    view,
    props: { tree: controller, navigation: controller, viewController: view, viewport },
  };
}

function createFixtureFromRoots(
  roots: readonly DocumentTreeItem[],
  mode: DocumentTreeSnapshot["mode"] = "page",
) {
  const snapshot = snapshotFromRoots(roots, mode);
  const controller = new FakeDocumentOwners(snapshot);
  const viewport = new DocumentOutlineRowViewport();
  const view = new DocumentTreeViewController({
    tree: controller,
    navigation: controller,
    origin: "document-outline",
    viewport,
  });
  return {
    controller,
    snapshot,
    view,
    props: { tree: controller, navigation: controller, viewController: view, viewport },
  };
}

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function item(
  value: string,
  kind: DocumentTreeItem["kind"],
  label: string,
  summary: string | null,
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label,
    summary,
    presentation: { actionIds: [], disabledReason: null },
    children,
  };
}

function snapshotFromRoots(
  roots: readonly DocumentTreeItem[],
  mode: DocumentTreeSnapshot["mode"] = "page",
): DocumentTreeSnapshot {
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
    mode,
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

function emptySnapshot(): DocumentTreeSnapshot {
  return snapshotFromRoots([]);
}

class FakeDocumentOwners {
  readonly showTargetCalls: Array<{ id: EmbeddedNodeId; options: EditorNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  nextResult: EditorNavigationResult | null = null;
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

  reportComponentSelection(itemId: EmbeddedNodeId): void {
    this.replace(this.#tree, itemId, "component");
  }

  async showTarget(
    itemId: EmbeddedNodeId,
    options: EditorNavigationOptions,
  ): Promise<EditorNavigationResult> {
    this.showTargetCalls.push({ id: itemId, options });
    const result = this.nextResult ?? { kind: "reached" as const, id: itemId };
    if (result.kind === "reached") this.replace(this.#tree, itemId, options.origin);
    return result;
  }

  replace(
    semantics: DocumentTreeSnapshot,
    selectedId: EmbeddedNodeId | null,
    selectionOrigin: EditorSelectionSnapshot["selectionOrigin"],
  ): void {
    this.#tree = semantics;
    this.#selection = { selectedId, selectionOrigin };
    for (const listener of this.#listeners) listener();
  }
}

function createStructurePort() {
  return {
    createCourseSection: vi.fn(() => Result.ok()),
    canMoveSurface: vi.fn(() => false),
    renameCourseSection: vi.fn(() => Result.ok()),
    duplicateCourseSection: vi.fn(() => Result.ok()),
    deleteCourseSection: vi.fn(() => Result.ok()),
    moveSurface: vi.fn(() => Result.ok()),
  } satisfies CourseOutlineStructureAuthoringPort;
}
