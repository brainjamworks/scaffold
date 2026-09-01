// @vitest-environment happy-dom

import type { EmbeddedDataId, EmbeddedNodeId, TimelineActionV1 } from "@scaffold/contracts";
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

const SURFACE_ID = nodeId("surface");
const TARGET_A_ID = nodeId("target-a");
const TARGET_B_ID = nodeId("target-b");
const ACTION_A_ID = dataId("action-a");

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
