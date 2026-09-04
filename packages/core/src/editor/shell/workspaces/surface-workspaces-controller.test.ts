import type { Editor as TiptapEditor } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { LearnerInteractionPreviewController } from "@/editor/learner-interaction/preview";
import type { LearnerInteractionWorkspaceController } from "@/editor/learner-interaction/workspace";
import type { PresentationPreviewController } from "@/editor/presentation/preview";

import {
  resolvePresentationSurfaceId,
  SurfaceWorkspacesController,
  type SurfaceWorkspacesSnapshot,
  type WorkspaceSemanticController,
} from "./surface-workspaces-controller";
import { FakeWorkspaceSemanticController } from "./testing/fake-workspace-semantic-controller";

const FIRST = EmbeddedNodeIdSchema.parse("workspace001");
const SECOND = EmbeddedNodeIdSchema.parse("workspace002");

type GuardRequest =
  | { readonly kind: "workspace"; readonly workspace: "timeline" | "interactions" }
  | { readonly kind: "surface"; readonly surfaceId: unknown };

class FakeInteractionController {
  dirty = false;
  readonly requested: GuardRequest[] = [];
  readonly resolved: Array<"save" | "discard" | "cancel"> = [];
  replaced = 0;
  #pendingApply: (() => void) | null = null;
  #pending: GuardRequest | null = null;

  requestContextChange(request: GuardRequest, apply: () => void): "applied" | "decision-required" {
    this.requested.push(request);
    if (!this.dirty) {
      apply();
      return "applied";
    }
    this.#pendingApply = apply;
    this.#pending = request;
    return "decision-required";
  }

  resolveContextChange(decision: "save" | "discard" | "cancel"): void {
    this.resolved.push(decision);
    if (decision === "cancel") {
      this.#pendingApply = null;
      this.#pending = null;
      return;
    }
    const apply = this.#pendingApply;
    this.#pendingApply = null;
    this.#pending = null;
    apply?.();
  }

  replaceArtifact(): void {
    this.replaced += 1;
    this.#pendingApply = null;
    this.#pending = null;
  }

  getSnapshot(): { readonly pendingContextChange: GuardRequest | null } {
    return { pendingContextChange: this.#pending };
  }
}

function stubPreview(order: string[], label: string) {
  let status: "idle" | "active" = "idle";
  const close = vi.fn(() => {
    order.push(label);
  });
  const controller = {
    getSnapshot: () => ({ status }),
    close,
    subscribe: () => () => undefined,
  };
  return {
    controller,
    close,
    setStatus: (next: "idle" | "active") => {
      status = next;
    },
  };
}

function stubStructure(...ids: typeof FIRST[]): ProjectedSlideshowCourseStructure {
  return {
    kind: "slideshow",
    surfaceIds: ids,
    surfaceById: Object.fromEntries(ids.map((id) => [id, { id }])),
    courseSectionById: {},
  } as unknown as ProjectedSlideshowCourseStructure;
}

function setup(options?: {
  readonly workspace?: SurfaceWorkspacesSnapshot["workspace"];
  readonly dirty?: boolean;
}) {
  const semantic = new FakeWorkspaceSemanticController([FIRST, SECOND]);
  const interaction = new FakeInteractionController();
  if (options?.dirty) interaction.dirty = true;
  const order: string[] = [];
  const presentation = stubPreview(order, "presentation");
  const learnerPreview = stubPreview(order, "learner");
  const onClosed = vi.fn(() => {
    order.push("closed");
  });
  let structure = stubStructure(FIRST, SECOND);
  const controller = new SurfaceWorkspacesController(
    {
      editor: {} as TiptapEditor,
      semanticController: semantic as unknown as WorkspaceSemanticController,
      interactionController: interaction as unknown as LearnerInteractionWorkspaceController,
      presentationPreviewController:
        presentation.controller as unknown as PresentationPreviewController,
      learnerInteractionPreviewController:
        learnerPreview.controller as unknown as LearnerInteractionPreviewController,
      courseStructure: () => structure,
      requestedSurfaceId: () => resolvePresentationSurfaceId(semantic.getSnapshot(), structure),
      semanticSnapshot: () => semantic.getSnapshot(),
      onClosed,
    },
    options?.workspace ?? "timeline",
    FIRST,
  );
  return {
    controller,
    semantic,
    interaction,
    presentation,
    learnerPreview,
    onClosed,
    order,
    setStructure: (next: ProjectedSlideshowCourseStructure) => {
      structure = next;
    },
  };
}

describe("SurfaceWorkspacesController", () => {
  it("opens the requested tab on applyRequest and ignores a repeated nonce", () => {
    const { controller } = setup();

    controller.applyRequest({ workspace: "interactions", surfaceId: FIRST, nonce: 1 });

    expect(controller.getSnapshot().workspace).toBe("interactions");
    expect(controller.getSnapshot().interactionSurfaceId).toBe(FIRST);

    controller.applyRequest({ workspace: "timeline", surfaceId: FIRST, nonce: 1 });

    expect(controller.getSnapshot().workspace).toBe("interactions");
  });

  it("re-targets on a new nonce and restores the requested surface when it differs", async () => {
    const { controller, semantic } = setup({ workspace: "interactions" });

    controller.applyRequest({ workspace: "timeline", surfaceId: SECOND, nonce: 7 });

    await vi.waitFor(() => expect(semantic.selectCalls).toContain(SECOND));
    expect(controller.getSnapshot().workspace).toBe("timeline");
  });

  it("defers a workspace switch behind a dirty draft until cancel, discard or save", () => {
    const { controller } = setup({ dirty: true });

    controller.requestWorkspace("interactions");

    expect(controller.getSnapshot().workspace).toBe("timeline");

    controller.resolveContextChange("cancel");

    expect(controller.getSnapshot().workspace).toBe("timeline");

    controller.requestWorkspace("interactions");
    controller.resolveContextChange("discard");

    expect(controller.getSnapshot().workspace).toBe("interactions");
  });

  it("applies a deferred switch on save", () => {
    const { controller } = setup({ dirty: true });

    controller.requestWorkspace("interactions");
    controller.resolveContextChange("save");

    expect(controller.getSnapshot().workspace).toBe("interactions");
  });

  it("restores the outgoing surface when a dirty surface change is cancelled", async () => {
    const { controller, semantic } = setup({ workspace: "interactions", dirty: true });

    semantic.publish(SECOND);
    controller.syncRequestedSurface();

    expect(controller.getSnapshot().workspace).toBe("interactions");

    controller.resolveContextChange("cancel");

    await vi.waitFor(() => expect(semantic.selectCalls).toContain(FIRST));
    expect(controller.getSnapshot().workspace).toBe("interactions");
  });

  it("closes both previews before reporting closed when clean", () => {
    const { controller, presentation, learnerPreview, onClosed, order } = setup();
    presentation.setStatus("active");
    learnerPreview.setStatus("active");

    controller.requestClose();

    expect(order).toEqual(["presentation", "learner", "closed"]);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("guards requestClose behind a dirty draft", () => {
    const { controller, onClosed, order } = setup({ dirty: true });

    controller.requestClose();

    expect(onClosed).not.toHaveBeenCalled();
    expect(order).toEqual([]);

    controller.resolveContextChange("discard");

    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("keeps a frozen, referentially stable snapshot until state changes", () => {
    const { controller } = setup();

    const before = controller.getSnapshot();
    controller.applyRequest({ workspace: "timeline", surfaceId: FIRST, nonce: 99 });

    expect(controller.getSnapshot()).toBe(before);

    controller.applyRequest({ workspace: "interactions", surfaceId: FIRST, nonce: 100 });

    expect(controller.getSnapshot()).not.toBe(before);
    expect(Object.isFrozen(controller.getSnapshot())).toBe(true);
  });
});
