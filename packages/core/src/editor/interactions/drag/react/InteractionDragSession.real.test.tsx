// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createViewportCoordinateSpace } from "../dom/dom-coordinate-space";
import { OverlayBoundaryResolutionProvider } from "@/ui/overlays/portal-host-context";
import { InteractionDragEnvironmentProvider } from "./interaction-drag-environment";
import { InteractionDragSession } from "./InteractionDragSession";
import { useInteractionDragSource } from "./use-interaction-drag-source";

describe("InteractionDragSession with installed dnd-kit", () => {
  it("waits for real source measurement before rendering a preview", async () => {
    const { host, sourceNode } = renderRealSession({ left: 40, top: 40, width: 120, height: 60 });
    activateWithRealPointer(sourceNode);
    expect(host.querySelector("[data-interaction-drag-overlay]")).toBeNull();
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    const overlay = host.querySelector<HTMLElement>("[data-interaction-drag-overlay]");
    expect(overlay).not.toBeNull();
    expect(overlay).not.toHaveStyle({ width: "0px", height: "0px" });
    expect(overlay).toHaveStyle({ width: "120px", height: "60px" });
  });

  it("cancels when real source geometry is still unavailable after deferred measurement", async () => {
    const onCancel = vi.fn();
    const { host, sourceNode } = renderRealSession(
      { left: 40, top: 40, width: 0, height: 0 },
      onCancel,
    );
    activateWithRealPointer(sourceNode);
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    expect(onCancel).toHaveBeenCalledWith("dnd-kit");
    expect(sourceNode).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(host.querySelector("[data-interaction-drag-overlay]")).toBeNull();
  });
});

function renderRealSession(
  sourceRect: { left: number; top: number; width: number; height: number },
  onCancel: (reason: string) => void = () => undefined,
) {
  const root = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
  const host = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
  const collisionBoundary = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
  const source = elementWithRect(sourceRect);

  render(
    <OverlayBoundaryResolutionProvider
      resolution={{
        status: "ready",
        environment: {
          collisionBoundary,
          host,
          kind: "viewport",
          ownerDocument: document,
          ownerWindow: window,
          strategy: "fixed",
        },
      }}
    >
      <InteractionDragEnvironmentProvider
        coordinateRoot={root}
        coordinateSpace={createViewportCoordinateSpace({
          getRoot: () => root,
          ownerDocument: document,
        })}
      >
        <InteractionDragSession
          accessibilityMode="draggable"
          collisionPolicy="pointer"
          labels={{ draggable: "Card" }}
          onCancel={onCancel}
          onEnd={() => undefined}
          profile="pointer"
          renderPreview={() => <span>Preview</span>}
          sessionId="real-dnd-kit-preview"
        >
          <RealSource element={source} />
        </InteractionDragSession>
      </InteractionDragEnvironmentProvider>
    </OverlayBoundaryResolutionProvider>,
  );

  return { host, sourceNode: screen.getByTestId("real-source") };
}

function activateWithRealPointer(sourceNode: HTMLElement) {
  fireEvent.pointerDown(sourceNode, {
    buttons: 1,
    clientX: 50,
    clientY: 50,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    buttons: 1,
    clientX: 60,
    clientY: 60,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
}

function RealSource({ element }: { element: HTMLElement }) {
  const drag = useInteractionDragSource({
    data: { title: "Alpha" },
    id: "real-source",
    label: "Card",
  });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        if (node) node.getBoundingClientRect = () => element.getBoundingClientRect();
      }}
      data-testid="real-source"
      {...drag.activatorProps}
      {...drag.sourceProps}
    >
      Card
    </div>
  );
}

function elementWithRect(rect: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => ({
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  document.body.append(element);
  return element;
}
