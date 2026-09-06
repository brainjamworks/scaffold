import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ProjectedSlideshowCourseStructure } from "@/document/model/course-structure";
import type { LearnerInteractionWorkspaceController } from "@/editor/learner-interaction/workspace";

import {
  SurfaceWorkspacesController,
  type SurfaceWorkspacesSnapshot,
} from "./surface-workspaces-controller";

const FIRST = EmbeddedNodeIdSchema.parse("workspace001");
const SECOND = EmbeddedNodeIdSchema.parse("workspace002");

type GuardRequest =
  | { readonly kind: "workspace"; readonly workspace: "timeline" | "interactions" }
  | { readonly kind: "surface"; readonly surfaceId: unknown };

class FakeInteractionController {
  dirty = false;
  failSave = false;
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

  resolveContextChange(
    decision: "save" | "discard" | "cancel",
  ): "applied" | "cancelled" | "save-failed" | "no-decision" {
    this.resolved.push(decision);
    if (!this.#pending) return "no-decision";
    if (decision === "cancel") {
      this.#pendingApply = null;
      this.#pending = null;
      return "cancelled";
    }
    if (decision === "save" && this.failSave) return "save-failed";
    this.dirty = false;
    const apply = this.#pendingApply;
    this.#pendingApply = null;
    this.#pending = null;
    apply?.();
    return "applied";
  }

  replaceArtifact(): void {
    this.replaced += 1;
    this.dirty = false;
    this.#pendingApply = null;
    this.#pending = null;
  }

  getSnapshot(): { readonly pendingContextChange: GuardRequest | null } {
    return { pendingContextChange: this.#pending };
  }
}

function stubStructure(...ids: (typeof FIRST)[]): ProjectedSlideshowCourseStructure {
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
  const interaction = new FakeInteractionController();
  if (options?.dirty) interaction.dirty = true;
  const onSurfaceChanged = vi.fn();
  const onClosed = vi.fn();
  let structure = stubStructure(FIRST, SECOND);
  const controller = new SurfaceWorkspacesController(
    {
      interactionController: interaction as unknown as LearnerInteractionWorkspaceController,
      courseStructure: () => structure,
      onSurfaceChanged,
      onClosed,
    },
    options?.workspace ?? "timeline",
    FIRST,
  );
  return {
    controller,
    interaction,
    onSurfaceChanged,
    onClosed,
    setStructure: (next: ProjectedSlideshowCourseStructure) => {
      structure = next;
    },
  };
}

describe("SurfaceWorkspacesController", () => {
  it("commits a requested tab only after its pending Surface change is accepted", () => {
    const { controller, interaction, onSurfaceChanged } = setup({ dirty: true });

    controller.requestSurface(SECOND);
    controller.requestWorkspace("interactions");

    expect(controller.getSnapshot()).toMatchObject({
      workspace: "timeline",
      surfaceId: FIRST,
      pendingSurfaceChange: { requestedSurfaceId: SECOND },
    });
    expect(interaction.requested).toEqual([{ kind: "surface", surfaceId: SECOND }]);
    expect(onSurfaceChanged).not.toHaveBeenCalled();

    controller.resolveContextChange("discard");

    expect(controller.getSnapshot()).toMatchObject({
      workspace: "interactions",
      surfaceId: SECOND,
      pendingSurfaceChange: null,
    });
    expect(interaction.requested).toEqual([
      { kind: "surface", surfaceId: SECOND },
      { kind: "workspace", workspace: "interactions" },
    ]);
    expect(onSurfaceChanged).toHaveBeenCalledOnce();
  });

  it("makes same-surface selection a referentially stable no-op", () => {
    const { controller, interaction, onSurfaceChanged } = setup();
    const before = controller.getSnapshot();

    controller.requestSurface(FIRST);

    expect(controller.getSnapshot()).toBe(before);
    expect(interaction.requested).toEqual([]);
    expect(onSurfaceChanged).not.toHaveBeenCalled();
  });

  it("keeps the source surface and draft when a guarded change is cancelled", () => {
    const { controller, interaction, onSurfaceChanged } = setup({ dirty: true });

    controller.requestSurface(SECOND);
    expect(controller.getSnapshot().pendingSurfaceChange).toEqual({
      requestedSurfaceId: SECOND,
    });

    controller.resolveContextChange("cancel");

    expect(controller.getSnapshot()).toMatchObject({
      surfaceId: FIRST,
      pendingSurfaceChange: null,
    });
    expect(interaction.dirty).toBe(true);
    expect(onSurfaceChanged).not.toHaveBeenCalled();
  });

  it.each(["discard", "save"] as const)(
    "commits a guarded surface change once after accepted %s",
    (decision) => {
      const { controller, interaction, onSurfaceChanged } = setup({ dirty: true });
      controller.requestSurface(SECOND);

      controller.resolveContextChange(decision);

      expect(controller.getSnapshot()).toMatchObject({
        surfaceId: SECOND,
        pendingSurfaceChange: null,
      });
      expect(interaction.replaced).toBe(1);
      expect(onSurfaceChanged).toHaveBeenCalledTimes(1);
      expect(onSurfaceChanged).toHaveBeenCalledWith(SECOND);
    },
  );

  it("retains the source surface and pending decision after Save fails", () => {
    const { controller, interaction, onSurfaceChanged } = setup({ dirty: true });
    interaction.failSave = true;
    controller.requestSurface(SECOND);

    controller.resolveContextChange("save");

    expect(controller.getSnapshot()).toMatchObject({
      surfaceId: FIRST,
      pendingSurfaceChange: { requestedSurfaceId: SECOND },
    });
    expect(interaction.dirty).toBe(true);
    expect(onSurfaceChanged).not.toHaveBeenCalled();
  });

  it("invalidates a surface-bound draft when its entire source Surface was removed", () => {
    const { controller, interaction, onSurfaceChanged, setStructure } = setup({ dirty: true });
    setStructure(stubStructure(SECOND));

    controller.requestSurface(SECOND);

    expect(controller.getSnapshot().surfaceId).toBe(SECOND);
    expect(interaction.replaced).toBe(1);
    expect(interaction.requested).toEqual([]);
    expect(onSurfaceChanged).toHaveBeenCalledTimes(1);
  });

  it("guards tab switches and explicit close without changing surface ownership", () => {
    const { controller, onClosed } = setup({ dirty: true });

    controller.requestWorkspace("interactions");
    controller.resolveContextChange("cancel");
    expect(controller.getSnapshot().workspace).toBe("timeline");

    controller.requestWorkspace("interactions");
    controller.resolveContextChange("discard");
    expect(controller.getSnapshot().workspace).toBe("interactions");
    expect(controller.getSnapshot().surfaceId).toBe(FIRST);

    controller.requestClose();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
