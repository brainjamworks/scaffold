// @vitest-environment jsdom

import {
  EmbeddedNodeIdSchema,
  type EmbeddedNodeId,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createTabsContent } from "@/editor/arrangements/layout/tabs/tabs-content";
import { createPresentationAction, updatePresentationAction } from "@/editor/presentation/model";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import { PresentationActionEditor } from "./PresentationActionEditor";
import {
  PresentationTimelineController,
  type PresentationTimelineSemanticSelection,
} from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("paragraph001");
const OTHER_TARGET_ID = EmbeddedNodeIdSchema.parse("paragraph002");
const CONTROL_TARGET_ID = EmbeddedNodeIdSchema.parse("tabsection01");
const SECTION_ID = EmbeddedNodeIdSchema.parse("section00001");
const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("PresentationActionEditor", () => {
  it("adds only a visual action declared by the selected target", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const controller = createController(TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"])}
      />,
    );

    expect(screen.getByRole("option", { name: "Reveal" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Hide" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add action" }));

    expect(actions(editor)).toMatchObject([
      {
        kind: "animate",
        targetId: TARGET_ID,
        atMs: 0,
        visual: { kind: "reveal", transition: { kind: "fade" } },
      },
    ]);
    controller.destroy();
  });

  it("adds a declared Move with the bounded default without exposing raw path syntax", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const controller = createController(TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["move"])}
      />,
    );
    expect(screen.getByRole("option", { name: "Move" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Motion path" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add action" }));

    expect(actions(editor)[0]).toMatchObject({
      kind: "animate",
      targetId: TARGET_ID,
      visual: {
        kind: "move",
        boundaryId: SURFACE_ID,
        pathData: "M 0 0 L 100 0",
        orientToPath: false,
      },
    });
    controller.destroy();
  });

  it("preserves existing Move path data during ordinary Timeline edits", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: {
          kind: "move",
          durationMs: 500,
          easing: { kind: "preset", preset: "ease-out" },
          boundaryId: SURFACE_ID,
          pathData: "M 0 0 C 20 0 40 80 100 100",
          orientToPath: true,
        },
      },
    });
    if (created.isErr()) throw new Error("Expected seeded Move.");
    const controller = createController(TARGET_ID);
    await controller.selectAction(created.value, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["move"], TARGET_ID, actions(editor))}
      />,
    );
    expect(screen.queryByRole("textbox", { name: "Motion path" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Follow path direction" }),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "900");
    await user.selectOptions(screen.getByRole("combobox", { name: "Easing" }), "linear");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(actions(editor)[0]).toMatchObject({
      id: created.value,
      atMs: 900,
      visual: {
        kind: "move",
        easing: { kind: "preset", preset: "linear" },
        boundaryId: SURFACE_ID,
        pathData: "M 0 0 C 20 0 40 80 100 100",
        orientToPath: true,
      },
    });
    controller.destroy();
  });

  it("offers Manual Wait only for the Surface row", () => {
    const editor = createEditor();
    const controller = createController(SURFACE_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection([], SURFACE_ID)}
      />,
    );

    expect(screen.getByRole("option", { name: "Manual wait" })).toBeInTheDocument();
    controller.destroy();
  });

  it("renders an inert state when a non-Surface target has no available action", () => {
    const editor = createEditor();
    const controller = createController(TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection([])}
      />,
    );

    expect(screen.queryByRole("option", { name: "Manual wait" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No presentation actions are available for Paragraph.",
    );
    controller.destroy();
  });

  it("reveals and persists bounded custom curve details only when requested", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const controller = createController(TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["emphasize"])}
      />,
    );
    expect(screen.queryByText("Curve details")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Easing" }), "cubic-bezier");
    expect(screen.getByText("Curve details")).toBeInTheDocument();
    await user.clear(screen.getByRole("spinbutton", { name: "X1" }));
    await user.type(screen.getByRole("spinbutton", { name: "X1" }), "0.4");
    await user.click(screen.getByRole("button", { name: "Add action" }));

    expect(actions(editor)[0]).toMatchObject({
      visual: {
        kind: "emphasize",
        easing: { kind: "cubic-bezier", x1: 0.4, y1: 0.1, x2: 0.25, y2: 1 },
      },
    });
    controller.destroy();
  });

  it("derives Trigger and learner Wait choices from the target Control catalogue", async () => {
    const user = userEvent.setup();
    const editor = createEditor("tabs");
    const controller = createController(CONTROL_TARGET_ID);
    const currentProjection = projection([], CONTROL_TARGET_ID);

    const { rerender } = render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={currentProjection}
      />,
    );

    expect(screen.getByRole("option", { name: "Select" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Wait for Selected" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Manual wait" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Action" }), "trigger:select");
    await user.click(screen.getByRole("button", { name: "Add action" }));
    expect(actions(editor)[0]).toMatchObject({
      kind: "trigger",
      command: { kind: "target-command", targetId: CONTROL_TARGET_ID, type: "select" },
    });

    rerender(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={currentProjection}
      />,
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Action" }),
      "wait:event:selected",
    );
    await user.click(screen.getByRole("button", { name: "Add action" }));
    expect(actions(editor)[1]).toMatchObject({
      kind: "learner-wait",
      requirement: { kind: "event", targetId: CONTROL_TARGET_ID, type: "selected" },
    });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Action" }),
      "wait:state:selected",
    );
    await user.click(screen.getByRole("checkbox", { name: "Expected Selected" }));
    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "100");
    await user.click(screen.getByRole("button", { name: "Add action" }));
    expect(actions(editor)[2]).toMatchObject({
      kind: "learner-wait",
      atMs: 100,
      requirement: {
        kind: "state",
        targetId: CONTROL_TARGET_ID,
        key: "selected",
        equals: true,
      },
    });
    controller.destroy();
  });

  it("edits numeric timing and only the recipe fields supported by the action", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: {
          kind: "reveal",
          transition: {
            kind: "fade",
            durationMs: 500,
            easing: { kind: "preset", preset: "ease-out" },
          },
        },
      },
    });
    if (created.isErr()) throw new Error("Expected seeded action.");
    const controller = createController(TARGET_ID);
    await controller.selectAction(created.value, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );

    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "1200");
    await user.clear(screen.getByRole("spinbutton", { name: "Duration (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Duration (ms)" }), "700");
    await user.selectOptions(screen.getByRole("combobox", { name: "Recipe" }), "slide");
    expect(screen.getByRole("combobox", { name: "Direction" })).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Direction" }), "left");
    await user.selectOptions(screen.getByRole("combobox", { name: "Easing" }), "ease-in");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(actions(editor)).toEqual([
      expect.objectContaining({
        id: created.value,
        atMs: 1_200,
        visual: {
          kind: "reveal",
          transition: {
            kind: "slide",
            direction: "left",
            durationMs: 700,
            easing: { kind: "preset", preset: "ease-in" },
          },
        },
      }),
    ]);
    controller.destroy();
  });

  it("refreshes the same selected action before a later form edit", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = seedReveal(editor, 500);
    const controller = createController(TARGET_ID);
    await controller.selectAction(created, TARGET_ID);
    const { rerender } = render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    const current = actions(editor)[0]!;
    if (
      current.kind !== "animate" ||
      current.visual.kind !== "reveal" ||
      current.visual.transition.kind === "instant"
    ) {
      throw new Error("Expected seeded timed Reveal.");
    }
    const updated = updatePresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      actionId: created,
      action: {
        ...current,
        atMs: 1_200,
        visual: {
          ...current.visual,
          transition: { ...current.visual.transition, durationMs: 700 },
        },
      },
    });
    if (updated.isErr()) throw new Error("Expected direct timing update.");

    rerender(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "Start (ms)" })).toHaveValue(1_200);
    expect(screen.getByRole("spinbutton", { name: "Duration (ms)" })).toHaveValue(700);
    await user.selectOptions(screen.getByRole("combobox", { name: "Easing" }), "linear");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(actions(editor)[0]).toMatchObject({
      id: created,
      atMs: 1_200,
      visual: {
        transition: {
          durationMs: 700,
          easing: { kind: "preset", preset: "linear" },
        },
      },
    });
    controller.destroy();
  });

  it("preserves an existing navigation Trigger during a timing edit", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "trigger",
        isEnabled: true,
        atMs: 500,
        command: { kind: "navigate-surface", surfaceId: SURFACE_ID },
      },
    });
    if (created.isErr()) throw new Error("Expected seeded navigation Trigger.");
    const controller = createController(TARGET_ID);
    await controller.selectAction(created.value, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "900");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(actions(editor)[0]).toMatchObject({
      id: created.value,
      atMs: 900,
      command: { kind: "navigate-surface", surfaceId: SURFACE_ID },
    });
    controller.destroy();
  });

  it("disables and deletes the selected action through checked commands", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = seedReveal(editor, 500);
    const controller = createController(TARGET_ID);
    await controller.selectAction(created, TARGET_ID);
    const targetProjection = projection(["reveal"], TARGET_ID, actions(editor));

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={targetProjection}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Disable action" }));
    expect(actions(editor)[0]).toMatchObject({ id: created, isEnabled: false });
    await user.click(screen.getByRole("button", { name: "Delete action" }));
    expect(actions(editor)).toEqual([]);
    controller.destroy();
  });

  it("reorders an action by retiming it without changing its identity", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = seedReveal(editor, 500);
    const controller = createController(TARGET_ID);
    await controller.selectAction(created, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Move earlier" }));

    expect(actions(editor)[0]).toMatchObject({ id: created, atMs: 400 });
    controller.destroy();
  });

  it("cancels an edit without changing the document", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const created = seedReveal(editor, 500);
    const controller = createController(TARGET_ID);
    await controller.selectAction(created, TARGET_ID);
    const before = editor.getJSON();
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "2500");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(editor.getJSON()).toEqual(before);
    expect(changedTransactions).toBe(0);
    expect(controller.getSnapshot().selectedActionId).toBeNull();
    controller.destroy();
  });

  it("calculates After previous as an absolute start time", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const previous = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: OTHER_TARGET_ID,
        isEnabled: true,
        atMs: 1_000,
        visual: {
          kind: "emphasize",
          durationMs: 500,
          easing: { kind: "preset", preset: "ease-out" },
          effect: "outline",
        },
      },
    });
    if (previous.isErr()) throw new Error("Expected previous action.");
    const controller = createController(TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, [], actions(editor))}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Placement" }), "after-previous");
    await user.click(screen.getByRole("button", { name: "Add action" }));

    expect(
      actions(editor).find((action) => action.kind === "animate" && action.targetId === TARGET_ID),
    ).toMatchObject({ atMs: 1_500 });
    controller.destroy();
  });

  it("uses the authoritative stable predecessor when editing an equal-time action", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const predecessor = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: OTHER_TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: {
          kind: "emphasize",
          durationMs: 200,
          easing: { kind: "preset", preset: "linear" },
          effect: "outline",
        },
      },
    });
    const selected = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: { kind: "reveal", transition: { kind: "instant" } },
      },
    });
    const tiedFollower = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: {
        kind: "animate",
        targetId: OTHER_TARGET_ID,
        isEnabled: true,
        atMs: 500,
        visual: { kind: "reveal", transition: { kind: "instant" } },
      },
    });
    const later = createPresentationAction({
      editor,
      surfaceId: SURFACE_ID,
      action: { kind: "manual-wait", isEnabled: true, atMs: 2_000 },
    });
    if (predecessor.isErr() || selected.isErr() || tiedFollower.isErr() || later.isErr()) {
      throw new Error("Expected ordered action setup.");
    }
    const sourceActions = actions(editor);
    const selectedAction = sourceActions.find(({ id }) => id === selected.value)!;
    const otherActions = sourceActions.filter(({ id }) => id !== selected.value);
    const currentProjection = {
      ...projection(["reveal"], TARGET_ID, [selectedAction], otherActions),
      orderedActionIds: sourceActions.map(({ id }) => id),
    };
    const controller = createController(TARGET_ID);
    await controller.selectAction(selected.value, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={currentProjection}
      />,
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Placement" }), "after-previous");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(actions(editor).find(({ id }) => id === selected.value)).toMatchObject({
      id: selected.value,
      atMs: 700,
    });
    controller.destroy();
  });

  it("presents typed overlap failures without changing the action", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    seedReveal(editor, 0);
    const selectedId = seedReveal(editor, 1_500);
    const controller = createController(TARGET_ID);
    await controller.selectAction(selectedId, TARGET_ID);

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["reveal"], TARGET_ID, actions(editor))}
      />,
    );
    await user.clear(screen.getByRole("spinbutton", { name: "Start (ms)" }));
    await user.type(screen.getByRole("spinbutton", { name: "Start (ms)" }), "250");
    await user.click(screen.getByRole("button", { name: "Save action" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This timed action overlaps another action on the same target.",
    );
    expect(actions(editor).find(({ id }) => id === selectedId)?.atMs).toBe(1_500);
    controller.destroy();
  });

  it("persists Replace as adjacent Hide and Reveal actions in one transaction", async () => {
    const user = userEvent.setup();
    const editor = createEditor();
    const controller = createController(TARGET_ID);
    let presentationWrites = 0;
    editor.on("transaction", ({ transaction }) => {
      const presentation = transaction.doc.firstChild?.attrs["presentation"] as
        | PresentationConfigurationV1
        | undefined;
      if ((presentation?.surfaces[0]?.actions.length ?? 0) > 0) presentationWrites += 1;
    });

    render(
      <PresentationActionEditor
        editor={editor}
        controller={controller}
        projection={projection(["hide"], TARGET_ID, [], [], ["reveal"])}
      />,
    );
    presentationWrites = 0;
    await user.click(screen.getByRole("button", { name: "Replace with Other paragraph" }));

    expect(actions(editor)).toHaveLength(2);
    expect(presentationWrites).toBe(1);
    expect(actions(editor)).toMatchObject([
      { kind: "animate", targetId: TARGET_ID, atMs: 0, visual: { kind: "hide" } },
      { kind: "animate", targetId: OTHER_TARGET_ID, atMs: 500, visual: { kind: "reveal" } },
    ]);
    expect(actions(editor).some((action) => action.kind === ("replace" as never))).toBe(false);
    controller.destroy();
  });
});

function createController(selectedId: EmbeddedNodeId) {
  return new PresentationTimelineController({
    semanticSelection: new FakeSemanticSelection(selectedId),
    initialViewport: { durationMs: 5_000, viewportWidthPx: 500 },
    zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
  });
}

function createEditor(content: "paragraph" | "tabs" = "paragraph"): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  const editor = new Editor({
    editable: true,
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: courseDocument(content),
  });
  editors.push(editor);
  return editor;
}

function seedReveal(editor: Editor, atMs: number) {
  const created = createPresentationAction({
    editor,
    surfaceId: SURFACE_ID,
    action: {
      kind: "animate",
      targetId: TARGET_ID,
      isEnabled: true,
      atMs,
      visual: {
        kind: "reveal",
        transition: {
          kind: "fade",
          durationMs: 500,
          easing: { kind: "preset", preset: "ease-out" },
        },
      },
    },
  });
  if (created.isErr()) throw new Error("Expected seeded action.");
  return created.value;
}

function courseDocument(content: "paragraph" | "tabs"): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID });
  const region = surface.content?.[1];
  if (!region) throw new Error("Expected the slide content main Region.");
  if (content === "tabs") {
    const tabs = createTabsContent({ tabs: 2 });
    tabs.content![0]!.attrs = { ...tabs.content![0]!.attrs, id: CONTROL_TARGET_ID };
    region.content = [tabs];
  } else {
    region.content = [
      { type: "paragraph", attrs: { id: TARGET_ID } },
      { type: "paragraph", attrs: { id: OTHER_TARGET_ID } },
    ];
  }
  assignMissingNodeIds(surface);
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "fit",
          presentation: {
            schemaVersion: 1,
            autoAdvance: false,
            allowPrevious: true,
            surfaces: [{ surfaceId: SURFACE_ID, durationMs: 5_000, actions: [] }],
          } satisfies PresentationConfigurationV1,
        },
        content: [
          { type: "courseSection", attrs: { id: SECTION_ID, title: "Presentation" } },
          surface,
        ],
      },
    ],
  };
}

function projection(
  visualActionIds: PresentationTimelineProjection["rows"][number]["capabilities"]["visualActionIds"],
  targetId = TARGET_ID,
  targetActions: PresentationTimelineProjection["rows"][number]["actions"] = [],
  otherActions: PresentationTimelineProjection["rows"][number]["actions"] = [],
  otherVisualActionIds: PresentationTimelineProjection["rows"][number]["capabilities"]["visualActionIds"] = [],
): PresentationTimelineProjection {
  return {
    surfaceId: SURFACE_ID,
    configurationState: "present",
    durationMs: 5_000,
    narration: null,
    transition: null,
    orderedActionIds: [...targetActions, ...otherActions].map(({ id }) => id),
    diagnostics: [],
    rows: [
      {
        targetId,
        parentTargetId: targetId === SURFACE_ID ? null : SURFACE_ID,
        depth: targetId === SURFACE_ID ? 0 : 1,
        semanticKind:
          targetId === SURFACE_ID
            ? "surface"
            : targetId === CONTROL_TARGET_ID
              ? "published-child"
              : "rich-text",
        label:
          targetId === SURFACE_ID
            ? "Surface"
            : targetId === CONTROL_TARGET_ID
              ? "Tab"
              : "Paragraph",
        summary: null,
        capabilities: {
          visualActionIds,
          reconstructableCommandTypes: [],
          disabledReason: null,
        },
        actions: targetActions,
      },
      ...(otherActions.length > 0 || otherVisualActionIds.length > 0
        ? [
            {
              targetId: OTHER_TARGET_ID,
              parentTargetId: SURFACE_ID,
              depth: 1,
              semanticKind: "rich-text" as const,
              label: "Other paragraph",
              summary: null,
              capabilities: {
                visualActionIds:
                  otherVisualActionIds.length > 0 ? otherVisualActionIds : (["emphasize"] as const),
                reconstructableCommandTypes: [],
                disabledReason: null,
              },
              actions: otherActions,
            },
          ]
        : []),
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

function actions(editor: Editor) {
  const presentation = editor.getJSON().content?.[0]?.attrs?.["presentation"] as
    | PresentationConfigurationV1
    | undefined;
  return presentation?.surfaces[0]?.actions ?? [];
}

class FakeSemanticSelection implements PresentationTimelineSemanticSelection {
  readonly #listeners = new Set<() => void>();
  #selectedId: EmbeddedNodeId;

  constructor(selectedId: EmbeddedNodeId) {
    this.#selectedId = selectedId;
  }

  getSnapshot = () => ({ selectedId: this.#selectedId });

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(
    id: EmbeddedNodeId,
    _options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.#selectedId = id;
    for (const listener of this.#listeners) listener();
    return { kind: "reached", id };
  }
}
