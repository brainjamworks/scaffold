import { Result } from "better-result";

import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorNavigationResult } from "@/document/authoring/editor-navigation";
import type {
  DocumentTreeItem,
  DocumentItemLocation,
  DocumentTreeSnapshot,
} from "@/document/model/document-tree";

export function createFakeWorkspaceDocumentOwners(
  surfaceIds: readonly EmbeddedNodeId[],
  options: {
    readonly courseSectionId?: EmbeddedNodeId;
    readonly selectedId?: EmbeddedNodeId | null;
  } = {},
) {
  const tree = createTree(surfaceIds, options.courseSectionId);
  const selectedId =
    options.selectedId === undefined ? (surfaceIds[0] ?? null) : options.selectedId;
  return {
    documentTree: new FakeWorkspaceDocumentTree(tree),
    editorNavigation: new FakeWorkspaceEditorNavigation(selectedId),
  };
}

export class FakeWorkspaceDocumentTree {
  readonly #listeners = new Set<() => void>();

  constructor(readonly snapshot: DocumentTreeSnapshot) {}

  readonly getSnapshot = () => this.snapshot;
  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  readonly getControlCapabilities = () => ({
    resolve: (targetId: EmbeddedNodeId) =>
      Result.ok({
        ownerId: targetId,
        targetId,
        capabilities: {
          events: [{ type: "activated", label: "Activated" }],
          commands: [{ type: "activate", label: "Activate" }],
        },
      }),
  });
}

export class FakeWorkspaceEditorNavigation {
  readonly showTargetCalls: EmbeddedNodeId[] = [];
  readonly #selectionResults: Array<EditorNavigationResult | Promise<EditorNavigationResult>> = [];
  readonly #listeners = new Set<() => void>();
  #selectedId: EmbeddedNodeId | null;
  #selectionOrigin: "editor" | "component" | "presentation-timeline" | null;
  #snapshot: {
    readonly selectedId: EmbeddedNodeId | null;
    readonly selectionOrigin: "editor" | "component" | "presentation-timeline" | null;
  };

  constructor(selectedId: EmbeddedNodeId | null) {
    this.#selectedId = selectedId;
    this.#selectionOrigin = selectedId ? "editor" : null;
    this.#snapshot = Object.freeze({
      selectedId: this.#selectedId,
      selectionOrigin: this.#selectionOrigin,
    });
  }

  readonly getSelectionSnapshot = () => this.#snapshot;
  readonly subscribeSelection = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  readonly showTarget = async (id: EmbeddedNodeId): Promise<EditorNavigationResult> => {
    this.showTargetCalls.push(id);
    const result = await (this.#selectionResults.shift() ?? ({ kind: "reached", id } as const));
    if (result.kind === "reached") this.publish(result.id, "presentation-timeline");
    if (result.kind === "reached-owner") this.publish(result.ownerId, "presentation-timeline");
    return result;
  };

  queueSelectionResult(result: EditorNavigationResult | Promise<EditorNavigationResult>) {
    this.#selectionResults.push(result);
  }

  publish(
    id: EmbeddedNodeId,
    selectionOrigin: "component" | "presentation-timeline" = "component",
  ) {
    this.#selectedId = id;
    this.#selectionOrigin = selectionOrigin;
    this.#snapshot = Object.freeze({ selectedId: id, selectionOrigin });
    for (const listener of this.#listeners) listener();
  }
}

function createTree(
  surfaceIds: readonly EmbeddedNodeId[],
  courseSectionId?: EmbeddedNodeId,
): DocumentTreeSnapshot {
  const items: DocumentTreeItem[] = surfaceIds.map((id, index) => ({
    id,
    kind: "surface" as const,
    nodeType: "surface",
    definitionId: index === 0 ? "slide-content" : "slide-cover",
    label: `Slide ${index + 1}`,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    presentationContainer: null,
    children: [],
  }));
  const courseSection: DocumentTreeItem | null = courseSectionId
    ? {
        id: courseSectionId,
        kind: "course-section" as const,
        nodeType: "courseSection",
        definitionId: null,
        label: "Section 1",
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
        presentationContainer: null,
        children: items,
      }
    : null;
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>(items.map((item) => [item.id, item]));
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>(
    items.map((item) => [item.id, courseSection?.id ?? null]),
  );
  const locationById = new Map<EmbeddedNodeId, DocumentItemLocation>(
    items.map((item, index) => [
      item.id,
      {
        id: item.id,
        nodeType: "surface",
        from: index + 2,
        to: index + 3,
        selectionTarget: { kind: "node" as const, pos: index + 2 },
        surfaceId: item.id,
        authoringAnchorId: item.id,
        activationPath: [],
      },
    ]),
  );
  if (courseSection) {
    itemById.set(courseSection.id, courseSection);
    parentById.set(courseSection.id, null);
    locationById.set(courseSection.id, {
      id: courseSection.id,
      nodeType: "courseSection",
      from: 1,
      to: 2,
      selectionTarget: { kind: "node", pos: 1 },
      surfaceId: null,
      authoringAnchorId: null,
      activationPath: [],
    });
  }
  return Object.freeze({
    revision: 0,
    mode: "slideshow" as const,
    roots: courseSection ? [courseSection] : items,
    itemById,
    parentById,
    locationById,
    diagnostics: [],
  });
}
