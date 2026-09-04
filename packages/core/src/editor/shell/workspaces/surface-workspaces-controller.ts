import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor } from "@tiptap/core";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import { resolveSemanticTargetSurfaceId } from "@/document/model/semantic-document";
import type {
  getSemanticDocumentControllerForEditor,
  SemanticNavigationResult,
  useSemanticDocumentControllerSnapshot,
} from "@/document/authoring/semantic-document";
import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type {
  LearnerInteractionWorkspaceController,
  LearnerInteractionWorkspaceSnapshot,
} from "@/editor/learner-interaction/workspace";
import type { LearnerInteractionPreviewController } from "@/editor/learner-interaction/preview";
import type { PresentationPreviewController } from "@/editor/presentation/preview";

import type { SurfaceWorkspaceRequest } from "./surface-workspace-request";

export interface SurfaceWorkspacesSnapshot {
  readonly workspace: "timeline" | "interactions";
  readonly interactionSurfaceId: EmbeddedNodeId;
  readonly pendingSurfaceChange: PendingInteractionSurfaceChange | null;
}

export interface SurfaceWorkspacesControllerDeps {
  readonly editor: TiptapEditor;
  readonly semanticController: WorkspaceSemanticController;
  readonly interactionController: LearnerInteractionWorkspaceController;
  readonly presentationPreviewController: PresentationPreviewController;
  readonly learnerInteractionPreviewController: LearnerInteractionPreviewController;
  readonly courseStructure: () => ProjectedSlideshowCourseStructure;
  readonly requestedSurfaceId: () => EmbeddedNodeId;
  readonly semanticSnapshot: () => WorkspaceSemanticSnapshot;
  readonly onClosed: () => void;
}

export type WorkspaceSemanticController = ReturnType<typeof getSemanticDocumentControllerForEditor>;
export type WorkspaceSemanticSnapshot = SemanticDocumentControllerSnapshot;

export interface PendingInteractionSurfaceChange {
  phase: "decision" | "applying";
  readonly requestedSurfaceId: EmbeddedNodeId;
  readonly requestedTargetId: EmbeddedNodeId;
}

export const IDLE_LEARNER_INTERACTION_WORKSPACE_SNAPSHOT: LearnerInteractionWorkspaceSnapshot =
  Object.freeze({
    status: "idle",
    draft: null,
    baseline: null,
    pendingContextChange: null,
    saveError: null,
  });

async function restoreInteractionSurface(
  semanticController: WorkspaceSemanticController,
  courseStructure: ProjectedSlideshowCourseStructure,
  surfaceId: EmbeddedNodeId,
): Promise<boolean> {
  return selectInteractionSurfaceTarget(semanticController, courseStructure, surfaceId, surfaceId);
}

async function applyInteractionSurfaceChange(
  semanticController: WorkspaceSemanticController,
  interactionController: LearnerInteractionWorkspaceController,
  interactionSurfaceIdRef: { current: EmbeddedNodeId },
  pendingSurfaceChangeRef: { current: PendingInteractionSurfaceChange | null },
  change: PendingInteractionSurfaceChange,
  courseStructure: ProjectedSlideshowCourseStructure,
  refreshInteractionSurface: (update: (revision: number) => number) => void,
): Promise<void> {
  if (pendingSurfaceChangeRef.current !== change) return;
  change.phase = "applying";
  const reached = await selectInteractionSurfaceTarget(
    semanticController,
    courseStructure,
    change.requestedTargetId,
    change.requestedSurfaceId,
  );
  if (pendingSurfaceChangeRef.current !== change) return;
  pendingSurfaceChangeRef.current = null;
  if (reached) {
    interactionSurfaceIdRef.current = change.requestedSurfaceId;
    refreshInteractionSurface((revision) => revision + 1);
    interactionController.replaceArtifact();
    return;
  }
  const currentSurfaceId = resolvePresentationSurfaceId(
    semanticController.getSnapshot(),
    courseStructure,
  );
  if (!currentSurfaceId) {
    throw new Error("Slideshow authoring lost its current semantic Surface.");
  }
  interactionSurfaceIdRef.current = currentSurfaceId;
  refreshInteractionSurface((revision) => revision + 1);
  interactionController.replaceArtifact();
}

async function cancelInteractionSurfaceChange(
  semanticController: WorkspaceSemanticController,
  interactionController: LearnerInteractionWorkspaceController,
  interactionSurfaceIdRef: { current: EmbeddedNodeId },
  pendingSurfaceChangeRef: { current: PendingInteractionSurfaceChange | null },
  courseStructure: ProjectedSlideshowCourseStructure,
): Promise<void> {
  const outgoingSurfaceId = interactionSurfaceIdRef.current;
  if (!(await restoreInteractionSurface(semanticController, courseStructure, outgoingSurfaceId))) {
    return;
  }
  pendingSurfaceChangeRef.current = null;
  interactionController.resolveContextChange("cancel");
}

async function selectInteractionSurfaceTarget(
  semanticController: WorkspaceSemanticController,
  courseStructure: ProjectedSlideshowCourseStructure,
  targetId: EmbeddedNodeId,
  surfaceId: EmbeddedNodeId,
): Promise<boolean> {
  const before = semanticController.getSnapshot();
  if (
    before.selectedId === targetId &&
    resolvePresentationSurfaceId(before, courseStructure) === surfaceId
  ) {
    return true;
  }
  const result = await semanticController.select(targetId, {
    origin: "presentation-timeline",
    focusEditor: false,
  });
  return navigationReachedSurface(result, surfaceId, semanticController, courseStructure);
}

function navigationReachedSurface(
  result: SemanticNavigationResult,
  surfaceId: EmbeddedNodeId,
  semanticController: WorkspaceSemanticController,
  courseStructure: ProjectedSlideshowCourseStructure,
): boolean {
  switch (result.kind) {
    case "reached":
    case "reached-owner":
      return (
        resolvePresentationSurfaceId(semanticController.getSnapshot(), courseStructure) ===
        surfaceId
      );
    case "missing":
    case "interrupted":
      return false;
  }
}

export function resolvePresentationSurfaceId(
  snapshot: ReturnType<typeof useSemanticDocumentControllerSnapshot>,
  courseStructure: ProjectedSlideshowCourseStructure,
): EmbeddedNodeId | null {
  if (!snapshot.selectedId) return courseStructure.surfaceIds[0] ?? null;
  return resolveSemanticTargetSurfaceId(snapshot.selectedId, snapshot.semantics, courseStructure);
}

export class SurfaceWorkspacesController {
  readonly #listeners = new Set<() => void>();
  readonly #deps: SurfaceWorkspacesControllerDeps;
  readonly #surfaceIdRef: { current: EmbeddedNodeId };
  readonly #pendingChangeRef: { current: PendingInteractionSurfaceChange | null };
  #workspace: SurfaceWorkspacesSnapshot["workspace"];
  #appliedRequestNonce: number | null = null;
  #snapshot: SurfaceWorkspacesSnapshot;
  #disposed = false;

  constructor(
    deps: SurfaceWorkspacesControllerDeps,
    initialWorkspace: SurfaceWorkspacesSnapshot["workspace"],
    initialSurfaceId: EmbeddedNodeId,
  ) {
    this.#deps = deps;
    this.#surfaceIdRef = { current: initialSurfaceId };
    this.#pendingChangeRef = { current: null };
    this.#workspace = initialWorkspace;
    this.#snapshot = Object.freeze({
      workspace: initialWorkspace,
      interactionSurfaceId: initialSurfaceId,
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
    if (this.#disposed || next === this.#workspace) return;
    this.#deps.interactionController.requestContextChange(
      { kind: "workspace", workspace: next },
      () => {
        if (
          next !== "interactions" &&
          this.#deps.learnerInteractionPreviewController.getSnapshot().status !== "idle"
        ) {
          this.#deps.learnerInteractionPreviewController.close();
        }
        this.#workspace = next;
        if (next === "interactions") {
          this.#surfaceIdRef.current = this.#deps.requestedSurfaceId();
        }
        this.#update();
      },
    );
  }

  applyRequest(request: SurfaceWorkspaceRequest): void {
    if (this.#disposed || this.#appliedRequestNonce === request.nonce) return;
    this.#appliedRequestNonce = request.nonce;
    const courseStructure = this.#deps.courseStructure();
    if (
      request.surfaceId !== this.#deps.requestedSurfaceId() &&
      courseStructure.surfaceById[request.surfaceId]
    ) {
      void restoreInteractionSurface(
        this.#deps.semanticController,
        courseStructure,
        request.surfaceId,
      );
    }
    this.requestWorkspace(request.workspace);
  }

  syncRequestedSurface(): void {
    if (this.#disposed) return;
    const { interactionController, semanticController } = this.#deps;
    const courseStructure = this.#deps.courseStructure();
    const requestedSurfaceId = this.#deps.requestedSurfaceId();
    const semanticSnapshot = this.#deps.semanticSnapshot();
    if (this.#workspace !== "interactions" || requestedSurfaceId === this.#surfaceIdRef.current) {
      return;
    }
    const outgoingSurfaceId = this.#surfaceIdRef.current;
    if (!semanticSnapshot.semantics.itemById.has(outgoingSurfaceId)) {
      this.#pendingChangeRef.current = null;
      this.#surfaceIdRef.current = requestedSurfaceId;
      interactionController.replaceArtifact();
      this.#update();
      return;
    }
    const pending = this.#pendingChangeRef.current;
    if (pending) {
      if (pending.phase === "decision") {
        void restoreInteractionSurface(semanticController, courseStructure, outgoingSurfaceId);
      }
      return;
    }
    const requestedTargetId = semanticSnapshot.selectedId ?? requestedSurfaceId;
    const change: PendingInteractionSurfaceChange = {
      phase: "decision",
      requestedSurfaceId,
      requestedTargetId,
    };
    this.#pendingChangeRef.current = change;
    const result = interactionController.requestContextChange(
      { kind: "surface", surfaceId: requestedSurfaceId },
      () => {
        void applyInteractionSurfaceChange(
          semanticController,
          interactionController,
          this.#surfaceIdRef,
          this.#pendingChangeRef,
          change,
          courseStructure,
          () => this.#update(),
        );
      },
    );
    if (result === "decision-required") {
      void restoreInteractionSurface(semanticController, courseStructure, outgoingSurfaceId);
      this.#update();
    }
  }

  resolveContextChange(decision: "save" | "discard" | "cancel"): void {
    if (this.#disposed) return;
    const interactionController = this.#deps.interactionController;
    const pending = interactionController.getSnapshot().pendingContextChange;
    if (decision !== "cancel" || pending?.kind !== "surface") {
      interactionController.resolveContextChange(decision);
      return;
    }
    void cancelInteractionSurfaceChange(
      this.#deps.semanticController,
      interactionController,
      this.#surfaceIdRef,
      this.#pendingChangeRef,
      this.#deps.courseStructure(),
    );
  }

  requestClose(): void {
    if (this.#disposed) return;
    const {
      interactionController,
      learnerInteractionPreviewController,
      presentationPreviewController,
    } = this.#deps;
    const finish = () => {
      if (presentationPreviewController.getSnapshot().status !== "idle") {
        presentationPreviewController.close();
      }
      if (learnerInteractionPreviewController.getSnapshot().status !== "idle") {
        learnerInteractionPreviewController.close();
      }
      this.#deps.onClosed();
    };
    interactionController.requestContextChange({ kind: "workspace", workspace: "timeline" }, finish);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
  }

  #update(): void {
    this.#snapshot = Object.freeze({
      workspace: this.#workspace,
      interactionSurfaceId: this.#surfaceIdRef.current,
      pendingSurfaceChange: this.#pendingChangeRef.current,
    });
    if (!this.#disposed) {
      for (const listener of this.#listeners) listener();
    }
  }
}
