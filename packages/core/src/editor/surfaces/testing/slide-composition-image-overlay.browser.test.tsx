import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import {
  expectCompositionGeometry,
  expectCompositionRendererParity,
  measureCompositionGeometry,
  renderCompositionStateCase,
  type RenderedCompositionStateCase,
} from "./slide-composition-browser-harness";
import { expandSlideCompositionCases } from "./slide-composition-cases";

const IMAGE_OVERLAY_STATES = expandSlideCompositionCases().filter((state) =>
  ["full-bleed-image", "image-backdrop-panel"].includes(state.composition),
);

let rendered: RenderedCompositionStateCase | null = null;

afterEach(() => {
  rendered?.dispose();
  rendered = null;
});

describe("Image overlay composition geometry", () => {
  it.each(IMAGE_OVERLAY_STATES)(
    "$composition title=$title orientation=$orientation proportion=$proportion",
    async (state) => {
      rendered = await renderCompositionStateCase(state, {
        backgroundImageUrl: "https://example.test/overlay.png",
      });
      rendered.runtime.host.style.padding = "0";
      const authoringDocument = rendered.authoring.editor.getJSON();
      const runtimeDocument = rendered.runtime.editor.getJSON();
      const authoring = measureCompositionGeometry(rendered.authoring, state);
      const runtime = measureCompositionGeometry(rendered.runtime, state);

      expectAuthoringSurfaceToMatchStageRadius(rendered.authoring.host);
      expectSurfaceBackgroundWithoutImageSlot(rendered.authoring.host);
      expectSurfaceBackgroundWithoutImageSlot(rendered.runtime.host);
      expectOverlayPanelRadius(rendered.authoring.host);
      expectOverlayPanelRadius(rendered.runtime.host);
      expectExplicitSurfaceGridPlacement(rendered.authoring.host, state);
      expectExplicitSurfaceGridPlacement(rendered.runtime.host, state);
      expectCompositionGeometry(authoring);
      expectCompositionGeometry(runtime);
      expectCompositionRendererParity(authoring, runtime);
      expect(rendered.authoring.editor.getJSON()).toEqual(authoringDocument);
      expect(rendered.runtime.editor.getJSON()).toEqual(runtimeDocument);
    },
  );
});

function expectAuthoringSurfaceToMatchStageRadius(host: HTMLElement): void {
  const stage = host.querySelector<HTMLElement>("[data-authoring-surface-stage]");
  const surface = stage?.querySelector<HTMLElement>(":scope > [data-surface]");

  if (!stage || !surface) {
    throw new Error("Expected an authoring stage with one direct slide surface.");
  }

  const stageRadius = Number.parseFloat(globalThis.getComputedStyle(stage).borderRadius);
  const surfaceRadius = Number.parseFloat(globalThis.getComputedStyle(surface).borderRadius);
  const scale = new DOMMatrixReadOnly(globalThis.getComputedStyle(surface).transform).a;

  expect(surfaceRadius * scale).toBeCloseTo(stageRadius, 2);
}

function expectSurfaceBackgroundWithoutImageSlot(host: HTMLElement): void {
  const surface = host.querySelector<HTMLElement>("[data-surface]");

  if (!surface) {
    throw new Error("Expected one slide surface with a background image.");
  }

  expect(surface.getAttribute("data-surface-background-image")).toBe("");
  expect(globalThis.getComputedStyle(surface).backgroundImage).not.toBe("none");
  expect(globalThis.getComputedStyle(surface).borderRadius).not.toBe("0px");
  expect(surface.querySelector("[data-image-role]")).toBeNull();
}

function expectOverlayPanelRadius(host: HTMLElement): void {
  const surface = host.querySelector<HTMLElement>("[data-surface]");
  const semanticContentHost = surface?.querySelector<HTMLElement>("[data-surface-content]");
  const panel = semanticContentHost?.parentElement?.hasAttribute("data-node-view-content-react")
    ? semanticContentHost.parentElement
    : semanticContentHost;

  if (!panel) {
    throw new Error("Expected the overlay surface to have one content panel.");
  }

  expect(globalThis.getComputedStyle(panel).borderRadius).not.toBe("0px");
}

function expectExplicitSurfaceGridPlacement(
  host: HTMLElement,
  state: (typeof IMAGE_OVERLAY_STATES)[number],
): void {
  const surface = host.querySelector<HTMLElement>("[data-surface]");
  const semanticContentHost = surface?.querySelector<HTMLElement>("[data-surface-content]");
  const contentHost = semanticContentHost?.parentElement?.hasAttribute(
    "data-node-view-content-react",
  )
    ? semanticContentHost.parentElement
    : semanticContentHost;

  if (!surface || !contentHost) {
    throw new Error("Expected one image overlay surface with a direct content host.");
  }

  const contentStyle = globalThis.getComputedStyle(contentHost);
  expect(contentStyle.gridRowStart).toBe("1");

  if (state.composition === "image-backdrop-panel") {
    expect(contentStyle.gridColumnStart).toBe(state.orientation === "reversed" ? "1" : "2");
    return;
  }

  expect(contentStyle.gridColumnStart).toBe("1");
  expect(contentStyle.gridColumnEnd).toBe("-1");
}
