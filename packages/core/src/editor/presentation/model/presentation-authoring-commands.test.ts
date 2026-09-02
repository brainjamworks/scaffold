// @vitest-environment jsdom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
  type TimelineAnimateActionV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import {
  createPresentationAction,
  createPresentationActions,
  removePresentationAction,
  reorderPresentationAction,
  setPresentationActionEnabled,
  setPresentationSurfaceDuration,
  setPresentationSurfaceNarration,
  setPresentationSurfaceTransition,
  updatePresentationAction,
} from "./presentation-authoring-commands";

const IDS = Object.freeze({
  section: EmbeddedNodeIdSchema.parse("section00001"),
  firstSurface: EmbeddedNodeIdSchema.parse("surface00001"),
  secondSurface: EmbeddedNodeIdSchema.parse("surface00002"),
  firstRegion: EmbeddedNodeIdSchema.parse("region000001"),
  firstParagraph: EmbeddedNodeIdSchema.parse("paragraph001"),
  secondParagraph: EmbeddedNodeIdSchema.parse("paragraph002"),
  missingSurface: EmbeddedNodeIdSchema.parse("surface99999"),
  missingTarget: EmbeddedNodeIdSchema.parse("target999999"),
  missingAction: EmbeddedDataIdSchema.parse("action999999"),
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("presentation authoring commands", () => {
  it("creates Presentation lazily and sets one Surface duration in one transaction", () => {
    const editor = createEditor();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    expect(readPresentation(editor)).toBeNull();

    const result = setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });

    expect(result.isOk()).toBe(true);
    expect(changedTransactions).toBe(1);
    expect(readPresentation(editor)).toEqual({
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: [
        { surfaceId: IDS.firstSurface, durationMs: 5_000, actions: [] },
        { surfaceId: IDS.secondSurface, durationMs: 0, actions: [] },
      ],
    });

    expect(editor.commands.undo()).toBe(true);
    expect(readPresentation(editor)).toBeNull();
  });

  it("creates flat actions with generated IDs and stable equal-time ordering", () => {
    const editor = createEditor();
    expect(
      setPresentationSurfaceDuration({
        editor,
        surfaceId: IDS.firstSurface,
        durationMs: 5_000,
      }).isOk(),
    ).toBe(true);
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const later = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 1_000),
    });
    const earlier = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.secondParagraph, 500),
    });
    const tied = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: { kind: "manual-wait", isEnabled: true, atMs: 1_000 },
    });

    expect(later.isOk() && earlier.isOk() && tied.isOk()).toBe(true);
    if (later.isErr() || earlier.isErr() || tied.isErr()) return;
    expect(changedTransactions).toBe(3);
    expect(actions(editor).map(({ id }) => id)).toEqual([earlier.value, later.value, tied.value]);
    expect(new Set(actions(editor).map(({ id }) => id)).size).toBe(3);
    expect(actions(editor).every(({ id }) => /^[0-9A-Z_a-z-]{12}$/.test(id))).toBe(true);
  });

  it("reorders equal-time actions by source order without changing identity or timing", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const first = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 1_000),
    });
    const second = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: { kind: "manual-wait", isEnabled: true, atMs: 1_000 },
    });
    if (first.isErr() || second.isErr()) throw new Error("Expected equal-time actions.");
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const result = reorderPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      actionId: second.value,
      direction: "earlier",
    });

    expect(result.isOk()).toBe(true);
    expect(changedTransactions).toBe(1);
    expect(actions(editor).map(({ id }) => id)).toEqual([second.value, first.value]);
    expect(actions(editor).map(({ atMs }) => atMs)).toEqual([1_000, 1_000]);

    expect(
      reorderPresentationAction({
        editor,
        surfaceId: IDS.firstSurface,
        actionId: second.value,
        direction: "later",
      }).isOk(),
    ).toBe(true);
    expect(changedTransactions).toBe(2);
    expect(actions(editor).map(({ id }) => id)).toEqual([first.value, second.value]);
  });

  it("returns source facts when an action has no equal-time reorder neighbour", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const created = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 1_000),
    });
    if (created.isErr()) throw new Error("Expected action creation.");
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const result = reorderPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      actionId: created.value,
      direction: "earlier",
    });

    expect(result.isErr() && result.error).toEqual({
      reason: "action-reorder-boundary",
      surfaceId: IDS.firstSurface,
      actionId: created.value,
      atMs: 1_000,
      direction: "earlier",
    });
    expect(changedTransactions).toBe(0);
  });

  it("creates adjacent Replace actions in one transaction without a Replace kind", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const result = createPresentationActions({
      editor,
      surfaceId: IDS.firstSurface,
      actions: [
        timedVisibility("hide", IDS.firstParagraph, 1_000, 500),
        timedVisibility("reveal", IDS.secondParagraph, 1_500, 500),
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(changedTransactions).toBe(1);
    expect(actions(editor)).toMatchObject([
      { kind: "animate", targetId: IDS.firstParagraph, atMs: 1_000, visual: { kind: "hide" } },
      {
        kind: "animate",
        targetId: IDS.secondParagraph,
        atMs: 1_500,
        visual: { kind: "reveal" },
      },
    ]);
    expect(actions(editor).some((action) => action.kind === ("replace" as never))).toBe(false);
  });

  it("checks every action in an atomic creation before writing", () => {
    const editor = createEditor();
    const missingTarget = EmbeddedNodeIdSchema.parse("missing00001");
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const result = createPresentationActions({
      editor,
      surfaceId: IDS.firstSurface,
      actions: [
        { ...instantReveal(IDS.firstParagraph, 500), isEnabled: false },
        { ...instantReveal(missingTarget, 1_000), isEnabled: false },
      ],
    });

    expect(result).toMatchObject({
      error: { reason: "target-not-current", targetId: missingTarget },
    });
    expect(changedTransactions).toBe(0);
    expect(actions(editor)).toEqual([]);
  });

  it("updates, enables, and removes an action without changing its identity", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const created = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 1_000),
    });
    if (created.isErr()) throw new Error("Expected action creation to succeed.");

    expect(
      updatePresentationAction({
        editor,
        surfaceId: IDS.firstSurface,
        actionId: created.value,
        action: { ...instantReveal(IDS.firstParagraph, 750), isEnabled: false },
      }).isOk(),
    ).toBe(true);
    expect(actions(editor)[0]).toMatchObject({ id: created.value, atMs: 750, isEnabled: false });

    expect(
      setPresentationActionEnabled({
        editor,
        surfaceId: IDS.firstSurface,
        actionId: created.value,
        isEnabled: true,
      }).isOk(),
    ).toBe(true);
    expect(actions(editor)[0]?.isEnabled).toBe(true);

    expect(
      removePresentationAction({
        editor,
        surfaceId: IDS.firstSurface,
        actionId: created.value,
      }).isOk(),
    ).toBe(true);
    expect(actions(editor)).toEqual([]);
  });

  it("sets and clears Surface narration and the incoming transition", () => {
    const editor = createEditor();
    const narration = {
      source: { mode: "external" as const, src: "https://example.test/narration.mp3" },
    };
    const transition = { kind: "wipe" as const, durationMs: 400 };

    expect(
      setPresentationSurfaceNarration({
        editor,
        surfaceId: IDS.firstSurface,
        narration,
      }).isOk(),
    ).toBe(true);
    expect(
      setPresentationSurfaceTransition({
        editor,
        surfaceId: IDS.firstSurface,
        transition,
      }).isOk(),
    ).toBe(true);
    expect(readPresentation(editor)?.surfaces[0]).toMatchObject({ narration, transition });

    expect(
      setPresentationSurfaceNarration({
        editor,
        surfaceId: IDS.firstSurface,
        narration: null,
      }).isOk(),
    ).toBe(true);
    expect(
      setPresentationSurfaceTransition({
        editor,
        surfaceId: IDS.firstSurface,
        transition: null,
      }).isOk(),
    ).toBe(true);
    expect(readPresentation(editor)?.surfaces[0]).not.toHaveProperty("narration");
    expect(readPresentation(editor)?.surfaces[0]).not.toHaveProperty("transition");
  });

  it("rejects a duration that would truncate an authored action", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const created = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: timedReveal(IDS.firstParagraph, 2_000, 1_000),
    });
    if (created.isErr()) throw new Error("Expected action creation to succeed.");

    const result = setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 2_500,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error).toEqual({
      reason: "surface-duration-before-action-end",
      surfaceId: IDS.firstSurface,
      durationMs: 2_500,
      blockingActionId: created.value,
      requiredDurationMs: 3_000,
    });
    expect(readPresentation(editor)?.surfaces[0]?.durationMs).toBe(5_000);
  });

  it("returns source-addressed failures for stale Surface and action identities", () => {
    const editor = createEditor();

    const surfaceResult = setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.missingSurface,
      durationMs: 1_000,
    });
    expect(surfaceResult.isErr() && surfaceResult.error).toEqual({
      reason: "surface-not-current",
      surfaceId: IDS.missingSurface,
      currentSurfaceIds: [IDS.firstSurface, IDS.secondSurface],
    });

    const actionResult = removePresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      actionId: IDS.missingAction,
    });
    expect(actionResult.isErr() && actionResult.error).toEqual({
      reason: "action-not-current",
      surfaceId: IDS.firstSurface,
      actionId: IDS.missingAction,
    });

    const created = createPresentationAction({
      editor,
      surfaceId: IDS.secondSurface,
      action: instantReveal(IDS.secondSurface, 0),
    });
    if (created.isErr()) throw new Error("Expected second-Surface action creation to succeed.");
    const wrongSurfaceResult = setPresentationActionEnabled({
      editor,
      surfaceId: IDS.firstSurface,
      actionId: created.value,
      isEnabled: false,
    });
    expect(wrongSurfaceResult.isErr() && wrongSurfaceResult.error).toEqual({
      reason: "action-belongs-to-another-surface",
      surfaceId: IDS.firstSurface,
      currentSurfaceId: IDS.secondSurface,
      actionId: created.value,
    });
  });

  it("returns input-specific failures without dispatching", () => {
    const editor = createEditor();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const duration = setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: -1,
    });
    expect(duration.isErr() && duration.error).toEqual({
      reason: "invalid-surface-duration",
      surfaceId: IDS.firstSurface,
      durationMs: -1,
    });

    const narration = setPresentationSurfaceNarration({
      editor,
      surfaceId: IDS.firstSurface,
      narration: { source: { mode: "external", src: "javascript:alert(1)" } },
    });
    expect(narration.isErr() && narration.error).toMatchObject({
      reason: "invalid-surface-narration",
      surfaceId: IDS.firstSurface,
    });

    const transition = setPresentationSurfaceTransition({
      editor,
      surfaceId: IDS.firstSurface,
      transition: { kind: "fade", durationMs: 0 },
    });
    expect(transition.isErr() && transition.error).toMatchObject({
      reason: "invalid-surface-transition",
      surfaceId: IDS.firstSurface,
    });
    expect(changedTransactions).toBe(0);
    expect(readPresentation(editor)).toBeNull();
  });

  it("returns action-specific input and scheduling failures", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 1_000,
    });

    const invalidNew = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, -1),
    });
    expect(invalidNew.isErr() && invalidNew.error).toMatchObject({
      reason: "invalid-new-action",
      surfaceId: IDS.firstSurface,
      issues: [{ path: ["atMs"] }],
    });
    if (invalidNew.isErr() && invalidNew.error.reason === "invalid-new-action") {
      expect(invalidNew.error.actionId).toEqual(expect.stringMatching(/^[0-9A-Z_a-z-]{12}$/));
    }

    const outside = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 1_001),
    });
    expect(outside.isErr() && outside.error).toMatchObject({
      reason: "action-outside-surface-duration",
      surfaceId: IDS.firstSurface,
      atMs: 1_001,
      endMs: 1_001,
      surfaceDurationMs: 1_000,
    });

    const created = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstParagraph, 500),
    });
    if (created.isErr()) throw new Error("Expected action creation to succeed.");
    const invalidUpdate = updatePresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      actionId: created.value,
      action: instantReveal(IDS.firstParagraph, -1),
    });
    expect(invalidUpdate.isErr() && invalidUpdate.error).toMatchObject({
      reason: "invalid-action-update",
      surfaceId: IDS.firstSurface,
      actionId: created.value,
      issues: [{ path: ["atMs"] }],
    });
  });

  it("reports the existing Wait when a timestamp is already occupied", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 1_000,
    });
    const first = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: { kind: "manual-wait", isEnabled: true, atMs: 500 },
    });
    if (first.isErr()) throw new Error("Expected Wait creation to succeed.");

    const second = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: { kind: "manual-wait", isEnabled: true, atMs: 500 },
    });

    expect(second.isErr() && second.error).toMatchObject({
      reason: "wait-time-occupied",
      surfaceId: IDS.firstSurface,
      blockingActionId: first.value,
      atMs: 500,
    });
  });

  it("returns target, destination, and capability source facts", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });

    const missingTarget = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.missingTarget, 0),
    });
    expect(missingTarget.isErr() && missingTarget.error).toMatchObject({
      reason: "target-not-current",
      surfaceId: IDS.firstSurface,
      targetId: IDS.missingTarget,
    });

    const disabledMissingTarget = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: { ...instantReveal(IDS.missingTarget, 0), isEnabled: false },
    });
    expect(disabledMissingTarget.isErr() && disabledMissingTarget.error).toMatchObject({
      reason: "target-not-current",
      surfaceId: IDS.firstSurface,
      targetId: IDS.missingTarget,
    });

    const movedTarget = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.secondSurface, 0),
    });
    expect(movedTarget.isErr() && movedTarget.error).toMatchObject({
      reason: "target-moved-to-another-surface",
      surfaceId: IDS.firstSurface,
      currentSurfaceId: IDS.secondSurface,
      targetId: IDS.secondSurface,
    });

    const missingDestination = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: {
        kind: "trigger",
        isEnabled: true,
        atMs: 0,
        command: { kind: "navigate-surface", surfaceId: IDS.missingSurface },
      },
    });
    expect(missingDestination.isErr() && missingDestination.error).toMatchObject({
      reason: "navigation-destination-not-current",
      surfaceId: IDS.firstSurface,
      destinationSurfaceId: IDS.missingSurface,
    });

    const unavailableCapability = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: instantReveal(IDS.firstRegion, 0),
    });
    expect(unavailableCapability.isErr() && unavailableCapability.error).toMatchObject({
      reason: "visual-capability-unavailable",
      surfaceId: IDS.firstSurface,
      targetId: IDS.firstRegion,
      capability: "reveal",
    });
  });

  it("rejects overlapping timed actions on the same target", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const first = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: timedReveal(IDS.firstParagraph, 1_000, 1_000),
    });
    if (first.isErr()) throw new Error("Expected first action creation to succeed.");

    const overlapping = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: timedReveal(IDS.firstParagraph, 1_500, 1_000),
    });

    expect(overlapping.isErr() && overlapping.error).toMatchObject({
      reason: "same-target-timed-overlap",
      surfaceId: IDS.firstSurface,
      targetId: IDS.firstParagraph,
      earlierActionId: first.value,
    });
  });

  it("rejects overlapping Surface layout transitions across different targets", () => {
    const editor = createEditor();
    setPresentationSurfaceDuration({
      editor,
      surfaceId: IDS.firstSurface,
      durationMs: 5_000,
    });
    const first = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: timedReveal(IDS.firstParagraph, 1_000, 1_000),
    });
    if (first.isErr()) throw new Error("Expected first action creation to succeed.");

    const overlapping = createPresentationAction({
      editor,
      surfaceId: IDS.firstSurface,
      action: timedReveal(IDS.secondParagraph, 1_500, 1_000),
    });

    expect(overlapping.isErr() && overlapping.error).toMatchObject({
      reason: "surface-timed-layout-overlap",
      surfaceId: IDS.firstSurface,
      earlierActionId: first.value,
      earlierTargetId: IDS.firstParagraph,
      laterTargetId: IDS.secondParagraph,
    });
  });

  it("returns editor lifecycle and stale coverage failures", () => {
    const readOnly = createEditor({ editable: false });
    const readOnlyResult = setPresentationSurfaceDuration({
      editor: readOnly,
      surfaceId: IDS.firstSurface,
      durationMs: 1_000,
    });
    expect(readOnlyResult.isErr() && readOnlyResult.error).toEqual({
      reason: "editor-read-only",
    });

    const destroyed = createEditor();
    destroyed.destroy();
    const destroyedResult = setPresentationSurfaceDuration({
      editor: destroyed,
      surfaceId: IDS.firstSurface,
      durationMs: 1_000,
    });
    expect(destroyedResult.isErr() && destroyedResult.error).toEqual({
      reason: "editor-destroyed",
    });

    const stale = createEditor({
      presentation: {
        schemaVersion: 1,
        autoAdvance: false,
        allowPrevious: true,
        surfaces: [{ surfaceId: IDS.firstSurface, durationMs: 1_000, actions: [] }],
      },
    });
    const staleResult = setPresentationSurfaceTransition({
      editor: stale,
      surfaceId: IDS.firstSurface,
      transition: { kind: "fade", durationMs: 250 },
    });
    expect(staleResult.isErr() && staleResult.error).toEqual({
      reason: "surface-coverage-stale",
      configuredSurfaceIds: [IDS.firstSurface],
      currentSurfaceIds: [IDS.firstSurface, IDS.secondSurface],
    });
  });

  it("keeps malformed portable configuration observable as a thrown defect", () => {
    const editor = createEditor({
      presentation: { schemaVersion: 2 } as unknown as PresentationConfigurationV1,
    });

    expect(() =>
      setPresentationSurfaceDuration({
        editor,
        surfaceId: IDS.firstSurface,
        durationMs: 1_000,
      }),
    ).toThrow();
  });
});

function instantReveal(
  targetId: typeof IDS.firstParagraph,
  atMs: number,
): Omit<TimelineAnimateActionV1, "id"> {
  return {
    kind: "animate",
    targetId,
    isEnabled: true,
    atMs,
    visual: { kind: "reveal", transition: { kind: "instant" } },
  };
}

function timedReveal(
  targetId: typeof IDS.firstParagraph,
  atMs: number,
  durationMs: number,
): Omit<TimelineAnimateActionV1, "id"> {
  return {
    kind: "animate",
    targetId,
    isEnabled: true,
    atMs,
    visual: {
      kind: "reveal",
      transition: {
        kind: "fade",
        durationMs,
        easing: { kind: "preset", preset: "ease-in-out" },
      },
    },
  };
}

function timedVisibility(
  kind: "reveal" | "hide",
  targetId: typeof IDS.firstParagraph,
  atMs: number,
  durationMs: number,
): Omit<TimelineAnimateActionV1, "id"> {
  return {
    kind: "animate",
    targetId,
    isEnabled: true,
    atMs,
    visual: {
      kind,
      transition: {
        kind: "fade",
        durationMs,
        easing: { kind: "preset", preset: "ease-in-out" },
      },
    },
  };
}

function createEditor({
  editable = true,
  presentation = null,
}: {
  readonly editable?: boolean;
  readonly presentation?: PresentationConfigurationV1 | null;
} = {}): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    editable,
    extensions: [...createCourseDocumentAuthoringExtensions({ editable, composition }), UndoRedo],
    content: courseDocument(presentation),
  });
  editors.push(editor);
  return editor;
}

function courseDocument(presentation: PresentationConfigurationV1 | null): JSONContent {
  const first = slideContentSurfaceDefinition.createSurface({ surfaceId: IDS.firstSurface });
  const second = slideContentSurfaceDefinition.createSurface({ surfaceId: IDS.secondSurface });
  const mainRegion = first.content?.[1];
  if (!mainRegion || mainRegion.type !== "region") {
    throw new Error("Expected the slide content main Region.");
  }
  mainRegion.attrs = { ...mainRegion.attrs, id: IDS.firstRegion };
  mainRegion.content = [
    { type: "paragraph", attrs: { id: IDS.firstParagraph } },
    { type: "paragraph", attrs: { id: IDS.secondParagraph } },
  ];
  assignMissingNodeIds(first);
  assignMissingNodeIds(second);
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "fit",
          presentation,
        },
        content: [
          { type: "courseSection", attrs: { id: IDS.section, title: "Presentation" } },
          first,
          second,
        ],
      },
    ],
  };
}

function assignMissingNodeIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    stack.push(...(node.content ?? []));
  }
}

function readPresentation(editor: Editor): PresentationConfigurationV1 | null {
  const value = editor.getJSON().content?.[0]?.attrs?.["presentation"];
  return (value ?? null) as PresentationConfigurationV1 | null;
}

function actions(editor: Editor) {
  return readPresentation(editor)?.surfaces[0]?.actions ?? [];
}
