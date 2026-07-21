// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AuthoringSurfaceView } from "./AuthoringSurfaceView";

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

  emit(width: number, height: number) {
    if (!this.target) return;
    this.callback(
      [{ target: this.target, contentRect: { width, height } } as ResizeObserverEntry],
      this,
    );
  }
}

beforeEach(() => {
  ResizeObserverStub.instances = [];
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal("innerHeight", 900);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthoringSurfaceView", () => {
  it("renders page documents as an authoring-owned page canvas", () => {
    render(
      <AuthoringSurfaceView settings={{ mode: "page", overflowMode: "grow", surfaceSize: "fluid" }}>
        <section data-surface data-testid="surface">
          Page content
        </section>
      </AuthoringSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Page canvas" });

    expect(frame.getAttribute("data-course-surface-view")).toBe("authoring");
    expect(frame.getAttribute("data-course-mode")).toBe("page");
    expect(frame.getAttribute("data-surface-size")).toBe("fluid");
    expect(frame.getAttributeNames().sort()).toEqual([
      "aria-label",
      "class",
      "data-course-mode",
      "data-course-surface-view",
      "data-overflow-mode",
      "data-surface-size",
    ]);
    expect(frame.className).toBe("scaffold-authoring-surface-view");
  });

  it("renders slideshow documents as fixed-ratio authoring canvases", () => {
    render(
      <AuthoringSurfaceView
        settings={{
          mode: "slideshow",
          overflowMode: "clip",
          surfaceSize: "16x9",
        }}
      >
        <section data-surface data-testid="surface">
          Slide content
        </section>
      </AuthoringSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Slide canvas" });

    expect(frame.getAttribute("data-course-surface-view")).toBe("authoring");
    expect(frame.getAttribute("data-course-mode")).toBe("slideshow");
    expect(frame.getAttribute("data-surface-size")).toBe("16x9");
    expect(frame.getAttribute("data-overflow-mode")).toBe("clip");
    expect(frame.className).toBe("scaffold-authoring-surface-view");
    expect(frame.style.getPropertyValue("--sc-slideshow-canvas-width")).toBe("1024px");
    expect(frame.style.getPropertyValue("--sc-slideshow-canvas-height")).toBe("576px");
  });

  it("publishes one bounded slideshow presentation scale from the available workspace", async () => {
    render(
      <AuthoringSurfaceView
        settings={{ mode: "slideshow", overflowMode: "clip", surfaceSize: "16x9" }}
      >
        <div>Slides</div>
      </AuthoringSurfaceView>,
    );

    const viewport = screen.getByRole("region", { name: "Slide canvas" });
    expect(ResizeObserverStub.instances).toHaveLength(1);
    ResizeObserverStub.instances[0]!.emit(512, 700);

    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--sc-authoring-slide-scale")).toBe("0.5");
    });
    expect(viewport.getAttribute("data-authoring-slide-scale")).toBe("0.5");
    expect(viewport.style.getPropertyValue("--sc-authoring-slide-rendered-width")).toBe("512px");
    expect(viewport.style.getPropertyValue("--sc-authoring-slide-rendered-height")).toBe("288px");

    ResizeObserverStub.instances[0]!.emit(2048, 1200);
    await waitFor(() => {
      expect(viewport.style.getPropertyValue("--sc-authoring-slide-scale")).toBe("1");
    });
    expect(viewport.getAttribute("data-authoring-slide-scale")).toBe("1");
    expect(viewport.style.getPropertyValue("--sc-authoring-slide-rendered-width")).toBe("1024px");
    expect(viewport.style.getPropertyValue("--sc-authoring-slide-rendered-height")).toBe("576px");
  });

  it("keeps branching canvases fluid without slideshow dimensions", () => {
    render(
      <AuthoringSurfaceView
        settings={{ mode: "branching", overflowMode: "clip", surfaceSize: "fluid" }}
      >
        <section data-surface>Branching content</section>
      </AuthoringSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Screen canvas" });
    expect(frame.getAttribute("data-surface-size")).toBe("fluid");
    expect(frame.getAttribute("style")).toBeNull();
  });

  it("keeps empty authoring surfaces at canvas height", () => {
    render(
      <AuthoringSurfaceView settings={{ mode: "page", overflowMode: "grow", surfaceSize: "fluid" }}>
        <section data-empty="true" data-surface data-testid="surface" />
      </AuthoringSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Page canvas" });

    expect(frame.getAttribute("data-surface-size")).toBe("fluid");
    expect(frame.className).toBe("scaffold-authoring-surface-view");
    expect(screen.getByTestId("surface").getAttribute("data-empty")).toBe("true");
  });
});
