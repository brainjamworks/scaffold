// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  OverlayBoundaryResolutionProvider,
  type OverlayBoundaryEnvironment,
} from "@/ui/overlays/portal-host-context";

import { createElementFloatingAnchor, createVirtualFloatingAnchor } from "./floating-anchor";
import { useEditorFloatingPosition } from "./useEditorFloatingPosition";

const floatingUiMock = vi.hoisted(() => ({
  autoUpdate: vi.fn((_reference: Element, _floating: Element, update: () => void) => {
    update();
    return vi.fn();
  }),
  computePosition: vi.fn(() =>
    Promise.resolve({
      middlewareData: {},
      placement: "bottom",
      strategy: "absolute",
      x: 12,
      y: 24,
    }),
  ),
  flip: vi.fn((options: unknown) => ({ name: "flip", options })),
  offset: vi.fn((value: number) => ({ name: "offset", options: value })),
  shift: vi.fn((options: unknown) => ({ name: "shift", options })),
  size: vi.fn((options: unknown) => ({ name: "size", options })),
}));

vi.mock("@floating-ui/dom", () => floatingUiMock);

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  floatingUiMock.autoUpdate.mockClear();
  floatingUiMock.computePosition.mockClear();
  floatingUiMock.flip.mockClear();
  floatingUiMock.offset.mockClear();
  floatingUiMock.shift.mockClear();
  floatingUiMock.size.mockClear();
});

describe("useEditorFloatingPosition", () => {
  it("sets up autoUpdate with default options while open and cleans it up when closed", async () => {
    const cleanupAutoUpdate = vi.fn();
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: Element, _floating: Element, update: () => void) => {
        update();
        return cleanupAutoUpdate;
      },
    );
    const { anchorElement, floatingElement, root } = createLiveElements();

    const { rerender } = render(
      <PositionProbe anchorElement={anchorElement} floatingElement={floatingElement} root={root} />,
    );

    await waitFor(() => expect(floatingElement.style.left).toBe("12px"));
    expect(floatingElement.style.top).toBe("24px");
    expect(floatingElement.style.visibility).toBe("visible");
    expect(floatingUiMock.autoUpdate).toHaveBeenCalledWith(
      anchorElement,
      floatingElement,
      expect.any(Function),
    );
    expect(floatingUiMock.autoUpdate.mock.calls[0]).toHaveLength(3);

    rerender(
      <PositionProbe
        anchorElement={anchorElement}
        floatingElement={floatingElement}
        open={false}
        root={root}
      />,
    );

    expect(cleanupAutoUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(floatingElement.style.visibility).toBe("hidden"));
  });

  it("computes positions with absolute strategy by default", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements();

    render(
      <PositionProbe
        anchorElement={anchorElement}
        floatingElement={floatingElement}
        offset={8}
        placement="top-start"
        root={root}
      />,
    );

    await waitFor(() => expect(floatingUiMock.computePosition).toHaveBeenCalled());
    expect(floatingUiMock.offset).toHaveBeenCalledWith(8);
    expect(floatingUiMock.computePosition).toHaveBeenCalledWith(
      anchorElement,
      floatingElement,
      expect.objectContaining({
        middleware: [expect.objectContaining({ name: "offset", options: 8 })],
        placement: "top-start",
        strategy: "absolute",
      }),
    );
  });

  it("keeps autoUpdate active while the visibility gate fails so hidden anchors can recover", async () => {
    let updatePosition: (() => void) | null = null;
    const cleanupAutoUpdate = vi.fn();
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: Element, _floating: Element, update: () => void) => {
        updatePosition = update;
        update();
        return cleanupAutoUpdate;
      },
    );
    let anchorRect = new DOMRect(160, 10, 40, 40);
    const { anchorElement, floatingElement, root } = createLiveElements({
      anchorRect: () => anchorRect,
      rootRect: new DOMRect(0, 0, 100, 100),
    });

    render(
      <PositionProbe anchorElement={anchorElement} floatingElement={floatingElement} root={root} />,
    );

    await waitFor(() => expect(floatingUiMock.autoUpdate).toHaveBeenCalled());
    expect(floatingElement.style.visibility).toBe("hidden");
    expect(floatingUiMock.computePosition).not.toHaveBeenCalled();

    anchorRect = new DOMRect(20, 10, 40, 40);
    await act(async () => {
      updatePosition?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(floatingElement.style.left).toBe("12px"));
    expect(floatingElement.style.visibility).toBe("visible");
  });

  it("applies autoUpdate position changes to the element without a React render hop", async () => {
    let updatePosition: (() => void) | null = null;
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: Element, _floating: Element, update: () => void) => {
        updatePosition = update;
        update();
        return vi.fn();
      },
    );
    floatingUiMock.computePosition
      .mockResolvedValueOnce({
        middlewareData: {},
        placement: "bottom",
        strategy: "absolute",
        x: 12,
        y: 24,
      })
      .mockResolvedValueOnce({
        middlewareData: {},
        placement: "bottom",
        strategy: "absolute",
        x: 36,
        y: 48,
      });
    const { anchorElement, floatingElement, root } = createLiveElements();
    let renderCount = 0;

    render(
      <PositionProbe
        anchorElement={anchorElement}
        floatingElement={floatingElement}
        onRender={() => {
          renderCount += 1;
        }}
        root={root}
      />,
    );

    await waitFor(() => expect(floatingElement.style.left).toBe("12px"));
    const renderCountAfterInitialPosition = renderCount;

    await act(async () => {
      updatePosition?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(floatingElement.style.left).toBe("36px"));
    expect(floatingElement.style.top).toBe("48px");
    expect(renderCount).toBe(renderCountAfterInitialPosition);
  });

  it("uses the ready boundary strategy without relocating structural chrome", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements();
    const host = document.createElement("div");
    const collisionBoundary = document.createElement("section");
    document.body.append(collisionBoundary, host);
    const environment = createBoundaryEnvironment({
      collisionBoundary,
      host,
      kind: "contained",
      strategy: "absolute",
    });

    render(
      <OverlayBoundaryResolutionProvider resolution={{ environment, status: "ready" }}>
        <PositionProbe
          anchorElement={anchorElement}
          floatingElement={floatingElement}
          offset={8}
          root={root}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(floatingUiMock.computePosition).toHaveBeenCalled());
    expect(floatingUiMock.flip).not.toHaveBeenCalled();
    expect(floatingUiMock.shift).not.toHaveBeenCalled();
    expect(floatingUiMock.size).not.toHaveBeenCalled();
    expect(floatingUiMock.computePosition).toHaveBeenCalledWith(
      anchorElement,
      floatingElement,
      expect.objectContaining({
        middleware: [expect.objectContaining({ name: "offset" })],
        strategy: "absolute",
      }),
    );
  });

  it("uses fixed geometry for a ready viewport boundary", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements();
    const host = document.createElement("div");
    document.body.append(host);
    const environment = createBoundaryEnvironment({
      collisionBoundary: null,
      host,
      kind: "viewport",
      strategy: "fixed",
    });

    render(
      <OverlayBoundaryResolutionProvider resolution={{ environment, status: "ready" }}>
        <PositionProbe
          anchorElement={anchorElement}
          floatingElement={floatingElement}
          root={root}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(floatingUiMock.computePosition).toHaveBeenCalled());
    expect(floatingUiMock.computePosition).toHaveBeenLastCalledWith(
      anchorElement,
      floatingElement,
      expect.objectContaining({ strategy: "fixed" }),
    );
  });

  it("does not start a placement session while the boundary is pending", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements();

    render(
      <OverlayBoundaryResolutionProvider resolution={{ status: "pending" }}>
        <PositionProbe
          anchorElement={anchorElement}
          floatingElement={floatingElement}
          root={root}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("false"));
    expect(floatingElement.dataset.scaffoldOverlayHidden).toBe("true");
    expect(floatingUiMock.autoUpdate).not.toHaveBeenCalled();
  });

  it("cleans and restarts placement when the ready boundary retargets", async () => {
    const cleanupFirstSession = vi.fn();
    floatingUiMock.autoUpdate.mockReturnValueOnce(cleanupFirstSession);
    const { anchorElement, floatingElement, root } = createLiveElements();
    const firstHost = document.createElement("div");
    const secondHost = document.createElement("div");
    document.body.append(firstHost, secondHost);
    const firstEnvironment = createBoundaryEnvironment({
      collisionBoundary: null,
      host: firstHost,
      kind: "viewport",
      strategy: "fixed",
    });
    const secondEnvironment = createBoundaryEnvironment({
      collisionBoundary: null,
      host: secondHost,
      kind: "viewport",
      strategy: "fixed",
    });

    const { rerender } = render(
      <OverlayBoundaryResolutionProvider
        resolution={{ environment: firstEnvironment, status: "ready" }}
      >
        <PositionProbe
          anchorElement={anchorElement}
          floatingElement={floatingElement}
          root={root}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(1));
    rerender(
      <OverlayBoundaryResolutionProvider
        resolution={{ environment: secondEnvironment, status: "ready" }}
      >
        <PositionProbe
          anchorElement={anchorElement}
          floatingElement={floatingElement}
          root={root}
        />
      </OverlayBoundaryResolutionProvider>,
    );

    await waitFor(() => expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(2));
    expect(cleanupFirstSession).toHaveBeenCalledTimes(1);
  });

  it("publishes placed and hidden state without a React render hop", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements();

    render(
      <PositionProbe anchorElement={anchorElement} floatingElement={floatingElement} root={root} />,
    );

    await waitFor(() => expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("true"));
    expect(floatingElement.dataset.scaffoldOverlayHidden).toBe("false");
    expect(floatingElement.style.pointerEvents).toBe("auto");
  });

  it("uses anchor snapshot visibility after a placement result is available", async () => {
    floatingUiMock.computePosition.mockResolvedValueOnce({
      middlewareData: { hide: { referenceHidden: true } },
      placement: "bottom",
      strategy: "absolute",
      x: 12,
      y: 24,
    });
    const { anchorElement, floatingElement, root } = createLiveElements();

    render(
      <PositionProbe anchorElement={anchorElement} floatingElement={floatingElement} root={root} />,
    );

    await waitFor(() => expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("true"));
    expect(floatingElement.dataset.scaffoldOverlayHidden).toBe("false");
    expect(floatingElement.style.visibility).toBe("visible");
    expect(floatingElement.style.pointerEvents).toBe("auto");
  });

  it("keeps a boundary-edge virtual point visible when its structural frame is visible", async () => {
    floatingUiMock.computePosition.mockResolvedValueOnce({
      middlewareData: { hide: { referenceHidden: true } },
      placement: "bottom-start",
      strategy: "absolute",
      x: 300,
      y: 0,
    });
    const { anchorElement, floatingElement, root } = createLiveElements({
      anchorRect: new DOMRect(20, 0, 360, 220),
      rootRect: new DOMRect(0, 0, 400, 300),
    });
    const anchor = createVirtualFloatingAnchor({
      contextElement: anchorElement,
      getBoundingClientRect: () => new DOMRect(380, 0, 0, 0),
      root,
      visibilityElement: anchorElement,
    });

    render(<VirtualPositionProbe anchor={anchor} floatingElement={floatingElement} />);

    await waitFor(() => expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("true"));
    expect(floatingElement.dataset.scaffoldOverlayHidden).toBe("false");
    expect(floatingElement.style.visibility).toBe("visible");
    expect(floatingElement.style.pointerEvents).toBe("auto");
  });

  it("supports zero-size virtual point anchors when a visibility element is live", async () => {
    const { anchorElement, floatingElement, root } = createLiveElements({
      anchorRect: new DOMRect(80, 90, 40, 40),
      rootRect: new DOMRect(0, 0, 400, 300),
    });
    const anchor = createVirtualFloatingAnchor({
      contextElement: anchorElement,
      getBoundingClientRect: () => new DOMRect(100, 120, 0, 0),
      root,
      visibilityElement: anchorElement,
    });

    render(<VirtualPositionProbe anchor={anchor} floatingElement={floatingElement} />);

    await waitFor(() => expect(floatingElement.style.left).toBe("12px"));
    expect(floatingUiMock.computePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        contextElement: anchorElement,
      }),
      floatingElement,
      expect.any(Object),
    );
  });
});

function PositionProbe({
  anchorElement,
  floatingElement,
  offset,
  onRender,
  open = true,
  placement,
  root,
}: {
  anchorElement: Element | null;
  floatingElement: HTMLElement | null;
  offset?: number;
  onRender?: () => void;
  open?: boolean;
  placement?: "bottom" | "top-start";
  root: Element;
}) {
  onRender?.();
  const anchor = useMemo(
    () => createElementFloatingAnchor(anchorElement, { root }),
    [anchorElement, root],
  );
  useEditorFloatingPosition({
    anchor,
    floatingElement,
    open,
    ...(offset !== undefined ? { offset } : {}),
    ...(placement !== undefined ? { placement } : {}),
  });

  return null;
}

function VirtualPositionProbe({
  anchor,
  floatingElement,
}: {
  anchor: ReturnType<typeof createVirtualFloatingAnchor>;
  floatingElement: HTMLElement | null;
}) {
  useEditorFloatingPosition({
    anchor,
    floatingElement,
    open: true,
  });

  return null;
}

function createLiveElements({
  anchorRect = new DOMRect(20, 10, 50, 30),
  rootRect = new DOMRect(0, 0, 400, 300),
}: {
  anchorRect?: DOMRectReadOnly | (() => DOMRectReadOnly);
  rootRect?: DOMRect;
} = {}) {
  const root = document.createElement("div");
  const anchorElement = document.createElement("button");
  const floatingElement = document.createElement("div");
  root.append(anchorElement);
  document.body.append(root, floatingElement);

  mockRect(root, rootRect);
  mockRect(anchorElement, anchorRect);

  return { anchorElement, floatingElement, root };
}

function mockRect(element: Element, value: DOMRectReadOnly | (() => DOMRectReadOnly)): void {
  vi.spyOn(element, "getBoundingClientRect").mockImplementation(
    typeof value === "function" ? value : () => value,
  );
}

function createBoundaryEnvironment({
  collisionBoundary,
  host,
  kind,
  strategy,
}: Pick<
  OverlayBoundaryEnvironment,
  "collisionBoundary" | "host" | "kind" | "strategy"
>): OverlayBoundaryEnvironment {
  const ownerWindow = document.defaultView;
  if (ownerWindow === null) throw new Error("Expected a window-backed test document.");

  return {
    collisionBoundary,
    host,
    kind,
    ownerDocument: document,
    ownerWindow,
    strategy,
  };
}
