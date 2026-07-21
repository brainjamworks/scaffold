// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  createOverlayFloatingPositioner,
  type OverlayFloatingPositionerEnvironment,
  type OverlayFloatingReference,
} from "./overlay-floating-positioner";

const floatingUiMock = vi.hoisted(() => ({
  autoUpdate: vi.fn((_reference: unknown, _floating: unknown, update: () => void) => {
    update();
    return vi.fn();
  }),
  computePosition: vi.fn((reference: { getBoundingClientRect: () => DOMRectReadOnly }) => {
    const rect = reference.getBoundingClientRect();
    return Promise.resolve({
      middlewareData: {},
      placement: "bottom-start",
      strategy: "absolute",
      x: rect.left,
      y: rect.bottom + 6,
    });
  }),
  flip: vi.fn((options: unknown) => ({ name: "flip", options })),
  hide: vi.fn((options: unknown) => ({ name: "hide", options })),
  offset: vi.fn((value: unknown) => ({ name: "offset", options: value })),
  shift: vi.fn((options: unknown) => ({ name: "shift", options })),
  size: vi.fn((options: unknown) => ({ name: "size", options })),
}));

vi.mock("@floating-ui/dom", () => floatingUiMock);

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("createOverlayFloatingPositioner", () => {
  it("waits while pending, then starts one boundary-aware placement session", async () => {
    const floatingElement = document.createElement("div");
    const contextElement = document.createElement("span");
    document.body.append(contextElement);
    const reference = createReference(contextElement, new DOMRect(24, 30, 4, 12));
    const environment = createEnvironment();
    const positioner = createOverlayFloatingPositioner({
      floatingElement,
      offset: 6,
      placement: "bottom-start",
    });

    positioner.start({ environment: null, reference });

    expect(floatingElement.isConnected).toBe(false);
    expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("false");
    expect(floatingUiMock.autoUpdate).not.toHaveBeenCalled();

    positioner.update({ environment, reference });

    await vi.waitFor(() => expect(floatingElement.style.left).toBe("24px"));
    expect(floatingElement.parentElement).toBe(environment.container);
    expect(floatingElement.style.top).toBe("48px");
    expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("true");
    expect(floatingElement.dataset.scaffoldOverlayHidden).toBe("false");
    expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(1);
    expect(floatingUiMock.computePosition).toHaveBeenCalledWith(
      expect.objectContaining({ contextElement }),
      floatingElement,
      expect.objectContaining({
        middleware: [
          expect.objectContaining({ name: "offset" }),
          expect.objectContaining({ name: "flip" }),
          expect.objectContaining({ name: "shift" }),
          expect.objectContaining({ name: "size" }),
          expect.objectContaining({ name: "hide" }),
        ],
        placement: "bottom-start",
        strategy: "absolute",
      }),
    );
  });

  it("uses the collision boundary and publishes the common size variables", () => {
    const floatingElement = document.createElement("div");
    const contextElement = document.createElement("span");
    document.body.append(contextElement);
    const collisionBoundary = document.createElement("section");
    const environment = createEnvironment({ collisionBoundary });
    const positioner = createOverlayFloatingPositioner({ floatingElement });

    positioner.start({
      environment,
      reference: createReference(contextElement, new DOMRect(10, 20, 80, 24)),
    });

    expect(floatingUiMock.flip).toHaveBeenCalledWith({ boundary: collisionBoundary, padding: 8 });
    expect(floatingUiMock.shift).toHaveBeenCalledWith({ boundary: collisionBoundary, padding: 8 });
    expect(floatingUiMock.hide).toHaveBeenCalledWith({
      boundary: collisionBoundary,
      padding: 8,
      strategy: "referenceHidden",
    });
    const sizeOptions = floatingUiMock.size.mock.calls[0]?.[0] as
      | {
          apply?: (input: {
            availableHeight: number;
            availableWidth: number;
            elements: { floating: HTMLElement };
            rects: { reference: { height: number; width: number } };
          }) => void;
        }
      | undefined;
    sizeOptions?.apply?.({
      availableHeight: 160,
      availableWidth: 220,
      elements: { floating: floatingElement },
      rects: { reference: { height: 24, width: 80 } },
    });

    expect(floatingElement.style.getPropertyValue("--sc-overlay-available-inline-size")).toBe(
      "220px",
    );
    expect(floatingElement.style.getPropertyValue("--sc-overlay-available-block-size")).toBe(
      "160px",
    );
    expect(floatingElement.style.getPropertyValue("--sc-overlay-anchor-inline-size")).toBe("80px");
    expect(floatingElement.style.getPropertyValue("--sc-overlay-anchor-block-size")).toBe("24px");
  });

  it("updates a Tiptap client rect without creating a second observer session", async () => {
    const floatingElement = document.createElement("div");
    const contextElement = document.createElement("span");
    document.body.append(contextElement);
    const environment = createEnvironment();
    const positioner = createOverlayFloatingPositioner({ floatingElement });

    positioner.start({
      environment,
      reference: createReference(contextElement, new DOMRect(12, 20, 2, 10)),
    });
    await vi.waitFor(() => expect(floatingElement.style.left).toBe("12px"));

    positioner.update({
      environment,
      reference: createReference(contextElement, new DOMRect(52, 60, 2, 10)),
    });

    await vi.waitFor(() => expect(floatingElement.style.left).toBe("52px"));
    expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(1);
    expect(floatingUiMock.computePosition).toHaveBeenCalledTimes(2);
  });

  it("cleans and retargets the observer when the boundary host changes", async () => {
    const firstCleanup = vi.fn();
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: unknown, _floating: unknown, update: () => void) => {
        update();
        return firstCleanup;
      },
    );
    const floatingElement = document.createElement("div");
    const contextElement = document.createElement("span");
    document.body.append(contextElement);
    const firstEnvironment = createEnvironment();
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondEnvironment = createEnvironment({ container: secondContainer });
    const reference = createReference(contextElement, new DOMRect(12, 20, 2, 10));
    const positioner = createOverlayFloatingPositioner({ floatingElement });

    positioner.start({ environment: firstEnvironment, reference });
    await vi.waitFor(() => expect(floatingElement.parentElement).toBe(firstEnvironment.container));
    positioner.update({ environment: secondEnvironment, reference });

    await vi.waitFor(() => expect(floatingElement.parentElement).toBe(secondContainer));
    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(floatingUiMock.autoUpdate).toHaveBeenCalledTimes(2);
  });

  it("uses the boundary owner document instead of the ambient document", async () => {
    const ownerDocument = document.implementation.createHTMLDocument("positioner owner");
    const container = ownerDocument.createElement("div");
    const contextElement = ownerDocument.createElement("span");
    const floatingElement = ownerDocument.createElement("div");
    ownerDocument.body.append(container, contextElement);
    const environment: OverlayFloatingPositionerEnvironment = {
      collisionBoundary: ownerDocument.body,
      container,
      ownerDocument,
      strategy: "absolute",
    };
    const positioner = createOverlayFloatingPositioner({ floatingElement });

    positioner.start({
      environment,
      reference: createReference(contextElement, new DOMRect(12, 20, 2, 10)),
    });

    await vi.waitFor(() => expect(floatingElement.parentElement).toBe(container));
    expect(floatingElement.ownerDocument).toBe(ownerDocument);
    expect(document.body.contains(floatingElement)).toBe(false);
  });

  it("destroys its observer, removes the surface, and ignores stale async placement", async () => {
    const cleanupAutoUpdate = vi.fn();
    let resolvePosition: (value: {
      middlewareData: Record<string, never>;
      placement: "bottom-start";
      strategy: "absolute";
      x: number;
      y: number;
    }) => void = () => {
      throw new Error("Expected a pending position computation.");
    };
    floatingUiMock.autoUpdate.mockImplementationOnce(
      (_reference: unknown, _floating: unknown, update: () => void) => {
        update();
        return cleanupAutoUpdate;
      },
    );
    floatingUiMock.computePosition.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePosition = resolve;
        }),
    );
    const floatingElement = document.createElement("div");
    const contextElement = document.createElement("span");
    document.body.append(contextElement);
    const positioner = createOverlayFloatingPositioner({ floatingElement });

    positioner.start({
      environment: createEnvironment(),
      reference: createReference(contextElement, new DOMRect(12, 20, 2, 10)),
    });
    positioner.destroy();
    resolvePosition({
      middlewareData: {},
      placement: "bottom-start",
      strategy: "absolute",
      x: 90,
      y: 100,
    });
    await Promise.resolve();

    expect(cleanupAutoUpdate).toHaveBeenCalledTimes(1);
    expect(floatingElement.isConnected).toBe(false);
    expect(floatingElement.style.left).toBe("0px");
    expect(floatingElement.dataset.scaffoldOverlayPlaced).toBe("false");
  });
});

function createReference(contextElement: Element, rect: DOMRectReadOnly): OverlayFloatingReference {
  return {
    contextElement,
    getBoundingClientRect: () => rect,
  };
}

function createEnvironment({
  collisionBoundary = null,
  container,
}: {
  collisionBoundary?: Element | null;
  container?: HTMLElement;
} = {}): OverlayFloatingPositionerEnvironment {
  const resolvedContainer = container ?? document.createElement("div");
  if (!resolvedContainer.isConnected) document.body.append(resolvedContainer);

  return {
    collisionBoundary,
    container: resolvedContainer,
    ownerDocument: resolvedContainer.ownerDocument,
    strategy: "absolute",
  };
}
