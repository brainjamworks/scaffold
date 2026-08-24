import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
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
const mountedStyles: HTMLStyleElement[] = [];
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  for (const pair of mountedPairs.splice(0)) pair.dispose();
  for (const style of mountedStyles.splice(0)) style.remove();
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
});

describe("Gallery container geometry", () => {
  it("allows adapter-layer overrides without losing shell geometry", () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-course-gallery__shell {
          gap: 1px;
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const shell = document.createElement("div");
    shell.className = "sc-course-gallery__shell";
    document.body.append(shell);

    const style = getComputedStyle(shell);
    expect(style.display).toBe("flex");
    expect(style.flexDirection).toBe("column");
    expect(style.gap).toBe("1px");
  });

  it("keeps the empty-state composition structured without a Course recipe", async () => {
    const pair = await mountPair(unboundedEmptyGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    setPairCourseDesign(pair, "none");
    await nextLayoutFrames(2);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frame = galleryFrame(mounted);
      const empty = requiredElement<HTMLElement>(frame, ".sc-course-gallery__empty");
      const text = requiredElement<HTMLElement>(frame, ".sc-course-gallery__empty-text");

      expect(getComputedStyle(empty).display).toBe("grid");
      expect(getComputedStyle(empty).gridTemplateColumns.split(" ")).toHaveLength(3);
      expect(getComputedStyle(empty).alignItems).toBe("center");
      expect(getComputedStyle(text).display).toBe("flex");
      expect(getComputedStyle(text).flexDirection).toBe("column");
    }
  });

  it("keeps unbounded grid geometry functional without a Course recipe", async () => {
    const pair = await mountPair(unboundedGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    setPairCourseDesign(pair, "none");

    const samples = [measureGrid(pair.authoring), measureGrid(pair.runtime)];
    for (const sample of samples) {
      sample.frame.style.width = "1000px";
      sample.frame.style.maxWidth = "none";
    }
    await nextLayoutFrames(2);

    for (const sample of samples) {
      expect(trackCount(sample.cells)).toBe(4);
      const tileButton = requiredElement<HTMLElement>(
        sample.cells[0]!,
        ".sc-course-gallery__tile-button",
      );
      expect(tileButton.getBoundingClientRect().height).toBeCloseTo(192, 0);
    }
  });

  it("keeps carousel media geometry functional without a Course recipe", async () => {
    const pair = await mountPair(unboundedGalleryDocument("carousel"), "gallerypage1", true);
    mountedPairs.push(pair);
    setPairCourseDesign(pair, "none");
    await nextLayoutFrames(2);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frame = galleryFrame(mounted);
      const thumb = frame.querySelector<HTMLElement>(".sc-course-gallery__thumb");
      const stageImage = requiredElement<HTMLElement>(frame, ".sc-course-gallery__stage-image");
      if (!thumb) throw new Error("Expected at least one Gallery thumbnail.");

      expect(thumb.getBoundingClientRect().width).toBeCloseTo(68, 0);
      expect(thumb.getBoundingClientRect().height).toBeCloseTo(68, 0);
      expect(getComputedStyle(stageImage).maxHeight).toBe("448px");
    }
  });

  it("gives the Pocket Atlas empty state a complete Course recipe", async () => {
    const pair = await mountPair(unboundedEmptyGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    setPairCourseDesign(pair, "pocket");
    await nextLayoutFrames(2);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frame = galleryFrame(mounted);
      const empty = requiredElement<HTMLElement>(frame, ".sc-course-gallery__empty");
      const title = requiredElement<HTMLElement>(frame, ".sc-course-gallery__empty-title");
      const emptyStyle = getComputedStyle(empty);

      expect(emptyStyle.borderTopWidth).toBe("2px");
      expect(emptyStyle.borderRadius).toBe("0px");
      expect(emptyStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(emptyStyle.boxShadow).not.toBe("none");
      expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
    }
  });

  it.each([
    { owner: "region" as const, expectedLayout: "4x1" },
    { owner: "section" as const, expectedLayout: "4x1" },
    { owner: "cell" as const, expectedLayout: "2x2" },
  ])(
    "fills a bounded $owner equally in authoring and runtime",
    async ({ owner, expectedLayout }) => {
      const surfaceId = boundedGallerySurfaceId(owner);
      const pair = await mountPair(boundedGalleryDocument(owner, "grid"), surfaceId, true);
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
      expect(authoring.frame.querySelector(".sc-app-gallery__grid-add")).not.toBeNull();
      expect(authoring.grid.querySelector(".sc-app-gallery__grid-add")).toBeNull();
      expect(runtime.frame.querySelector(".sc-app-gallery__grid-add")).toBeNull();
    },
  );

  it("grows an unbounded page, caps wide rows at four, and responds to container width", async () => {
    const pair = await mountPair(unboundedGalleryDocument(), "gallerypage1", true);
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
      const tileButton = requiredElement<HTMLElement>(
        sample.cells[0]!,
        ".sc-course-gallery__tile-button",
      );
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
    const pair = await mountPair(unboundedGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    await nextLayoutFrames(2);

    const authoringFrame = galleryFrame(pair.authoring);
    const addAction = requiredElement<HTMLElement>(
      authoringFrame,
      ".sc-app-gallery__grid-add-action",
    );
    const style = getComputedStyle(addAction);

    expect(style.borderStyle).toBe("dashed");
    expect(style.boxShadow).toBe("none");
    expect(addAction.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(addAction.getBoundingClientRect().height).toBeCloseTo(44, 0);
    expect(addAction.querySelector(".sc-app-block-add__icon")).not.toBeNull();
    expect(galleryFrame(pair.runtime).querySelector(".sc-app-gallery__grid-add-action")).toBeNull();
  });

  it("gives the grid remove action an accessible App-owned target", async () => {
    const pair = await mountPair(unboundedGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    await nextLayoutFrames(2);

    const authoringFrame = galleryFrame(pair.authoring);
    const removeActions = authoringFrame.querySelectorAll<HTMLButtonElement>(
      ".sc-app-gallery__tile-delete",
    );
    expect(removeActions).toHaveLength(9);
    const removeAction = removeActions[0]!;
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(pair.authoring.host, ".sc-app"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));
    const removeStyle = getComputedStyle(removeAction);

    expect(removeAction).toHaveClass("sc-icon-button");
    expect(removeAction).toHaveAttribute("data-size", "sm");
    expect(removeAction).toHaveAttribute("data-variant", "danger");
    expect(removeAction).not.toHaveClass(
      "rt-IconButton",
      "sc-course-icon-action",
      "sc-course-gallery__delete",
    );
    expect(removeStyle.width).toBe("44px");
    expect(removeStyle.height).toBe("44px");
    expect(removeStyle.borderTopWidth).toBe("0px");
    expect(Number.parseFloat(removeStyle.borderTopLeftRadius)).toBeCloseTo(controlRadius, 1);
    expect(removeStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(removeStyle.color).toBe(mutedColour);
    expect(removeStyle.opacity).toBe("1");
    expect(removeStyle.position).toBe("absolute");
    expect(removeStyle.insetBlockStart).toBe("6px");
    expect(removeStyle.insetInlineEnd).toBe("6px");
    expect(galleryFrame(pair.runtime).querySelector(".sc-app-gallery__tile-delete")).toBeNull();
  });

  it("gives carousel thumbnail removal an accessible App-owned target", async () => {
    const pair = await mountPair(unboundedGalleryDocument("carousel"), "gallerypage1", true);
    mountedPairs.push(pair);
    await nextLayoutFrames(2);

    const authoringFrame = galleryFrame(pair.authoring);
    const learnerThumbs = authoringFrame.querySelectorAll<HTMLButtonElement>(
      ".sc-course-gallery__thumb",
    );
    const removeActions = authoringFrame.querySelectorAll<HTMLButtonElement>(
      ".sc-app-gallery__thumb-delete",
    );
    expect(learnerThumbs).toHaveLength(8);
    expect(removeActions).toHaveLength(8);
    const removeAction = removeActions[0]!;
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(pair.authoring.host, ".sc-app"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));
    const removeStyle = getComputedStyle(removeAction);
    const affordanceStyle = getComputedStyle(removeAction, "::before");

    expect(removeAction).toHaveClass("sc-icon-button");
    expect(removeAction).toHaveAttribute("data-size", "sm");
    expect(removeAction).toHaveAttribute("data-variant", "danger");
    expect(removeAction).not.toHaveClass(
      "rt-IconButton",
      "sc-course-icon-action",
      "sc-course-gallery__delete",
    );
    expect(removeStyle.width).toBe("44px");
    expect(removeStyle.height).toBe("44px");
    expect(removeStyle.borderTopWidth).toBe("0px");
    expect(Number.parseFloat(removeStyle.borderTopLeftRadius)).toBeCloseTo(controlRadius, 1);
    expect(removeStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(removeStyle.color).toBe(mutedColour);
    expect(removeStyle.opacity).toBe("1");
    expect(removeStyle.position).toBe("absolute");
    expect(removeStyle.insetBlockStart).toBe("3px");
    expect(removeStyle.insetInlineEnd).toBe("3px");
    expect(affordanceStyle.width).toBe("24px");
    expect(affordanceStyle.height).toBe("24px");
    expect(affordanceStyle.insetBlockStart).toBe("4px");
    expect(affordanceStyle.insetInlineEnd).toBe("4px");
    expect(affordanceStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(galleryFrame(pair.runtime).querySelector(".sc-app-gallery__thumb-delete")).toBeNull();
  });

  it("keeps the empty-state add affordance pill-shaped under square Course roundness", async () => {
    const pair = await mountPair(unboundedEmptyGalleryDocument(), "gallerypage1", true);
    mountedPairs.push(pair);
    await nextLayoutFrames(2);

    const authoringFrame = galleryFrame(pair.authoring);
    const courseTheme = authoringFrame.closest<HTMLElement>(".sc-course");
    if (!courseTheme) throw new Error("Expected Gallery inside a Course theme boundary.");
    courseTheme.style.setProperty("--radius-full", "0px");
    await nextLayoutFrames(1);

    const addAction = requiredElement<HTMLElement>(authoringFrame, ".sc-app-gallery__empty-add");
    const addRadius = Number.parseFloat(getComputedStyle(addAction).borderTopLeftRadius);

    expect(addAction).toHaveClass("sc-app-block-add");
    expect(addRadius).toBeGreaterThanOrEqual(addAction.getBoundingClientRect().height / 2);
    expect(galleryFrame(pair.runtime).querySelector(".sc-app-gallery__empty-add")).toBeNull();
  });

  it("scores narrow bounded tracks with the effective eight-pixel gap", async () => {
    const pair = await mountPair(boundedGalleryDocument("region", "grid"), "galleryreg01", true);
    mountedPairs.push(pair);
    await waitForGridLayout(pair);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const composition = requiredElement<HTMLElement>(
        galleryFrame(mounted),
        ".sc-course-gallery__grid-composition",
      );
      composition.style.width = "320px";
      composition.style.height = "210px";
    }

    await waitForCondition(() =>
      [pair.authoring, pair.runtime].every(
        (mounted) =>
          requiredElement<HTMLElement>(galleryFrame(mounted), ".sc-course-gallery__grid").dataset[
            "galleryGridLayout"
          ] === "3x2",
      ),
    );

    for (const mounted of [pair.authoring, pair.runtime]) {
      const grid = requiredElement<HTMLElement>(galleryFrame(mounted), ".sc-course-gallery__grid");
      expect(Number.parseFloat(getComputedStyle(grid).columnGap)).toBeCloseTo(8, 0);
      expect(grid.dataset["galleryGridLayout"]).toBe("3x2");
    }
  });

  it("contains the bounded Carousel stage and keeps thumbnails outside its flexible stage", async () => {
    const pair = await mountPair(
      boundedGalleryDocument("region", "carousel"),
      boundedGallerySurfaceId("region"),
      true,
    );
    mountedPairs.push(pair);
    await nextLayoutFrames(3);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frame = galleryFrame(mounted);
      const shell = requiredElement<HTMLElement>(frame, ".sc-course-gallery__shell");
      const composition = requiredElement<HTMLElement>(frame, ".sc-course-gallery__composition");
      const stage = requiredElement<HTMLElement>(frame, ".sc-course-gallery__stage");
      const image = requiredElement<HTMLElement>(frame, ".sc-course-gallery__stage-image");
      const thumbs = requiredElement<HTMLElement>(frame, ".sc-course-gallery__thumbs");

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
  const surfaceId = boundedGallerySurfaceId(owner);
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Slide content fixture is missing its Region.");

  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Gallery",
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture has no courseDocument.");
  const courseSection = courseDocument.content?.find((child) => child.type === "courseSection");
  if (!courseSection) throw new Error("Slideshow fixture has no courseSection.");

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
              id: "gallerytab01",
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
        attrs: { id: "gallerygrid1", columnWidths: [1, 1] },
        content: [
          {
            type: "cell",
            attrs: { id: "gallerycell1" },
            content: [gallery],
          },
          {
            type: "cell",
            attrs: { id: "gallerycell2" },
            content: [{ type: "paragraph", content: [{ type: "text", text: "Support" }] }],
          },
        ],
      },
    ];
  }

  assignFixtureNodeIds(surface);
  courseDocument.content = [courseSection, surface];
  return content;
}

function assignFixtureNodeIds(node: JSONContent): void {
  if (node.type !== "text") {
    node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of node.content ?? []) assignFixtureNodeIds(child);
}

function boundedGallerySurfaceId(owner: BoundedOwner): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    owner === "region" ? "galleryreg01" : owner === "section" ? "gallerysec01" : "gallerycel01",
  );
}

function unboundedGalleryDocument(layout: "carousel" | "grid" = "grid"): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "gallerypage1" });
  const surface = content.content?.[0]?.content?.[0];
  if (!surface) throw new Error("Page fixture has no Surface.");
  surface.content = [galleryNode(layout, layout === "carousel" ? 8 : 9)];
  return content;
}

function unboundedEmptyGalleryDocument(): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "gallerypage1" });
  const surface = content.content?.[0]?.content?.[0];
  if (!surface) throw new Error("Page fixture has no Surface.");
  surface.content = [galleryNode("grid", 0)];
  return content;
}

function galleryNode(layout: "carousel" | "grid", itemCount: number): JSONContent {
  return {
    type: "gallery",
    attrs: {
      id: layout === "grid" ? "gallery-grid" : "gallerycar01",
      data: {
        type: "gallery",
        layout,
        caption: richText("Shared Gallery caption"),
      },
    },
    content: Array.from({ length: itemCount }, (_, index) => ({
      type: "gallery_item",
      attrs: {
        id: `galitem${String(index + 1).padStart(5, "0")}`,
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
    <AppThemeProvider appearance="light">
      <div>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <CourseDocumentEditor
            composition={coreAuthoringComposition}
            source={{ mode: "document", content: cloneJSON(initialContent) }}
            editable={editable}
            onReady={(editor) => {
              authoringEditor = editor;
            }}
          />
        </CourseThemeProvider>
      </div>
    </AppThemeProvider>,
  );
  runtimeRoot.render(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <div
        className="sc-slideshow-player__viewport"
        style={{ width: 1024, height: 576, padding: 0 }}
      >
        <div className="sc-slideshow-player__canvas" style={{ width: 1024, height: 576 }}>
          <CourseDocumentRuntimeRenderer
            composition={coreRuntimeComposition}
            initialContent={cloneJSON(initialContent)}
            productAccess={{ scaffoldPlusAuthorized: false }}
            visibleSurfaceId={surfaceId}
            onReady={(editor) => {
              runtimeEditor = editor;
            }}
          />
        </div>
      </div>
    </CourseThemeProvider>,
  );

  await waitForCondition(
    () =>
      authoringEditor !== null &&
      runtimeEditor !== null &&
      authoringHost.querySelector(".sc-course-gallery") &&
      runtimeHost.querySelector(".sc-course-gallery"),
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
      outer.remove();
    },
  };
}

function rendererHost(kind: RendererKind): HTMLElement {
  const host = document.createElement("div");
  host.dataset["galleryRenderer"] = kind;
  host.style.width = "1024px";
  host.style.height = "576px";
  return host;
}

function measureGrid(mounted: MountedRenderer) {
  const frame = galleryFrame(mounted);
  const grid = requiredElement<HTMLElement>(frame, ".sc-course-gallery__grid");
  return {
    frame,
    grid,
    shell: requiredElement<HTMLElement>(frame, ".sc-course-gallery__shell"),
    caption: requiredElement<HTMLElement>(frame, ".sc-course-gallery__shared-caption"),
    cells: Array.from(grid.querySelectorAll<HTMLElement>(".sc-course-gallery__tile")),
    objectFits: Array.from(
      grid.querySelectorAll<HTMLElement>(".sc-course-gallery__tile-image"),
      (image) => getComputedStyle(image).objectFit,
    ),
  };
}

function galleryFrame(mounted: MountedRenderer): HTMLElement {
  const frameSelector =
    mounted.kind === "authoring"
      ? '.sc-course-gallery[data-authoring-frame="block"]'
      : '.sc-course-gallery[data-runtime-frame="block"]';
  return requiredElement(mounted.host, frameSelector);
}

function setPairCourseDesign(pair: MountedPair, design: "none" | "pocket"): void {
  for (const mounted of [pair.authoring, pair.runtime]) {
    for (const courseRoot of mounted.host.querySelectorAll<HTMLElement>(".sc-course")) {
      courseRoot.classList.remove(
        "sc-course-theme-scaffold-flow-v1",
        "sc-course-theme-pocket-atlas-v1",
      );
      if (design === "pocket") {
        courseRoot.classList.add("sc-course-theme-pocket-atlas-v1");
        courseRoot.style.setProperty("--heading-font-family", '"Silkscreen", sans-serif');
      }
    }
  }
}

async function waitForGridLayout(pair: MountedPair): Promise<void> {
  await waitForCondition(() =>
    [pair.authoring, pair.runtime].every(
      (mounted) =>
        galleryFrame(mounted)
          .querySelector(".sc-course-gallery__grid")
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
  expect(relativeDifference(authoringRect.width, runtimeRect.width)).toBeLessThanOrEqual(0.06);
  expect(relativeDifference(authoringRect.height, runtimeRect.height)).toBeLessThanOrEqual(0.06);
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

function computedColor(value: string, property: "color" | "background" = "color"): string {
  const probe = document.createElement("div");
  probe.style[property] = value;
  document.body.append(probe);
  const computed = getComputedStyle(probe)[property === "color" ? "color" : "backgroundColor"];
  probe.remove();
  return computed;
}

function computedLength(value: string): number {
  const probe = document.createElement("div");
  probe.style.width = value;
  document.body.append(probe);
  const computed = Number.parseFloat(getComputedStyle(probe).width);
  probe.remove();
  return computed;
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
