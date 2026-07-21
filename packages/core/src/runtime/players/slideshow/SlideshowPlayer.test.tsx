// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";

import { SlideshowPlayer } from "./SlideshowPlayer";

let restoreFullscreenHarness: (() => void) | null = null;

class ResizeObserverStub implements ResizeObserver {
  static instances: ResizeObserverStub[] = [];
  static initialSize = { width: 1024, height: 576 };

  readonly observe = vi.fn((target: Element) => {
    this.target = target;
    if (!target.matches(".sc-slideshow-player__viewport, .sc-slideshow-player__stage")) {
      return;
    }
    this.emit(ResizeObserverStub.initialSize.width, ResizeObserverStub.initialSize.height);
  });
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();
  private target: Element | null = null;

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  emit(width: number, height: number) {
    if (!this.target) {
      return;
    }

    this.callback(
      [
        {
          target: this.target,
          contentRect: { width, height },
        } as ResizeObserverEntry,
      ],
      this,
    );
  }
}

beforeEach(() => {
  ResizeObserverStub.instances = [];
  ResizeObserverStub.initialSize = { width: 1024, height: 576 };
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

afterEach(() => {
  restoreFullscreenHarness?.();
  restoreFullscreenHarness = null;
  cleanup();
  document
    .querySelectorAll("iframe[data-test-slideshow-owner-document]")
    .forEach((frame) => frame.remove());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function paragraph(text: string): JSONContent {
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function slideshowDocumentContent(surfaces: Array<{ id: string; text: string }>): JSONContent {
  const firstSurfaceId = surfaces[0]?.id ?? "slide-1";
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: firstSurfaceId,
  });
  const courseDocument = content.content?.[0];

  if (!courseDocument) {
    throw new Error("slideshow player test document is missing courseDocument");
  }

  courseDocument.attrs = {
    ...courseDocument.attrs,
    mode: "slideshow",
  };
  courseDocument.content = surfaces.map((surface) => ({
    type: "surface",
    attrs: { id: surface.id, variant: "slide-cover" },
    content: [paragraph(surface.text)],
  }));

  return content;
}

function slideshowDocumentContentWithRuntimeHint(): JSONContent {
  const content = slideshowDocumentContent([{ id: "slide-1", text: "Hinted slide" }]);
  const surface = content.content?.[0]?.content?.[0];

  if (!surface) {
    throw new Error("slideshow player test document is missing its first surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-fullscreen-popover",
        assessment: {
          correctOptionId: "choice-b",
          feedbackByOptionId: {},
          summaryFeedback: null,
        },
        settings: {
          feedbackMode: "on_submit",
          isGraded: true,
          showAnswer: true,
          legend: "Choose a letter",
          points: 1,
          maxAttempts: null,
        },
      },
      content: [
        { type: "assessment_title", content: [{ type: "paragraph" }] },
        { type: "assessment_instructions", content: [{ type: "paragraph" }] },
        {
          type: "assessment_prompt",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Pick B" }] }],
        },
        {
          type: "assessment_choices_group",
          content: [selectableChoice("choice-a", "A"), selectableChoice("choice-b", "B")],
        },
        {
          type: "assessment_actions_group",
          content: [
            {
              type: "assessment_hints_group",
              content: [
                {
                  type: "assessment_hint",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "The answer follows A." }],
                    },
                  ],
                },
              ],
            },
            { type: "assessment_summary_feedback" },
          ],
        },
      ],
    },
  ];

  return content;
}

function selectableChoice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      },
    ],
  };
}

function surfaceById(surfaceId: string): HTMLElement {
  const surface = document.body.querySelector(`[data-surface-id="${surfaceId}"]`);

  if (!(surface instanceof HTMLElement)) {
    throw new Error(`surface ${surfaceId} was not rendered`);
  }

  return surface;
}

function buttonByName(name: string): HTMLButtonElement {
  const button = screen.getByRole("button", { name });

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`${name} control is not a button element`);
  }

  return button;
}

function installFullscreenHarness({ requestError }: { requestError?: Error } = {}) {
  return installFullscreenHarnessForDocument(
    document,
    window,
    requestError === undefined ? {} : { requestError },
  );
}

function installFullscreenHarnessForDocument(
  ownerDocument: Document,
  ownerWindow: Window,
  { requestError }: { requestError?: Error } = {},
) {
  const OwnerEvent = (ownerWindow as Window & typeof globalThis).Event;
  const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;
  const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
    ownerDocument,
    "fullscreenEnabled",
  );
  const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
    ownerDocument,
    "fullscreenElement",
  );
  const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(ownerDocument, "exitFullscreen");
  const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
    OwnerHTMLElement.prototype,
    "requestFullscreen",
  );
  let fullscreenElement: Element | null = null;
  const enterFullscreen = (element: Element) => {
    fullscreenElement = element;
    ownerDocument.dispatchEvent(new OwnerEvent("fullscreenchange"));
  };
  const requestFullscreen = vi.fn(async function requestFullscreen(this: HTMLElement) {
    if (requestError) {
      throw requestError;
    }
    enterFullscreen(this);
  });
  const exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    ownerDocument.dispatchEvent(new OwnerEvent("fullscreenchange"));
  });

  Object.defineProperties(ownerDocument, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: { configurable: true, value: exitFullscreen },
  });
  Object.defineProperty(OwnerHTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });

  restoreFullscreenHarness = () => {
    restoreProperty(ownerDocument, "fullscreenEnabled", fullscreenEnabledDescriptor);
    restoreProperty(ownerDocument, "fullscreenElement", fullscreenElementDescriptor);
    restoreProperty(ownerDocument, "exitFullscreen", exitFullscreenDescriptor);
    restoreProperty(OwnerHTMLElement.prototype, "requestFullscreen", requestFullscreenDescriptor);
  };

  return { requestFullscreen, exitFullscreen };
}

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) {
    Object.defineProperty(target, property, descriptor);
    return;
  }

  Reflect.deleteProperty(target, property);
}

describe("SlideshowPlayer", () => {
  it("renders a one-slide slideshow with disabled boundary controls", async () => {
    const onRendererReady = vi.fn();

    render(
      <SlideshowPlayer
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Only slide content" }])}
        surfaceIds={["slide-1"]}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));

    const player = screen.getByTestId("slideshow-player");
    expect(player.getAttribute("data-runtime-player")).toBe("slideshow");
    expect(player.getAttribute("data-slideshow-sizing")).toBe("contained");
    expect(player.classList.contains("sc-slideshow-player")).toBe(true);
    expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("course-document-runtime-renderer")
        .closest(".sc-slideshow-player__viewport"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("course-document-runtime-renderer").closest(".sc-slideshow-player__stage"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("slideshow-controls").closest(".sc-slideshow-player__chrome"),
    ).not.toBeNull();
    expect(
      screen.getByTestId("slideshow-controls").closest(".sc-slideshow-player__stage"),
    ).not.toBeNull();
    expect(screen.getByText("1 of 1")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(buttonByName("Next slide").disabled).toBe(true);
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-visible")).toBe("true");
  });

  it("requests fullscreen for the slideshow viewport", async () => {
    const user = userEvent.setup();
    const { requestFullscreen } = installFullscreenHarness();

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Fullscreen slide" }])}
        surfaceIds={["slide-1"]}
        sizing="embedded"
      />,
    );

    const enterFullscreen = await screen.findByRole("button", { name: "Enter fullscreen" });
    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");

    await user.click(enterFullscreen);

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen.mock.instances[0]).toBe(viewport);
    expect(
      (await screen.findByRole("button", { name: "Exit fullscreen" })).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("keeps runtime popovers inside the active fullscreen viewport", async () => {
    const user = userEvent.setup();
    installFullscreenHarness();

    render(
      <ScaffoldArtifactIdentityProvider artifactId="artifact-fullscreen-popover">
        <AssessmentRuntimeProvider>
          <SlideshowPlayer
            artifactId="artifact-fullscreen-popover"
            initialContent={slideshowDocumentContentWithRuntimeHint()}
            surfaceIds={["slide-1"]}
            sizing="embedded"
          />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    await user.click(await screen.findByRole("button", { name: "Show a hint" }));

    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");
    await waitFor(() =>
      expect(document.body.querySelector(".sc-assessment-hint-popover--runtime")).not.toBeNull(),
    );
    const hintPopover = document.body.querySelector(".sc-assessment-hint-popover--runtime");

    expect(viewport?.contains(hintPopover)).toBe(true);
  });

  it("uses the viewport owner document and retargets one host across fullscreen", async () => {
    const frame = document.createElement("iframe");
    frame.dataset.testSlideshowOwnerDocument = "";
    document.body.append(frame);
    const ownerDocument = frame.contentDocument;
    const ownerWindow = frame.contentWindow;
    if (ownerDocument === null || ownerWindow === null) {
      throw new Error("Expected Slideshow iframe owner document and window");
    }

    const mount = ownerDocument.createElement("div");
    ownerDocument.body.append(mount);
    const ownerAddEventListener = vi.spyOn(ownerDocument, "addEventListener");
    const ownerRemoveEventListener = vi.spyOn(ownerDocument, "removeEventListener");
    const ambientAddEventListener = vi.spyOn(document, "addEventListener");
    const { requestFullscreen, exitFullscreen } = installFullscreenHarnessForDocument(
      ownerDocument,
      ownerWindow,
    );
    const user = userEvent.setup({ document: ownerDocument });
    const { unmount } = render(
      <ScaffoldArtifactIdentityProvider artifactId="artifact-owner-document-popover">
        <AssessmentRuntimeProvider>
          <SlideshowPlayer
            artifactId="artifact-owner-document-popover"
            initialContent={slideshowDocumentContentWithRuntimeHint()}
            surfaceIds={["slide-1"]}
            sizing="embedded"
          />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>,
      { container: mount },
    );

    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    });
    const viewport = ownerDocument.querySelector<HTMLElement>(".sc-slideshow-player__viewport");
    const canvas = ownerDocument.querySelector<HTMLElement>(".sc-slideshow-player__canvas");
    if (viewport === null || canvas === null) throw new Error("Expected Slideshow viewport/canvas");
    const normalHost = ownerDocument.querySelector<HTMLElement>("[data-scaffold-overlay-host]");
    if (normalHost === null) throw new Error("Expected normal Slideshow overlay host");

    expect(normalHost.parentElement).toBe(ownerDocument.body);
    expect(canvas.contains(normalHost)).toBe(false);
    expect(normalHost.ownerDocument).toBe(ownerDocument);

    await user.click(buttonByNameIn(ownerDocument, "Show a hint"));
    await waitFor(() => {
      expect(normalHost.querySelector(".sc-assessment-hint-popover--runtime")).not.toBeNull();
    });
    await user.click(buttonByNameIn(ownerDocument, "Enter fullscreen"));

    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
      expect(viewport.querySelector("[data-scaffold-overlay-host]")).not.toBeNull();
    });
    const fullscreenHost = viewport.querySelector<HTMLElement>("[data-scaffold-overlay-host]");
    if (fullscreenHost === null) throw new Error("Expected fullscreen Slideshow overlay host");

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen.mock.instances[0]).toBe(viewport);
    expect(normalHost.isConnected).toBe(false);
    expect(fullscreenHost).not.toBe(normalHost);
    expect(canvas.contains(fullscreenHost)).toBe(false);
    const popoverAfterEntry = ownerDocument.querySelector(".sc-assessment-hint-popover--runtime");
    if (popoverAfterEntry === null) {
      await user.click(runtimeHintTriggerIn(ownerDocument));
      await waitFor(() => {
        expect(fullscreenHost.querySelector(".sc-assessment-hint-popover--runtime")).not.toBeNull();
      });
    } else {
      expect(fullscreenHost.contains(popoverAfterEntry)).toBe(true);
    }

    await user.click(buttonByNameIn(ownerDocument, "Exit fullscreen"));
    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
      expect(viewport.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    });
    const restoredHost = ownerDocument.querySelector<HTMLElement>("[data-scaffold-overlay-host]");
    if (restoredHost === null) throw new Error("Expected restored Slideshow overlay host");

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenHost.isConnected).toBe(false);
    expect(restoredHost.parentElement).toBe(ownerDocument.body);
    const popoverAfterExit = ownerDocument.querySelector(".sc-assessment-hint-popover--runtime");
    if (popoverAfterExit === null) {
      await user.click(runtimeHintTriggerIn(ownerDocument));
      await waitFor(() => {
        expect(restoredHost.querySelector(".sc-assessment-hint-popover--runtime")).not.toBeNull();
      });
    } else {
      expect(restoredHost.contains(popoverAfterExit)).toBe(true);
    }
    expect(ownerAddEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      true,
    );
    expect(ambientAddEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      false,
    );

    unmount();

    expect(restoredHost.isConnected).toBe(false);
    expect(ownerDocument.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    expect(ownerRemoveEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      true,
    );
  });

  it("exits fullscreen from the runtime control", async () => {
    const user = userEvent.setup();
    const { exitFullscreen } = installFullscreenHarness();

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Fullscreen slide" }])}
        surfaceIds={["slide-1"]}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    await user.click(await screen.findByRole("button", { name: "Exit fullscreen" }));

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Enter fullscreen" })).toBeInTheDocument();
  });

  it("announces when fullscreen cannot be opened", async () => {
    const user = userEvent.setup();
    installFullscreenHarness({ requestError: new Error("fullscreen denied") });

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Fullscreen slide" }])}
        surfaceIds={["slide-1"]}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));

    expect(await screen.findByText("Fullscreen could not be opened")).toBeInTheDocument();
  });

  it("uses fullscreen viewport bounds to scale beyond the intrinsic canvas", async () => {
    const user = userEvent.setup();
    installFullscreenHarness();

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Fullscreen slide" }])}
        surfaceIds={["slide-1"]}
        sizing="embedded"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(ResizeObserverStub.instances).toHaveLength(2));

    const observer = ResizeObserverStub.instances[1]!;
    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");
    expect(observer.observe).toHaveBeenCalledWith(viewport);

    observer.emit(1920, 1080);

    const stage = document.body.querySelector<HTMLElement>(".sc-slideshow-player__stage")!;
    const canvas = document.body.querySelector<HTMLElement>(".sc-slideshow-player__canvas")!;
    await waitFor(() => expect(stage.style.width).toBe("1920px"));
    expect(stage.style.height).toBe("1080px");
    expect(canvas.style.transform).toBe("scale(1.875)");
  });

  it("keeps slide navigation separate from fullscreen utilities", async () => {
    installFullscreenHarness();

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Fullscreen slide" }])}
        surfaceIds={["slide-1"]}
      />,
    );

    const navigationGroup = await screen.findByRole("group", { name: "Slide navigation" });
    const viewGroup = screen.getByRole("group", { name: "Slideshow view" });

    expect(navigationGroup.contains(buttonByName("Previous slide"))).toBe(true);
    expect(navigationGroup.contains(buttonByName("Next slide"))).toBe(true);
    expect(navigationGroup.contains(buttonByName("Enter fullscreen"))).toBe(false);
    expect(viewGroup.contains(buttonByName("Enter fullscreen"))).toBe(true);
  });

  it("fits one intrinsic renderer while keeping player chrome unscaled", async () => {
    const onRendererReady = vi.fn();

    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Scaled slide" }])}
        surfaceIds={["slide-1"]}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));
    expect(ResizeObserverStub.instances).toHaveLength(1);
    const observer = ResizeObserverStub.instances[0]!;
    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");
    expect(observer.observe).toHaveBeenCalledOnce();
    expect(observer.observe).toHaveBeenCalledWith(viewport);

    observer.emit(512, 800);

    await waitFor(() => {
      expect(
        document.body.querySelector<HTMLElement>(".sc-slideshow-player__stage")?.style.width,
      ).toBe("512px");
    });
    const stage = document.body.querySelector<HTMLElement>(".sc-slideshow-player__stage")!;
    const canvas = document.body.querySelector<HTMLElement>(".sc-slideshow-player__canvas")!;
    expect(stage.style.height).toBe("288px");
    expect(canvas.style.width).toBe("1024px");
    expect(canvas.style.height).toBe("576px");
    expect(canvas.style.transform).toBe("scale(0.5)");
    expect(canvas.style.transformOrigin).toBe("top left");
    expect(
      screen.getByTestId("slideshow-controls").closest(".sc-slideshow-player__canvas"),
    ).toBeNull();

    observer.emit(2048, 1152);
    await waitFor(() => expect(stage.style.width).toBe("2048px"));
    expect(stage.style.height).toBe("1152px");
    expect(canvas.style.transform).toBe("scale(2)");

    observer.emit(400, 1000);
    await waitFor(() => expect(stage.style.width).toBe("400px"));
    expect(stage.style.height).toBe("225px");
    expect(canvas.style.transform).toBe("scale(0.390625)");

    observer.emit(0, 0);
    expect(stage.style.width).toBe("400px");
    expect(stage.style.height).toBe("225px");
  });

  it("withholds the stage until the viewport has valid bounds and disconnects on unmount", async () => {
    ResizeObserverStub.initialSize = { width: 0, height: 0 };
    const { unmount } = render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Deferred slide" }])}
        surfaceIds={["slide-1"]}
      />,
    );

    expect(document.body.querySelector(".sc-slideshow-player__stage")).toBeNull();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();

    const observer = ResizeObserverStub.instances[0]!;
    observer.emit(1024, 288);
    await waitFor(() =>
      expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument(),
    );
    expect(
      document.body.querySelector<HTMLElement>(".sc-slideshow-player__stage")?.style.width,
    ).toBe("512px");

    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });

  it("establishes an embedded stage before rendering into measured bounds", async () => {
    ResizeObserverStub.initialSize = { width: 0, height: 0 };
    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([{ id: "slide-1", text: "Embedded slide" }])}
        surfaceIds={["slide-1"]}
        sizing="embedded"
      />,
    );

    const player = screen.getByTestId("slideshow-player");
    const stage = document.body.querySelector(".sc-slideshow-player__stage");
    expect(player.getAttribute("data-slideshow-sizing")).toBe("embedded");
    expect(stage).not.toBeNull();
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();

    const observer = ResizeObserverStub.instances[0]!;
    expect(observer.observe).toHaveBeenCalledOnce();
    expect(observer.observe).toHaveBeenCalledWith(stage);

    observer.emit(1024, 576);
    await waitFor(() =>
      expect(screen.getByTestId("course-document-runtime-renderer")).toBeInTheDocument(),
    );
    expect(
      document.body.querySelector<HTMLElement>(".sc-slideshow-player__canvas")?.style.transform,
    ).toBe("scale(1)");

    observer.emit(1536, 864);
    await waitFor(() =>
      expect(
        document.body.querySelector<HTMLElement>(".sc-slideshow-player__canvas")?.style.transform,
      ).toBe("scale(1.5)"),
    );
  });

  it("retains the last embedded scale when the stage temporarily reports zero bounds", async () => {
    ResizeObserverStub.initialSize = { width: 512, height: 288 };
    const onRendererReady = vi.fn();
    render(
      <SlideshowPlayer
        initialContent={slideshowDocumentContent([
          { id: "slide-1", text: "Measured embedded slide" },
        ])}
        surfaceIds={["slide-1"]}
        sizing="embedded"
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));
    const observer = ResizeObserverStub.instances[0]!;
    const stage = document.body.querySelector(".sc-slideshow-player__stage");
    const canvas = document.body.querySelector<HTMLElement>(".sc-slideshow-player__canvas")!;
    expect(observer.observe).toHaveBeenCalledWith(stage);
    expect(canvas.style.transform).toBe("scale(0.5)");
    expect(
      screen.getByTestId("slideshow-controls").closest(".sc-slideshow-player__canvas"),
    ).toBeNull();

    observer.emit(0, 0);
    expect(canvas.style.transform).toBe("scale(0.5)");
  });

  it("rejects a slideshow document without 16x9 view settings", () => {
    const initialContent = slideshowDocumentContent([{ id: "slide-1", text: "Invalid slide" }]);
    initialContent.content![0]!.attrs!.surfaceSize = "fluid";

    render(<SlideshowPlayer initialContent={initialContent} surfaceIds={["slide-1"]} />);

    expect(screen.getByRole("alert").textContent).toContain("Slideshow surface size must be 16x9.");
    expect(ResizeObserverStub.instances).toHaveLength(0);
    expect(screen.queryByTestId("course-document-runtime-renderer")).toBeNull();
  });

  it("navigates a multi-slide slideshow without changing document JSON", async () => {
    const user = userEvent.setup();
    const readyEditors: TiptapEditor[] = [];
    const onRendererReady = vi.fn((editor: TiptapEditor) => {
      readyEditors.push(editor);
    });

    render(
      <SlideshowPlayer
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([
          { id: "slide-1", text: "First slide content" },
          { id: "slide-2", text: "Second slide content" },
          { id: "slide-3", text: "Third slide content" },
        ])}
        surfaceIds={["slide-1", "slide-2", "slide-3"]}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));
    const editor = readyEditors[0];
    if (!editor) {
      throw new Error("slideshow player did not provide an editor");
    }
    const initialJSON = editor.getJSON();

    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(buttonByName("Next slide").disabled).toBe(false);
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-state")).toBe("current");
    expect(surfaceById("slide-2").getAttribute("data-runtime-surface-state")).toBe("next");
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(surfaceById("slide-2").getAttribute("data-runtime-surface-hidden")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(surfaceById("slide-2").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(false);
    expect(buttonByName("Next slide").disabled).toBe(false);
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-state")).toBe("previous");
    expect(surfaceById("slide-2").getAttribute("data-runtime-surface-state")).toBe("current");
    expect(surfaceById("slide-3").getAttribute("data-runtime-surface-state")).toBe("next");
    expect(surfaceById("slide-1").getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(editor.getJSON()).toEqual(initialJSON);

    await user.click(screen.getByRole("button", { name: "Previous slide" }));

    await waitFor(() =>
      expect(surfaceById("slide-1").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(editor.getJSON()).toEqual(initialJSON);

    await user.click(screen.getByRole("button", { name: "Next slide" }));
    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(surfaceById("slide-3").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(buttonByName("Next slide").disabled).toBe(true);
    expect(editor.getJSON()).toEqual(initialJSON);
  });

  it("omits authoring and expanded slideshow product controls", async () => {
    const onRendererReady = vi.fn();

    render(
      <SlideshowPlayer
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([
          { id: "slide-1", text: "First slide content" },
          { id: "slide-2", text: "Second slide content" },
        ])}
        surfaceIds={["slide-1", "slide-2"]}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /autoplay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /narration/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /presenter notes/i })).toBeNull();
    expect(screen.queryByTestId("slide-thumbnails")).toBeNull();
    expect(screen.queryByTestId("authoring-agent-dock")).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="bubble"]')).toBeNull();
    expect(document.body.querySelector('[data-authoring-chrome="menu"]')).toBeNull();
  });
});

function buttonByNameIn(root: ParentNode, name: string): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
  );

  if (button === undefined) throw new Error(`${name} control is not a button element`);
  return button as HTMLButtonElement;
}

function runtimeHintTriggerIn(root: ParentNode): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll("button")).find((candidate) =>
    /^Show(?: a| \d+) hints?$/.test(candidate.textContent?.trim() ?? ""),
  );
  if (button === undefined) throw new Error("Expected runtime hint trigger");
  return button as HTMLButtonElement;
}
