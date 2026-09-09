import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  TimelineActionV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { Result } from "better-result";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { EditorBottomPanel } from "@/editor/shell/chrome/EditorBottomPanel";
import { EditorShell } from "@/editor/shell/chrome/EditorShell";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import { PresentationTimelineController } from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";
import { PresentationTimeline } from "./PresentationTimeline";
import type { PresentationPreviewSnapshot } from "@/presentation/model";
import type { AuthorPreviewTransport } from "@/editor/shell/authoring/author-preview-session-controller";

const SURFACE_ID = nodeId("surface");
const SELECTED_TARGET_ID = nodeId("target000001");
const SECTION_ID = nodeId("section");

describe("PresentationTimeline browser layout", () => {
  it("keeps authoring controls reachable and tracks usable in a bounded panel", async () => {
    const mounted = mountTimeline(965, 10_000, true, false, true, 360);
    try {
      await nextLayout();
      const panel = requiredElement<HTMLElement>(mounted.host, ".sc-editor-bottom-panel");
      requiredElement<HTMLElement>(mounted.host, '[aria-label="Add effect to"]');
      const controls = requiredElement<HTMLElement>(
        mounted.host,
        ".sc-editor-bottom-panel-header-actions",
      );
      const zoom = requiredElement<HTMLElement>(mounted.host, '[aria-label="Zoom in"]');
      expect(controls.scrollWidth).toBeLessThanOrEqual(controls.clientWidth + 1);
      expect(zoom.getBoundingClientRect().right).toBeLessThanOrEqual(
        panel.getBoundingClientRect().right,
      );
      const rows = requiredElement<HTMLElement>(
        mounted.host,
        ".sc-presentation-timeline-row-scroll",
      );
      expect(rows.clientHeight).toBeGreaterThanOrEqual(64);
      const inspector = requiredElement<HTMLElement>(
        mounted.host,
        ".sc-presentation-action-editor",
      );
      const effect = requiredElement<HTMLElement>(inspector, 'select[name="effect"]');
      const save = requiredElement<HTMLElement>(inspector, 'button[type="submit"]');
      expect(effect.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().bottom,
      );
      expect(save.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        panel.getBoundingClientRect().bottom,
      );
      expect(inspector.clientHeight).toBeGreaterThanOrEqual(100);
    } finally {
      mounted.destroy();
    }
  });
  it.each([
    ["short standard", 1_200, 2_000, false],
    ["long standard", 1_200, 120_000, true],
    ["short narrow", 760, 2_000, false],
    ["long narrow", 760, 120_000, true],
  ] as const)(
    "keeps its gutter, ruler, actions and scroll owners aligned for %s",
    async (_, hostWidth, durationMs, expectHorizontalOverflow) => {
      const mounted = mountTimeline(hostWidth, durationMs);

      try {
        await nextLayout();
        const { host } = mounted;
        const workspace = requiredElement<HTMLElement>(host, ".sc-editor-bottom-panel");
        const workspaceScroll = requiredElement<HTMLElement>(
          host,
          ".sc-editor-bottom-panel-scroll",
        );
        const rowScroll = requiredElement<HTMLElement>(
          host,
          ".sc-presentation-timeline-row-scroll",
        );
        const timeViewport = requiredElement<HTMLElement>(
          host,
          ".sc-presentation-timeline-time-viewport",
        );
        const gutter = requiredElement<HTMLElement>(
          host,
          ".sc-presentation-timeline-gutter-heading",
        );
        const leftDock = requiredElement<HTMLElement>(
          host,
          '.sc-editor-dock-slot[data-side="left"]',
        );
        const rightDock = requiredElement<HTMLElement>(
          host,
          '.sc-editor-dock-slot[data-side="right"]',
        );
        const targetLabel = requiredElement<HTMLElement>(
          host,
          `[data-target-id="${SELECTED_TARGET_ID}"]`,
        );
        const action = requiredElement<HTMLElement>(
          host,
          '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
        );
        const midpointTick = requiredElement<HTMLElement>(
          host,
          `[data-time-ms="${durationMs / 2}"]`,
        );

        expect(workspace.getBoundingClientRect().left).toBeGreaterThanOrEqual(
          leftDock.getBoundingClientRect().right,
        );
        expect(workspace.getBoundingClientRect().right).toBeLessThanOrEqual(
          rightDock.getBoundingClientRect().left,
        );
        expect(gutter.getBoundingClientRect().width).toBeCloseTo(184, 1);
        expect(getComputedStyle(rowScroll).overflowY).toBe("auto");
        expect(rowScroll.scrollHeight).toBeGreaterThan(rowScroll.clientHeight);
        expect(workspaceScroll.scrollHeight).toBeLessThanOrEqual(workspaceScroll.clientHeight);
        expect(getComputedStyle(timeViewport).overflowX).toBe("auto");
        const horizontalOverflowPx = timeViewport.scrollWidth - timeViewport.clientWidth;
        if (expectHorizontalOverflow) expect(horizontalOverflowPx).toBeGreaterThan(1);
        else expect(horizontalOverflowPx).toBeLessThanOrEqual(1);
        expect(action.getBoundingClientRect().left).toBeCloseTo(
          midpointTick.getBoundingClientRect().left,
          1,
        );

        if (expectHorizontalOverflow) {
          const labelLeftBeforeScroll = targetLabel.getBoundingClientRect().left;
          timeViewport.scrollLeft = Math.min(
            100,
            timeViewport.scrollWidth - timeViewport.clientWidth,
          );
          flushSync(() => timeViewport.dispatchEvent(new Event("scroll", { bubbles: true })));

          expect(targetLabel.getBoundingClientRect().left).toBeCloseTo(labelLeftBeforeScroll, 1);
          expect(action.getBoundingClientRect().left).toBeCloseTo(
            midpointTick.getBoundingClientRect().left,
            1,
          );
        }
      } finally {
        mounted.destroy();
      }
    },
  );

  it("keeps the pointed time fixed during modified-wheel zoom", async () => {
    const mounted = mountTimeline(1_200, 120_000);

    try {
      await nextLayout();
      const zoomSurface = requiredElement<HTMLElement>(
        mounted.host,
        ".sc-presentation-timeline-lane-window",
      );
      const initial = mounted.controller.getSnapshot();
      const pointerX = 100;

      flushSync(() => {
        zoomSurface.dispatchEvent(
          new WheelEvent("wheel", {
            bubbles: true,
            cancelable: true,
            clientX: zoomSurface.getBoundingClientRect().left + pointerX,
            ctrlKey: true,
            deltaY: -100,
          }),
        );
      });

      const zoomed = mounted.controller.getSnapshot();
      const pointedTimeBefore = (initial.viewportLeftPx + pointerX) / initial.pixelsPerSecond;
      const pointedTimeAfter = (zoomed.viewportLeftPx + pointerX) / zoomed.pixelsPerSecond;
      expect(zoomed.pixelsPerSecond).toBeGreaterThan(initial.pixelsPerSecond);
      expect(pointedTimeAfter).toBeCloseTo(pointedTimeBefore, 5);
    } finally {
      mounted.destroy();
    }
  });

  it("drives the isolated preview transport and keeps its snapshot aligned to the ruler", async () => {
    const mounted = mountTimeline(1_200, 10_000, false, false, true);

    try {
      await nextLayout();
      requiredElement<HTMLButtonElement>(mounted.host, '[aria-label="Play preview"]').click();
      await nextLayout();
      expect(mounted.previewPort?.playCalls).toBe(1);

      const ruler = requiredElement<HTMLElement>(
        mounted.host,
        '[role="slider"][aria-label="Timeline playhead"]',
      );
      ruler.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      await nextLayout();
      expect(mounted.previewPort?.seekCalls).toEqual([100]);

      mounted.previewPort?.publish({
        status: "ready",
        surfaceId: SURFACE_ID,
        phase: "paused",
        currentTimeMs: 5_000,
        durationMs: 10_000,
      });
      await nextLayout();
      expect(ruler).toHaveAttribute("aria-valuenow", "5000");
      expect(
        requiredElement<HTMLElement>(
          mounted.host,
          ".sc-presentation-timeline-lane-playhead",
        ).getBoundingClientRect().left,
      ).toBeCloseTo(
        requiredElement<HTMLElement>(mounted.host, '[data-time-ms="5000"]').getBoundingClientRect()
          .left,
        1,
      );
    } finally {
      mounted.destroy();
    }
  });

  it("keeps Preview selection local while an explicit Apply remains canonical and undoable", async () => {
    const mounted = mountTimeline(1_200, 120_000, true, false, true);

    try {
      await nextLayout();
      let documentWrites = 0;
      mounted.editor!.on("transaction", ({ transaction }) => {
        if (transaction.docChanged) documentWrites += 1;
      });
      const action = requiredElement<HTMLButtonElement>(
        mounted.host,
        '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
      );

      action.click();
      await nextLayout();

      expect(mounted.controller.getSnapshot()).toMatchObject({
        selectedTargetId: SELECTED_TARGET_ID,
        selectedActionId: animateAction(120_000).id,
      });
      expect(documentWrites).toBe(0);
      expect(mounted.previewPort?.playCalls).toBe(0);
      expect(mounted.previewPort?.seekCalls).toEqual([]);
      expect(mounted.previewPort?.getSnapshot()).toMatchObject({
        status: "ready",
        surfaceId: SURFACE_ID,
        phase: "awaiting-start",
      });

      const effect = requiredElement<HTMLSelectElement>(mounted.host, 'select[name="effect"]');
      effect.value = "pulse";
      effect.dispatchEvent(new Event("change", { bubbles: true }));
      const inspector = requiredElement<HTMLElement>(
        mounted.host,
        ".sc-presentation-action-editor",
      );
      const save = requiredElement<HTMLButtonElement>(inspector, 'button[type="submit"]');
      const form = save.form;
      if (!form) throw new Error("Expected the action Apply control to own a form.");
      form.dispatchEvent(
        new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: save }),
      );
      await nextLayout();

      const applyError = mounted.host.querySelector<HTMLElement>('[role="alert"]');
      if (applyError) throw new Error(`Action Apply failed: ${applyError.textContent}`);
      expect(documentWrites).toBe(1);
      expect(emphasizeEffect(presentationActions(mounted.editor!)[0]!)).toBe("pulse");
      expect(mounted.editor!.commands.undo()).toBe(true);
      expect(emphasizeEffect(presentationActions(mounted.editor!)[0]!)).toBe("outline");
      expect(mounted.editor!.commands.redo()).toBe(true);
      expect(emphasizeEffect(presentationActions(mounted.editor!)[0]!)).toBe("pulse");
      expect(mounted.previewPort?.playCalls).toBe(0);
    } finally {
      mounted.destroy();
    }
  });

  it("keeps pointer movement transient and commits once on pointer end", async () => {
    const mounted = mountTimeline(1_200, 120_000, true);

    try {
      await nextLayout();
      const action = requiredElement<HTMLButtonElement>(
        mounted.host,
        '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
      );
      action.click();
      await nextLayout();
      expect(mounted.controller.getSnapshot().selectedActionId).not.toBeNull();
      let presentationWrites = 0;
      mounted.editor!.on("transaction", ({ transaction }) => {
        const currentActions = presentationActionsFromDoc(transaction.doc.toJSON());
        if (currentActions[0]?.atMs !== 60_000) presentationWrites += 1;
      });
      const bounds = action.getBoundingClientRect();
      const pointerId = 7;
      action.setPointerCapture = () => undefined;
      action.releasePointerCapture = () => undefined;

      action.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: bounds.left + bounds.width / 2,
          pointerId,
        }),
      );
      action.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: bounds.left + bounds.width / 2 + 100,
          pointerId,
        }),
      );

      expect(mounted.controller.getSnapshot().editDraft).toMatchObject({
        kind: "move-action",
        atMs: 70_000,
      });
      await nextLayout();
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-alignment-guide"),
      ).toHaveLength(0);
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(0);
      expect(presentationActions(mounted.editor!)[0]?.atMs).toBe(60_000);

      action.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: bounds.left + bounds.width / 2 + 100,
          pointerId,
        }),
      );
      expect(mounted.controller.getSnapshot().editDraft).toBeNull();
      expect(presentationActions(mounted.editor!)[0]?.atMs).toBe(70_000);
      expect(presentationWrites).toBe(1);
    } finally {
      mounted.destroy();
    }
  });

  it("cancels a resize draft, then commits one resize on pointer end", async () => {
    const mounted = mountTimeline(1_200, 120_000, true);

    try {
      await nextLayout();
      const action = requiredElement<HTMLButtonElement>(
        mounted.host,
        '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
      );
      action.click();
      await nextLayout();
      action.setPointerCapture = () => undefined;
      action.releasePointerCapture = () => undefined;
      const bounds = action.getBoundingClientRect();
      const resize = (type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel") =>
        action.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            ...(type === "pointerdown" ? { button: 0 } : {}),
            clientX: bounds.right + (type === "pointerdown" ? -1 : 10),
            pointerId: 9,
          }),
        );

      resize("pointerdown");
      resize("pointermove");
      expect(mounted.controller.getSnapshot().editDraft).toMatchObject({
        kind: "resize-action",
        durationMs: 2_100,
      });
      resize("pointercancel");
      expect(mounted.controller.getSnapshot().editDraft).toBeNull();
      expect(actionDuration(presentationActions(mounted.editor!)[0]!)).toBe(1_000);

      resize("pointerdown");
      resize("pointermove");
      resize("pointerup");
      expect(actionDuration(presentationActions(mounted.editor!)[0]!)).toBe(2_100);
    } finally {
      mounted.destroy();
    }
  });

  it("offers keyboard start and duration nudges", async () => {
    const mounted = mountTimeline(1_200, 120_000, true);

    try {
      await nextLayout();
      const action = requiredElement<HTMLButtonElement>(
        mounted.host,
        '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
      );
      action.click();
      await nextLayout();

      action.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" }));
      expect(presentationActions(mounted.editor!)[0]?.atMs).toBe(60_100);
      action.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight", altKey: true }),
      );
      expect(actionDuration(presentationActions(mounted.editor!)[0]!)).toBe(1_100);
    } finally {
      mounted.destroy();
    }
  });

  it("shows transient alignment and overlap feedback and clears it on cancel and end", async () => {
    const mounted = mountTimeline(1_200, 120_000, true, true);

    try {
      await nextLayout();
      const action = requiredElement<HTMLButtonElement>(
        mounted.host,
        '.sc-presentation-timeline-action[aria-label^="Emphasize"]',
      );
      action.click();
      await nextLayout();
      action.setPointerCapture = () => undefined;
      action.releasePointerCapture = () => undefined;
      const bounds = action.getBoundingClientRect();
      const pointer = (
        type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
        deltaPx: number,
      ) =>
        action.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            ...(type === "pointerdown" ? { button: 0 } : {}),
            clientX: bounds.left + bounds.width / 2 + deltaPx,
            pointerId: 11,
          }),
        );

      pointer("pointerdown", 0);
      pointer("pointermove", 100);
      await nextLayout();
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-alignment-guide"),
      ).toHaveLength(1);
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(0);
      pointer("pointercancel", 100);
      await nextLayout();
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-alignment-guide"),
      ).toHaveLength(0);

      pointer("pointerdown", 0);
      pointer("pointermove", 110);
      await nextLayout();
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(1);
      pointer("pointerup", 110);
      await nextLayout();
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-alignment-guide"),
      ).toHaveLength(0);
      expect(
        mounted.host.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(0);
    } finally {
      mounted.destroy();
    }
  });
});

function mountTimeline(
  hostWidth: number,
  durationMs: number,
  authoring = false,
  withFeedbackAction = false,
  withPreview = false,
  panelHeight = 240,
) {
  const host = document.createElement("div");
  host.style.width = `${hostWidth}px`;
  host.style.height = "640px";
  document.body.append(host);
  const currentProjection = projection(durationMs, 14, withFeedbackAction);
  const controller = new PresentationTimelineController({
    initialProjection: currentProjection,
    initialSelectedTargetId: SELECTED_TARGET_ID,
    initialViewport: { durationMs, viewportWidthPx: 500 },
    zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
  });
  const editor = authoring ? createAuthoringEditor(durationMs, withFeedbackAction) : null;
  const previewPort = withPreview ? new BrowserPreviewPort(durationMs) : null;
  const root = createRoot(host);

  flushSync(() => {
    root.render(
      <EditorShell
        style={{ height: "100%" }}
        leftNavigatorDock={<aside style={{ width: 160 }}>Document Outline</aside>}
        dock={<aside style={{ width: 160 }}>Agent</aside>}
        stage={<main>Stage</main>}
        bottomWorkspace={
          <EditorBottomPanel
            initialHeightPx={panelHeight}
            tabsLabel="Surface workspace"
            activeTabId="timeline"
            onTabChange={() => undefined}
            onClose={() => undefined}
            tabs={[
              {
                id: "timeline",
                label: "Timeline",
                content: (
                  <PresentationTimeline
                    controller={controller}
                    {...(previewPort
                      ? { preview: { transport: previewPort, surfaceId: SURFACE_ID } }
                      : {})}
                    projection={currentProjection}
                    {...(editor ? { editor } : {})}
                  />
                ),
              },
            ]}
          />
        }
      />,
    );
  });

  return {
    host,
    controller,
    editor,
    previewPort,
    destroy() {
      flushSync(() => root.unmount());
      controller.destroy();
      editor?.destroy();
      host.remove();
    },
  };
}

class BrowserPreviewPort implements AuthorPreviewTransport {
  readonly seekCalls: number[] = [];
  playCalls = 0;
  #snapshot: PresentationPreviewSnapshot;
  readonly #listeners = new Set<() => void>();

  constructor(readonly durationMs: number) {
    this.#snapshot = {
      status: "ready",
      surfaceId: SURFACE_ID,
      phase: "awaiting-start",
      currentTimeMs: 0,
      durationMs,
    };
  }

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  play(_surfaceId: EmbeddedNodeId) {
    this.playCalls += 1;
    this.publish({ ...this.requireReady(), phase: "playing" });
    return Result.ok();
  }
  pause(_surfaceId: EmbeddedNodeId) {
    this.publish({ ...this.requireReady(), phase: "paused" });
    return Result.ok();
  }
  async seek(_surfaceId: EmbeddedNodeId, timeMs: number) {
    this.seekCalls.push(timeMs);
    this.publish({ ...this.requireReady(), phase: "paused", currentTimeMs: timeMs });
    return Result.ok({ kind: "applied" as const, timeMs });
  }
  publish(snapshot: PresentationPreviewSnapshot) {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }
  private requireReady() {
    if (this.#snapshot.status !== "ready") throw new Error("Expected ready preview.");
    return this.#snapshot;
  }
}

function createAuthoringEditor(durationMs: number, withFeedbackAction: boolean): Editor {
  const composition = createCoreScaffoldAuthoringComposition();
  return new Editor({
    editable: true,
    extensions: [
      ...createCourseDocumentAuthoringExtensions({ editable: true, composition }),
      UndoRedo,
    ],
    content: authoringDocument(durationMs, withFeedbackAction),
  });
}

function authoringDocument(durationMs: number, withFeedbackAction: boolean): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID });
  const region = surface.content?.[1];
  if (!region) throw new Error("Expected the slide content main Region.");
  region.content = [
    {
      type: "layer",
      attrs: { id: createEmbeddedNodeId() },
      content: [{ type: "paragraph", attrs: { id: SELECTED_TARGET_ID } }],
    },
  ];
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
            surfaces: [
              {
                surfaceId: SURFACE_ID,
                durationMs,
                layerTracks: [],
                actions: [
                  animateAction(durationMs),
                  ...(withFeedbackAction ? [feedbackAction()] : []),
                ],
              },
            ],
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

function presentationActions(editor: Editor): readonly TimelineActionV1[] {
  return presentationActionsFromDoc(editor.getJSON());
}

function presentationActionsFromDoc(document: JSONContent): readonly TimelineActionV1[] {
  const presentation = document.content?.[0]?.attrs?.["presentation"] as
    | PresentationConfigurationV1
    | undefined;
  return presentation?.surfaces[0]?.actions ?? [];
}

function actionDuration(action: TimelineActionV1): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function emphasizeEffect(action: TimelineActionV1): "outline" | "pulse" {
  if (action.kind !== "animate" || action.visual.kind !== "emphasize") {
    throw new Error("Expected an emphasize action.");
  }
  return action.visual.effect;
}

function projection(
  durationMs: number,
  targetCount: number,
  withFeedbackAction = false,
): PresentationTimelineProjection {
  const midpointAction = animateAction(durationMs);
  return {
    surfaceId: SURFACE_ID,
    configurationState: "present",
    durationMs,
    narration: null,
    transition: null,
    orderedActionIds: [midpointAction.id, ...(withFeedbackAction ? [feedbackAction().id] : [])],
    diagnostics: [],
    rows: [
      row(SURFACE_ID, "Surface", 0, []),
      ...Array.from({ length: targetCount }, (_, index) => {
        const id = nodeId(`target${String(index + 1).padStart(6, "0")}`);
        return row(
          id,
          `Target ${index + 1}`,
          1,
          index === 0 ? [midpointAction, ...(withFeedbackAction ? [feedbackAction()] : [])] : [],
        );
      }),
    ],
  };
}

function row(
  targetId: EmbeddedNodeId,
  label: string,
  depth: number,
  actions: readonly TimelineActionV1[],
): PresentationTimelineProjection["rows"][number] {
  return {
    targetId,
    parentTargetId: depth === 0 ? null : SURFACE_ID,
    depth,
    semanticKind: depth === 0 ? "surface" : "block",
    label,
    summary: null,
    capabilities: {
      visualActionIds: ["emphasize"],
      reconstructableCommandTypes: [],
      disabledReason: null,
    },
    actions,
  };
}

function animateAction(durationMs: number): TimelineActionV1 {
  return {
    kind: "animate",
    id: dataId("mid-action"),
    targetId: SELECTED_TARGET_ID,
    isEnabled: true,
    atMs: durationMs / 2,
    visual: {
      kind: "emphasize",
      durationMs: Math.max(1, Math.min(1_000, durationMs / 4)),
      easing: { kind: "preset", preset: "ease-out" },
      effect: "outline",
    },
  };
}

function feedbackAction(): TimelineActionV1 {
  return {
    kind: "animate",
    id: dataId("feedback"),
    targetId: SELECTED_TARGET_ID,
    isEnabled: true,
    atMs: 71_000,
    visual: {
      kind: "emphasize",
      durationMs: 1_000,
      easing: { kind: "preset", preset: "linear" },
      effect: "pulse",
    },
  };
}

async function nextLayout(): Promise<void> {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

function nodeId(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedNodeId;
}

function dataId(value: string): EmbeddedDataId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedDataId;
}
