import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/styles/globals.css";

type BoundedOwner = "cell" | "region" | "section";
type RendererKind = "authoring" | "runtime";

interface MountedRenderer {
  editor: TiptapEditor;
  host: HTMLElement;
  kind: RendererKind;
}

interface MountedPair {
  authoring: MountedRenderer;
  runtime: MountedRenderer;
  dispose: () => void;
}

const mountedPairs: MountedPair[] = [];

afterEach(() => {
  for (const pair of mountedPairs.splice(0)) pair.dispose();
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
});

describe("Gallery container geometry", () => {
  it.each([
    { owner: "region" as const, expectedLayout: "4x1" },
    { owner: "section" as const, expectedLayout: "4x1" },
    { owner: "cell" as const, expectedLayout: "2x2" },
  ])(
    "fills a bounded $owner equally in authoring and runtime",
    async ({ owner, expectedLayout }) => {
      const pair = await mountPair(boundedGalleryDocument(owner, "grid"), `gallery-${owner}`, true);
      mountedPairs.push(pair);
      await waitForGridLayout(pair);

      const authoring = measureGrid(pair.authoring);
      const runtime = measureGrid(pair.runtime);

      expect(authoring.frame.getAttribute("data-bounded-placement")).toBe("fill");
      expect(runtime.frame.getAttribute("data-bounded-placement")).toBe("fill");
      expect(authoring.grid.getAttribute("data-gallery-grid-layout")).toBe(expectedLayout);
      expect(runtime.grid.getAttribute("data-gallery-grid-layout")).toBe(expectedLayout);
      expectUniformCells(authoring.cells);
      expectUniformCells(runtime.cells);
      expect(authoring.objectFits).toEqual(["contain", "contain", "contain", "contain"]);
      expect(runtime.objectFits).toEqual(authoring.objectFits);
      expect(authoring.grid.scrollHeight).toBeLessThanOrEqual(authoring.grid.clientHeight + 1);
      expect(runtime.grid.scrollHeight).toBeLessThanOrEqual(runtime.grid.clientHeight + 1);
      expect(authoring.shell.scrollHeight).toBeLessThanOrEqual(authoring.shell.clientHeight + 1);
      expect(runtime.shell.scrollHeight).toBeLessThanOrEqual(runtime.shell.clientHeight + 1);
      expect(authoring.grid.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        authoring.caption.getBoundingClientRect().top + 1,
      );
      expect(runtime.grid.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        runtime.caption.getBoundingClientRect().top + 1,
      );
      expectRectSizeParity(authoring.cells[0]!, runtime.cells[0]!);
      expect(authoring.grid.querySelectorAll('[role="listitem"]')).toHaveLength(4);
      expect(runtime.grid.querySelectorAll('[role="listitem"]')).toHaveLength(4);
      expect(authoring.frame.querySelector(".sc-gallery__grid-add")).not.toBeNull();
      expect(authoring.grid.querySelector(".sc-gallery__grid-add")).toBeNull();
      expect(runtime.frame.querySelector(".sc-gallery__grid-add")).toBeNull();
    },
  );

  it("grows an unbounded page, caps wide rows at four, and responds to container width", async () => {
    const pair = await mountPair(unboundedGalleryDocument(), "gallery-page", true);
    mountedPairs.push(pair);
    const samples = [measureGrid(pair.authoring), measureGrid(pair.runtime)];

    for (const sample of samples) {
      sample.frame.style.width = "1000px";
      sample.frame.style.maxWidth = "none";
    }
    await nextLayoutFrames(2);

    for (const sample of samples) {
      expect(sample.frame.getAttribute("data-bounded-placement")).toBeNull();
      expect(sample.grid.getAttribute("data-gallery-grid-layout")).toBeNull();
      expect(trackCount(sample.cells)).toBe(4);
      expect(rowCount(sample.cells)).toBe(3);
      expectUniformCells(sample.cells);
      expect(sample.objectFits.every((value) => value === "contain")).toBe(true);
      expect(sample.grid.scrollHeight).toBe(sample.grid.clientHeight);
      const tileButton = requiredElement<HTMLElement>(sample.cells[0]!, ".sc-gallery__tile-button");
      const tileRect = tileButton.getBoundingClientRect();
      expect(getComputedStyle(tileButton).aspectRatio).toBe("auto");
      expect(Math.abs(tileRect.width - tileRect.height)).toBeGreaterThan(16);
    }

    for (const sample of samples) sample.frame.style.width = "500px";
    await nextLayoutFrames(2);

    for (const sample of samples) {
      expect(trackCount(sample.cells)).toBe(2);
      expect(rowCount(sample.cells)).toBe(5);
      expect(columnGap(sample.cells)).toBeCloseTo(8, 0);
    }
  });

  it("uses the dashed block-slot add affordance only in authoring", async () => {
    const pair = await mountPair(unboundedGalleryDocument(), "gallery-page", true);
    mountedPairs.push(pair);
    await nextLayoutFrames(2);

    const authoringFrame = galleryFrame(pair.authoring);
    const addAction = requiredElement<HTMLElement>(authoringFrame, ".sc-gallery__grid-add-action");
    const style = getComputedStyle(addAction);

    expect(style.borderStyle).toBe("dashed");
    expect(style.boxShadow).toBe("none");
    expect(addAction.querySelector(".sc-ghost-add__icon")).not.toBeNull();
    expect(galleryFrame(pair.runtime).querySelector(".sc-gallery__grid-add-action")).toBeNull();
  });

  it("scores narrow bounded tracks with the effective eight-pixel gap", async () => {
    const pair = await mountPair(boundedGalleryDocument("region", "grid"), "gallery-region", true);
    mountedPairs.push(pair);
    await waitForGridLayout(pair);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const composition = requiredElement<HTMLElement>(
        galleryFrame(mounted),
        ".sc-gallery__grid-composition",
      );
      composition.style.width = "320px";
      composition.style.height = "210px";
    }

    await waitForCondition(() =>
      [pair.authoring, pair.runtime].every(
        (mounted) =>
          requiredElement<HTMLElement>(galleryFrame(mounted), ".sc-gallery__grid").dataset[
            "galleryGridLayout"
          ] === "3x2",
      ),
    );

    for (const mounted of [pair.authoring, pair.runtime]) {
      const grid = requiredElement<HTMLElement>(galleryFrame(mounted), ".sc-gallery__grid");
      expect(Number.parseFloat(getComputedStyle(grid).columnGap)).toBeCloseTo(8, 0);
      expect(grid.dataset["galleryGridLayout"]).toBe("3x2");
    }
  });

  it("contains the bounded Carousel stage and keeps thumbnails outside its flexible stage", async () => {
    const pair = await mountPair(
      boundedGalleryDocument("region", "carousel"),
      "gallery-carousel",
      true,
    );
    mountedPairs.push(pair);
    await nextLayoutFrames(3);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frame = galleryFrame(mounted);
      const shell = requiredElement<HTMLElement>(frame, ".sc-gallery__shell");
      const composition = requiredElement<HTMLElement>(frame, ".sc-gallery__composition");
      const stage = requiredElement<HTMLElement>(frame, ".sc-gallery__stage");
      const image = requiredElement<HTMLElement>(frame, ".sc-gallery__stage-image");
      const thumbs = requiredElement<HTMLElement>(frame, ".sc-gallery__thumbs");

      expect(frame.getAttribute("data-bounded-placement")).toBe("fill");
      expect(getComputedStyle(image).objectFit).toBe("contain");
      expect(stage.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        thumbs.getBoundingClientRect().top + 1,
      );
      expect(thumbs.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        composition.getBoundingClientRect().bottom + 1,
      );
      expect(shell.scrollHeight).toBeLessThanOrEqual(shell.clientHeight + 1);
      expect(getComputedStyle(thumbs).flexWrap).toBe("nowrap");
    }
  });
});

function boundedGalleryDocument(owner: BoundedOwner, layout: "carousel" | "grid"): JSONContent {
  const surfaceId = `gallery-${owner}`;
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Slide content fixture is missing its Region.");

  const gallery = galleryNode(layout, layout === "carousel" ? 8 : 4);
  if (owner === "region") {
    region.content = [gallery];
  } else if (owner === "section") {
    region.content = [
      {
        type: "layout",
        attrs: {
          id: "gallery-tabs",
          variant: "tabs",
          options: { variant: "default", label: "Gallery tabs" },
        },
        content: [
          {
            type: "section",
            attrs: {
              id: "gallery-tab",
              role: "tab-panel",
              label: "Gallery",
              options: { label: "Gallery" },
            },
            content: [gallery],
          },
        ],
      },
    ];
  } else {
    region.content = [
      {
        type: "grid",
        attrs: { id: "gallery-host-grid", columnWidths: [1, 1] },
        content: [
          {
            type: "cell",
            attrs: { id: "gallery-host-cell" },
            content: [gallery],
          },
          {
            type: "cell",
            attrs: { id: "gallery-support-cell" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Support" }] }],
          },
        ],
      },
    ];
  }

  const content = createScaffoldDocumentContent({ mode: "slideshow", surfaceId });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture has no courseDocument.");
  courseDocument.content = [surface];
  return content;
}

function unboundedGalleryDocument(): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "gallery-page" });
  const surface = content.content?.[0]?.content?.[0];
  if (!surface) throw new Error("Page fixture has no Surface.");
  surface.content = [galleryNode("grid", 9)];
  return content;
}

function galleryNode(layout: "carousel" | "grid", itemCount: number): JSONContent {
  return {
    type: "gallery",
    attrs: {
      id: `gallery-${layout}`,
      data: {
        type: "gallery",
        layout,
        caption: richText("Shared Gallery caption"),
      },
    },
    content: Array.from({ length: itemCount }, (_, index) => ({
      type: "gallery_item",
      attrs: {
        id: `gallery-item-${index + 1}`,
        data: {
          image: {
            mode: "external",
            src: `https://example.com/gallery-${index + 1}.jpg`,
            alt: `Gallery image ${index + 1}`,
          },
          caption: richText(`Image ${index + 1} caption`),
        },
      },
    })),
  };
}

function richText(text: string): JSONContent {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function mountPair(
  initialContent: JSONContent,
  surfaceId: string,
  editable: boolean,
): Promise<MountedPair> {
  const ydoc = new Y.Doc();
  initializeAuthoringCourseDocumentFragment(ydoc, cloneJSON(initialContent));
  const outer = document.createElement("div");
  outer.style.width = "1024px";
  document.body.append(outer);
  const authoringHost = rendererHost("authoring");
  const runtimeHost = rendererHost("runtime");
  outer.append(authoringHost, runtimeHost);
  const authoringRoot = createRoot(authoringHost);
  const runtimeRoot = createRoot(runtimeHost);
  let authoringEditor: TiptapEditor | null = null;
  let runtimeEditor: TiptapEditor | null = null;

  authoringRoot.render(
    <CourseDocumentEditor
      document={ydoc}
      editable={editable}
      onReady={(editor) => {
        authoringEditor = editor;
      }}
    />,
  );
  runtimeRoot.render(
    <CourseDocumentRuntimeRenderer
      initialContent={cloneJSON(initialContent)}
      visibleSurfaceId={surfaceId}
      onReady={(editor) => {
        runtimeEditor = editor;
      }}
    />,
  );

  await waitForCondition(
    () =>
      authoringEditor !== null &&
      runtimeEditor !== null &&
      authoringHost.querySelector(".sc-gallery") &&
      runtimeHost.querySelector(".sc-gallery"),
  );
  if (!authoringEditor || !runtimeEditor)
    throw new Error("Gallery browser editors were not ready.");
  await nextLayoutFrames(2);

  let disposed = false;
  return {
    authoring: { editor: authoringEditor, host: authoringHost, kind: "authoring" },
    runtime: { editor: runtimeEditor, host: runtimeHost, kind: "runtime" },
    dispose() {
      if (disposed) return;
      disposed = true;
      authoringRoot.unmount();
      runtimeRoot.unmount();
      authoringEditor?.destroy();
      runtimeEditor?.destroy();
      ydoc.destroy();
      outer.remove();
    },
  };
}

function rendererHost(kind: RendererKind): HTMLElement {
  const host = document.createElement("div");
  host.dataset["galleryRenderer"] = kind;
  host.style.width = "1024px";
  host.style.height = "576px";
  if (kind === "runtime")
    host.className = "sc-slideshow-player__viewport sc-slideshow-player__canvas";
  return host;
}

function measureGrid(mounted: MountedRenderer) {
  const frame = galleryFrame(mounted);
  const grid = requiredElement<HTMLElement>(frame, ".sc-gallery__grid");
  return {
    frame,
    grid,
    shell: requiredElement<HTMLElement>(frame, ".sc-gallery__shell"),
    caption: requiredElement<HTMLElement>(frame, ".sc-gallery__shared-caption"),
    cells: Array.from(grid.querySelectorAll<HTMLElement>(".sc-gallery__tile")),
    objectFits: Array.from(
      grid.querySelectorAll<HTMLElement>(".sc-gallery__tile-image"),
      (image) => getComputedStyle(image).objectFit,
    ),
  };
}

function galleryFrame(mounted: MountedRenderer): HTMLElement {
  const frameSelector =
    mounted.kind === "authoring"
      ? '.sc-gallery[data-authoring-frame="block"]'
      : '.sc-gallery[data-runtime-frame="block"]';
  return requiredElement(mounted.host, frameSelector);
}

async function waitForGridLayout(pair: MountedPair): Promise<void> {
  await waitForCondition(() =>
    [pair.authoring, pair.runtime].every(
      (mounted) =>
        galleryFrame(mounted)
          .querySelector(".sc-gallery__grid")
          ?.hasAttribute("data-gallery-grid-layout") === true,
    ),
  );
}

function expectUniformCells(cells: readonly HTMLElement[]) {
  expect(cells.length).toBeGreaterThan(0);
  const first = cells[0]!.getBoundingClientRect();
  for (const cell of cells) {
    const rect = cell.getBoundingClientRect();
    expect(rect.width).toBeCloseTo(first.width, 0);
    expect(rect.height).toBeCloseTo(first.height, 0);
  }
}

function expectRectSizeParity(authoring: HTMLElement, runtime: HTMLElement) {
  const authoringRect = authoring.getBoundingClientRect();
  const runtimeRect = runtime.getBoundingClientRect();
  expect(relativeDifference(authoringRect.width, runtimeRect.width)).toBeLessThanOrEqual(0.04);
  expect(relativeDifference(authoringRect.height, runtimeRect.height)).toBeLessThanOrEqual(0.04);
}

function relativeDifference(first: number, second: number): number {
  return Math.abs(first - second) / Math.max(first, second);
}

function trackCount(cells: readonly HTMLElement[]): number {
  return new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().left))).size;
}

function rowCount(cells: readonly HTMLElement[]): number {
  return new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))).size;
}

function columnGap(cells: readonly HTMLElement[]): number {
  const first = cells[0]?.getBoundingClientRect();
  const second = cells[1]?.getBoundingClientRect();
  if (!first || !second) throw new Error("Need two Gallery cells to measure a gap.");
  return second.left - first.right;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for Gallery browser state.");
    await nextLayoutFrames(1);
  }
}

async function nextLayoutFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
