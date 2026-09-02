// @vitest-environment happy-dom

import type { EmbeddedDataId, EmbeddedNodeId, TimelineActionV1 } from "@scaffold/contracts";
import { Result } from "better-result";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document";

import {
  PresentationTimeline,
  PresentationTimelineController,
  type PresentationTimelineProjection,
  type PresentationTimelineSemanticSelection,
} from "./index";
import { PresentationPreviewController } from "../preview/presentation-preview-controller";
import type {
  PresentationPreviewDocument,
  PresentationPreviewPort,
  PresentationPreviewSnapshot,
} from "@/presentation/model";

const SURFACE_ID = nodeId("surface");
const SECOND_SURFACE_ID = nodeId("surface-b");
const TARGET_A_ID = nodeId("target-a");
const TARGET_B_ID = nodeId("target-b");
const ACTION_A_ID = dataId("action-a");
const ACTION_B_ID = dataId("action-b");

describe("PresentationTimeline", () => {
  it("renders a fixed target gutter, ruler, action layer, and only one expanded target", () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);

    const { container } = render(
      <PresentationTimeline controller={controller} projection={projection()} />,
    );

    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveAttribute(
      "aria-valuemax",
      "10000",
    );
    expect(container.querySelectorAll(".sc-presentation-timeline-time-viewport")).toHaveLength(1);
    expect(container.querySelectorAll(".sc-presentation-timeline-row-scroll")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Select First target" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select Second target" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reveal at 2 seconds on First target/ })).toHaveStyle(
      { left: "100px", width: "50px" },
    );
    expect(container.querySelector(`[data-target-id="${TARGET_A_ID}"]`)).toHaveAttribute(
      "data-expanded",
      "true",
    );
    expect(container.querySelector(`[data-target-id="${TARGET_B_ID}"]`)).toHaveAttribute(
      "data-expanded",
      "false",
    );

    controller.destroy();
  });

  it("delegates target and action navigation through the Timeline controller", async () => {
    const user = userEvent.setup();
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);
    const { container } = render(
      <PresentationTimeline controller={controller} projection={projection()} />,
    );

    await user.click(screen.getByRole("button", { name: "Select Second target" }));
    await waitFor(() =>
      expect(container.querySelector(`[data-target-id="${TARGET_B_ID}"]`)).toHaveAttribute(
        "data-expanded",
        "true",
      ),
    );
    expect(semanticSelection.selectCalls[0]).toEqual({
      id: TARGET_B_ID,
      options: { origin: "presentation-timeline", focusEditor: false },
    });

    const action = screen.getByRole("button", {
      name: /Reveal at 2 seconds on First target/,
    });
    await user.click(action);
    await waitFor(() => expect(action).toHaveAttribute("aria-pressed", "true"));
    expect(semanticSelection.selectCalls[1]).toEqual({
      id: TARGET_A_ID,
      options: { origin: "presentation-timeline", focusEditor: false },
    });
    expect(controller.getSnapshot()).toMatchObject({
      selectedTargetId: TARGET_A_ID,
      selectedActionId: ACTION_A_ID,
    });

    controller.destroy();
  });

  it("expands collapsed ancestors and reveals a target selected outside the Timeline", async () => {
    const user = userEvent.setup();
    const semanticSelection = new FakeSemanticSelection(SURFACE_ID);
    const controller = createController(semanticSelection);
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(<PresentationTimeline controller={controller} projection={nestedProjection()} />);
      await user.click(screen.getByRole("button", { name: "Collapse First target" }));
      expect(
        screen.queryByRole("button", { name: "Select Second target" }),
      ).not.toBeInTheDocument();

      semanticSelection.publish(TARGET_B_ID);

      const selected = await screen.findByRole("button", { name: "Select Second target" });
      expect(selected).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Collapse First target" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
      controller.destroy();
    }
  });

  it("fits, zooms around the viewport centre, and shares horizontal scroll with the action layer", async () => {
    const user = userEvent.setup();
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);
    const { container } = render(
      <PresentationTimeline controller={controller} projection={projection()} />,
    );
    const viewport = requiredElement<HTMLElement>(
      container,
      ".sc-presentation-timeline-time-viewport",
    );
    const lanes = requiredElement<HTMLElement>(container, ".sc-presentation-timeline-lanes");
    setViewportMetrics(viewport, 500);

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "manual",
      pixelsPerSecond: 62.5,
      viewportLeftPx: 62.5,
    });
    await waitFor(() => expect(viewport.scrollLeft).toBe(62.5));

    viewport.scrollLeft = 100;
    fireEvent.scroll(viewport);
    expect(controller.getSnapshot().viewportLeftPx).toBe(100);
    expect(lanes).toHaveStyle({ transform: "translateX(-100px)" });

    await user.click(screen.getByRole("button", { name: "Fit timeline" }));
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "fit",
      pixelsPerSecond: 50,
      viewportLeftPx: 0,
    });
    await waitFor(() => expect(viewport.scrollLeft).toBe(0));

    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(controller.getSnapshot()).toMatchObject({
      zoomMode: "manual",
      pixelsPerSecond: 40,
      viewportLeftPx: 0,
    });

    controller.destroy();
  });

  it("seeks the draft playhead by ruler pointer and keyboard without selecting content", () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);
    render(<PresentationTimeline controller={controller} projection={projection()} />);
    const playhead = screen.getByRole("slider", {
      name: "Timeline playhead",
    }) as HTMLDivElement;
    setViewportMetrics(playhead, 500);
    playhead.setPointerCapture = vi.fn();
    playhead.releasePointerCapture = vi.fn();

    fireEvent.pointerDown(playhead, { button: 0, clientX: 250, pointerId: 4 });
    expect(playhead).toHaveFocus();
    expect(playhead).toHaveAttribute("aria-valuenow", "5000");
    expect(playhead).toHaveAttribute("aria-valuetext", "5 seconds of 10 seconds");

    fireEvent.pointerMove(playhead, { clientX: 400, pointerId: 4 });
    expect(playhead).toHaveAttribute("aria-valuenow", "8000");
    fireEvent.pointerUp(playhead, { pointerId: 4 });

    fireEvent.keyDown(playhead, { key: "Home" });
    fireEvent.keyDown(playhead, { key: "ArrowRight" });
    expect(playhead).toHaveAttribute("aria-valuenow", "100");
    fireEvent.keyDown(playhead, { key: "ArrowRight", shiftKey: true });
    expect(playhead).toHaveAttribute("aria-valuenow", "1100");
    fireEvent.keyDown(playhead, { key: "End" });
    expect(playhead).toHaveAttribute("aria-valuenow", "10000");
    expect(semanticSelection.selectCalls).toEqual([]);

    controller.destroy();
  });

  it("clamps the local playhead when the current Surface duration becomes shorter", async () => {
    const controller = createController(new FakeSemanticSelection(TARGET_A_ID));
    controller.setPlayheadDraft(9_000, 10_000);
    const { rerender } = render(
      <PresentationTimeline controller={controller} projection={projection()} />,
    );

    rerender(<PresentationTimeline controller={controller} projection={projection(2_000)} />);

    const playhead = screen.getByRole("slider", { name: "Timeline playhead" });
    await waitFor(() => expect(controller.getSnapshot().playheadDraftMs).toBe(2_000));
    expect(playhead).toHaveAttribute("aria-valuemax", "2000");
    expect(playhead).toHaveAttribute("aria-valuenow", "2000");
    controller.destroy();
  });

  it("resets the local playhead when the current Surface identity changes", async () => {
    const controller = createController(new FakeSemanticSelection(TARGET_A_ID));
    controller.setPlayheadDraft(9_000, 10_000);
    const { rerender } = render(
      <PresentationTimeline controller={controller} projection={projection()} />,
    );

    rerender(
      <PresentationTimeline
        controller={controller}
        projection={projectionForSurface(SECOND_SURFACE_ID, 10_000)}
      />,
    );

    await waitFor(() => expect(controller.getSnapshot().playheadDraftMs).toBe(0));
    expect(screen.getByRole("slider", { name: "Timeline playhead" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    controller.destroy();
  });

  it("routes Play, Pause, and playhead seeks through the isolated preview controller", async () => {
    const user = userEvent.setup();
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);
    const port = new FakePreviewPort();
    const previewController = new PresentationPreviewController({ port });
    const input: PresentationPreviewDocument = {
      document: { type: "doc" },
      surfaceId: SURFACE_ID,
    };
    render(
      <PresentationTimeline
        controller={controller}
        preview={{ controller: previewController, document: input }}
        projection={projection()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Play preview" }));
    await waitFor(() => expect(port.playCalls).toBe(1));
    expect(port.loadCalls).toEqual([input]);
    expect(screen.getByRole("button", { name: "Pause preview" })).toBeInTheDocument();

    const playhead = screen.getByRole("slider", { name: "Timeline playhead" });
    fireEvent.keyDown(playhead, { key: "ArrowRight" });
    await waitFor(() => expect(port.seekCalls).toEqual([100]));

    port.publish({
      status: "ready",
      surfaceId: SURFACE_ID,
      phase: "paused",
      currentTimeMs: 650,
      durationMs: 10_000,
    });
    await waitFor(() => expect(playhead).toHaveAttribute("aria-valuenow", "650"));
    await user.click(screen.getByRole("button", { name: "Play preview" }));
    await user.click(screen.getByRole("button", { name: "Pause preview" }));
    expect(port.pauseCalls).toBe(1);

    previewController.dispose();
    controller.destroy();
  });

  it("reloads its selected Surface instead of controlling a navigated preview Surface", async () => {
    const user = userEvent.setup();
    const controller = createController(new FakeSemanticSelection(TARGET_A_ID));
    const port = new FakePreviewPort();
    const previewController = new PresentationPreviewController({ port });
    const input: PresentationPreviewDocument = {
      document: { type: "doc" },
      surfaceId: SURFACE_ID,
    };
    render(
      <PresentationTimeline
        controller={controller}
        preview={{ controller: previewController, document: input }}
        projection={projection()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Play preview" }));

    port.publish({
      status: "ready",
      surfaceId: TARGET_B_ID,
      phase: "playing",
      currentTimeMs: 300,
      durationMs: 10_000,
    });
    const play = await screen.findByRole("button", { name: "Play preview" });
    await user.click(play);
    await waitFor(() => expect(port.loadCalls).toEqual([input, input]));
    expect(port.pauseCalls).toBe(0);

    port.publish({
      status: "ready",
      surfaceId: TARGET_B_ID,
      phase: "paused",
      currentTimeMs: 500,
      durationMs: 10_000,
    });
    fireEvent.keyDown(screen.getByRole("slider", { name: "Timeline playhead" }), {
      key: "ArrowRight",
    });
    await waitFor(() => expect(port.loadCalls).toEqual([input, input, input]));
    expect(port.seekCalls).toEqual([100]);

    previewController.dispose();
    controller.destroy();
  });

  it("derives distinct alignment and overlap feedback only while a draft exists", async () => {
    const semanticSelection = new FakeSemanticSelection(TARGET_A_ID);
    const controller = createController(semanticSelection);
    const currentProjection = projectionWithSecondAction();
    const { container } = render(
      <PresentationTimeline controller={controller} projection={currentProjection} />,
    );
    await controller.selectAction(ACTION_A_ID, TARGET_A_ID);

    controller.setEditDraft({ kind: "move-action", actionId: ACTION_A_ID, atMs: 2_925 });
    await waitFor(() =>
      expect(container.querySelectorAll(".sc-presentation-timeline-alignment-guide")).toHaveLength(
        1,
      ),
    );
    expect(container.querySelectorAll(".sc-presentation-timeline-overlap-indicator")).toHaveLength(
      0,
    );

    controller.setEditDraft({ kind: "move-action", actionId: ACTION_A_ID, atMs: 3_500 });
    await waitFor(() =>
      expect(
        container.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(1),
    );
    expect(container.querySelectorAll(".sc-presentation-timeline-alignment-guide")).toHaveLength(0);

    controller.clearEditDraft();
    await waitFor(() =>
      expect(
        container.querySelectorAll(".sc-presentation-timeline-overlap-indicator"),
      ).toHaveLength(0),
    );
    expect(container.querySelectorAll(".sc-presentation-timeline-alignment-guide")).toHaveLength(0);
    controller.destroy();
  });
});

function createController(semanticSelection: PresentationTimelineSemanticSelection) {
  return new PresentationTimelineController({
    semanticSelection,
    initialViewport: { durationMs: 10_000, viewportWidthPx: 500 },
    zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
  });
}

function projection(durationMs = 10_000): PresentationTimelineProjection {
  return {
    surfaceId: SURFACE_ID,
    configurationState: "present",
    durationMs,
    narration: null,
    transition: null,
    orderedActionIds: [ACTION_A_ID],
    diagnostics: [],
    rows: [
      {
        targetId: SURFACE_ID,
        parentTargetId: null,
        depth: 0,
        semanticKind: "surface",
        label: "Surface",
        summary: null,
        capabilities: capabilities(),
        actions: [],
      },
      {
        targetId: TARGET_A_ID,
        parentTargetId: SURFACE_ID,
        depth: 1,
        semanticKind: "block",
        label: "First target",
        summary: "Opening statement",
        capabilities: capabilities(["reveal"]),
        actions: [animateAction()],
      },
      {
        targetId: TARGET_B_ID,
        parentTargetId: SURFACE_ID,
        depth: 1,
        semanticKind: "block",
        label: "Second target",
        summary: null,
        capabilities: capabilities(["emphasize"]),
        actions: [],
      },
    ],
  };
}

function projectionForSurface(
  surfaceId: EmbeddedNodeId,
  durationMs: number,
): PresentationTimelineProjection {
  const current = projection(durationMs);
  return {
    ...current,
    surfaceId,
    rows: current.rows.map((row) => ({
      ...row,
      targetId: row.targetId === SURFACE_ID ? surfaceId : row.targetId,
      parentTargetId: row.parentTargetId === SURFACE_ID ? surfaceId : row.parentTargetId,
    })),
  };
}

function projectionWithSecondAction(): PresentationTimelineProjection {
  const base = projection();
  return {
    ...base,
    orderedActionIds: [ACTION_A_ID, ACTION_B_ID],
    rows: base.rows.map((row) =>
      row.targetId === TARGET_B_ID
        ? {
            ...row,
            actions: [
              {
                kind: "animate",
                id: ACTION_B_ID,
                targetId: TARGET_B_ID,
                isEnabled: true,
                atMs: 4_000,
                visual: {
                  kind: "emphasize",
                  durationMs: 1_000,
                  easing: { kind: "preset", preset: "linear" },
                  effect: "outline",
                },
              },
            ],
          }
        : row,
    ),
  };
}

function nestedProjection(): PresentationTimelineProjection {
  const current = projection();
  return {
    ...current,
    rows: current.rows.map((row) =>
      row.targetId === TARGET_B_ID ? { ...row, parentTargetId: TARGET_A_ID, depth: 2 } : row,
    ),
  };
}

function animateAction(): TimelineActionV1 {
  return {
    kind: "animate",
    id: ACTION_A_ID,
    targetId: TARGET_A_ID,
    isEnabled: true,
    atMs: 2_000,
    visual: {
      kind: "reveal",
      transition: {
        kind: "fade",
        durationMs: 1_000,
        easing: { kind: "preset", preset: "ease-out" },
      },
    },
  };
}

function capabilities(visualActionIds: readonly ("reveal" | "emphasize")[] = []) {
  return {
    visualActionIds,
    reconstructableCommandTypes: [],
    disabledReason: null,
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

  publish(id: EmbeddedNodeId | null): void {
    this.#selectedId = id;
    for (const listener of this.#listeners) listener();
  }
}

class FakePreviewPort implements PresentationPreviewPort {
  readonly loadCalls: PresentationPreviewDocument[] = [];
  readonly seekCalls: number[] = [];
  playCalls = 0;
  pauseCalls = 0;
  #snapshot: PresentationPreviewSnapshot = { status: "idle" };
  readonly #listeners = new Set<() => void>();

  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  async loadCurrentDocument(input: PresentationPreviewDocument) {
    this.loadCalls.push(input);
    this.publish({
      status: "ready",
      surfaceId: input.surfaceId,
      phase: "awaiting-start",
      currentTimeMs: 0,
      durationMs: 10_000,
    });
    return Result.ok();
  }
  play() {
    this.playCalls += 1;
    const snapshot = this.requireReady();
    this.publish({ ...snapshot, phase: "playing" });
    return Result.ok();
  }
  pause() {
    this.pauseCalls += 1;
    const snapshot = this.requireReady();
    this.publish({ ...snapshot, phase: "paused" });
    return Result.ok();
  }
  async seek(timeMs: number) {
    this.seekCalls.push(timeMs);
    const snapshot = this.requireReady();
    this.publish({ ...snapshot, currentTimeMs: timeMs, phase: "paused" });
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

function nodeId(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedNodeId;
}

function dataId(value: string): EmbeddedDataId {
  return value.padEnd(12, "0").slice(0, 12) as EmbeddedDataId;
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

function setViewportMetrics(viewport: HTMLElement, width: number): void {
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: width });
  viewport.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      right: width,
      bottom: 36,
      left: 0,
      width,
      height: 36,
      toJSON: () => undefined,
    }) as DOMRect;
}
