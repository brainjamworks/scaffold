import type { EmbeddedDataId, EmbeddedNodeId, TimelineActionV1 } from "@scaffold/contracts";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";
import { EditorShell } from "@/editor/shell/chrome/EditorShell";

import {
  PresentationTimelineController,
  type PresentationTimelineSemanticSelection,
} from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";
import { PresentationTimeline } from "./PresentationTimeline";

const SURFACE_ID = nodeId("surface");
const SELECTED_TARGET_ID = nodeId("target000001");

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
});

function mountTimeline(hostWidth: number, durationMs: number) {
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
  const root = createRoot(host);

  flushSync(() => {
    root.render(
      <EditorShell
        style={{ height: "100%" }}
        leftNavigatorDock={<aside style={{ width: 160 }}>Document Outline</aside>}
        dock={<aside style={{ width: 160 }}>Agent</aside>}
        stage={<main>Stage</main>}
        bottomWorkspace={
          <PresentationTimeline controller={controller} projection={projection(durationMs, 14)} />
        }
      />,
    );
  });

  return {
    host,
    controller,
    semanticSelection,
    destroy() {
      flushSync(() => root.unmount());
      controller.destroy();
      host.remove();
    },
  };
}

function projection(durationMs: number, targetCount: number): PresentationTimelineProjection {
  const midpointAction = animateAction(durationMs);
  return {
    surfaceId: SURFACE_ID,
    configurationState: "present",
    durationMs,
    narration: null,
    transition: null,
    diagnostics: [],
    rows: [
      row(SURFACE_ID, "Surface", 0, []),
      ...Array.from({ length: targetCount }, (_, index) => {
        const id = nodeId(`target${String(index + 1).padStart(6, "0")}`);
        return row(id, `Target ${index + 1}`, 1, index === 0 ? [midpointAction] : []);
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
