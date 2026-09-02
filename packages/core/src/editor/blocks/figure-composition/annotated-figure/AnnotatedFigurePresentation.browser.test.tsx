import { createRoot, type Root } from "react-dom/client";
import { Schema } from "@tiptap/pm/model";
import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  CompiledSurfacePresentationVisualProgram,
  CompiledVisualTarget,
} from "@/presentation/model";
import { createPresentationPlaybackSession } from "@/runtime/presentation/presentation-playback-session";
import { createAnimeVisualAnimationDriver } from "@/runtime/presentation/visual/anime-visual-animation-driver";
import { createPresentationVisualRuntime } from "@/runtime/presentation/visual/presentation-visual-runtime";
import { createPresentationVisualStateRenderer } from "@/runtime/presentation/visual/presentation-visual-state-renderer";
import { createVisualTargetResolver } from "@/runtime/presentation/visual/visual-target-resolver";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/styles/globals.css";

import "./AnnotatedFigure.css";
import type { AnnotatedFigureAnnotationProjection } from "./annotated-figure-document-model";
import { AnnotatedFigureRuntimeCaptionList } from "./AnnotatedFigureRuntimeCaptionList";
import { AnnotatedFigureSurface } from "./AnnotatedFigureSurface";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Annotated Figure presentation contract", () => {
  it("uses each published annotation ID on its exact pin and caption anchors", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    document.body.append(host);
    const annotations = [
      annotationProjection("annotation01", 1),
      annotationProjection("annotation02", 2),
    ];

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{
            type: "annotated_figure",
            source: { mode: "managed", mediaId: "annotated-figure-markers" },
            alt: "Annotated marker diagram",
            captionDisplay: "popover",
          }}
          annotations={annotations}
          fileUrl={twoToOneImageUrl()}
          markAnnotationTargets
          onActivatePin={() => undefined}
        />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll("[data-pin]").length === annotations.length);
    for (const annotation of annotations) {
      const pin = requiredElement<HTMLElement>(host, `[data-pin="${annotation.id}"]`);
      expect(pin).toHaveAttribute("data-presentation-target-id", annotation.id);
      expect(pin.querySelector(`[data-presentation-target-id="${annotation.id}"]`)).toBeNull();
    }

    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureRuntimeCaptionList
          annotations={annotations}
          markAnnotationTargets
          presentation="expanded"
        />
      </CourseThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelectorAll("[data-annotation-id]").length === annotations.length,
    );
    for (const annotation of annotations) {
      const caption = requiredElement<HTMLElement>(host, `[data-annotation-id="${annotation.id}"]`);
      expect(caption).toHaveAttribute("data-presentation-target-id", annotation.id);
      expect(caption.querySelector(`[data-presentation-target-id="${annotation.id}"]`)).toBeNull();
    }
  });

  it("plays, seeks and tears down real annotation choreography without learner interaction", async () => {
    const surfaceId = EmbeddedNodeIdSchema.parse("surface00001");
    const firstId = EmbeddedNodeIdSchema.parse("annotation01");
    const secondId = EmbeddedNodeIdSchema.parse("annotation02");
    const annotations = [annotationProjection(firstId, 1), annotationProjection(secondId, 2)];
    const host = document.createElement("div");
    const outsideFocus = document.createElement("button");
    outsideFocus.textContent = "Outside focus";
    const surfaceRoot = document.createElement("div");
    surfaceRoot.setAttribute("data-presentation-target-id", surfaceId);
    surfaceRoot.className = "sc-course-annotated-figure";
    host.append(outsideFocus, surfaceRoot);
    document.body.append(host);
    outsideFocus.focus();
    const activation = vi.fn();
    const clicks = vi.fn();
    surfaceRoot.addEventListener("click", clicks);

    const root = createRoot(surfaceRoot);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{
            type: "annotated_figure",
            source: { mode: "managed", mediaId: "annotated-figure-choreography" },
            alt: "Choreographed annotations",
            captionDisplay: "popover",
          }}
          annotations={annotations}
          fileUrl={twoToOneImageUrl()}
          markAnnotationTargets
          onActivatePin={activation}
        />
      </CourseThemeProvider>,
    );
    await waitForCondition(() => surfaceRoot.querySelectorAll("[data-pin]").length === 2);

    let motionMode: "normal" | "reduced-motion" = "normal";
    const firstHarness = createVisualHarness({
      surfaceId,
      surfaceRoot,
      visualProgram: annotationVisualProgram(surfaceId, firstId, secondId),
      getMotionMode: () => motionMode,
    });
    const firstPin = requiredElement<HTMLElement>(surfaceRoot, `[data-pin="${firstId}"]`);
    const secondPin = requiredElement<HTMLElement>(surfaceRoot, `[data-pin="${secondId}"]`);
    const authoredCenter = elementCenter(firstPin);

    expect(firstPin).toHaveAttribute("data-presentation-availability", "withheld");
    expect(secondPin).toHaveAttribute("data-presentation-availability", "available");
    firstHarness.session.play();
    expect(firstHarness.session.getSnapshot().phase).toBe("playing");
    firstHarness.session.pause();
    expect(firstHarness.session.getSnapshot().phase).toBe("paused");

    seek(firstHarness.session, 750);
    expect(firstPin).toHaveAttribute("data-presentation-availability", "available");
    expect(Number.parseFloat(firstPin.style.opacity)).toBeCloseTo(0.5, 1);
    expect(secondPin).toHaveAttribute("data-presentation-availability", "withheld");
    expect(secondPin).toHaveAttribute("aria-hidden", "true");
    expect(secondPin).toHaveAttribute("inert");
    expect(Number.parseFloat(secondPin.style.opacity)).toBeCloseTo(0.5, 1);

    seek(firstHarness.session, 1_350);
    expect(firstPin.style.transform).not.toBe("");
    expectElementCenter(firstPin, authoredCenter);
    motionMode = "reduced-motion";
    seek(firstHarness.session, 1_400);
    expect(firstPin.style.transform).toBe("");
    expect(firstPin.style.outline).toContain("3px");

    seek(firstHarness.session, 0);
    expect(firstPin).toHaveAttribute("data-presentation-availability", "withheld");
    expect(secondPin).toHaveAttribute("data-presentation-availability", "available");
    expect(document.activeElement).toBe(outsideFocus);
    expect(activation).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();

    firstHarness.dispose();
    expect(firstPin).toHaveAttribute("data-presentation-target-id", firstId);
    expect(firstPin).not.toHaveAttribute("data-presentation-availability");
    expect(firstPin.style.opacity).toBe("");
    expect(firstPin.style.outline).toBe("");

    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureRuntimeCaptionList
          annotations={annotations}
          markAnnotationTargets
          presentation="expanded"
        />
      </CourseThemeProvider>,
    );
    await waitForCondition(() => surfaceRoot.querySelectorAll("[data-annotation-id]").length === 2);
    motionMode = "reduced-motion";
    const captionHarness = createVisualHarness({
      surfaceId,
      surfaceRoot,
      visualProgram: annotationVisualProgram(surfaceId, firstId, secondId),
      getMotionMode: () => motionMode,
    });
    const firstCaption = requiredElement<HTMLElement>(
      surfaceRoot,
      `[data-annotation-id="${firstId}"]`,
    );

    seek(captionHarness.session, 1_400);
    expect(firstCaption).toHaveAttribute("data-presentation-target-id", firstId);
    expect(firstCaption).toHaveAttribute("data-presentation-availability", "available");
    expect(firstCaption.style.outline).toContain("3px");
    expect(activation).not.toHaveBeenCalled();
    expect(clicks).not.toHaveBeenCalled();

    captionHarness.dispose();
    expect(firstCaption).toHaveAttribute("data-presentation-target-id", firstId);
    expect(firstCaption).not.toHaveAttribute("data-presentation-availability");
    expect(firstCaption.style.outline).toBe("");
  });

  it("keeps the empty media stage usable without a Course recipe", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "640px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <AnnotatedFigureSurface
          data={{ type: "annotated_figure", source: null, alt: "", captionDisplay: "list" }}
          annotations={[]}
          fileUrl={null}
        />
      </CourseThemeProvider>,
    );

    const empty = await waitForElement<HTMLElement>(host, ".sc-course-annotated-figure__empty");
    expect(empty.getBoundingClientRect().height).toBeGreaterThan(300);
  });

  it("gives Pocket Atlas a deliberate empty state and 44px pin target", async () => {
    const host = document.createElement("div");
    host.className = "sc-course-annotated-figure";
    host.style.width = "640px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <CourseThemeProvider
          appearance="light"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <AnnotatedFigureSurface
            data={{
              type: "annotated_figure",
              source: { mode: "managed", mediaId: "annotated-figure-pocket" },
              alt: "Pocket Atlas annotated diagram",
              captionDisplay: "list",
            }}
            annotations={[{ id: "pocket-pin", number: 1, x: 50, y: 50 }]}
            fileUrl={twoToOneImageUrl()}
            onActivatePin={() => undefined}
          />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    const pin = await waitForElement<HTMLButtonElement>(
      host,
      ".sc-course-annotated-figure__pin-activate",
    );
    await waitForCondition(() => pin.getBoundingClientRect().width > 0);
    const marker = requiredElement<HTMLElement>(pin, ".sc-course-annotated-figure__pin-number");

    expect(pin.getBoundingClientRect().width).toBe(44);
    expect(pin.getBoundingClientRect().height).toBe(44);
    expect(getComputedStyle(pin).borderRadius).toBe("0px");
    expect(marker.getBoundingClientRect().width).toBe(28);
    expect(marker.getBoundingClientRect().height).toBe(28);
    expect(getComputedStyle(marker).borderTopWidth).toBe("2px");
    expect(getComputedStyle(marker).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("collapses the authoring caption frame when the figure has no annotations", () => {
    const content = document.createElement("div");
    content.className = "sc-course-annotated-figure__content";
    content.dataset.hasAnnotations = "false";

    const nodeViewContent = document.createElement("div");
    nodeViewContent.dataset.nodeViewContentReact = "";

    const renderer = document.createElement("div");
    renderer.className = "react-renderer";

    const captionFrame = document.createElement("div");
    captionFrame.className = "sc-course-annotated-figure__caption-frame";

    renderer.append(captionFrame);
    nodeViewContent.append(renderer);
    content.append(nodeViewContent);
    document.body.append(content);

    expect(getComputedStyle(captionFrame).display).toBe("none");
  });

  it("reserves a caption row only for the Pocket Atlas list lightbox", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <div
          className="sc-course-annotated-figure__runtime-lightbox-composition"
          data-caption-display="list"
          data-testid="list-lightbox"
          style={{ blockSize: "480px" }}
        />
        <div
          className="sc-course-annotated-figure__runtime-lightbox-composition"
          data-caption-display="popover"
          data-testid="popover-lightbox"
          style={{ blockSize: "480px" }}
        >
          <AnnotatedFigureSurface
            data={{
              type: "annotated_figure",
              source: { mode: "managed", mediaId: "annotated-figure-lightbox" },
              alt: "Pocket Atlas expanded annotated diagram",
              captionDisplay: "popover",
            }}
            annotations={[{ id: "lightbox-pin", number: 1, x: 50, y: 50 }]}
            fileUrl={twoToOneImageUrl()}
            onActivatePin={() => undefined}
            presentation="lightbox"
          />
        </div>
      </CourseThemeProvider>,
    );

    const list = await waitForElement<HTMLElement>(host, '[data-testid="list-lightbox"]');
    const popover = requiredElement<HTMLElement>(host, '[data-testid="popover-lightbox"]');

    expect(getComputedStyle(list).gridTemplateRows.split(" ")).toHaveLength(2);
    expect(getComputedStyle(popover).gridTemplateRows.split(" ")).toHaveLength(1);

    const pin = requiredElement<HTMLButtonElement>(
      popover,
      ".sc-course-annotated-figure__pin-activate",
    );
    const marker = requiredElement<HTMLElement>(pin, ".sc-course-annotated-figure__pin-number");
    expect(pin.getBoundingClientRect().width).toBe(44);
    expect(pin.getBoundingClientRect().height).toBe(44);
    expect(marker.getBoundingClientRect().width).toBe(28);
    expect(marker.getBoundingClientRect().height).toBe(28);
  });
});

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector));
  return requiredElement<T>(root, selector);
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function twoToOneImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='%2300A689'/%3E%3C/svg%3E";
}

const annotationSchema = new Schema({
  nodes: {
    doc: { content: "paragraph+" },
    paragraph: { attrs: { id: { default: null } }, content: "text*" },
    text: { inline: true },
  },
});

function annotationProjection(id: string, number: number): AnnotatedFigureAnnotationProjection {
  const captionNode = annotationSchema.node(
    "paragraph",
    { id: `${id}-caption` },
    annotationSchema.text(`Annotation ${number}`),
  );
  return {
    id,
    relativePos: number,
    index: number - 1,
    number,
    title: `Annotation ${number}`,
    x: number * 25,
    y: 50,
    node: captionNode,
    pos: number,
    captionNode,
  };
}

function annotationVisualProgram(
  surfaceId: EmbeddedNodeId,
  firstId: EmbeddedNodeId,
  secondId: EmbeddedNodeId,
): CompiledSurfacePresentationVisualProgram {
  const transition = Object.freeze({
    kind: "fade" as const,
    durationMs: 500,
    easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
  });
  const targets: Array<readonly [EmbeddedNodeId, CompiledVisualTarget]> = [
    [firstId, Object.freeze({ targetId: firstId, initialVisibility: "withheld" as const })],
    [secondId, Object.freeze({ targetId: secondId, initialVisibility: "visible" as const })],
  ];
  return Object.freeze({
    surfaceId,
    durationMs: 2_000,
    targetById: new Map(targets),
    segments: Object.freeze([
      Object.freeze({
        id: EmbeddedDataIdSchema.parse("reveal000001"),
        targetId: firstId,
        startMs: 500,
        endMs: 1_000,
        visual: Object.freeze({ kind: "reveal" as const, transition }),
      }),
      Object.freeze({
        id: EmbeddedDataIdSchema.parse("hide00000001"),
        targetId: secondId,
        startMs: 500,
        endMs: 1_000,
        visual: Object.freeze({ kind: "hide" as const, transition }),
      }),
      Object.freeze({
        id: EmbeddedDataIdSchema.parse("emphasize001"),
        targetId: firstId,
        startMs: 1_100,
        endMs: 1_600,
        visual: Object.freeze({
          kind: "emphasize" as const,
          effect: "pulse" as const,
          durationMs: 500,
          easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
        }),
      }),
    ]),
    sequenceContainers: Object.freeze([]),
  });
}

function elementCenter(element: HTMLElement): { readonly x: number; readonly y: number } {
  const bounds = element.getBoundingClientRect();
  return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
}

function expectElementCenter(
  element: HTMLElement,
  expected: { readonly x: number; readonly y: number },
): void {
  const center = elementCenter(element);
  expect(center.x).toBeCloseTo(expected.x, 1);
  expect(center.y).toBeCloseTo(expected.y, 1);
}

function createVisualHarness({
  surfaceId,
  surfaceRoot,
  visualProgram,
  getMotionMode,
}: {
  readonly surfaceId: EmbeddedNodeId;
  readonly surfaceRoot: HTMLElement;
  readonly visualProgram: CompiledSurfacePresentationVisualProgram;
  readonly getMotionMode: () => "normal" | "reduced-motion";
}) {
  const session = createPresentationPlaybackSession({
    timeline: Object.freeze({
      surfaceId,
      durationMs: visualProgram.durationMs,
      cues: Object.freeze([]),
      waits: Object.freeze([]),
    }),
    monotonicClock: {
      nowMs: () => 0,
      subscribe: () => () => undefined,
    },
    cueExecutor: {
      execute: async () => Object.freeze({ kind: "succeeded" as const }),
    },
    gatePort: {
      waitUntilSatisfied: async () => undefined,
    },
    autoAdvance: false,
  });
  const visualRuntime = createPresentationVisualRuntime({
    visualProgram,
    session,
    renderer: createPresentationVisualStateRenderer({
      resolver: createVisualTargetResolver(surfaceRoot),
      driver: createAnimeVisualAnimationDriver(),
    }),
    getMotionMode,
  });
  return {
    session,
    dispose() {
      visualRuntime.dispose();
      session.dispose();
    },
  };
}

function seek(session: ReturnType<typeof createPresentationPlaybackSession>, timeMs: number): void {
  const result = session.seek(timeMs);
  if (result.isErr()) throw new Error(`Expected seek, received ${result.error.reason}.`);
}
