// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { RuntimeSurfaceView } from "./RuntimeSurfaceView";

describe("RuntimeSurfaceView", () => {
  it("renders page documents as runtime-owned flowing content", () => {
    render(
      <RuntimeSurfaceView settings={{ mode: "page", overflowMode: "grow", surfaceSize: "fluid" }}>
        <section data-surface data-testid="surface">
          Runtime page content
        </section>
      </RuntimeSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Course content" });

    expect(frame.getAttribute("data-course-surface-view")).toBe("runtime");
    expect(frame.getAttribute("data-course-mode")).toBe("page");
    expect(frame.getAttributeNames().sort()).toEqual([
      "aria-label",
      "class",
      "data-course-mode",
      "data-course-surface-view",
      "data-overflow-mode",
      "data-surface-size",
    ]);
    expect(frame.className).toBe("scaffold-runtime-surface-view");
    expect(frame.getAttribute("data-overflow-mode")).toBe("grow");
    expect(frame.getAttribute("data-surface-size")).toBe("fluid");
  });

  it("renders slideshow documents as runtime-owned slide canvases", () => {
    render(
      <RuntimeSurfaceView
        settings={{
          mode: "slideshow",
          overflowMode: "fit",
          surfaceSize: "16x9",
        }}
      >
        <section data-surface data-testid="surface">
          Runtime slide content
        </section>
      </RuntimeSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Slide canvas" });

    expect(frame.getAttribute("data-course-surface-view")).toBe("runtime");
    expect(frame.getAttribute("data-course-mode")).toBe("slideshow");
    expect(frame.getAttribute("data-surface-size")).toBe("16x9");
    expect(frame.getAttribute("data-overflow-mode")).toBe("fit");
    expect(frame.className).toBe("scaffold-runtime-surface-view");
    expect(frame.style.getPropertyValue("--sc-slideshow-canvas-width")).toBe("1024px");
    expect(frame.style.getPropertyValue("--sc-slideshow-canvas-height")).toBe("576px");
  });

  it("preserves child-owned alignment semantics inside the runtime canvas", () => {
    render(
      <RuntimeSurfaceView
        settings={{
          mode: "slideshow",
          overflowMode: "fit",
          surfaceSize: "16x9",
        }}
      >
        <section data-surface>
          <h1 data-text-align="right">Aligned title</h1>
          <p data-text-align="left">Independent subtitle</p>
        </section>
      </RuntimeSurfaceView>,
    );

    expect(
      screen.getByRole("heading", { name: "Aligned title" }).getAttribute("data-text-align"),
    ).toBe("right");
    expect(screen.getByText("Independent subtitle").getAttribute("data-text-align")).toBe("left");
  });

  it("keeps branching canvases fluid without slideshow dimensions", () => {
    render(
      <RuntimeSurfaceView
        settings={{ mode: "branching", overflowMode: "clip", surfaceSize: "fluid" }}
      >
        <section data-surface>Branching content</section>
      </RuntimeSurfaceView>,
    );

    const frame = screen.getByRole("region", { name: "Screen canvas" });
    expect(frame.getAttribute("data-surface-size")).toBe("fluid");
    expect(frame.getAttribute("style")).toBeNull();
  });
});
