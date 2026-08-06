// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createViewportCoordinateSpace } from "../dom/dom-coordinate-space";
import { OverlayBoundaryResolutionProvider } from "@/ui/overlays/portal-host-context";
import { InteractionDragEnvironmentProvider } from "./interaction-drag-environment";
import { InteractionDragSession } from "./InteractionDragSession";
import { useInteractionDragSource } from "./use-interaction-drag-source";

const geometryElements: HTMLElement[] = [];

afterEach(() => {
  while (geometryElements.length > 0) geometryElements.pop()?.remove();
});

describe("InteractionDragSession with installed dnd-kit", () => {
  it("measures the source separately from the handle that activates it", async () => {
    const root = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
    const host = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });
    const collisionBoundary = elementWithRect({ left: 0, top: 0, width: 800, height: 600 });

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
            onEnd={() => undefined}
            profile="pointer"
            renderPreview={() => <span>Preview</span>}
            sessionId="real-dnd-kit-preview"
          >
            <RealSource />
          </InteractionDragSession>
        </InteractionDragEnvironmentProvider>
      </OverlayBoundaryResolutionProvider>,
    );

    activateWithPointer(screen.getByRole("button", { name: "Drag Card" }));

    await waitFor(() => {
      const overlay = host.querySelector<HTMLElement>("[data-interaction-drag-overlay]");
      expect(overlay).toHaveStyle({ height: "60px", width: "120px" });
      expect(screen.getByTestId("real-source")).toHaveAttribute(
        "data-interaction-drag-placeholder",
        "",
      );
    });

    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
  });
});

function RealSource() {
  const drag = useInteractionDragSource({
    data: { title: "Alpha" },
    id: "real-source",
    label: "Card",
  });
  return (
    <div
      ref={(node) => {
        drag.sourceRef(node);
        if (node) {
          node.getBoundingClientRect = () => rect({ left: 40, top: 40, width: 120, height: 60 });
        }
      }}
      data-testid="real-source"
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
    >
      <span>Card</span>
      <button ref={drag.handleRef} type="button" aria-label="Drag Card">
        Drag
      </button>
    </div>
  );
}

function activateWithPointer(handle: HTMLElement) {
  fireEvent.pointerDown(handle, {
    button: 0,
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

function elementWithRect(input: {
  left: number;
  top: number;
  width: number;
  height: number;
}): HTMLElement {
  const element = document.createElement("div");
  element.getBoundingClientRect = () => rect(input);
  document.body.append(element);
  geometryElements.push(element);
  return element;
}

function rect(input: { left: number; top: number; width: number; height: number }): DOMRect {
  return {
    bottom: input.top + input.height,
    height: input.height,
    left: input.left,
    right: input.left + input.width,
    top: input.top,
    width: input.width,
    x: input.left,
    y: input.top,
    toJSON: () => ({}),
  } as DOMRect;
}
