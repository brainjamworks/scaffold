import type { EmbeddedNodeId } from "@scaffold/contracts";
import { getSchema, type Editor, type Extensions, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getDocumentTreeForEditor } from "@/document/authoring/document-tree";
import { getEditorNavigationForEditor } from "@/document/authoring/editor-navigation";
import { createAuthoringEditorNavigationEnvironment } from "@/document/authoring/editor-navigation/authoring-editor-navigation-environment";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/styles/globals.css";

type Renderer = "authoring" | "runtime";
type Owner = "cell" | "tab";
type VerticalPosition = "top" | "middle" | "bottom";

const authoringComposition = createCoreScaffoldAuthoringComposition();
const runtimeComposition = createCoreScaffoldRuntimeComposition();
const positions = ["top", "middle", "bottom"] as const;
const slideshowSettings = {
  mode: "slideshow",
  overflowMode: "clip",
  surfaceSize: "16x9",
} as const;
const pageSettings = { mode: "page", overflowMode: "grow", surfaceSize: "fluid" } as const;

/**
 * Mounted Chromium baseline exported from
 * 23712d0ae0c7cefb9310a170d0cd049995ef8c17 with the same 1024×576 viewport,
 * Scaffold Flow light theme, content and authoring/runtime providers used below.
 *
 * Command from the isolated HEAD export's packages/core directory:
 * ../../node_modules/.bin/vp test run --project browser src/editor/layers/head-layer16-alignment-baseline.browser.test.tsx
 *
 * The approved task correction intentionally changes only alignment: overflowing
 * Cells become safely top-aligned, and short middle/bottom Tabs start honoring
 * their owner setting. Bounds, padding and per-owner paragraph spacing stay fixed.
 */
const headOwnerGeometry = {
  cell: {
    ownerWidth: 314.66,
    ownerHeight: 446,
    ownerPadding: [4, 4, 4, 4],
    scrollWidth: 306.66,
    scrollClientHeight: 438,
    scrollPadding: [0, 0, 0, 0],
    paragraphGap: 12,
    secondMarginTop: 0,
  },
  tab: {
    ownerWidth: 952,
    ownerHeight: 402,
    ownerPadding: [0, 0, 0, 0],
    scrollWidth: 952,
    scrollClientHeight: 402,
    scrollPadding: [12, 12, 12, 12],
    paragraphGap: 24,
    secondMarginTop: 12,
  },
} as const;

const headAlignmentBaseline = {
  cell: {
    shortOffsets: { top: 0, middle: 189, bottom: 378 },
    overflowingOffsets: { top: 0, middle: -207, bottom: -414 },
    overflowingScrollHeights: { top: 852, middle: 645, bottom: 438 },
  },
  tab: {
    shortOffsets: { top: 12, middle: 12, bottom: 12 },
    overflowingOffsets: { top: 12, middle: 12, bottom: 12 },
    overflowingScrollHeights: { top: 1152, middle: 1152, bottom: 1152 },
  },
} as const;

const approvedLayerAlignment = {
  cell: {
    shortOffsets: headAlignmentBaseline.cell.shortOffsets,
    overflowingOffset: 0,
    overflowingScrollHeight: 852,
  },
  tab: {
    shortOffsets: { top: 12, middle: 165, bottom: 318 },
    overflowingOffset: 12,
    overflowingScrollHeight: 1152,
  },
} as const;

let mounted: MountedPair | null = null;

afterEach(() => {
  mounted?.dispose();
  mounted = null;
});

describe("Layer composition geometry", () => {
  it.each(["cell", "tab"] as const)(
    "preserves %s top/middle/bottom alignment and owner scrolling in authoring and runtime",
    async (owner) => {
      const samples: AlignmentSample[] = [];

      for (const overflowing of [false, true]) {
        for (const position of positions) {
          const fixture = alignmentDocument(owner, position, overflowing);
          mounted = await mountPair(fixture.document, fixture.activeRuntimeLayerIds);

          for (const renderer of ["authoring", "runtime"] as const) {
            const sample = measureAlignment(mounted[renderer].host, owner, position, overflowing);
            samples.push(sample);
            expectOwnerGeometry(sample, owner);
            if (overflowing) {
              expect(sample.scrollHeight).toBeCloseTo(
                approvedLayerAlignment[owner].overflowingScrollHeight,
                0,
              );
              expect(sample.firstOffset).toBeCloseTo(
                approvedLayerAlignment[owner].overflowingOffset,
                0,
              );
            } else {
              expect(sample.scrollHeight).toBeLessThanOrEqual(sample.clientHeight + 1);
              expect(sample.firstOffset).toBeCloseTo(
                approvedLayerAlignment[owner].shortOffsets[position],
                0,
              );
            }

            const regionScroll = requiredElement(
              mounted[renderer].host,
              ".sc-region > [data-bounded-scroll-frame] > [data-bounded-scroll]",
            );
            const outerLayer = layerElement(mounted[renderer].host, fixture.outerLayerId);
            const takeover = requiredElement(
              outerLayer,
              owner === "cell" ? '[data-node="grid"]' : '[data-node="layout"]',
            );
            expect(outerLayer.dataset["layerComposition"]).toBe("fill");
            expectRectHeight(outerLayer, regionScroll);
            expectRectHeight(takeover, regionScroll);
          }

          const authoring = samples.at(-2);
          const runtime = samples.at(-1);
          if (!authoring || !runtime) throw new Error("Missing paired Layer geometry samples.");
          expect(authoring.firstOffset).toBeCloseTo(runtime.firstOffset, 0);
          expect(authoring.clientHeight).toBeCloseTo(runtime.clientHeight, 0);
          expect(authoring.ownerHeight).toBeCloseTo(runtime.ownerHeight, 0);
          expect(authoring.paragraphGap).toBeCloseTo(runtime.paragraphGap, 0);

          if (owner === "cell" && !overflowing && position === "top") {
            for (const renderer of ["authoring", "runtime"] as const) {
              const cells = mounted[renderer].host.querySelectorAll<HTMLElement>(".sc-grid-cell");
              const first = cells[0]?.getBoundingClientRect();
              const second = cells[1]?.getBoundingClientRect();
              if (!first || !second) throw new Error("Expected the two mounted Grid cells.");
              expect(second.width / first.width).toBeCloseTo(2, 1);
            }
          }

          mounted.dispose();
          mounted = null;
        }
      }

      for (const renderer of ["authoring", "runtime"] as const) {
        const short = samples.filter(
          (sample) => sample.renderer === renderer && !sample.overflowing,
        );
        expect(sampleFor(short, "middle").firstOffset).toBeGreaterThan(
          sampleFor(short, "top").firstOffset + 20,
        );
        expect(sampleFor(short, "bottom").firstOffset).toBeGreaterThan(
          sampleFor(short, "middle").firstOffset + 20,
        );

        const overflowing = samples.filter(
          (sample) => sample.renderer === renderer && sample.overflowing,
        );
        expect(sampleFor(overflowing, "middle").firstOffset).toBeCloseTo(
          sampleFor(overflowing, "top").firstOffset,
          0,
        );
        expect(sampleFor(overflowing, "bottom").firstOffset).toBeCloseTo(
          sampleFor(overflowing, "top").firstOffset,
          0,
        );
      }
    },
  );

  it.each(["cell", "tab"] as const)(
    "keeps a nested top-aligned %s independent of its bottom-aligned Section owner",
    async (nestedOwner) => {
      const fixture = nestedOwnerDocument(nestedOwner);
      mounted = await mountPair(fixture.document, fixture.activeRuntimeLayerIds);

      for (const renderer of ["authoring", "runtime"] as const) {
        const innerLayer = layerElement(mounted[renderer].host, fixture.innerLayerId);
        const innerOwner = requiredClosest(
          innerLayer,
          nestedOwner === "cell" ? ".sc-grid-cell" : ".sc-layout-section",
        );
        const innerScroll = requiredElement(innerOwner, "[data-bounded-scroll]");
        const first = requiredElement(innerLayer, "p");
        const outerSection = requiredElement(
          mounted[renderer].host,
          `.sc-layout-section[data-id="${fixture.outerSectionId}"]`,
        );
        const readOffset = () =>
          first.getBoundingClientRect().top - innerScroll.getBoundingClientRect().top;

        expect(readOffset()).toBeCloseTo(approvedLayerAlignment[nestedOwner].shortOffsets.top, 0);
        outerSection.setAttribute("data-vertical-content-position", "top");
        await nextLayoutFrame();
        expect(readOffset()).toBeCloseTo(approvedLayerAlignment[nestedOwner].shortOffsets.top, 0);

        outerSection.style.setProperty("--sc-layout-section-flow-gap", "31px");
        innerOwner.style.setProperty(
          nestedOwner === "cell" ? "--sc-grid-cell-flow-gap" : "--sc-layout-section-flow-gap",
          "7px",
        );
        await nextLayoutFrame();
        expect(getComputedStyle(innerScroll).rowGap).toBe("7px");
        expect(getComputedStyle(innerLayer).rowGap).toBe("7px");
      }
    },
  );

  it("excludes inactive content and lets only the active direct composition control Region fill", async () => {
    const fixture = alternatingRegionDocument();
    mounted = await mountPair(fixture.document, [fixture.flowLayerId]);

    for (const renderer of ["authoring", "runtime"] as const) {
      const host = mounted[renderer].host;
      const scroll = requiredElement(host, '[data-node="region"] [data-bounded-scroll]');
      const flow = layerElement(host, fixture.flowLayerId);
      const grid = layerElement(host, fixture.gridLayerId);

      expect(flow.dataset["layerState"]).toBe("active");
      expect(flow.dataset["layerComposition"]).toBe("flow");
      expect(grid.dataset["layerState"]).toBe("inactive");
      expect(grid.dataset["layerComposition"]).toBe("fill");
      expect(grid.hidden).toBe(true);
      expect(grid.hasAttribute("inert")).toBe(true);
      expect(grid.getAttribute("aria-hidden")).toBe("true");
      expect(grid.getClientRects()).toHaveLength(0);
      expect(grid.querySelector('[data-node="grid"]')).not.toBeNull();
      expect(getComputedStyle(scroll).overflowY).toBe("auto");
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
      expect(scroll.scrollHeight).toBeCloseTo(flow.getBoundingClientRect().height, 0);
    }

    const runtimeScroll = requiredElement(
      mounted.runtime.host,
      '[data-node="region"] [data-bounded-scroll]',
    );
    runtimeScroll.tabIndex = 0;
    runtimeScroll.focus();
    await userEvent.keyboard("{PageDown}");
    await nextLayoutFrame();
    expect(runtimeScroll.scrollTop).toBeGreaterThan(0);

    const authoringScroll = requiredElement(
      mounted.authoring.host,
      '[data-node="region"] [data-bounded-scroll]',
    );

    const navigation = getEditorNavigationForEditor(mounted.authoring.editor);
    const tree = getDocumentTreeForEditor(mounted.authoring.editor).getSnapshot();
    const authoringFlow = layerElement(mounted.authoring.host, fixture.flowLayerId);
    await userEvent.click(requiredElement(authoringFlow, "p"));
    expect(mounted.authoring.editor.view.hasFocus()).toBe(true);
    expect(document.activeElement).toBe(mounted.authoring.editor.view.dom);
    const result = navigation.authoringLayers.openAncestorsForTarget(tree, fixture.gridTargetId);
    expect(result.kind).toBe("opened");
    await waitForCondition(
      () =>
        layerElement(mounted!.authoring.host, fixture.gridLayerId).dataset["layerState"] ===
        "active",
    );

    const inactiveFlow = layerElement(mounted.authoring.host, fixture.flowLayerId);
    const activeGrid = layerElement(mounted.authoring.host, fixture.gridLayerId);
    expect(inactiveFlow.hidden).toBe(true);
    expect(inactiveFlow.getClientRects()).toHaveLength(0);
    expect(document.activeElement).toBe(mounted.authoring.editor.view.dom);
    expect(activeGrid.dataset["layerComposition"]).toBe("fill");
    expect(getComputedStyle(authoringScroll).overflowY).toBe("hidden");
    expectRectHeight(requiredElement(activeGrid, '[data-node="grid"]'), authoringScroll);
    expect(layerElement(mounted.runtime.host, fixture.flowLayerId).dataset["layerState"]).toBe(
      "active",
    );
  });

  it("does not fall back when an explicit runtime initial Layer reference is broken", async () => {
    const fixture = alternatingRegionDocument();
    const document = withInitialLayerChoices(fixture.document, new Set([fixture.flowLayerId]));
    const courseDocument = document.content?.find((node) => node.type === "courseDocument");
    const track = courseDocument?.attrs?.["presentation"]?.surfaces?.[0]?.layerTracks?.[0];
    if (!track) throw new Error("Expected an explicit Layer track fixture.");
    track.initialLayerId = "missinglyr01";

    mounted = await mountPair(document, [], "slideshow", true);

    expect(layerElement(mounted.runtime.host, fixture.flowLayerId).dataset["layerState"]).toBe(
      "inactive",
    );
    expect(layerElement(mounted.runtime.host, fixture.gridLayerId).dataset["layerState"]).toBe(
      "inactive",
    );
  });

  it("keeps a page Accordion panel intrinsic when its composition grows", async () => {
    const heights: Record<"short" | "long", { surface: number; panel: number }> = {
      short: { surface: 0, panel: 0 },
      long: { surface: 0, panel: 0 },
    };

    for (const length of ["short", "long"] as const) {
      const fixture = accordionPageDocument(length === "long" ? 80 : 2);
      mounted = await mountPair(fixture.document, fixture.activeRuntimeLayerIds, "page");

      for (const renderer of ["authoring", "runtime"] as const) {
        const host = mounted[renderer].host;
        const surface = requiredElement(host, `.sc-page-default-surface-${renderer}-view`);
        const panelScroll = requiredElement(
          host,
          ".sc-course-accordion__panel:not([hidden]) [data-bounded-scroll]",
        );
        expect(panelScroll.scrollHeight).toBeLessThanOrEqual(panelScroll.clientHeight + 1);
        expect(panelScroll.getBoundingClientRect().height).toBeGreaterThan(0);
        if (renderer === "runtime") {
          heights[length] = {
            surface: surface.getBoundingClientRect().height,
            panel: panelScroll.getBoundingClientRect().height,
          };
        }
      }

      mounted.dispose();
      mounted = null;
    }

    expect(heights.long.panel).toBeGreaterThan(heights.short.panel + 500);
    expect(heights.long.surface).toBeGreaterThan(heights.short.surface + 500);
  });
});

interface MountedEditor {
  readonly editor: Editor;
  readonly host: HTMLElement;
}

interface MountedPair {
  readonly authoring: MountedEditor;
  readonly runtime: MountedEditor;
  readonly dispose: () => void;
}

function CandidateEditor({
  content,
  onReady,
  renderer,
  surfaceMode,
}: {
  readonly content: JSONContent;
  readonly onReady: (editor: Editor) => void;
  readonly renderer: Renderer;
  readonly surfaceMode: "page" | "slideshow";
}) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const extensions = useMemo(() => productionExtensions(renderer), [renderer]);
  const editor = useEditor({
    immediatelyRender: false,
    editable: renderer === "authoring",
    extensions,
    content,
    onCreate: ({ editor: readyEditor }) => onReady(readyEditor),
  });

  useEffect(() => {
    if (renderer !== "authoring" || !editor || !overlayContainer) return;
    const navigation = getEditorNavigationForEditor(editor);
    navigation.setEditor({
      dispatch: (transaction) => editor.view.dispatch(transaction),
      focus: () => editor.view.focus(),
    });
    navigation.setEnvironment(
      createAuthoringEditorNavigationEnvironment({
        blockDefinitions: authoringComposition.capabilities.blocks.registry,
        getDocumentTree: getDocumentTreeForEditor(editor).getSnapshot,
        root: overlayContainer,
        view: editor.view,
      }),
    );
    return () => navigation.clearEnvironment();
  }, [editor, overlayContainer, renderer]);

  if (!editor) return null;

  const settings = surfaceMode === "slideshow" ? slideshowSettings : pageSettings;
  const editorContent = (
    <EditorContent
      className={
        renderer === "authoring"
          ? "sc-course-document-editor__content"
          : "sc-course-document-runtime-renderer__content"
      }
      editor={editor}
    />
  );
  if (renderer === "authoring") {
    return (
      <div ref={setOverlayContainer} className="sc-course-document-editor">
        <ScaffoldArtifactIdentityProvider artifactId={null}>
          <AuthoringDocumentChrome
            editable
            editor={editor}
            overlayContainer={overlayContainer}
            surfaceAuthoringChrome={authoringComposition.surfaces.chrome}
          >
            <CourseThemeProvider
              theme={createDefaultPersistedCourseTheme()}
              appearance="light"
              hasBackground={false}
            >
              <AuthoringSurfaceView settings={settings}>{editorContent}</AuthoringSurfaceView>
            </CourseThemeProvider>
          </AuthoringDocumentChrome>
        </ScaffoldArtifactIdentityProvider>
      </div>
    );
  }

  const runtimeSurface = (
    <RuntimeSurfaceView settings={settings}>{editorContent}</RuntimeSurfaceView>
  );
  return (
    <CourseThemeProvider
      theme={createDefaultPersistedCourseTheme()}
      appearance="light"
      hasBackground={false}
    >
      <ScaffoldArtifactIdentityProvider artifactId={null}>
        {surfaceMode === "slideshow" ? (
          <div
            className="sc-slideshow-player__viewport"
            style={{ width: 1024, height: 576, padding: 0 }}
          >
            <div className="sc-slideshow-player__canvas" style={{ width: 1024, height: 576 }}>
              {runtimeSurface}
            </div>
          </div>
        ) : (
          runtimeSurface
        )}
      </ScaffoldArtifactIdentityProvider>
    </CourseThemeProvider>
  );
}

function productionExtensions(renderer: Renderer): Extensions {
  return renderer === "authoring"
    ? createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: authoringComposition,
      })
    : createCourseDocumentRuntimeExtensions({ composition: runtimeComposition });
}

async function mountPair(
  content: JSONContent,
  activeRuntimeLayerIds: readonly EmbeddedNodeId[],
  surfaceMode: "page" | "slideshow" = "slideshow",
  preservePresentation = false,
): Promise<MountedPair> {
  const pairHost = document.createElement("div");
  pairHost.style.cssText = "position:absolute;inset:0 auto auto 0;width:1024px;";
  document.body.append(pairHost);
  const authoringHost = rendererHost("authoring");
  const runtimeHost = rendererHost("runtime");
  pairHost.append(authoringHost, runtimeHost);
  const authoringRoot = createRoot(authoringHost);
  const runtimeRoot = createRoot(runtimeHost);
  const activeSet = new Set(activeRuntimeLayerIds);
  const productionContent = preservePresentation
    ? cloneJSON(content)
    : withInitialLayerChoices(content, activeSet);
  getSchema(productionExtensions("authoring")).nodeFromJSON(productionContent).check();
  getSchema(productionExtensions("runtime")).nodeFromJSON(productionContent).check();

  let authoringEditor: Editor | null = null;
  let runtimeEditor: Editor | null = null;
  authoringRoot.render(
    <CandidateEditor
      content={cloneJSON(productionContent)}
      onReady={(editor) => {
        authoringEditor = editor;
      }}
      renderer="authoring"
      surfaceMode={surfaceMode}
    />,
  );
  runtimeRoot.render(
    <CandidateEditor
      content={cloneJSON(productionContent)}
      onReady={(editor) => {
        runtimeEditor = editor;
      }}
      renderer="runtime"
      surfaceMode={surfaceMode}
    />,
  );

  try {
    await waitForCondition(
      () =>
        authoringEditor !== null &&
        runtimeEditor !== null &&
        authoringHost.querySelector('[data-node="layer"]') !== null &&
        runtimeHost.querySelector('[data-node="layer"]') !== null,
    );
    await nextLayoutFrame();
    const readyAuthoringEditor = requireMountedEditor(authoringEditor, "authoring");
    const readyRuntimeEditor = requireMountedEditor(runtimeEditor, "runtime");
    if (
      !readyAuthoringEditor.isEditable ||
      readyAuthoringEditor.view.dom.getAttribute("contenteditable") !== "true"
    ) {
      throw new Error("Layer geometry authoring acceptance requires a real editable editor.");
    }

    return {
      authoring: { editor: readyAuthoringEditor, host: authoringHost },
      runtime: { editor: readyRuntimeEditor, host: runtimeHost },
      dispose: () => {
        disposeRoot(authoringRoot, readyAuthoringEditor);
        disposeRoot(runtimeRoot, readyRuntimeEditor);
        pairHost.remove();
      },
    };
  } catch (error) {
    const diagnostic = JSON.stringify({
      authoringEditor: authoringEditor !== null,
      runtimeEditor: runtimeEditor !== null,
      authoringProseMirror: authoringHost.querySelector(".ProseMirror")?.innerHTML.slice(0, 2_000),
      runtimeProseMirror: runtimeHost.querySelector(".ProseMirror")?.innerHTML.slice(0, 2_000),
    });
    disposeRoot(authoringRoot, authoringEditor);
    disposeRoot(runtimeRoot, runtimeEditor);
    pairHost.remove();
    throw new Error(diagnostic, { cause: error });
  }
}

function withInitialLayerChoices(
  source: JSONContent,
  activeLayerIds: ReadonlySet<EmbeddedNodeId>,
): JSONContent {
  const document = cloneJSON(source);
  const courseDocument = document.content?.find((node) => node.type === "courseDocument");
  if (!courseDocument) throw new Error("Layer geometry fixture has no Course Document.");
  const surfaces = (courseDocument.content ?? []).filter((node) => node.type === "surface");
  courseDocument.attrs = {
    ...courseDocument.attrs,
    presentation: {
      schemaVersion: 1,
      autoAdvance: false,
      allowPrevious: true,
      surfaces: surfaces.map((surface) => ({
        surfaceId: surface.attrs?.["id"],
        durationMs: 0,
        layerTracks: collectLayerOwners(surface).flatMap(({ ownerId, layerIds }) => {
          if (layerIds.length === 1) return [];
          const selected = layerIds.filter((layerId) => activeLayerIds.has(layerId));
          if (selected.length !== 1) {
            throw new Error(`Layer geometry owner "${ownerId}" requires one initial Layer.`);
          }
          return [{ ownerId, initialLayerId: selected[0], switches: [] }];
        }),
        actions: [],
      })),
    },
  };
  return document;
}

function collectLayerOwners(
  surface: JSONContent,
): readonly { readonly ownerId: EmbeddedNodeId; readonly layerIds: readonly EmbeddedNodeId[] }[] {
  const owners: { ownerId: EmbeddedNodeId; layerIds: EmbeddedNodeId[] }[] = [];
  const visit = (node: JSONContent, owner: (typeof owners)[number] | null) => {
    const nextOwner =
      node.type === "region" || node.type === "cell" || node.type === "section"
        ? { ownerId: node.attrs?.["id"] as EmbeddedNodeId, layerIds: [] }
        : owner;
    if (nextOwner && nextOwner !== owner) owners.push(nextOwner);
    if (node.type === "layer") nextOwner?.layerIds.push(node.attrs?.["id"] as EmbeddedNodeId);
    for (const child of node.content ?? []) visit(child, nextOwner);
  };
  visit(surface, null);
  return owners;
}

function requireMountedEditor(editor: Editor | null, renderer: Renderer): Editor {
  if (!editor) throw new Error(`Candidate ${renderer} Layer editor did not mount.`);
  return editor;
}

function rendererHost(renderer: Renderer): HTMLElement {
  const host = document.createElement("div");
  host.dataset["layerRenderer"] = renderer;
  host.style.cssText = "width:1024px;min-height:576px;";
  return host;
}

function disposeRoot(root: Root, editor: Editor | null): void {
  root.unmount();
  if (editor && !editor.isDestroyed) editor.destroy();
}

interface AlignmentSample {
  readonly renderer: Renderer;
  readonly position: VerticalPosition;
  readonly overflowing: boolean;
  readonly ownerWidth: number;
  readonly ownerHeight: number;
  readonly ownerPadding: readonly [number, number, number, number];
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly scrollPadding: readonly [number, number, number, number];
  readonly firstOffset: number;
  readonly paragraphGap: number;
  readonly secondMarginTop: number;
}

function measureAlignment(
  host: HTMLElement,
  owner: Owner,
  position: VerticalPosition,
  overflowing: boolean,
): AlignmentSample {
  const ownerElement = requiredElement(
    host,
    owner === "cell" ? ".sc-grid-cell" : ".sc-layout-section",
  );
  const scroll = requiredElement(ownerElement, "[data-bounded-scroll]");
  const mountedParagraphs = scroll.querySelectorAll<HTMLElement>("p");
  const first = mountedParagraphs[0];
  const second = mountedParagraphs[1];
  if (!first || !second) throw new Error("Layer alignment fixture requires two paragraphs.");
  const ownerRect = ownerElement.getBoundingClientRect();
  const scrollRect = scroll.getBoundingClientRect();
  const ownerStyle = getComputedStyle(ownerElement);
  const scrollStyle = getComputedStyle(scroll);
  return {
    renderer: host.dataset["layerRenderer"] as Renderer,
    position,
    overflowing,
    ownerWidth: ownerRect.width,
    ownerHeight: ownerRect.height,
    ownerPadding: cssPadding(ownerStyle),
    scrollWidth: scrollRect.width,
    clientHeight: scroll.clientHeight,
    scrollHeight: scroll.scrollHeight,
    scrollPadding: cssPadding(scrollStyle),
    firstOffset: first.getBoundingClientRect().top - scrollRect.top,
    paragraphGap: second.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
    secondMarginTop: Number.parseFloat(getComputedStyle(second).marginTop),
  };
}

function sampleFor(
  samples: readonly AlignmentSample[],
  position: VerticalPosition,
): AlignmentSample {
  const sample = samples.find((candidate) => candidate.position === position);
  if (!sample) throw new Error(`Missing ${position} Layer alignment sample.`);
  return sample;
}

function expectOwnerGeometry(sample: AlignmentSample, owner: Owner): void {
  const baseline = headOwnerGeometry[owner];
  expect(sample.ownerWidth).toBeCloseTo(baseline.ownerWidth, 0);
  expect(sample.ownerHeight).toBeCloseTo(baseline.ownerHeight, 0);
  expect(sample.scrollWidth).toBeCloseTo(baseline.scrollWidth, 0);
  expect(sample.clientHeight).toBeCloseTo(baseline.scrollClientHeight, 0);
  expectTupleClose(sample.ownerPadding, baseline.ownerPadding);
  expectTupleClose(sample.scrollPadding, baseline.scrollPadding);
  expect(sample.paragraphGap).toBeCloseTo(baseline.paragraphGap, 0);
  expect(sample.secondMarginTop).toBeCloseTo(baseline.secondMarginTop, 0);
}

function expectTupleClose(
  actual: readonly [number, number, number, number],
  expected: readonly [number, number, number, number],
): void {
  for (const [index, value] of actual.entries()) {
    expect(value).toBeCloseTo(expected[index] ?? Number.NaN, 0);
  }
}

function cssPadding(style: CSSStyleDeclaration): readonly [number, number, number, number] {
  return [
    Number.parseFloat(style.paddingTop),
    Number.parseFloat(style.paddingRight),
    Number.parseFloat(style.paddingBottom),
    Number.parseFloat(style.paddingLeft),
  ];
}

function alignmentDocument(
  owner: Owner,
  position: VerticalPosition,
  overflowing: boolean,
): {
  readonly document: JSONContent;
  readonly activeRuntimeLayerIds: readonly EmbeddedNodeId[];
  readonly outerLayerId: EmbeddedNodeId;
} {
  const outerLayerId = createEmbeddedNodeId();
  const primaryLayerId = createEmbeddedNodeId();
  const secondaryLayerId = createEmbeddedNodeId();
  const blocks = paragraphs(overflowing ? 24 : 2, `${owner} geometry`);
  const composition: JSONContent =
    owner === "cell"
      ? {
          type: "grid",
          attrs: { id: createEmbeddedNodeId(), columnWidths: [1, 2] },
          content: [
            cell(position, primaryLayerId, blocks),
            cell("top", secondaryLayerId, paragraphs(2, "Secondary cell")),
          ],
        }
      : {
          type: "layout",
          attrs: {
            id: createEmbeddedNodeId(),
            variant: "tabs",
            options: { label: "Layer tabs", variant: "default" },
          },
          content: [section(position, primaryLayerId, blocks)],
        };

  return {
    document: documentWithRegionLayers([layer(outerLayerId, [composition])]),
    activeRuntimeLayerIds: [outerLayerId, primaryLayerId, secondaryLayerId],
    outerLayerId,
  };
}

function nestedOwnerDocument(nestedOwner: Owner): {
  readonly document: JSONContent;
  readonly activeRuntimeLayerIds: readonly EmbeddedNodeId[];
  readonly innerLayerId: EmbeddedNodeId;
  readonly outerSectionId: EmbeddedNodeId;
} {
  const regionLayerId = createEmbeddedNodeId();
  const outerSectionId = createEmbeddedNodeId();
  const outerSectionLayerId = createEmbeddedNodeId();
  const innerLayerId = createEmbeddedNodeId();
  const innerComposition: JSONContent =
    nestedOwner === "cell"
      ? {
          type: "grid",
          attrs: { id: createEmbeddedNodeId(), columnWidths: [1] },
          content: [cell("top", innerLayerId, paragraphs(2, "Nested Cell"))],
        }
      : {
          type: "layout",
          attrs: {
            id: createEmbeddedNodeId(),
            variant: "tabs",
            options: { label: "Inner tabs", variant: "default" },
          },
          content: [section("top", innerLayerId, paragraphs(2, "Nested Tab"))],
        };
  const outerTabs: JSONContent = {
    type: "layout",
    attrs: {
      id: createEmbeddedNodeId(),
      variant: "tabs",
      options: { label: "Outer tabs", variant: "default" },
    },
    content: [
      {
        type: "section",
        attrs: {
          id: outerSectionId,
          role: "tab-panel",
          verticalPosition: "bottom",
          options: { label: "Outer" },
        },
        content: [layer(outerSectionLayerId, [innerComposition])],
      },
    ],
  };

  return {
    document: documentWithRegionLayers([layer(regionLayerId, [outerTabs])]),
    activeRuntimeLayerIds: [regionLayerId, outerSectionLayerId, innerLayerId],
    innerLayerId,
    outerSectionId,
  };
}

function alternatingRegionDocument(): {
  readonly document: JSONContent;
  readonly flowLayerId: EmbeddedNodeId;
  readonly gridLayerId: EmbeddedNodeId;
  readonly gridTargetId: EmbeddedNodeId;
} {
  const flowLayerId = createEmbeddedNodeId();
  const gridLayerId = createEmbeddedNodeId();
  const gridTargetId = createEmbeddedNodeId();
  const gridCellLayerId = createEmbeddedNodeId();
  const grid: JSONContent = {
    type: "grid",
    attrs: { id: createEmbeddedNodeId(), columnWidths: [1] },
    content: [
      cell("top", gridCellLayerId, [
        {
          type: "paragraph",
          attrs: { id: gridTargetId },
          content: [{ type: "text", text: "Retained inactive Grid content" }],
        },
        ...paragraphs(39, "Hidden Grid overflow"),
      ]),
    ],
  };
  return {
    document: documentWithRegionLayers([
      layer(flowLayerId, paragraphs(24, "Scrollable active composition")),
      layer(gridLayerId, [grid]),
    ]),
    flowLayerId,
    gridLayerId,
    gridTargetId,
  };
}

function accordionPageDocument(paragraphCount: number): {
  readonly document: JSONContent;
  readonly activeRuntimeLayerIds: readonly EmbeddedNodeId[];
} {
  const panelLayerId = createEmbeddedNodeId();
  const accordion: JSONContent = {
    type: "layout",
    attrs: {
      id: createEmbeddedNodeId(),
      variant: "accordion",
      options: { allowMultiple: false, label: "Intrinsic Layer Accordion", variant: "default" },
    },
    content: [
      {
        type: "section",
        attrs: {
          id: createEmbeddedNodeId(),
          role: "accordion-panel",
          options: { defaultOpen: true },
        },
        content: [
          {
            type: "accordion_section_title",
            attrs: { id: createEmbeddedNodeId() },
            content: [
              {
                type: "paragraph",
                attrs: { id: createEmbeddedNodeId() },
                content: [{ type: "text", text: "Intrinsic panel" }],
              },
            ],
          },
          {
            type: "accordion_section_panel",
            attrs: { id: createEmbeddedNodeId() },
            content: [layer(panelLayerId, paragraphs(paragraphCount, "Accordion panel"))],
          },
        ],
      },
    ],
  };
  return {
    document: documentWithPageContent([accordion]),
    activeRuntimeLayerIds: [panelLayerId],
  };
}

function documentWithRegionLayers(layers: readonly JSONContent[]): JSONContent {
  const surfaceId = createEmbeddedNodeId();
  const definition = builtInSurfaceVariantRegistry.get("slide-content");
  if (!definition) throw new Error("Missing slide-content Surface definition.");
  const surface = definition.createSurface({ surfaceId });
  if (!surface.content) throw new Error("Slide-content Surface has no content.");
  surface.content = surface.content.map((child) =>
    child.type === "region" ? { ...child, content: [...layers] } : child,
  );
  const document = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Layer geometry",
  });
  const courseDocument = document.content?.[0];
  const courseSection = courseDocument?.content?.find((node) => node.type === "courseSection");
  if (courseDocument?.type !== "courseDocument" || !courseSection) {
    throw new Error("Could not create the Layer geometry document.");
  }
  courseDocument.content = [courseSection, surface];
  assignMissingIds(document);
  return document;
}

function documentWithPageContent(content: readonly JSONContent[]): JSONContent {
  const surfaceId = createEmbeddedNodeId();
  const definition = builtInSurfaceVariantRegistry.get("page-default");
  if (!definition) throw new Error("Missing page-default Surface definition.");
  const surface = definition.createSurface({ surfaceId });
  surface.content = [...content];
  const document = createScaffoldDocumentContent({ mode: "page", surfaceId });
  const courseDocument = document.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Could not create the page Layer geometry document.");
  }
  courseDocument.content = [surface];
  assignMissingIds(document);
  return document;
}

function layer(id: EmbeddedNodeId, content: readonly JSONContent[]): JSONContent {
  return { type: "layer", attrs: { id }, content: [...content] };
}

function cell(
  verticalPosition: VerticalPosition,
  layerId: EmbeddedNodeId,
  content: readonly JSONContent[],
): JSONContent {
  return {
    type: "cell",
    attrs: { id: createEmbeddedNodeId(), verticalPosition },
    content: [layer(layerId, content)],
  };
}

function section(
  verticalPosition: VerticalPosition,
  layerId: EmbeddedNodeId,
  content: readonly JSONContent[],
): JSONContent {
  return {
    type: "section",
    attrs: {
      id: createEmbeddedNodeId(),
      role: "tab-panel",
      verticalPosition,
      options: { label: "First" },
    },
    content: [layer(layerId, content)],
  };
}

function paragraphs(count: number, prefix: string): JSONContent[] {
  return Array.from({ length: count }, (_, index) => ({
    type: "paragraph",
    attrs: { id: createEmbeddedNodeId() },
    content: [{ type: "text", text: `${prefix} ${index + 1}` }],
  }));
}

function assignMissingIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) throw new Error("Layer geometry ID traversal lost its node.");
    if (node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    for (const child of node.content ?? []) stack.push(child);
  }
}

function layerElement(root: ParentNode, id: EmbeddedNodeId): HTMLElement {
  return requiredElement(root, `.sc-layer[data-layer-id="${id}"]`);
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing mounted Layer geometry element: ${selector}`);
  return element;
}

function requiredClosest(element: Element, selector: string): HTMLElement {
  const closest = element.closest<HTMLElement>(selector);
  if (!closest) throw new Error(`Missing mounted Layer geometry owner: ${selector}`);
  return closest;
}

function expectRectHeight(element: HTMLElement, owner: HTMLElement): void {
  expect(element.getBoundingClientRect().height).toBeCloseTo(
    owner.getBoundingClientRect().height,
    0,
  );
}

async function waitForCondition(condition: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = performance.now();
  while (!condition()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for mounted Layer geometry.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
