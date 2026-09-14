// @vitest-environment happy-dom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  SpatialImageSurface,
  normalizedPointToOverlayStyle,
  type SpatialImageSurfaceState,
} from "./spatial-image-surface";

class ResizeObserverStub implements ResizeObserver {
  static instances: ResizeObserverStub[] = [];

  readonly observe = vi.fn((target: Element) => {
    this.target = target;
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  private target: Element | null = null;

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  emit() {
    if (!this.target) return;
    this.callback([{ target: this.target } as ResizeObserverEntry], this);
  }
}

beforeEach(() => {
  ResizeObserverStub.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SpatialImageSurface", () => {
  it("presents empty, loading, unavailable, and ready media states explicitly", async () => {
    const onImageError = vi.fn();
    const { container, rerender } = render(
      <SpatialImageSurface src={null} alt="Map" onImageError={onImageError} />,
    );

    expect(surface(container).dataset.spatialImageSurfaceState).toBe("empty");
    expect(container.querySelector("img")).toBeNull();

    rerender(<SpatialImageSurface src="map.png" alt="Map" onImageError={onImageError} />);
    expect(surface(container).dataset.spatialImageSurfaceState).toBe("loading");

    fireEvent.error(requireImage(container));
    expect(surface(container).dataset.spatialImageSurfaceState).toBe("unavailable");
    expect(onImageError).toHaveBeenCalledOnce();

    rerender(<SpatialImageSurface src="replacement.png" alt="Map" onImageError={onImageError} />);
    const image = requireImage(container);
    setNaturalSize(image, 1600, 900);
    fireEvent.load(image);

    await waitFor(() => {
      expect(surface(container).dataset.spatialImageSurfaceState).toBe("ready");
    });
  });

  it.each([
    { label: "landscape", natural: [1600, 900], expected: [800, 450] },
    { label: "portrait", natural: [900, 1600], expected: [337.5, 600] },
    { label: "square", natural: [1000, 1000], expected: [600, 600] },
  ] as const)(
    "fits a $label image and keeps the overlay on the exact image box",
    async ({ natural, expected }) => {
      const fitContainerRef = createRef<HTMLDivElement>();
      const surfaceRef = createRef<HTMLDivElement>();
      const { container } = render(
        <div ref={fitContainerRef}>
          <SpatialImageSurface
            ref={surfaceRef}
            fitContainerRef={fitContainerRef}
            src="map.png"
            alt="Map"
          >
            {() => <span data-testid="overlay-content" />}
          </SpatialImageSurface>
        </div>,
      );
      setLayoutSize(fitContainerRef.current!, 800, 600);
      const image = requireImage(container);
      setNaturalSize(image, natural[0], natural[1]);
      fireEvent.load(image);

      await waitFor(() => {
        expect(surfaceRef.current?.style.width).toBe(`${expected[0]}px`);
        expect(surfaceRef.current?.style.height).toBe(`${expected[1]}px`);
      });
      expect(surfaceRef.current).toBe(surface(container));
      expect(image.style.width).toBe("100%");
      expect(image.style.height).toBe("100%");
      expect(overlay(container)).toBe(surface(container));
    },
  );

  it("subtracts layout padding and recomputes the contain fit after resize", async () => {
    const fitContainerRef = createRef<HTMLDivElement>();
    const { container } = render(
      <div ref={fitContainerRef} style={{ padding: "10px 20px" }}>
        <SpatialImageSurface fitContainerRef={fitContainerRef} src="map.png" alt="Map" />
      </div>,
    );
    setLayoutSize(fitContainerRef.current!, 840, 620);
    const image = requireImage(container);
    setNaturalSize(image, 1600, 900);
    fireEvent.load(image);

    await waitFor(() => expect(surface(container).style.width).toBe("800px"));
    expect(surface(container).style.height).toBe("450px");

    setLayoutSize(fitContainerRef.current!, 440, 620);
    ResizeObserverStub.instances[0]!.emit();

    await waitFor(() => expect(surface(container).style.width).toBe("400px"));
    expect(surface(container).style.height).toBe("225px");
  });

  it("converts visible client points under scale and rejects points outside the image", async () => {
    let state: SpatialImageSurfaceState | null = null;
    const { container } = render(
      <SpatialImageSurface src="map.png" alt="Map">
        {(nextState) => {
          state = nextState;
          return null;
        }}
      </SpatialImageSurface>,
    );
    const image = requireImage(container);
    setNaturalSize(image, 1600, 900);
    fireEvent.load(image);
    await waitFor(() => expect(state?.status).toBe("ready"));
    const readyState = requireReadySpatialImageSurfaceState(state);

    surface(container).getBoundingClientRect = () =>
      ({
        bottom: 250,
        height: 200,
        left: 100,
        right: 500,
        top: 50,
        width: 400,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;

    expect(readyState.pointFromClient({ x: 300, y: 150 })).toEqual({ x: 50, y: 50 });
    expect(readyState.pointFromClient({ x: 100, y: 50 })).toEqual({ x: 0, y: 0 });
    expect(readyState.pointFromClient({ x: 500, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(readyState.pointFromClient({ x: 99, y: 150 })).toBeNull();
    expect(readyState.pointFromClient({ x: Number.NaN, y: 150 })).toBeNull();
  });

  it("keeps invalid natural geometry unavailable and rejects invalid normalized positions", () => {
    const onImageError = vi.fn();
    const { container } = render(
      <SpatialImageSurface src="map.png" alt="Map" onImageError={onImageError} />,
    );
    const image = requireImage(container);
    setNaturalSize(image, Number.POSITIVE_INFINITY, 900);
    fireEvent.load(image);

    expect(surface(container).dataset.spatialImageSurfaceState).toBe("unavailable");
    expect(onImageError).toHaveBeenCalledOnce();
    expect(normalizedPointToOverlayStyle({ x: 25, y: 75 })).toEqual({
      left: "25%",
      top: "75%",
    });
    expect(() => normalizedPointToOverlayStyle({ x: Number.NaN, y: 50 })).toThrow(
      "finite normalized image point",
    );
    expect(() => normalizedPointToOverlayStyle({ x: 101, y: 50 })).toThrow(
      "within the image bounds",
    );
  });

  it("keeps consumer interaction semantics on the exact image box", () => {
    const onClick = vi.fn();
    const { container } = render(
      <SpatialImageSurface
        src="map.png"
        alt="Map"
        surfaceProps={{ "aria-label": "Map interaction", onClick, role: "group", tabIndex: 0 }}
      />,
    );

    const element = surface(container);
    expect(element.getAttribute("role")).toBe("group");
    expect(element.getAttribute("aria-label")).toBe("Map interaction");
    expect(element.tabIndex).toBe(0);
    fireEvent.click(element);
    expect(onClick).toHaveBeenCalledOnce();
  });
});

function surface(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector<HTMLDivElement>("[data-spatial-image-surface]");
  if (!element) throw new Error("Expected a spatial image surface.");
  return element;
}

function overlay(container: HTMLElement): HTMLDivElement {
  const element = container.querySelector<HTMLDivElement>("[data-spatial-image-overlay]");
  if (!element) throw new Error("Expected a spatial image overlay.");
  return element;
}

function requireImage(container: HTMLElement): HTMLImageElement {
  const image = container.querySelector("img");
  if (!image) throw new Error("Expected an image.");
  return image;
}

function requireReadySpatialImageSurfaceState(
  state: SpatialImageSurfaceState | null,
): SpatialImageSurfaceState {
  if (!state || state.status !== "ready") {
    throw new Error("Expected a ready spatial image surface state.");
  }
  return state;
}

function setNaturalSize(image: HTMLImageElement, width: number, height: number) {
  Object.defineProperties(image, {
    naturalHeight: { configurable: true, value: height },
    naturalWidth: { configurable: true, value: width },
  });
}

function setLayoutSize(element: HTMLElement, width: number, height: number) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: height },
    clientWidth: { configurable: true, value: width },
  });
}
