import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { fireEvent } from "@testing-library/react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import {
  projectCourseStructure,
  type ProjectedSlideshowCourseStructure,
} from "@/document/model/course-structure";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { projectDragDropLearnerNode } from "@/editor/assessment/drag-drop/assessment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import type { MediaPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { assessmentProblemOutcome } from "@/runtime/assessment/test-utils";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { checkRuntimeDocumentReadiness } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/styles/globals.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

const mountedRoots: Root[] = [];
const runtimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("full-slide Drag and Drop presentation", () => {
  it("uses a slide-native dense layout and preserves keyboard state across player changes", async () => {
    await page.viewport(1100, 700);
    const host = mountRuntimeSlide();
    await waitForCondition(
      () => host.querySelector('[data-drag-drop-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    await waitForCondition(
      () => (host.querySelector<HTMLImageElement>("img")?.naturalWidth ?? 0) > 0,
    );

    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-drag-drop-question-surface-runtime-view",
    );
    const interaction = requiredElement<HTMLElement>(
      surface,
      '[data-drag-drop-presentation="full-slide"]',
    );
    const layout = requiredElement<HTMLElement>(
      interaction,
      ".sc-course-drag-drop-interaction__layout",
    );
    const stage = requiredElement<HTMLElement>(layout, ".sc-course-drag-drop-stage");
    const tray = requiredElement<HTMLElement>(layout, ".sc-course-drag-drop-tray");

    expect(surface.querySelector('[data-node="drag_drop"]')).toBeNull();
    expect(surface.querySelector(".sc-block-frame")).toBeNull();
    expect(interaction.getBoundingClientRect().width).toBeGreaterThan(
      surface.getBoundingClientRect().width * 0.9,
    );
    expect(stage.getBoundingClientRect().width).toBeGreaterThan(
      tray.getBoundingClientRect().width * 1.5,
    );
    expect(getComputedStyle(tray).overflowY).toBe("auto");
    expect(tray.scrollHeight).toBeGreaterThanOrEqual(tray.clientHeight);
    expect(surface.querySelectorAll(".sc-course-drag-drop-source")).toHaveLength(12);

    const first = requiredElement<HTMLButtonElement>(surface, '[aria-label*="Marker 1"]');
    await waitForCondition(() => !first.disabled);
    first.focus();
    fireEvent.keyDown(first, { code: "Enter", key: "Enter" });
    await waitForCondition(
      () => surface.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]") !== null,
    );
    const cursor = requiredElement<HTMLElement>(surface, "[data-drag-drop-keyboard-cursor]");
    fireEvent.keyDown(cursor, { code: "ArrowRight", key: "ArrowRight" });
    fireEvent.keyDown(cursor, { code: "Enter", key: "Enter" });
    await waitForCondition(() => surface.textContent?.includes("1 of 12 markers placed") === true);

    const placedBefore = requiredElement<HTMLElement>(surface, ".sc-course-drag-drop-marker");
    const placementBefore = {
      left: placedBefore.style.left,
      top: placedBefore.style.top,
    };
    expect(placementBefore.left).toMatch(/%$/);
    const stageWidthBefore = stage.getBoundingClientRect().width;
    const inverseScaleBefore = readSlideshowInverseScale(host);

    // Real mounted resize: shrink the host so the player recomputes a non-1
    // slideshow scale and the spatial surface reflows through ResizeObserver.
    host.style.width = "640px";
    host.style.height = "360px";
    await waitForCondition(
      () => Math.abs(stage.getBoundingClientRect().width - stageWidthBefore) > 20,
    );
    normalizePlayerGeometry(host);
    const inverseScaleAfter = await waitForInverseScaleChange(host, inverseScaleBefore);

    expect(inverseScaleAfter).toBeGreaterThan(1.2);
    expect(surface.textContent).toContain("1 of 12 markers placed");
    expect(surface.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(1);
    const placedAfter = requiredElement<HTMLElement>(surface, ".sc-course-drag-drop-marker");
    expect(placedAfter.style.left).toBe(placementBefore.left);
    expect(placedAfter.style.top).toBe(placementBefore.top);
    expectMarkerInsideImage(surface, placedAfter);

    // A new keyboard placement after the resize proves conversion still uses
    // live image geometry rather than a stale pre-resize rectangle.
    const second = requiredElement<HTMLButtonElement>(surface, '[aria-label*="Marker 2"]');
    await waitForCondition(() => !second.disabled);
    second.focus();
    fireEvent.keyDown(second, { code: "Enter", key: "Enter" });
    await waitForCondition(
      () => surface.querySelector<HTMLElement>("[data-drag-drop-keyboard-cursor]") !== null,
    );
    const secondCursor = requiredElement<HTMLElement>(surface, "[data-drag-drop-keyboard-cursor]");
    fireEvent.keyDown(secondCursor, { code: "ArrowLeft", key: "ArrowLeft" });
    fireEvent.keyDown(secondCursor, { code: "Enter", key: "Enter" });
    await waitForCondition(() => surface.textContent?.includes("2 of 12 markers placed") === true);
    expect(surface.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(2);

    // Fullscreen signal paired with the real reflow above: state survives.
    // When the browser grants fullscreen, the same assertions run while the
    // slide is genuinely fullscreen rather than only after a bare event.
    document.dispatchEvent(new Event("fullscreenchange"));
    await attemptRealFullscreen(host, () => {
      expect(surface.textContent).toContain("2 of 12 markers placed");
      expect(surface.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(2);
    });
    expect(surface.textContent).toContain("2 of 12 markers placed");
    expect(surface.querySelectorAll(".sc-course-drag-drop-marker")).toHaveLength(2);
  });

  it("keeps the full-slide layout inside the slide bounds at a small player scale", async () => {
    // The slideshow canvas always lays out at its intrinsic size under a
    // scale transform, so container queries cannot fire here. What matters at
    // a small scale is that the stage/tray arrangement stays inside the slide
    // with a scrollable tray instead of overflowing it.
    await page.viewport(700, 440);
    const host = mountRuntimeSlide({ height: 360, width: 640 });
    await waitForCondition(
      () => host.querySelector('[data-drag-drop-presentation="full-slide"]') !== null,
    );
    normalizePlayerGeometry(host);
    await waitForCondition(
      () => (host.querySelector<HTMLImageElement>("img")?.naturalWidth ?? 0) > 0,
    );

    const surface = requiredElement<HTMLElement>(
      host,
      ".sc-slide-drag-drop-question-surface-runtime-view",
    );
    const layout = requiredElement<HTMLElement>(
      surface,
      '[data-drag-drop-presentation="full-slide"] .sc-course-drag-drop-interaction__layout',
    );
    const tray = requiredElement<HTMLElement>(layout, ".sc-course-drag-drop-tray");
    const stage = requiredElement<HTMLElement>(layout, ".sc-course-drag-drop-stage");

    expect(trackCount(getComputedStyle(layout).gridTemplateColumns)).toBe(2);
    expect(stage.getBoundingClientRect().width).toBeGreaterThan(
      tray.getBoundingClientRect().width * 1.5,
    );
    expect(getComputedStyle(tray).overflowY).toBe("auto");
    expect(surface.scrollWidth).toBeLessThanOrEqual(surface.clientWidth + 1);
    expect(surface.scrollHeight).toBeLessThanOrEqual(surface.clientHeight + 1);
  });
});

function mountRuntimeSlide({
  height = 576,
  width = 1024,
}: { height?: number; width?: number } = {}): HTMLElement {
  const host = document.createElement("div");
  host.style.cssText = `position:absolute;inset:0 auto auto 0;width:${width}px;height:${height}px;`;
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  const content = dragDropQuestionDocument();
  const readiness = checkRuntimeDocumentReadiness(content, runtimeComposition, {
    scaffoldPlusAuthorized: false,
  });
  if (readiness.status !== "supported") {
    throw new Error(`Expected supported Drag and Drop fixture: ${JSON.stringify(readiness)}`);
  }

  root.render(
    <ScaffoldServicesProvider
      ports={{
        assessment: {
          type: "runtime",
          submit: async (request) =>
            assessmentProblemOutcome(
              { feedback: null, isCorrect: true, score: { scaled: 1 }, items: {} },
              { response: request.response },
            ),
        },
        media: testMediaPort(),
      }}
    >
      <CourseThemeProvider appearance="light" theme={courseTheme()}>
        <ScaffoldArtifactIdentityProvider artifactId="artifact-1">
          <AssessmentRuntimeProvider>
            <SlideshowPlayer
              artifactId="artifact-1"
              preparedDocument={readiness.preparedDocument}
              structure={requireStructure(content)}
            />
          </AssessmentRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </CourseThemeProvider>
    </ScaffoldServicesProvider>,
  );
  return host;
}

function dragDropQuestionDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-drag-drop-question");
  if (!definition) throw new Error("Expected Drag and Drop Surface definition.");
  const surface = definition.createSurface({ surfaceId: createEmbeddedNodeId() });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Drag and Drop question.");
  const markers = Array.from({ length: 12 }, (_, index) => ({
    id: `marker0000${String(index + 1).padStart(2, "0")}`,
    label: `Marker ${index + 1}`,
    visualOverride: null,
  }));
  const authored = {
    ...question,
    attrs: {
      ...question.attrs,
      id: "target000001",
      assessment: {
        correctPlacements: markers.map((marker, index) => ({
          markerId: marker.id,
          geometry: {
            kind: "circle",
            centerX: 10 + (index % 4) * 25,
            centerY: 20 + Math.floor(index / 4) * 30,
            radius: 5,
          },
        })),
        feedbackByMarkerId: {},
        summaryFeedback: null,
      },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "drag_drop_canvas"
        ? {
            ...child,
            attrs: {
              id: "canvas000001",
              data: {
                image: { mode: "managed", mediaId: "media0000001", alt: "Dense map" },
                imageAspectRatio: 16 / 9,
                defaultMarkerVisual: { kind: "preset", preset: "dot" },
                markers,
              },
            },
          }
        : child,
    ),
  };

  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface00001",
    initialCourseSectionTitle: "Assessment",
  });
  const courseDocument = document.content?.[0];
  const section = courseDocument?.content?.find((child) => child.type === "courseSection");
  if (courseDocument?.type !== "courseDocument" || !section) {
    throw new Error("Expected a Slideshow document fixture.");
  }
  courseDocument.content = [
    section,
    { ...surface, content: [projectDragDropLearnerNode(authored)] },
  ];
  normalizeRuntimeFixtureIds(document);
  return document;
}

function normalizePlayerGeometry(host: HTMLElement) {
  requiredElement<HTMLElement>(host, ".sc-course").style.cssText +=
    "width:100%;height:100%;min-height:0;";
  requiredElement<HTMLElement>(host, ".sc-slideshow-player").style.cssText +=
    "width:100%;height:100%;min-height:0;";
  requiredElement<HTMLElement>(host, ".sc-slideshow-player__viewport").style.padding = "0";
}

function requireStructure(content: JSONContent): ProjectedSlideshowCourseStructure {
  const structure = projectCourseStructure(content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected slideshow structure.");
  }
  return structure;
}

function testMediaPort(): MediaPort {
  return {
    resolve: async () =>
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'/>",
    upload: async () => {
      throw new Error("Uploads are unavailable in this fixture.");
    },
  };
}

function courseTheme() {
  return {
    schemaVersion: 1 as const,
    design: { id: "scaffold-flow", revision: "1" },
    colourSystem: { id: "scaffold-indigo", revision: "1" },
    overrides: {},
  };
}

function normalizeRuntimeFixtureIds(content: JSONContent): void {
  const seen = new Set<string>();
  const stack = [content];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.["id"];
      if (!EmbeddedNodeIdSchema.safeParse(id).success || seen.has(String(id))) {
        node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
      }
      seen.add(String(node.attrs?.["id"]));
    }
    stack.push(...(node.content ?? []));
  }
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

function readSlideshowInverseScale(host: HTMLElement): number {
  const canvas = requiredElement<HTMLElement>(host, ".sc-slideshow-player__canvas");
  const raw = canvas.style.getPropertyValue("--sc-slideshow-canvas-inverse-scale");
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Expected a numeric slideshow inverse scale, received: ${raw}`);
  }
  return value;
}

async function waitForInverseScaleChange(host: HTMLElement, before: number): Promise<number> {
  const started = Date.now();
  while (Date.now() - started < 5_000) {
    const current = readSlideshowInverseScale(host);
    if (Math.abs(current - before) > 0.01) return current;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error("Timed out waiting for the slideshow scale to recompute after resize.");
}

function expectMarkerInsideImage(surface: HTMLElement, marker: HTMLElement): void {
  const image = requiredElement<HTMLImageElement>(surface, ".sc-course-drag-drop-stage img");
  const imageRect = image.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();
  const centerX = markerRect.left + markerRect.width / 2;
  const centerY = markerRect.top + markerRect.height / 2;
  expect(centerX).toBeGreaterThanOrEqual(imageRect.left - 1);
  expect(centerX).toBeLessThanOrEqual(imageRect.right + 1);
  expect(centerY).toBeGreaterThanOrEqual(imageRect.top - 1);
  expect(centerY).toBeLessThanOrEqual(imageRect.bottom + 1);
}

async function attemptRealFullscreen(host: HTMLElement, assert: () => void): Promise<void> {
  try {
    await host.requestFullscreen();
  } catch {
    return;
  }
  if (document.fullscreenElement !== host) return;
  try {
    assert();
  } finally {
    try {
      await document.exitFullscreen();
    } catch {
      // Leaving fullscreen is best-effort; the mounted assertions already ran.
    }
  }
}

function trackCount(gridTemplateColumns: string): number {
  return gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
}

async function waitForCondition(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out waiting for condition.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
