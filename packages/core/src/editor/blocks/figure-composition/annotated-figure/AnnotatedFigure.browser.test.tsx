import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import type { MediaPort } from "@/host/ports/media";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/styles/globals.css";

import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";
import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";
import "./AnnotatedFigure.css";

const mountedRoots: Root[] = [];
const mountedPairs: MountedPair[] = [];
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  for (const pair of mountedPairs.splice(0)) pair.dispose();
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Annotated Figure image geometry", () => {
  it("fits the image coordinate canvas inside the available stage", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "500px";
    document.body.append(host);
    let canvasActivations = 0;

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{
            type: "annotated_figure",
            source: { mode: "managed", mediaId: "annotated-figure-browser-test" },
            alt: "Two-to-one test image",
            captionDisplay: "list",
          }}
          annotations={[
            { id: "pin-top-left", number: 1, x: 0, y: 0 },
            { id: "pin-bot-rght", number: 2, x: 100, y: 100 },
          ]}
          fileUrl={twoToOneImageUrl()}
          onStageClick={() => {
            canvasActivations += 1;
          }}
          onActivatePin={() => undefined}
        />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-annotated-figure__stage"));
    const stage = requiredElement<HTMLElement>(host, ".sc-course-annotated-figure__stage");
    stage.style.height = "400px";

    await waitForCondition(() => {
      const canvas = host.querySelector<HTMLElement>(".sc-course-annotated-figure__canvas");
      if (!canvas) return false;
      const rect = canvas.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    const canvas = requiredElement<HTMLElement>(host, ".sc-course-annotated-figure__canvas");
    const topLeftPin = requiredElement<HTMLElement>(canvas, '[data-pin="pin-top-left"]');
    const bottomRightPin = requiredElement<HTMLElement>(canvas, '[data-pin="pin-bot-rght"]');
    const topLeftActivator = requiredElement<HTMLElement>(topLeftPin, "button");
    const bottomRightActivator = requiredElement<HTMLElement>(bottomRightPin, "button");
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const topLeftPinRect = topLeftPin.getBoundingClientRect();
    const bottomRightPinRect = bottomRightPin.getBoundingClientRect();
    const topLeftActivatorRect = topLeftActivator.getBoundingClientRect();
    const bottomRightActivatorRect = bottomRightActivator.getBoundingClientRect();

    expect(canvasRect.width / canvasRect.height).toBeCloseTo(2, 2);
    expect(canvasRect.right).toBeLessThanOrEqual(stageRect.right + 1);
    expect(canvasRect.bottom).toBeLessThanOrEqual(stageRect.bottom + 1);
    expect(topLeftPinRect.left + topLeftPinRect.width / 2).toBeCloseTo(canvasRect.left, 0);
    expect(topLeftPinRect.top + topLeftPinRect.height / 2).toBeCloseTo(canvasRect.top, 0);
    expect(bottomRightPinRect.left + bottomRightPinRect.width / 2).toBeCloseTo(canvasRect.right, 0);
    expect(bottomRightPinRect.top + bottomRightPinRect.height / 2).toBeCloseTo(
      canvasRect.bottom,
      0,
    );
    for (const rect of [
      topLeftPinRect,
      bottomRightPinRect,
      topLeftActivatorRect,
      bottomRightActivatorRect,
    ]) {
      expect(rect.left).toBeGreaterThanOrEqual(stageRect.left - 1);
      expect(rect.top).toBeGreaterThanOrEqual(stageRect.top - 1);
      expect(rect.right).toBeLessThanOrEqual(stageRect.right + 1);
      expect(rect.bottom).toBeLessThanOrEqual(stageRect.bottom + 1);
    }
    for (const activator of [topLeftActivator, bottomRightActivator]) {
      const rect = activator.getBoundingClientRect();
      expect(rect.width).toBeGreaterThanOrEqual(44);
      expect(rect.height).toBeGreaterThanOrEqual(44);
    }
    expect(canvas.querySelector(".sc-app-annotated-figure__pin-delete")).toBeNull();
    expect(canvasActivations).toBe(0);
  });

  it("reserves a finite responsive stage for portrait images in page flow", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{
            type: "annotated_figure",
            source: { mode: "managed", mediaId: "annotated-figure-portrait" },
            alt: "Portrait test image",
            captionDisplay: "list",
          }}
          annotations={[{ id: "portrait-pin", number: 1, x: 50, y: 100 }]}
          fileUrl={oneToTwoImageUrl()}
        />
      </CourseThemeProvider>,
    );

    await waitForCondition(
      () =>
        host.querySelector('.sc-course-annotated-figure__canvas[data-media-fit-ready="true"]') !==
        null,
    );
    const stage = requiredElement<HTMLElement>(host, ".sc-course-annotated-figure__stage");
    const canvas = requiredElement<HTMLElement>(host, ".sc-course-annotated-figure__canvas");
    const firstStageHeight = stage.getBoundingClientRect().height;
    const firstCanvasRect = canvas.getBoundingClientRect();
    expect(firstStageHeight).toBeGreaterThan(200);
    expect(firstStageHeight).toBeLessThan(600);
    expect(firstCanvasRect.width / firstCanvasRect.height).toBeCloseTo(0.5, 2);
    expect(firstCanvasRect.bottom).toBeLessThanOrEqual(stage.getBoundingClientRect().bottom + 1);

    host.style.width = "320px";
    await waitForCondition(() => {
      const stageRect = stage.getBoundingClientRect();
      return (
        stageRect.height < firstStageHeight &&
        canvas.getBoundingClientRect().bottom <= stageRect.bottom + 1
      );
    });
    expect(canvas.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      stage.getBoundingClientRect().bottom + 1,
    );
  });

  it("contains a long legend inside a bounded slide region in authoring and runtime", async () => {
    await page.viewport(1280, 900);
    const pair = await mountBoundedPair();
    mountedPairs.push(pair);

    await waitForCondition(() =>
      [pair.authoring, pair.runtime].every(
        ({ host }) =>
          host.querySelector('.sc-course-annotated-figure[data-bounded-placement="fill"]') &&
          host.querySelector('.sc-course-annotated-figure__canvas[data-media-fit-ready="true"]'),
      ),
    );

    const samples = [measureBoundedFigure(pair.authoring), measureBoundedFigure(pair.runtime)];
    for (const sample of samples) {
      expect(sample.frame.getAttribute("data-bounded-placement")).toBe("fill");
      expect(sample.frame.scrollHeight).toBeLessThanOrEqual(sample.frame.clientHeight + 1);
      expect(sample.stage.clientHeight).toBeGreaterThan(0);
      expect(sample.legend.scrollHeight).toBeGreaterThan(sample.legend.clientHeight);
      expect(getComputedStyle(sample.legend).overflowY).toBe("auto");
      expect(sample.canvas.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        sample.stage.getBoundingClientRect().top - 1,
      );
      expect(sample.canvas.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        sample.stage.getBoundingClientRect().bottom + 1,
      );
      expect(sample.legend.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        sample.frame.getBoundingClientRect().bottom + 1,
      );
      const rows = Array.from(
        sample.legend.querySelectorAll<HTMLElement>(".sc-course-annotated-figure__annotation"),
      );
      const legendRect = sample.legend.getBoundingClientRect();
      const fullyVisibleRows = rows.filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= legendRect.top && rect.bottom <= legendRect.bottom;
      });
      expect(fullyVisibleRows.length).toBeGreaterThanOrEqual(3);
      expect(fullyVisibleRows.length).toBeLessThanOrEqual(4);
      expect(rows[0]!.getBoundingClientRect().top).toBeGreaterThan(legendRect.top);
      expect(sample.legend).toHaveAttribute("data-bounded-scroll-overflow", "");
      expect(sample.legend).not.toHaveAttribute("data-bounded-scroll-end");

      sample.legend.scrollTop = sample.legend.scrollHeight;
      sample.legend.dispatchEvent(new Event("scroll"));
      await waitForCondition(() => sample.legend.hasAttribute("data-bounded-scroll-end"));
      const finalRowRect = rows.at(-1)!.getBoundingClientRect();
      expect(finalRowRect.top).toBeGreaterThan(legendRect.top);
      expect(finalRowRect.bottom).toBeLessThan(legendRect.bottom);
      expect(sample.legend).toHaveAttribute("data-bounded-scroll-overflow", "");
      const frameStyle = getComputedStyle(sample.frame);
      const measuredGap = Number.parseFloat(getComputedStyle(sample.content).rowGap);
      const gap = Number.isFinite(measuredGap) ? measuredGap : 0;
      const framePadding =
        Number.parseFloat(frameStyle.paddingBlockStart) +
        Number.parseFloat(frameStyle.paddingBlockEnd);
      const allocatedHeight =
        sample.stage.getBoundingClientRect().height +
        sample.legend.getBoundingClientRect().height +
        gap +
        framePadding;
      expect(
        Math.abs(allocatedHeight - sample.frame.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(16);
    }
  });

  it("commits one pointer drag while cancelling previews and suppressing post-drag activation", async () => {
    await page.viewport(1280, 900);
    const pair = await mountBoundedPair("popover");
    mountedPairs.push(pair);
    await waitForCondition(
      () =>
        pair.authoring.host.querySelector(
          '.sc-course-annotated-figure__canvas[data-media-fit-ready="true"]',
        ) !== null,
    );
    const canvas = requiredElement<HTMLElement>(
      pair.authoring.host,
      ".sc-course-annotated-figure__canvas",
    );
    const pin = requiredElement<HTMLButtonElement>(
      canvas,
      '[aria-label="Edit annotation 1 caption"]',
    );
    const pinRect = pin.getBoundingClientRect();
    installSyntheticPointerCapture(pin);
    const origin = {
      x: pinRect.left + pinRect.width / 2,
      y: pinRect.top + pinRect.height / 2,
    };
    let changedTransactions = 0;
    pair.authoring.editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    dispatchPointer(pin, "pointerdown", { ...origin, pointerId: 31 });
    dispatchPointer(pin, "pointermove", {
      x: origin.x + 2,
      y: origin.y + 2,
      pointerId: 31,
    });
    dispatchPointer(pin, "pointerup", {
      x: origin.x + 2,
      y: origin.y + 2,
      pointerId: 31,
    });
    pin.click();
    await waitForCondition(
      () => pair.authoring.host.querySelector('[aria-label="Annotation 1 caption"]') !== null,
    );
    expect(changedTransactions).toBe(0);
    await userEvent.keyboard("{Escape}");
    await waitForCondition(
      () => pair.authoring.host.querySelector('[aria-label="Annotation 1 caption"]') === null,
    );

    dispatchPointer(pin, "pointerdown", { ...origin, pointerId: 32 });
    dispatchPointer(pin, "pointermove", {
      x: origin.x + 36,
      y: origin.y + 18,
      pointerId: 32,
    });
    await waitForCondition(
      () => requiredElement<HTMLElement>(canvas, '[data-pin="annotpin0001"]').style.left !== "50%",
    );
    dispatchPointer(pin, "pointercancel", {
      x: origin.x + 36,
      y: origin.y + 18,
      pointerId: 32,
    });
    await waitForCondition(
      () => requiredElement<HTMLElement>(canvas, '[data-pin="annotpin0001"]').style.left === "50%",
    );
    expect(changedTransactions).toBe(0);

    dispatchPointer(pin, "pointerdown", { ...origin, pointerId: 34 });
    dispatchPointer(pin, "pointermove", {
      x: origin.x + 30,
      y: origin.y + 16,
      pointerId: 34,
    });
    await waitForCondition(
      () => requiredElement<HTMLElement>(canvas, '[data-pin="annotpin0001"]').style.left !== "50%",
    );
    dispatchPointer(pin, "lostpointercapture", {
      x: origin.x + 30,
      y: origin.y + 16,
      pointerId: 34,
    });
    await waitForCondition(
      () => requiredElement<HTMLElement>(canvas, '[data-pin="annotpin0001"]').style.left === "50%",
    );
    expect(changedTransactions).toBe(0);

    dispatchPointer(pin, "pointerdown", { ...origin, pointerId: 33 });
    dispatchPointer(pin, "pointermove", {
      x: origin.x + 54,
      y: origin.y + 24,
      pointerId: 33,
    });
    dispatchPointer(pin, "pointerup", {
      x: origin.x + 54,
      y: origin.y + 24,
      pointerId: 33,
    });
    pin.click();
    await waitForCondition(() => changedTransactions === 1);
    const model = resolveFirstAnnotatedFigureModel(pair.authoring.editor);
    expect(model?.annotations[0]).not.toMatchObject({ x: 50, y: 50 });
    expect(model?.annotations).toHaveLength(18);
    expect(pair.authoring.host.querySelector('[aria-label="Annotation 1 caption"]')).toBeNull();
  });

  it("keeps the workspace canvas and caption list finite beside and below each other", async () => {
    await page.viewport(1280, 900);
    const pair = await mountBoundedPair();
    mountedPairs.push(pair);

    await waitForCondition(() =>
      pair.authoring.host.querySelector<HTMLElement>('[aria-label="Annotated figure image tools"]'),
    );
    const imageTools = requiredElement<HTMLElement>(
      pair.authoring.host,
      '[aria-label="Annotated figure image tools"]',
    );
    expect(imageTools.querySelectorAll("button")).toHaveLength(3);
    const workspaceTrigger = requiredElement<HTMLButtonElement>(
      imageTools,
      '[aria-label="Edit annotated figure in expanded workspace"]',
    );
    workspaceTrigger.focus({ preventScroll: true });
    workspaceTrigger.click();
    await waitForCondition(() => document.querySelector('[role="dialog"] .sc-media-workspace'));

    const dialog = requiredElement<HTMLElement>(document, '[role="dialog"]');
    const workspace = requiredElement<HTMLElement>(dialog, ".sc-media-workspace");
    const layout = requiredElement<HTMLElement>(workspace, ".sc-media-workspace__layout");
    const stage = requiredElement<HTMLElement>(
      workspace,
      '[role="region"][aria-label="Annotation canvas"]',
    );
    const list = requiredElement<HTMLElement>(workspace, 'ol[aria-label="Annotation captions"]');
    const captionPanel = requiredElement<HTMLElement>(
      workspace,
      '[role="region"][aria-label="Caption management"]',
    );

    dialog.style.width = "76rem";
    await waitForCondition(
      () => stage.getBoundingClientRect().right < captionPanel.getBoundingClientRect().left,
    );
    const wideStageRect = stage.getBoundingClientRect();
    const wideListRect = list.getBoundingClientRect();
    const wideCaptionPanelRect = captionPanel.getBoundingClientRect();
    expect(getComputedStyle(layout).display).toBe("grid");
    expect(wideStageRect.height).toBeGreaterThan(240);
    expect(wideListRect.height).toBeGreaterThan(240);
    expect(wideStageRect.top).toBeCloseTo(wideCaptionPanelRect.top, 0);
    expect(getComputedStyle(list).overflowY).toBe("auto");
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);

    dialog.style.width = "40rem";
    await waitForCondition(
      () => captionPanel.getBoundingClientRect().top > stage.getBoundingClientRect().bottom,
    );
    const narrowStageRect = stage.getBoundingClientRect();
    const narrowListRect = list.getBoundingClientRect();
    const narrowCaptionPanelRect = captionPanel.getBoundingClientRect();
    expect(narrowStageRect.width).toBeCloseTo(narrowCaptionPanelRect.width, 0);
    expect(narrowStageRect.height).toBeGreaterThan(180);
    expect(narrowListRect.height).toBeGreaterThan(160);
    expect(dialog.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    await waitForCondition(() => !dialog.isConnected);
    expect(document.activeElement).toBe(workspaceTrigger);
  });

  it("keeps the List Lightbox in its owner document and returns focus on close", async () => {
    await page.viewport(1280, 900);
    const pair = await mountBoundedPair("list");
    mountedPairs.push(pair);
    const expand = await waitForElement<HTMLButtonElement>(
      pair.runtime.host,
      '[aria-label="Expand annotated figure"]',
    );
    expand.focus({ preventScroll: true });
    await userEvent.click(expand);
    const dialog = await waitForElement<HTMLElement>(
      document,
      '[role="dialog"][aria-label="Annotated figure viewer"]',
    );
    const list = requiredElement<HTMLOListElement>(dialog, 'ol[aria-label="Annotations"]');

    expect(dialog.ownerDocument).toBe(pair.runtime.host.ownerDocument);
    expect(dialog.parentElement).toBe(pair.runtime.host.ownerDocument.body);
    expect(list.dataset["visual"]).toBe("true");
    expect(list.querySelectorAll(":scope > li")).toHaveLength(18);
    expect(dialog.querySelector('[contenteditable="true"]')).toBeNull();
    expect(document.activeElement).toBe(dialog);

    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    await waitForCondition(() => !dialog.isConnected);
    await waitForCondition(() => document.activeElement === expand);
  });

  it("contains a long Popover Lightbox caption and closes child-first", async () => {
    await page.viewport(760, 620);
    const pair = await mountBoundedPair("popover", true);
    mountedPairs.push(pair);
    const expand = await waitForElement<HTMLButtonElement>(
      pair.runtime.host,
      '[aria-label="Expand annotated figure"]',
    );
    expand.focus({ preventScroll: true });
    await userEvent.click(expand);
    const dialog = await waitForElement<HTMLElement>(
      document,
      '[role="dialog"][aria-label="Annotated figure viewer"]',
    );
    const pin = requiredElement<HTMLButtonElement>(dialog, '[aria-label="View annotation 1"]');
    const fallback = requiredElement<HTMLOListElement>(dialog, 'ol[aria-label="Annotations"]');
    expect(fallback.dataset["visual"]).toBe("false");

    pin.focus({ preventScroll: true });
    pin.click();
    const popover = await waitForElement<HTMLElement>(
      dialog,
      ".sc-course-annotated-figure__caption-popover",
    );
    const childHost = requiredElement<HTMLElement>(
      dialog,
      ':scope > [data-scaffold-overlay-host][data-kind="contained"]',
    );
    const popoverBody = requiredElement<HTMLElement>(popover, '[data-slot="popover-surface-body"]');
    const dialogRect = dialog.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();

    expect(childHost.contains(popover)).toBe(true);
    expect(popoverRect.left).toBeGreaterThanOrEqual(dialogRect.left - 1);
    expect(popoverRect.top).toBeGreaterThanOrEqual(dialogRect.top - 1);
    expect(popoverRect.right).toBeLessThanOrEqual(dialogRect.right + 1);
    expect(popoverRect.bottom).toBeLessThanOrEqual(dialogRect.bottom + 1);
    expect(getComputedStyle(popoverBody).overflowY).toBe("auto");
    expect(popoverBody.scrollHeight).toBeGreaterThan(popoverBody.clientHeight);
    expect(dialog.querySelector('[contenteditable="true"]')).toBeNull();

    await userEvent.keyboard("{Escape}");
    await waitForCondition(() => !popover.isConnected);
    expect(dialog.isConnected).toBe(true);
    expect(document.activeElement).toBe(pin);

    await userEvent.keyboard("{Escape}");
    await waitForCondition(() => !dialog.isConnected);
    expect(document.activeElement).toBe(expand);
  });
});

interface MountedRenderer {
  editor: TiptapEditor;
  host: HTMLElement;
}

interface MountedPair {
  authoring: MountedRenderer;
  runtime: MountedRenderer;
  dispose: () => void;
}

async function mountBoundedPair(
  captionDisplay: "list" | "popover" = "list",
  longFirstCaption = false,
): Promise<MountedPair> {
  const initialContent = boundedAnnotatedFigureDocument(captionDisplay, longFirstCaption);
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
  const ports = { media: testMediaPort() };

  authoringRoot.render(
    <AppThemeProvider appearance="light">
      <div>
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
          <ScaffoldServicesProvider ports={ports}>
            <CourseDocumentEditor
              composition={coreAuthoringComposition}
              source={{ mode: "document", content: cloneJSON(initialContent) }}
              editable
              onReady={(editor) => {
                authoringEditor = editor;
              }}
            />
          </ScaffoldServicesProvider>
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
          <ScaffoldServicesProvider ports={ports}>
            <CourseDocumentRuntimeRenderer
              composition={coreRuntimeComposition}
              initialContent={cloneJSON(initialContent)}
              productAccess={{ scaffoldPlusAuthorized: false }}
              visibleSurfaceId="annotsurf001"
              onReady={(editor) => {
                runtimeEditor = editor;
              }}
            />
          </ScaffoldServicesProvider>
        </div>
      </div>
    </CourseThemeProvider>,
  );

  await waitForCondition(
    () =>
      authoringEditor !== null &&
      runtimeEditor !== null &&
      authoringHost.querySelector(".sc-course-annotated-figure") &&
      runtimeHost.querySelector(".sc-course-annotated-figure"),
  );
  if (!authoringEditor || !runtimeEditor)
    throw new Error("Annotated Figure browser editors were not ready.");

  let disposed = false;
  return {
    authoring: { editor: authoringEditor, host: authoringHost },
    runtime: { editor: runtimeEditor, host: runtimeHost },
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

function boundedAnnotatedFigureDocument(
  captionDisplay: "list" | "popover" = "list",
  longFirstCaption = false,
): JSONContent {
  const surfaceId = EmbeddedNodeIdSchema.parse("annotsurf001");
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Slide content fixture is missing its Region.");

  region.content = [
    createLayerWithContent([
      {
        type: "annotated_figure",
        attrs: {
          id: "annotfig0001",
          data: {
            type: "annotated_figure",
            source: { mode: "managed", mediaId: "annotated-figure-browser-image" },
            alt: "Bounded two-to-one test image",
            captionDisplay,
          },
        },
        content: [
          { type: "annotated_figure_canvas" },
          {
            type: "annotated_figure_legend",
            content: Array.from({ length: 18 }, (_, index) => ({
              type: "annotated_figure_annotation",
              attrs: {
                id: `annotpin${String(index + 1).padStart(4, "0")}`,
                x: 50,
                y: 50,
              },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text:
                        longFirstCaption && index === 0
                          ? Array.from(
                              { length: 24 },
                              (_, paragraphIndex) =>
                                `Detailed long annotation segment ${paragraphIndex + 1}.`,
                            ).join(" ")
                          : `Detailed pin description ${index + 1}`,
                    },
                  ],
                },
              ],
            })),
          },
        ],
      },
    ]),
  ];
  assignFixtureNodeIds(surface);

  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId,
    initialCourseSectionTitle: "Annotated Figure",
  });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture has no courseDocument.");
  const courseSection = courseDocument.content?.find((child) => child.type === "courseSection");
  if (!courseSection) throw new Error("Slideshow fixture has no courseSection.");
  courseDocument.content = [courseSection, surface];
  return content;
}

function assignFixtureNodeIds(node: JSONContent): void {
  if (node.type !== "text") {
    node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of node.content ?? []) assignFixtureNodeIds(child);
}

function rendererHost(kind: "authoring" | "runtime"): HTMLElement {
  const host = document.createElement("div");
  host.dataset["annotatedFigureRenderer"] = kind;
  host.style.width = "1024px";
  host.style.height = "576px";
  return host;
}

function testMediaPort(): MediaPort {
  return {
    context: "preview",
    resolve: async () => twoToOneImageUrl(),
    upload: async () => {
      throw new Error("Uploads are not available in this browser fixture.");
    },
  };
}

function measureBoundedFigure({ host }: MountedRenderer) {
  const frame = requiredElement<HTMLElement>(host, ".sc-course-annotated-figure");
  return {
    frame,
    content: requiredElement<HTMLElement>(frame, ".sc-course-annotated-figure__content"),
    stage: requiredElement<HTMLElement>(frame, ".sc-course-annotated-figure__stage"),
    canvas: requiredElement<HTMLElement>(frame, ".sc-course-annotated-figure__canvas"),
    legend: requiredElement<HTMLElement>(frame, ".sc-course-annotated-figure__legend"),
  };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector));
  return requiredElement<T>(root, selector);
}

function dispatchPointer(
  target: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  input: { pointerId: number; x: number; y: number; pointerType?: "mouse" | "touch" },
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      button: 0,
      clientX: input.x,
      clientY: input.y,
      isPrimary: true,
      pointerId: input.pointerId,
      pointerType: input.pointerType ?? "mouse",
    }),
  );
}

function installSyntheticPointerCapture(element: HTMLElement): void {
  let capturedPointerId: number | null = null;
  Object.defineProperties(element, {
    hasPointerCapture: {
      configurable: true,
      value: (pointerId: number) => capturedPointerId === pointerId,
    },
    releasePointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        if (capturedPointerId === pointerId) capturedPointerId = null;
      },
    },
    setPointerCapture: {
      configurable: true,
      value: (pointerId: number) => {
        capturedPointerId = pointerId;
      },
    },
  });
}

function resolveFirstAnnotatedFigureModel(editor: TiptapEditor) {
  const owners: Array<Parameters<typeof resolveAnnotatedFigureModel>[0]> = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "annotated_figure") return true;
    owners.push({ node, pos });
    return false;
  });
  const owner = owners[0];
  return owner ? resolveAnnotatedFigureModel(owner) : null;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for Annotated Figure browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function twoToOneImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%2300A689'/%3E%3C/svg%3E";
}

function oneToTwoImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='400'%3E%3Crect width='200' height='400' fill='%23212b58'/%3E%3C/svg%3E";
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
