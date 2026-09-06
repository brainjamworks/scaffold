import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import { resolveDocumentItemSurfaceId } from "@/document/model/document-tree";
import type { useDocumentTreeSnapshot } from "@/document/authoring/document-tree";
import type { useEditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import type {
  LearnerInteractionWorkspaceController,
  LearnerInteractionWorkspaceSnapshot,
} from "@/editor/learner-interaction/workspace";

export interface SurfaceWorkspacesSnapshot {
  readonly workspace: "timeline" | "interactions";
  readonly surfaceId: EmbeddedNodeId;
  readonly pendingSurfaceChange: PendingSurfaceChange | null;
}

export interface SurfaceWorkspacesControllerDeps {
  readonly interactionController: LearnerInteractionWorkspaceController;
  readonly courseStructure: () => ProjectedSlideshowCourseStructure;
  readonly onSurfaceChanged: (surfaceId: EmbeddedNodeId) => void;
  readonly onClosed: () => void;
}

export type WorkspaceDocumentTreeSnapshot = ReturnType<typeof useDocumentTreeSnapshot>;
export type WorkspaceEditorSelectionSnapshot = ReturnType<typeof useEditorSelectionSnapshot>;

export interface PendingSurfaceChange {
  readonly requestedSurfaceId: EmbeddedNodeId;
}

export const IDLE_LEARNER_INTERACTION_WORKSPACE_SNAPSHOT: LearnerInteractionWorkspaceSnapshot =
  Object.freeze({
    status: "idle",
    draft: null,
    baseline: null,
    pendingContextChange: null,
    saveError: null,
  });

export function resolvePresentationSurfaceId(
  selection: WorkspaceEditorSelectionSnapshot,
  tree: WorkspaceDocumentTreeSnapshot,
  courseStructure: ProjectedSlideshowCourseStructure,
): EmbeddedNodeId | null {
  if (!selection.selectedId) return courseStructure.surfaceIds[0] ?? null;
  return resolveDocumentItemSurfaceId(selection.selectedId, tree, courseStructure);
}

export class SurfaceWorkspacesController {
  readonly #listeners = new Set<() => void>();
  readonly #deps: SurfaceWorkspacesControllerDeps;
  #pendingRequestedWorkspace: SurfaceWorkspacesSnapshot["workspace"] | null = null;
  #snapshot: SurfaceWorkspacesSnapshot;
  #disposed = false;

  constructor(
    deps: SurfaceWorkspacesControllerDeps,
    initialWorkspace: SurfaceWorkspacesSnapshot["workspace"],
    initialSurfaceId: EmbeddedNodeId,
  ) {
    this.#deps = deps;
    this.#snapshot = freezeSnapshot({
      workspace: initialWorkspace,
      surfaceId: initialSurfaceId,
      pendingSurfaceChange: null,
    });
  }

  readonly getSnapshot = (): SurfaceWorkspacesSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  requestWorkspace(next: SurfaceWorkspacesSnapshot["workspace"]): void {
    if (this.#disposed || next === this.#snapshot.workspace) return;
    if (this.#snapshot.pendingSurfaceChange) {
      this.#pendingRequestedWorkspace = next;
      return;
    }
    this.#deps.interactionController.requestContextChange(
      { kind: "workspace", workspace: next },
      () => this.#replaceSnapshot({ workspace: next }),
    );
  }

  requestSurface(surfaceId: EmbeddedNodeId): void {
    if (this.#disposed || surfaceId === this.#snapshot.surfaceId) return;
    const courseStructure = this.#deps.courseStructure();
    if (!courseStructure.surfaceById[surfaceId]) {
      throw new Error(`Surface workspace cannot select missing Surface "${surfaceId}".`);
    }
    if (this.#snapshot.pendingSurfaceChange) return;

    if (!courseStructure.surfaceById[this.#snapshot.surfaceId]) {
      this.#deps.interactionController.replaceArtifact();
      this.#commitSurface(surfaceId);
      return;
    }

    const change = Object.freeze({ requestedSurfaceId: surfaceId });
    this.#replaceSnapshot({ pendingSurfaceChange: change });
    const result = this.#deps.interactionController.requestContextChange(
      { kind: "surface", surfaceId },
      () => {
        if (this.#snapshot.pendingSurfaceChange !== change) return;
        this.#deps.interactionController.replaceArtifact();
        this.#commitSurface(surfaceId);
      },
    );
    if (result === "applied" && this.#snapshot.pendingSurfaceChange === change) {
      throw new Error("Surface workspace context change applied without committing its Surface.");
    }
  }

  resolveContextChange(decision: "save" | "discard" | "cancel"): void {
    if (this.#disposed) return;
    const interactionController = this.#deps.interactionController;
    const pending = interactionController.getSnapshot().pendingContextChange;
    if (decision === "cancel" && pending?.kind === "surface") {
      this.#pendingRequestedWorkspace = null;
      this.#replaceSnapshot({ pendingSurfaceChange: null });
      interactionController.resolveContextChange("cancel");
      return;
    }

    const result = interactionController.resolveContextChange(decision);
    if (result === "save-failed") return;
    if (result === "applied" && this.#snapshot.pendingSurfaceChange === null) {
      const pendingWorkspace = this.#takePendingRequestedWorkspace();
      if (pendingWorkspace) this.requestWorkspace(pendingWorkspace);
    }
  }

  requestClose(): void {
    if (this.#disposed) return;
    this.#deps.interactionController.requestContextChange(
      { kind: "workspace", workspace: "timeline" },
      this.#deps.onClosed,
    );
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pendingRequestedWorkspace = null;
    this.#listeners.clear();
  }

  #commitSurface(surfaceId: EmbeddedNodeId): void {
    if (this.#disposed || surfaceId === this.#snapshot.surfaceId) return;
    this.#replaceSnapshot({ surfaceId, pendingSurfaceChange: null });
    this.#deps.onSurfaceChanged(surfaceId);
    const pendingWorkspace = this.#takePendingRequestedWorkspace();
    if (pendingWorkspace) this.requestWorkspace(pendingWorkspace);
  }

  #takePendingRequestedWorkspace(): SurfaceWorkspacesSnapshot["workspace"] | null {
    const workspace = this.#pendingRequestedWorkspace;
    this.#pendingRequestedWorkspace = null;
    return workspace;
  }

  #replaceSnapshot(patch: Partial<SurfaceWorkspacesSnapshot>): void {
    const next = { ...this.#snapshot, ...patch };
    if (
      next.workspace === this.#snapshot.workspace &&
      next.surfaceId === this.#snapshot.surfaceId &&
      next.pendingSurfaceChange === this.#snapshot.pendingSurfaceChange
    ) {
      return;
    }
    this.#snapshot = freezeSnapshot(next);
    if (!this.#disposed) {
      for (const listener of this.#listeners) listener();
    }
  }
}

function freezeSnapshot(snapshot: SurfaceWorkspacesSnapshot): SurfaceWorkspacesSnapshot {
  return Object.freeze(snapshot);
}
