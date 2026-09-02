import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  LearnerInteractionAuthoringCommandError,
  LearnerInteractionRuleDraft,
} from "../model";

import { LearnerInteractionWorkspaceController } from "./learner-interaction-workspace-controller";

const IDS = Object.freeze({
  rule: EmbeddedDataIdSchema.parse("rule00000001"),
  createdRule: EmbeddedDataIdSchema.parse("rule00000002"),
  surface: EmbeddedNodeIdSchema.parse("surface00001"),
  otherSurface: EmbeddedNodeIdSchema.parse("surface00002"),
});

function draft(ruleId: LearnerInteractionRuleDraft["ruleId"] = IDS.rule): LearnerInteractionRuleDraft {
  return Object.freeze({
    ruleId,
    isEnabled: true,
    when: Object.freeze({ targetId: IDS.surface, type: "activated" }),
    conditions: Object.freeze([]),
    commands: Object.freeze([
      Object.freeze({ kind: "reveal-target" as const, targetId: IDS.surface }),
    ]),
  });
}

describe("LearnerInteractionWorkspaceController", () => {
  it("starts new and existing rules as clean transient drafts", () => {
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.ok(IDS.createdRule),
    });

    controller.startNewRule();
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-clean",
      draft: { ruleId: null, isEnabled: true, when: null, conditions: [], commands: [] },
      baseline: null,
      saveError: null,
    });

    controller.focusRule(draft());
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-clean",
      draft: draft(),
      baseline: draft(),
    });
  });

  it.each([
    { kind: "rule", ruleId: IDS.createdRule } as const,
    { kind: "surface", surfaceId: IDS.otherSurface } as const,
    { kind: "workspace", workspace: "timeline" } as const,
  ])("guards a dirty $kind context request and accepts only one pending request", (request) => {
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.ok(IDS.rule),
    });
    const apply = vi.fn();
    controller.focusRule(draft());
    controller.updateDraft({ ...draft(), isEnabled: false });

    expect(controller.requestContextChange(request, apply)).toBe("decision-required");
    expect(controller.getSnapshot()).toMatchObject({
      status: "decision-required",
      pendingContextChange: request,
    });
    expect(
      controller.requestContextChange(
        { kind: "workspace", workspace: "interactions" },
        vi.fn(),
      ),
    ).toBe("decision-required");
    expect(controller.getSnapshot().pendingContextChange).toEqual(request);
    expect(apply).not.toHaveBeenCalled();
  });

  it("applies clean context changes immediately", () => {
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.ok(IDS.rule),
    });
    const apply = vi.fn();
    controller.focusRule(draft());

    expect(
      controller.requestContextChange(
        { kind: "surface", surfaceId: IDS.otherSurface },
        apply,
      ),
    ).toBe("applied");
    expect(apply).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().status).toBe("focused-clean");
  });

  it("saves before applying a deferred context change and adopts a generated rule ID", () => {
    const saveDraft = vi.fn(() => Result.ok(IDS.createdRule));
    const closePreview = vi.fn();
    const apply = vi.fn();
    const controller = new LearnerInteractionWorkspaceController({ saveDraft, closePreview });
    controller.startNewRule();
    controller.updateDraft(draft(null));
    controller.requestContextChange({ kind: "workspace", workspace: "timeline" }, apply);

    expect(controller.resolveContextChange("save")).toBe("applied");
    expect(saveDraft).toHaveBeenCalledWith(draft(null));
    expect(closePreview).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-clean",
      draft: { ruleId: IDS.createdRule },
      baseline: { ruleId: IDS.createdRule },
      pendingContextChange: null,
      saveError: null,
    });
  });

  it("preserves the dirty draft and typed facts when a deferred Save fails", () => {
    const error: LearnerInteractionAuthoringCommandError = Object.freeze({
      reason: "surface-not-current",
      surfaceId: IDS.surface,
      currentSurfaceIds: Object.freeze([IDS.otherSurface]),
    });
    const apply = vi.fn();
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.err(error),
    });
    controller.focusRule(draft());
    controller.updateDraft({ ...draft(), isEnabled: false });
    controller.requestContextChange({ kind: "surface", surfaceId: IDS.otherSurface }, apply);

    expect(controller.resolveContextChange("save")).toBe("save-failed");
    expect(controller.getSnapshot()).toMatchObject({
      status: "decision-required",
      draft: { isEnabled: false },
      pendingContextChange: { kind: "surface", surfaceId: IDS.otherSurface },
      saveError: error,
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it("discards or cancels a deferred context change explicitly", () => {
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.ok(IDS.rule),
    });
    const discardApply = vi.fn();
    controller.focusRule(draft());
    controller.updateDraft({ ...draft(), isEnabled: false });
    controller.requestContextChange(
      { kind: "rule", ruleId: IDS.createdRule },
      discardApply,
    );

    expect(controller.resolveContextChange("cancel")).toBe("cancelled");
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-dirty",
      draft: { isEnabled: false },
      pendingContextChange: null,
    });
    expect(discardApply).not.toHaveBeenCalled();

    controller.requestContextChange(
      { kind: "rule", ruleId: IDS.createdRule },
      discardApply,
    );
    expect(controller.resolveContextChange("discard")).toBe("applied");
    expect(discardApply).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-clean",
      draft: draft(),
      baseline: draft(),
      pendingContextChange: null,
    });
  });

  it("saves and discards without a pending context request", () => {
    const closePreview = vi.fn();
    const controller = new LearnerInteractionWorkspaceController({
      saveDraft: () => Result.ok(IDS.rule),
      closePreview,
    });
    controller.focusRule(draft());
    controller.updateDraft({ ...draft(), isEnabled: false });

    expect(controller.save()).toBe("saved");
    expect(controller.getSnapshot().status).toBe("focused-clean");
    expect(closePreview).toHaveBeenCalledOnce();
    controller.updateDraft({ ...draft(), isEnabled: true });
    controller.discard();
    expect(controller.getSnapshot()).toMatchObject({
      status: "focused-clean",
      draft: { ...draft(), isEnabled: false },
    });
  });

  it("replacement and disposal discard without prompting and close preview once", () => {
    const closePreview = vi.fn();
    const saveDraft = vi.fn(() => Result.ok(IDS.rule));
    const apply = vi.fn();
    const controller = new LearnerInteractionWorkspaceController({ saveDraft, closePreview });
    controller.focusRule(draft());
    controller.updateDraft({ ...draft(), isEnabled: false });
    controller.requestContextChange({ kind: "surface", surfaceId: IDS.otherSurface }, apply);

    controller.replaceArtifact();
    expect(controller.getSnapshot()).toMatchObject({
      status: "idle",
      draft: null,
      baseline: null,
      pendingContextChange: null,
    });
    expect(saveDraft).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    expect(closePreview).toHaveBeenCalledOnce();

    controller.dispose();
    controller.dispose();
    controller.startNewRule();
    controller.updateDraft(draft(null));
    expect(closePreview).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().status).toBe("idle");
  });
});
