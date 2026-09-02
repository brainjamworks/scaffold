import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationConfigurationV1,
  TimelineActionV1,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { Result } from "better-result";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { EditorShell } from "@/editor/shell/chrome/EditorShell";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";

import {
  PresentationTimelineController,
  type PresentationTimelineSemanticSelection,
} from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";
import { PresentationTimeline } from "./PresentationTimeline";
import { PresentationPreviewController } from "../preview/presentation-preview-controller";
import type {
  PresentationPreviewDocument,
  PresentationPreviewPort,
  PresentationPreviewSnapshot,
} from "@/presentation/model";

const SURFACE_ID = nodeId("surface");
const SELECTED_TARGET_ID = nodeId("target000001");
const SECTION_ID = nodeId("section");

describe("PresentationTimeline browser layout", () => {
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
        const workspace = requiredElement<HTMLElement>(host, ".sc-editor-bottom-workspace");
        const workspaceScroll = requiredElement<HTMLElement>(
          host,
          ".sc-editor-bottom-workspace-scroll",
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
      expect(mounted.semanticSelection.selectCalls).toEqual([]);
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
) {
  const host = document.createElement("div");
  host.style.width = `${hostWidth}px`;
  host.style.height = "640px";
  document.body.append(host);
  const semanticSelection = new FakeSemanticSelection(SELECTED_TARGET_ID);
  const controller = new PresentationTimelineController({
    semanticSelection,
    initialViewport: { durationMs, viewportWidthPx: 500 },
    zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
  });
  const editor = authoring ? createAuthoringEditor(durationMs, withFeedbackAction) : null;
  const previewPort = withPreview ? new BrowserPreviewPort(durationMs) : null;
  const previewController = previewPort
    ? new PresentationPreviewController({ port: previewPort })
    : null;
  const previewDocument: PresentationPreviewDocument = {
    document: { type: "doc" },
    surfaceId: SURFACE_ID,
  };
  const root = createRoot(host);

  flushSync(() => {
    root.render(
      <EditorShell
        style={{ height: "100%" }}
        leftNavigatorDock={<aside style={{ width: 160 }}>Document Outline</aside>}
        dock={<aside style={{ width: 160 }}>Agent</aside>}
        stage={<main>Stage</main>}
        bottomWorkspace={
          <PresentationTimeline
            controller={controller}
            {...(previewController
              ? { preview: { controller: previewController, document: previewDocument } }
              : {})}
            projection={projection(durationMs, 14, withFeedbackAction)}
            {...(editor ? { editor } : {})}
          />
        }
      />,
    );
  });

  return {
    host,
    controller,
    semanticSelection,
    editor,
    previewPort,
    destroy() {
      flushSync(() => root.unmount());
      controller.destroy();
      previewController?.dispose();
      editor?.destroy();
      host.remove();
    },
  };
}

class BrowserPreviewPort implements PresentationPreviewPort {
  readonly seekCalls: number[] = [];
  playCalls = 0;
  #snapshot: PresentationPreviewSnapshot = { status: "idle" };
  readonly #listeners = new Set<() => void>();

  constructor(readonly durationMs: number) {}

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  async loadCurrentDocument(input: PresentationPreviewDocument) {
    this.publish({
      status: "ready",
      surfaceId: input.surfaceId,
      phase: "awaiting-start",
      currentTimeMs: 0,
      durationMs: this.durationMs,
    });
    return Result.ok();
  }
  play() {
    this.playCalls += 1;
    this.publish({ ...this.requireReady(), phase: "playing" });
    return Result.ok();
  }
  pause() {
    this.publish({ ...this.requireReady(), phase: "paused" });
    return Result.ok();
  }
  async seek(timeMs: number) {
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
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: authoringDocument(durationMs, withFeedbackAction),
  });
}

function authoringDocument(durationMs: number, withFeedbackAction: boolean): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID });
  const region = surface.content?.[1];
  if (!region) throw new Error("Expected the slide content main Region.");
  region.content = [{ type: "paragraph", attrs: { id: SELECTED_TARGET_ID } }];
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

class FakeSemanticSelection implements PresentationTimelineSemanticSelection {
  readonly selectCalls: Array<{ id: EmbeddedNodeId; options: SemanticNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  #selectedId: EmbeddedNodeId | null;

  constructor(selectedId: EmbeddedNodeId | null) {
    this.#selectedId = selectedId;
  }

  getSnapshot = () => ({ selectedId: this.#selectedId });

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(
    id: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.selectCalls.push({ id, options });
    this.#selectedId = id;
    for (const listener of this.#listeners) listener();
    return { kind: "reached", id };
  }
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
