// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import {
  act,
  cleanup,
  render as renderTest,
  screen,
  waitFor,
  type RenderOptions,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import {
  createCoreScaffoldRuntimeComposition,
  type ScaffoldRuntimeComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { ScaffoldProductAccess } from "@/host/contracts/product-access";
import { projectCourseStructure, type SurfaceId } from "@/document/model/course-structure";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import {
  checkRuntimeDocumentReadiness,
  type PreparedCourseDocumentRuntimeRendererProps,
} from "@/runtime/renderer/CourseDocumentRuntimeRenderer";

import { SlideshowPlayer, type SlideshowPlayerProps } from "./SlideshowPlayer";
import type {
  SurfaceExitEnvironment,
  SurfaceExitGuard,
  SurfaceExitGuardSnapshot,
} from "./surface-exit-environment";
import type { SurfaceExitEnvironmentAvailability } from "./SurfaceExitEnvironmentProvider";

const surfaceExitEnvironmentProbe = vi.hoisted(() => ({ availability: null as unknown }));

vi.mock("../../renderer/CourseDocumentRuntimeRenderer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../renderer/CourseDocumentRuntimeRenderer")>();
  const { createElement } = await import("react");
  const { useSurfaceExitEnvironmentAvailability } =
    await import("./SurfaceExitEnvironmentProvider");

  return {
    ...actual,
    PreparedCourseDocumentRuntimeRenderer(props: PreparedCourseDocumentRuntimeRendererProps) {
      surfaceExitEnvironmentProbe.availability = useSurfaceExitEnvironmentAvailability();
      return createElement(actual.PreparedCourseDocumentRuntimeRenderer, props);
    },
  };
});

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const coreProductAccess = { scaffoldPlusAuthorized: false } as const;

let restoreFullscreenHarness: (() => void) | null = null;

function render(children: ReactNode, options?: RenderOptions) {
  return renderWithCourseAppearance(children, "light", options);
}

function renderWithCourseAppearance(
  children: ReactNode,
  appearance: ScaffoldColorMode,
  options?: RenderOptions,
) {
  return renderTest(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance={appearance}>
      {children}
    </CourseThemeProvider>,
    options,
  );
}

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
  surfaceExitEnvironmentProbe.availability = null;
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
  const firstSurfaceId = surfaces[0]?.id ?? "slide_000001";
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    initialCourseSectionTitle: "Introduction",
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
  courseDocument.content = [
    { type: "courseSection", attrs: { id: "section00001", title: "Introduction" } },
    ...surfaces.map((surface) => ({
      type: "surface",
      attrs: { id: surface.id, variant: "slide-cover" },
      content: [paragraph(surface.text)],
    })),
  ];

  return content;
}

function sectionedSlideshowDocumentContent(
  sections: Array<{ id: string; title: string; surfaces: Array<{ id: string; text: string }> }>,
): JSONContent {
  const surfaces = sections.flatMap((section) => section.surfaces);
  const content = slideshowDocumentContent(surfaces);
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("sectioned slideshow fixture is missing courseDocument");
  const surfaceById = new Map(
    (courseDocument.content ?? []).map((surface) => [surface.attrs?.["id"], surface]),
  );
  courseDocument.content = sections.flatMap((section) => [
    { type: "courseSection", attrs: { id: section.id, title: section.title } },
    ...section.surfaces.map(({ id }) => surfaceById.get(id)!),
  ]);
  return content;
}

function slideshowDocumentContentWithRuntimeHint(): JSONContent {
  const content = slideshowDocumentContent([{ id: "slide_000001", text: "Hinted slide" }]);
  const surface = content.content?.[0]?.content?.[1];

  if (!surface) {
    throw new Error("slideshow player test document is missing its first surface");
  }

  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcqFullscr01",
        assessment: {
          correctOptionId: "option000002",
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
          content: [selectableChoice("option000001", "A"), selectableChoice("option000002", "B")],
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
  const surface = document.body.querySelector(`[data-node="surface"][data-id="${surfaceId}"]`);

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

function TestSlideshowPlayer(
  props: Omit<SlideshowPlayerProps, "preparedDocument" | "structure"> & {
    readonly composition: ScaffoldRuntimeComposition;
    readonly initialContent: JSONContent;
    readonly productAccess?: ScaffoldProductAccess;
  },
) {
  const { composition, initialContent, productAccess = coreProductAccess, ...playerProps } = props;
  normalizeRuntimeFixtureIds(initialContent);
  const readiness = checkRuntimeDocumentReadiness(initialContent, composition, productAccess);
  if (readiness.status !== "supported") {
    throw new Error(`Expected a prepared Slideshow fixture, received ${readiness.status}.`);
  }
  const structure = projectCourseStructure(readiness.preparedDocument.content);
  if (!structure || structure.mode !== "slideshow") {
    throw new Error("Expected a projected Slideshow fixture.");
  }
  return (
    <SlideshowPlayer
      {...playerProps}
      preparedDocument={readiness.preparedDocument}
      structure={structure}
    />
  );
}

function normalizeRuntimeFixtureIds(content: JSONContent): void {
  const seen = new Set<string>();
  const stack = [content];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type !== "doc" && node.type !== "text") {
      const id = node.attrs?.id;
      if (!EmbeddedNodeIdSchema.safeParse(id).success || seen.has(String(id))) {
        node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
      }
      seen.add(String(node.attrs?.id));
    }
    stack.push(...(node.content ?? []));
  }
}

function surfaceExitEnvironmentFromRenderer(): SurfaceExitEnvironment {
  const availability =
    surfaceExitEnvironmentProbe.availability as SurfaceExitEnvironmentAvailability;
  if (availability.status !== "available") {
    throw new Error("Slideshow renderer did not receive the Surface Exit Environment");
  }
  return availability.environment;
}

function controllableQuizExitGuard(surfaceId: SurfaceId) {
  const ownerId = `quiz-${surfaceId}`;
  const listeners = new Set<() => void>();
  let attemptStatus: "not_started" | "in_progress" | null = null;
  const guard: SurfaceExitGuard = {
    ownerId,
    surfaceId,
    getSnapshot(): SurfaceExitGuardSnapshot {
      if (attemptStatus === null) return { status: "allowed" };
      return {
        status: "blocked",
        blocker: {
          reason: "quiz-not-complete",
          ownerId,
          surfaceId,
          attemptStatus,
        },
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    guard,
    setAttemptStatus(nextAttemptStatus: "not_started" | "in_progress" | null) {
      attemptStatus = nextAttemptStatus;
    },
    publish() {
      for (const listener of listeners) listener();
    },
  };
}

describe("SlideshowPlayer", () => {
  it("provides one lifecycle Surface Exit Environment to the renderer and disposes it", async () => {
    const { unmount } = render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Environment slide" },
        ])}
      />,
    );

    await waitFor(() =>
      expect(surfaceExitEnvironmentProbe.availability).toMatchObject({ status: "available" }),
    );
    const environment = surfaceExitEnvironmentFromRenderer();
    expect(environment.getSnapshot()).toMatchObject({
      status: "allowed",
      surfaceId: "slide_000001",
    });

    unmount();

    expect(() => environment.getSnapshot()).toThrow("Surface Exit Environment has been disposed");
  });

  it("keeps the active Surface setter behind one request commit callback", () => {
    const source = readFileSync("src/runtime/players/slideshow/SlideshowPlayer.tsx", "utf8");
    const setterReferences = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("setActiveSurfaceId"));

    expect(setterReferences).toEqual([
      "const [activeSurfaceId, setActiveSurfaceId] = useState(initialActiveSurfaceId);",
      "surfaceExitEnvironmentOwner.setActiveSurfaceId(surfaceId);",
      "setActiveSurfaceId(surfaceId);",
    ]);
  });

  it.each(["light", "dark"] as const)(
    "passes the resolved %s course mode into slideshow content",
    async (mode) => {
      const onRendererReady = vi.fn();
      renderWithCourseAppearance(
        <TestSlideshowPlayer
          composition={runtimeComposition}
          initialContent={slideshowDocumentContent([
            { id: "slide_theme1", text: "Themed slide content" },
          ])}
          onRendererReady={onRendererReady}
        />,
        mode,
      );

      await waitFor(() => expect(onRendererReady).toHaveBeenCalledOnce());
      expect(
        screen.getByTestId("course-document-runtime-renderer").closest(".sc-course"),
      ).toHaveClass(mode, "sc-course-theme-scaffold-flow-v1");
    },
  );

  it("renders a one-slide slideshow with disabled boundary controls", async () => {
    const onRendererReady = vi.fn();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Only slide content" },
        ])}
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
    expect(screen.getByRole("status")).toHaveTextContent("1 of 1");
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(buttonByName("Next slide").disabled).toBe(true);
    expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-visible")).toBe("true");
  });

  it("requests fullscreen for the slideshow viewport", async () => {
    const user = userEvent.setup();
    const { requestFullscreen } = installFullscreenHarness();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Fullscreen slide" },
        ])}
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
          <TestSlideshowPlayer
            composition={runtimeComposition}
            artifactId="artifact-fullscreen-popover"
            initialContent={slideshowDocumentContentWithRuntimeHint()}
            sizing="embedded"
            surfaceRuntimeProgramSource={(surfaceId) =>
              Object.freeze({
                presentation: Object.freeze({
                  autoAdvance: false,
                  timeline: Object.freeze({
                    surfaceId,
                    durationMs: 0,
                    cues: Object.freeze([]),
                    waits: Object.freeze([]),
                  }),
                }),
              })
            }
          />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>,
    );

    await waitFor(() =>
      expect(document.body.querySelector(".sc-slideshow-player__canvas")).toHaveAttribute("inert"),
    );
    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    await user.click(await screen.findByRole("button", { name: "Show a hint" }));

    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");
    await waitFor(() =>
      expect(
        document.body.querySelector(".sc-course-assessment-hint-popover--runtime"),
      ).not.toBeNull(),
    );
    const hintPopover = document.body.querySelector(".sc-course-assessment-hint-popover--runtime");

    expect(viewport?.contains(hintPopover)).toBe(true);
    const contentOwner = hintPopover?.closest<HTMLElement>(
      '[data-slideshow-overlay-owner="content"]',
    );
    const chromeOwner = document.body.querySelector<HTMLElement>(
      '[data-slideshow-overlay-owner="chrome"]',
    );
    expect(contentOwner).toHaveAttribute("inert");
    expect(chromeOwner).not.toBeNull();
    expect(chromeOwner).not.toHaveAttribute("inert");
  });

  it("uses the viewport owner document and retargets distinct content and chrome hosts", async () => {
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
          <TestSlideshowPlayer
            composition={runtimeComposition}
            artifactId="artifact-owner-document-popover"
            initialContent={slideshowDocumentContentWithRuntimeHint()}
            sizing="embedded"
          />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>,
      { container: mount },
    );

    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(2);
    });
    const viewport = ownerDocument.querySelector<HTMLElement>(".sc-slideshow-player__viewport");
    const canvas = ownerDocument.querySelector<HTMLElement>(".sc-slideshow-player__canvas");
    if (viewport === null || canvas === null) throw new Error("Expected Slideshow viewport/canvas");
    const normalContentOwner = slideshowOverlayOwner(ownerDocument, "content");
    const normalChromeOwner = slideshowOverlayOwner(ownerDocument, "chrome");
    const normalContentHost = normalContentOwner.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );
    const normalChromeHost = normalChromeOwner.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );
    if (normalContentHost === null || normalChromeHost === null) {
      throw new Error("Expected normal Slideshow content and chrome hosts");
    }

    expect(normalContentOwner.parentElement).toBe(ownerDocument.body);
    expect(normalChromeOwner.parentElement).toBe(ownerDocument.body);
    expect(canvas.contains(normalContentHost)).toBe(false);
    expect(normalContentHost.ownerDocument).toBe(ownerDocument);
    expect(normalChromeHost.ownerDocument).toBe(ownerDocument);
    expect(normalContentOwner.dataset.slideshowOverlayInstance).toBe(
      normalChromeOwner.dataset.slideshowOverlayInstance,
    );

    await user.click(buttonByNameIn(ownerDocument, "Show a hint"));
    await waitFor(() => {
      expect(
        normalContentHost.querySelector(".sc-course-assessment-hint-popover--runtime"),
      ).not.toBeNull();
    });
    await user.click(buttonByNameIn(ownerDocument, "Enter fullscreen"));

    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(2);
      expect(viewport.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(2);
    });
    const fullscreenContentOwner = slideshowOverlayOwner(viewport, "content");
    const fullscreenChromeOwner = slideshowOverlayOwner(viewport, "chrome");
    const fullscreenContentHost = fullscreenContentOwner.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );
    if (fullscreenContentHost === null) {
      throw new Error("Expected fullscreen Slideshow content host");
    }

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(requestFullscreen.mock.instances[0]).toBe(viewport);
    expect(normalContentOwner.isConnected).toBe(false);
    expect(normalChromeOwner.isConnected).toBe(false);
    expect(fullscreenContentOwner).not.toBe(normalContentOwner);
    expect(fullscreenChromeOwner).not.toBe(normalChromeOwner);
    expect(canvas.contains(fullscreenContentHost)).toBe(false);
    const popoverAfterEntry = ownerDocument.querySelector(
      ".sc-course-assessment-hint-popover--runtime",
    );
    if (popoverAfterEntry === null) {
      await user.click(runtimeHintTriggerIn(ownerDocument));
      await waitFor(() => {
        expect(
          fullscreenContentHost.querySelector(".sc-course-assessment-hint-popover--runtime"),
        ).not.toBeNull();
      });
    } else {
      expect(fullscreenContentHost.contains(popoverAfterEntry)).toBe(true);
    }

    await user.click(buttonByNameIn(ownerDocument, "Exit fullscreen"));
    await waitFor(() => {
      expect(ownerDocument.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(2);
      expect(viewport.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    });
    const restoredContentOwner = slideshowOverlayOwner(ownerDocument, "content");
    const restoredChromeOwner = slideshowOverlayOwner(ownerDocument, "chrome");
    const restoredContentHost = restoredContentOwner.querySelector<HTMLElement>(
      "[data-scaffold-overlay-host]",
    );
    if (restoredContentHost === null) throw new Error("Expected restored Slideshow content host");

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(fullscreenContentOwner.isConnected).toBe(false);
    expect(fullscreenChromeOwner.isConnected).toBe(false);
    expect(restoredContentOwner.parentElement).toBe(ownerDocument.body);
    expect(restoredChromeOwner.parentElement).toBe(ownerDocument.body);
    const popoverAfterExit = ownerDocument.querySelector(
      ".sc-course-assessment-hint-popover--runtime",
    );
    if (popoverAfterExit === null) {
      await user.click(runtimeHintTriggerIn(ownerDocument));
      await waitFor(() => {
        expect(
          restoredContentHost.querySelector(".sc-course-assessment-hint-popover--runtime"),
        ).not.toBeNull();
      });
    } else {
      expect(restoredContentHost.contains(popoverAfterExit)).toBe(true);
    }
    expect(ownerAddEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      true,
    );
    expect(ambientAddEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      false,
    );

    unmount();

    expect(restoredContentOwner.isConnected).toBe(false);
    expect(restoredChromeOwner.isConnected).toBe(false);
    expect(ownerDocument.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    expect(ownerRemoveEventListener.mock.calls.some(([type]) => type === "fullscreenchange")).toBe(
      true,
    );
  });

  it("exits fullscreen from the runtime control", async () => {
    const user = userEvent.setup();
    const { exitFullscreen } = installFullscreenHarness();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Fullscreen slide" },
        ])}
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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Fullscreen slide" },
        ])}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));

    expect(await screen.findByText("Fullscreen could not be opened")).toBeInTheDocument();
  });

  it("uses fullscreen viewport bounds to scale beyond the intrinsic canvas", async () => {
    const user = userEvent.setup();
    installFullscreenHarness();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Fullscreen slide" },
        ])}
        sizing="embedded"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    await waitFor(() => expect(ResizeObserverStub.instances).toHaveLength(3));

    const observer = ResizeObserverStub.instances[2]!;
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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Fullscreen slide" },
        ])}
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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([{ id: "slide_000001", text: "Scaled slide" }])}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));
    expect(ResizeObserverStub.instances).toHaveLength(2);
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
    expect(canvas.style.getPropertyValue("--sc-slideshow-canvas-inverse-scale")).toBe("2");
    expect(canvas.style.transformOrigin).toBe("top left");
    expect(
      screen.getByTestId("slideshow-controls").closest(".sc-slideshow-player__canvas"),
    ).toBeNull();

    observer.emit(2048, 1152);
    await waitFor(() => expect(stage.style.width).toBe("2048px"));
    expect(stage.style.height).toBe("1152px");
    expect(canvas.style.transform).toBe("scale(2)");
    expect(canvas.style.getPropertyValue("--sc-slideshow-canvas-inverse-scale")).toBe("0.5");

    observer.emit(400, 1000);
    await waitFor(() => expect(stage.style.width).toBe("400px"));
    expect(stage.style.height).toBe("225px");
    expect(canvas.style.transform).toBe("scale(0.390625)");
    expect(canvas.style.getPropertyValue("--sc-slideshow-canvas-inverse-scale")).toBe("2.56");

    observer.emit(0, 0);
    expect(stage.style.width).toBe("400px");
    expect(stage.style.height).toBe("225px");
  });

  it("withholds the stage until the viewport has valid bounds and disconnects on unmount", async () => {
    ResizeObserverStub.initialSize = { width: 0, height: 0 };
    const { unmount } = render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([{ id: "slide_000001", text: "Deferred slide" }])}
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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([{ id: "slide_000001", text: "Embedded slide" }])}
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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Measured embedded slide" },
        ])}
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

  it("refuses a slideshow document without 16x9 view settings before player construction", () => {
    const initialContent = slideshowDocumentContent([
      { id: "slide_000001", text: "Invalid slide" },
    ]);
    initialContent.content![0]!.attrs!.surfaceSize = "fluid";
    normalizeRuntimeFixtureIds(initialContent);

    expect(
      checkRuntimeDocumentReadiness(initialContent, runtimeComposition, coreProductAccess),
    ).toEqual(
      expect.objectContaining({
        status: "invalid-learner-content",
      }),
    );

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
      <TestSlideshowPlayer
        composition={runtimeComposition}
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "First slide content" },
          { id: "slide_000002", text: "Second slide content" },
          { id: "slide_000003", text: "Third slide content" },
        ])}
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
    expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-state")).toBe("current");
    expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-state")).toBe("next");
    expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-visible")).toBe("true");
    expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-hidden")).toBe("true");

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(false);
    expect(buttonByName("Next slide").disabled).toBe(false);
    expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-state")).toBe("previous");
    expect(surfaceById("slide_000002").getAttribute("data-runtime-surface-state")).toBe("current");
    expect(surfaceById("slide_000003").getAttribute("data-runtime-surface-state")).toBe("next");
    expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-hidden")).toBe("true");
    expect(editor.getJSON()).toEqual(initialJSON);

    await user.click(screen.getByRole("button", { name: "Previous slide" }));

    await waitFor(() =>
      expect(surfaceById("slide_000001").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(editor.getJSON()).toEqual(initialJSON);

    await user.click(screen.getByRole("button", { name: "Next slide" }));
    await user.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() =>
      expect(surfaceById("slide_000003").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(buttonByName("Next slide").disabled).toBe(true);
    expect(editor.getJSON()).toEqual(initialJSON);
  });

  it("rechecks an unpublished blocker before Next changes the Surface", async () => {
    const user = userEvent.setup();
    const readyEditors: TiptapEditor[] = [];
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "First guarded slide" },
          { id: "slide_000002", text: "Second guarded slide" },
        ])}
        onRendererReady={(editor) => {
          readyEditors.push(editor);
        }}
      />,
    );

    await waitFor(() => expect(readyEditors).toHaveLength(1));
    const editor = readyEditors[0]!;
    const initialJSON = editor.getJSON();
    const guard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000001"));
    surfaceExitEnvironmentFromRenderer().registerGuard(guard.guard);
    guard.setAttemptStatus("in_progress");
    expect(buttonByName("Next slide")).not.toBeDisabled();

    await user.click(buttonByName("Next slide"));

    expect(surfaceById("slide_000001")).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
    expect(editor.getJSON()).toEqual(initialJSON);
  });

  it("rechecks an unpublished blocker before Previous changes the Surface", async () => {
    const user = userEvent.setup();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "First guarded slide" },
          { id: "slide_000002", text: "Second guarded slide" },
        ])}
      />,
    );

    await screen.findByTestId("course-document-runtime-renderer");
    const guard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000002"));
    surfaceExitEnvironmentFromRenderer().registerGuard(guard.guard);
    await user.click(buttonByName("Next slide"));
    await waitFor(() =>
      expect(surfaceById("slide_000002")).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    guard.setAttemptStatus("in_progress");
    expect(buttonByName("Previous slide")).not.toBeDisabled();

    await user.click(buttonByName("Previous slide"));

    expect(surfaceById("slide_000002")).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
  });

  it("rechecks an unpublished blocker before Course Section selection changes the Surface", async () => {
    const user = userEvent.setup();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={sectionedSlideshowDocumentContent([
          {
            id: "section00001",
            title: "Introduction",
            surfaces: [{ id: "slide_000001", text: "First guarded slide" }],
          },
          {
            id: "section00002",
            title: "Practice",
            surfaces: [{ id: "slide_000002", text: "Second guarded slide" }],
          },
        ])}
      />,
    );

    const guard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000001"));
    surfaceExitEnvironmentFromRenderer().registerGuard(guard.guard);
    await user.click(
      await screen.findByRole("button", { name: "Introduction, Course Section 1 of 2" }),
    );
    guard.setAttemptStatus("in_progress");

    await user.click(
      screen.getByRole("menuitemradio", { name: "Practice, Course Section 2 of 2" }),
    );

    expect(surfaceById("slide_000001")).toHaveAttribute("data-runtime-surface-visible", "true");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("projects current blockers into Surface controls while keeping fullscreen available", async () => {
    const user = userEvent.setup();
    const { requestFullscreen } = installFullscreenHarness();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "Blocked slide" },
          { id: "slide_000002", text: "Available destination" },
        ])}
      />,
    );

    await screen.findByTestId("course-document-runtime-renderer");
    const guard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000001"));
    act(() => {
      guard.setAttemptStatus("not_started");
      surfaceExitEnvironmentFromRenderer().registerGuard(guard.guard);
    });

    const courseSection = screen.getByRole("button", {
      name: "Introduction, Course Section 1 of 1",
    });
    const previous = buttonByName("Previous slide");
    const next = buttonByName("Next slide");
    await waitFor(() => expect(next).toBeDisabled());
    expect(courseSection).toBeDisabled();
    expect(previous).toBeDisabled();
    const explanation = screen.getByText("Complete this quiz before moving to another slide.");
    expect(explanation).toHaveClass("sc-sr-only");
    expect(explanation.id).not.toBe("");
    for (const control of [courseSection, previous, next]) {
      expect(control).toHaveAttribute("aria-describedby", explanation.id);
    }
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    const enterFullscreen = await screen.findByRole("button", { name: "Enter fullscreen" });
    expect(enterFullscreen).not.toBeDisabled();
    expect(enterFullscreen).not.toHaveAttribute("aria-describedby");
    await user.click(enterFullscreen);
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(surfaceById("slide_000001")).toHaveAttribute("data-runtime-surface-visible", "true");

    act(() => {
      guard.setAttemptStatus(null);
      guard.publish();
    });

    await waitFor(() => expect(next).not.toBeDisabled());
    expect(courseSection).not.toBeDisabled();
    expect(previous).toBeDisabled();
    for (const control of [courseSection, previous, next]) {
      expect(control).not.toHaveAttribute("aria-describedby");
    }
    expect(screen.queryByText("Complete this quiz before moving to another slide.")).toBeNull();
    expect(screen.getByText("1 of 2")).toBeInTheDocument();
  });

  it("observes blocked snapshots without disabling or refusing author Preview Surface navigation", async () => {
    const user = userEvent.setup();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={sectionedSlideshowDocumentContent([
          {
            id: "section00001",
            title: "Introduction",
            surfaces: [
              { id: "slide_000001", text: "First guarded slide" },
              { id: "slide_000002", text: "Second guarded slide" },
            ],
          },
          {
            id: "section00002",
            title: "Practice",
            surfaces: [{ id: "slide_000003", text: "Third guarded slide" }],
          },
        ])}
        surfaceExitPolicy="observe-only"
      />,
    );

    await screen.findByTestId("course-document-runtime-renderer");
    const firstGuard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000001"));
    const secondGuard = controllableQuizExitGuard(EmbeddedNodeIdSchema.parse("slide_000002"));
    firstGuard.setAttemptStatus("not_started");
    secondGuard.setAttemptStatus("in_progress");
    act(() => {
      surfaceExitEnvironmentFromRenderer().registerGuard(firstGuard.guard);
      surfaceExitEnvironmentFromRenderer().registerGuard(secondGuard.guard);
    });

    await waitFor(() =>
      expect(surfaceExitEnvironmentFromRenderer().getSnapshot()).toMatchObject({
        status: "blocked",
        surfaceId: "slide_000001",
      }),
    );
    const courseSection = screen.getByRole("button", {
      name: "Introduction, Course Section 1 of 2",
    });
    expect(courseSection).not.toBeDisabled();
    expect(buttonByName("Next slide")).not.toBeDisabled();
    expect(screen.queryByText("Complete this quiz before moving to another slide.")).toBeNull();

    await user.click(buttonByName("Next slide"));

    await waitFor(() =>
      expect(surfaceById("slide_000002")).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    expect(surfaceExitEnvironmentFromRenderer().getSnapshot()).toMatchObject({
      status: "blocked",
      surfaceId: "slide_000002",
    });
    expect(buttonByName("Previous slide")).not.toBeDisabled();
    expect(buttonByName("Next slide")).not.toBeDisabled();

    await user.click(buttonByName("Previous slide"));
    await waitFor(() =>
      expect(surfaceById("slide_000001")).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    await user.click(courseSection);
    await user.click(
      screen.getByRole("menuitemradio", { name: "Practice, Course Section 2 of 2" }),
    );

    await waitFor(() =>
      expect(surfaceById("slide_000003")).toHaveAttribute("data-runtime-surface-visible", "true"),
    );
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  it("presents Course Section context and jumps to a selected section's first Surface", async () => {
    const user = userEvent.setup();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={sectionedSlideshowDocumentContent([
          {
            id: "section00001",
            title: "Introduction",
            surfaces: [
              { id: "slide_000001", text: "First slide content" },
              { id: "slide_000002", text: "Second slide content" },
            ],
          },
          {
            id: "section00002",
            title: "Practice",
            surfaces: [{ id: "slide_000003", text: "Third slide content" }],
          },
        ])}
      />,
    );

    const trigger = await screen.findByRole("button", {
      name: "Introduction, Course Section 1 of 2",
    });
    const rawBoundaries = document.body.querySelectorAll<HTMLElement>("[data-course-section]");
    expect(rawBoundaries).toHaveLength(2);
    for (const boundary of rawBoundaries) {
      expect(boundary.hidden).toBe(true);
      expect(boundary.getAttribute("aria-hidden")).toBe("true");
      expect(boundary.textContent).toBe("");
    }
    expect(document.body.querySelectorAll('[data-node="surface"]')).toHaveLength(3);
    expect(screen.queryByText("Introduction")).toBeNull();
    await user.click(trigger);
    await user.click(
      screen.getByRole("menuitemradio", { name: "Practice, Course Section 2 of 2" }),
    );

    await waitFor(() =>
      expect(surfaceById("slide_000003").getAttribute("data-runtime-surface-visible")).toBe("true"),
    );
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Practice, Course Section 2 of 2" }),
    ).toBeInTheDocument();
  });

  it("presents empty-only Course Sections and publishes a null active Surface", async () => {
    const user = userEvent.setup();
    const onActiveSurfaceChange = vi.fn();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={sectionedSlideshowDocumentContent([
          { id: "section00001", title: "Introduction", surfaces: [] },
          { id: "section00002", title: "Practice", surfaces: [] },
        ])}
        onActiveSurfaceChange={onActiveSurfaceChange}
      />,
    );

    await waitFor(() => expect(onActiveSurfaceChange).toHaveBeenLastCalledWith(null));
    expect(screen.getByRole("status")).toHaveTextContent("No slides");
    expect(buttonByName("Previous slide").disabled).toBe(true);
    expect(buttonByName("Next slide").disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "Course Sections, no slides" }));
    expect(
      screen.getByRole("menuitemradio", {
        name: "Introduction, Course Section 1 of 2, no slides",
      }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("menuitemradio", {
        name: "Practice, Course Section 2 of 2, no slides",
      }),
    ).toBeInTheDocument();
    expect(document.body.querySelectorAll('[data-node="surface"]')).toHaveLength(0);
  });

  it("keeps the Course Section chooser portal inside the fullscreen viewport", async () => {
    const user = userEvent.setup();
    installFullscreenHarness();
    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        initialContent={sectionedSlideshowDocumentContent([
          {
            id: "section00001",
            title: "Introduction",
            surfaces: [{ id: "slide_000001", text: "First slide content" }],
          },
          {
            id: "section00002",
            title: "Practice",
            surfaces: [{ id: "slide_000002", text: "Second slide content" }],
          },
        ])}
        sizing="embedded"
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Enter fullscreen" }));
    const viewport = document.body.querySelector(".sc-slideshow-player__viewport");
    let fullscreenHost: Element | null = null;
    await waitFor(() => {
      fullscreenHost = viewport?.querySelector("[data-scaffold-overlay-host]") ?? null;
      expect(fullscreenHost).not.toBeNull();
    });
    await user.click(
      await screen.findByRole("button", {
        name: "Introduction, Course Section 1 of 2",
      }),
    );

    const menu = await screen.findByRole("menu");
    expect(menu).toHaveAccessibleName("Introduction, Course Section 1 of 2");
    expect(menu.closest("[aria-hidden='true']")).toBeNull();
    expect(viewport?.contains(menu)).toBe(true);
    const chromeOwner = menu.closest<HTMLElement>('[data-slideshow-overlay-owner="chrome"]');
    expect(chromeOwner).not.toBeNull();
    expect(chromeOwner).not.toHaveAttribute("inert");
    expect(menu.closest('[data-slideshow-overlay-owner="content"]')).toBeNull();
  });

  it("omits authoring and expanded slideshow product controls", async () => {
    const onRendererReady = vi.fn();

    render(
      <TestSlideshowPlayer
        composition={runtimeComposition}
        artifactId="artifact-slideshow"
        initialContent={slideshowDocumentContent([
          { id: "slide_000001", text: "First slide content" },
          { id: "slide_000002", text: "Second slide content" },
        ])}
        onRendererReady={onRendererReady}
      />,
    );

    await waitFor(() => expect(onRendererReady).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("button", { name: /add/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /fullscreen/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /autoplay/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /narration/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Course Section 1 of 1/ })).toBeInTheDocument();
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

function slideshowOverlayOwner(
  root: ParentNode,
  owner: "content" | "chrome",
): HTMLElement {
  const element = root.querySelector<HTMLElement>(
    `[data-slideshow-overlay-owner="${owner}"]`,
  );
  if (element === null) throw new Error(`Expected Slideshow ${owner} overlay owner`);
  return element;
}
