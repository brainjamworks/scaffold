// @vitest-environment jsdom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  PresentationConfigurationV1Schema,
  type PresentationConfigurationV1,
  type TimelineActionV1,
  type TimelineAnimateActionV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import {
  createPresentationAction,
  removePresentationAction,
  setPresentationActionEnabled,
  updatePresentationAction,
} from "./presentation-authoring-commands";

const IDS = Object.freeze({
  surface: EmbeddedNodeIdSchema.parse("surface00001"),
  target: EmbeddedNodeIdSchema.parse("paragraph001"),
  missingTarget: EmbeddedNodeIdSchema.parse("missing00001"),
  firstAction: EmbeddedDataIdSchema.parse("action000001"),
  secondAction: EmbeddedDataIdSchema.parse("action000002"),
});

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("presentation authoring checked edits under the production Layer grammar", () => {
  it("refuses enabling a second same-time Wait with typed scheduling facts", () => {
    const editor = createEditor([
      manualWait(IDS.firstAction, 500, true),
      manualWait(IDS.secondAction, 500, false),
    ]);
    const before = editor.getJSON();
    const changedTransactions = countChangedTransactions(editor);

    const result = setPresentationActionEnabled({
      editor,
      surfaceId: IDS.surface,
      actionId: IDS.secondAction,
      isEnabled: true,
    });

    expect(result.isErr() && result.error).toEqual({
      reason: "wait-time-occupied",
      surfaceId: IDS.surface,
      actionId: IDS.secondAction,
      blockingActionId: IDS.firstAction,
      atMs: 500,
    });
    expect(changedTransactions()).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });

  it("refuses enabling a learner Wait whose required target is missing", () => {
    const editor = createEditor([
      {
        kind: "learner-wait",
        id: IDS.firstAction,
        atMs: 500,
        isEnabled: false,
        boundary: "before-actions",
        requirement: { kind: "event", targetId: IDS.missingTarget, type: "selected" },
      },
    ]);
    const before = editor.getJSON();
    const changedTransactions = countChangedTransactions(editor);

    const result = setPresentationActionEnabled({
      editor,
      surfaceId: IDS.surface,
      actionId: IDS.firstAction,
      isEnabled: true,
    });

    expect(result.isErr() && result.error).toEqual({
      reason: "action-compilation-invalid",
      surfaceId: IDS.surface,
      actionId: IDS.firstAction,
      diagnostics: [
        {
          reason: "referenced-target-missing",
          surfaceId: IDS.surface,
          source: { kind: "learner-wait", waitId: IDS.firstAction },
          targetId: IDS.missingTarget,
        },
      ],
    });
    expect(changedTransactions()).toBe(0);
    expect(editor.getJSON()).toEqual(before);
  });

  it.each(["create", "update", "enable"] as const)(
    "refuses a %s edit when its earlier effect would displace a later effect",
    (entrypoint) => {
      const editor = createEditor(overlapFixture(entrypoint));
      const before = editor.getJSON();
      const changedTransactions = countChangedTransactions(editor);

      const result = runOverlapEdit(editor, entrypoint);

      expect(result.isErr()).toBe(true);
      if (result.isOk()) return;
      expect(result.error.reason).toBe("action-compilation-invalid");
      if (result.error.reason !== "action-compilation-invalid") return;
      expect(result.error).toEqual({
        reason: "action-compilation-invalid",
        surfaceId: IDS.surface,
        actionId: result.error.actionId,
        diagnostics: [
          {
            reason: "same-target-timed-overlap",
            surfaceId: IDS.surface,
            targetId: IDS.target,
            earlierActionId: result.error.actionId,
            laterActionId: IDS.firstAction,
          },
        ],
      });
      expect(changedTransactions()).toBe(0);
      expect(editor.getJSON()).toEqual(before);
    },
  );

  it("keeps disabling and removing broken actions available as explicit repairs", () => {
    const editor = createEditor([
      learnerWait(IDS.firstAction, 500),
      learnerWait(IDS.secondAction, 1_000),
    ]);
    const changedTransactions = countChangedTransactions(editor);

    const disabled = setPresentationActionEnabled({
      editor,
      surfaceId: IDS.surface,
      actionId: IDS.firstAction,
      isEnabled: false,
    });

    expect(disabled.isOk()).toBe(true);
    expect(changedTransactions()).toBe(1);
    expect(readActions(editor)).toMatchObject([
      { id: IDS.firstAction, isEnabled: false },
      { id: IDS.secondAction, isEnabled: true },
    ]);

    const removed = removePresentationAction({
      editor,
      surfaceId: IDS.surface,
      actionId: IDS.secondAction,
    });

    expect(removed.isOk()).toBe(true);
    expect(changedTransactions()).toBe(2);
    expect(readActions(editor)).toMatchObject([{ id: IDS.firstAction, isEnabled: false }]);
  });
});

function createEditor(actions: readonly TimelineActionV1[]): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  const extensions = createCourseDocumentAuthoringExtensions({ editable: true, composition });
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId: IDS.surface });
  const region = surface.content?.find((node) => node.type === "region");
  if (!region) throw new Error("Expected a Region in the slide content fixture.");
  region.content = [
    {
      type: "layer",
      attrs: { id: createEmbeddedNodeId() },
      content: [
        {
          type: "paragraph",
          attrs: { id: IDS.target },
          content: [{ type: "text", text: "Target" }],
        },
      ],
    },
  ];
  assignMissingNodeIds(surface);

  const presentation: PresentationConfigurationV1 = {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [
      { surfaceId: IDS.surface, durationMs: 2_000, layerTracks: [], actions: [...actions] },
    ],
  };
  const editor = new Editor({
    editable: true,
    extensions,
    content: {
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
            {
              type: "courseSection",
              attrs: { id: createEmbeddedNodeId(), title: "Checked edits" },
            },
            surface,
          ],
        },
      ],
    },
  });
  editor.state.doc.check();
  editors.push(editor);
  return editor;
}

function assignMissingNodeIds(root: JSONContent): void {
  if (root.type !== "text") {
    root.attrs = { ...root.attrs, id: root.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of root.content ?? []) assignMissingNodeIds(child);
}

function countChangedTransactions(editor: Editor): () => number {
  let count = 0;
  editor.on("transaction", ({ transaction }) => {
    if (transaction.docChanged) count += 1;
  });
  return () => count;
}

function readActions(editor: Editor): readonly TimelineActionV1[] {
  const value = editor.getJSON().content?.[0]?.attrs?.["presentation"];
  return PresentationConfigurationV1Schema.parse(value).surfaces[0]!.actions;
}

function manualWait(
  id: typeof IDS.firstAction,
  atMs: number,
  isEnabled: boolean,
): TimelineActionV1 {
  return { kind: "manual-wait", id, atMs, isEnabled, boundary: "before-actions" };
}

function learnerWait(id: typeof IDS.firstAction, atMs: number): TimelineActionV1 {
  return {
    kind: "learner-wait",
    id,
    atMs,
    isEnabled: true,
    boundary: "before-actions",
    requirement: { kind: "event", targetId: IDS.missingTarget, type: "selected" },
  };
}

function reveal(
  id: typeof IDS.firstAction,
  atMs: number,
  isEnabled = true,
): TimelineAnimateActionV1 {
  return {
    kind: "animate",
    id,
    targetId: IDS.target,
    atMs,
    isEnabled,
    visual: {
      kind: "reveal",
      transition: {
        kind: "fade",
        durationMs: 300,
        easing: { kind: "preset", preset: "linear" },
      },
    },
  };
}

type OverlapEntrypoint = "create" | "update" | "enable";

function overlapFixture(entrypoint: OverlapEntrypoint): readonly TimelineActionV1[] {
  const later = reveal(IDS.firstAction, 500);
  switch (entrypoint) {
    case "create":
      return [later];
    case "update":
      return [reveal(IDS.secondAction, 100), later];
    case "enable":
      return [reveal(IDS.secondAction, 400, false), later];
  }
}

function runOverlapEdit(editor: Editor, entrypoint: OverlapEntrypoint) {
  switch (entrypoint) {
    case "create": {
      const { id: _id, ...action } = reveal(IDS.secondAction, 400);
      return createPresentationAction({ editor, surfaceId: IDS.surface, action });
    }
    case "update": {
      const { id: _id, ...action } = reveal(IDS.secondAction, 400);
      return updatePresentationAction({
        editor,
        surfaceId: IDS.surface,
        actionId: IDS.secondAction,
        action,
      });
    }
    case "enable":
      return setPresentationActionEnabled({
        editor,
        surfaceId: IDS.surface,
        actionId: IDS.secondAction,
        isEnabled: true,
      });
  }
}
