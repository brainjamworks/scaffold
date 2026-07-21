import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { AssessmentRuntimeProvider } from "@/runtime/assessment/AssessmentRuntimeProvider";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import "@/styles/globals.css";

import { expandSlideCompositionCases } from "./slide-composition-cases";
import {
  createCompositionDocumentForTest,
  expectCompositionGeometry,
  measureCompositionGeometry,
  type CompositionGeometrySample,
} from "./slide-composition-browser-harness";

const PLAYER_BOUNDS = [
  { name: "exact", hostWidth: 1024, hostHeight: 576, stageWidth: 1024, stageHeight: 576, scale: 1 },
  {
    name: "narrow",
    hostWidth: 512,
    hostHeight: 800,
    stageWidth: 512,
    stageHeight: 288,
    scale: 0.5,
  },
  {
    name: "height-constrained",
    hostWidth: 1000,
    hostHeight: 288,
    stageWidth: 512,
    stageHeight: 288,
    scale: 0.5,
  },
  {
    name: "large",
    hostWidth: 2048,
    hostHeight: 1152,
    stageWidth: 2048,
    stageHeight: 1152,
    scale: 2,
  },
] as const;

const EMBEDDED_PLAYER_BOUNDS = [
  {
    name: "wide-bootstrap",
    hostWidth: 1536,
    hostHeight: 320,
    stageWidth: 1536,
    stageHeight: 864,
    scale: 1.5,
  },
  {
    name: "narrow",
    hostWidth: 512,
    hostHeight: 320,
    stageWidth: 512,
    stageHeight: 288,
    scale: 0.5,
  },
  {
    name: "tall",
    hostWidth: 1024,
    hostHeight: 1200,
    stageWidth: 1024,
    stageHeight: 576,
    scale: 1,
  },
] as const;

let root: Root | null = null;
let host: HTMLElement | null = null;
let restoreFullscreenHarness: (() => void) | null = null;

afterEach(() => {
  restoreFullscreenHarness?.();
  restoreFullscreenHarness = null;
  root?.unmount();
  root = null;
  host?.remove();
  host = null;
});

describe("slideshow player geometry", () => {
  it("keeps one intrinsic composition canvas under exact, narrow, and height-constrained bounds", async () => {
    const state = expandSlideCompositionCases().find(
      (candidate) => candidate.composition === "content" && candidate.title === "visible",
    );
    if (!state) throw new Error("Content player acceptance state is not registered.");

    const initialContent = createCompositionDocumentForTest(state);
    let editor: TiptapEditor | null = null;
    host = document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0 auto auto 0";
    host.style.width = `${PLAYER_BOUNDS[0].hostWidth}px`;
    host.style.height = `${PLAYER_BOUNDS[0].hostHeight}px`;
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <SlideshowPlayer
        initialContent={initialContent}
        surfaceIds={[`geometry-${state.composition}`]}
        onRendererReady={(readyEditor) => {
          editor = readyEditor;
        }}
      />,
    );

    await waitForCondition(() => editor !== null && host?.querySelector(".sc-slideshow-player"));
    const player = uniqueElement<HTMLElement>(host, ".sc-slideshow-player");
    const viewport = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    const runtimeEditor = requireEditor(editor);
    const initialDocument = runtimeEditor.getJSON();
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.minHeight = "0";
    viewport.style.padding = "0";

    let baseline: CompositionGeometrySample | null = null;
    let chromeWidth: number | null = null;
    for (const bounds of PLAYER_BOUNDS) {
      host.style.width = `${bounds.hostWidth}px`;
      host.style.height = `${bounds.hostHeight}px`;
      await waitForPlayerBounds(player, viewport, bounds);

      const stages = player.querySelectorAll<HTMLElement>(".sc-slideshow-player__stage");
      const canvases = player.querySelectorAll<HTMLElement>(".sc-slideshow-player__canvas");
      expect(stages).toHaveLength(1);
      expect(canvases).toHaveLength(1);
      const stage = stages[0]!;
      const canvas = canvases[0]!;
      expect(stage.style.width).toBe(`${bounds.stageWidth}px`);
      expect(stage.style.height).toBe(`${bounds.stageHeight}px`);
      expect(canvas.style.width).toBe("1024px");
      expect(canvas.style.height).toBe("576px");
      expect(canvas.style.transform).toBe(`scale(${bounds.scale})`);
      expect(getComputedStyle(canvas).transformOrigin).toBe("0px 0px");

      const geometry = measureCompositionGeometry(
        { renderer: "runtime", host: player, editor: runtimeEditor },
        state,
      );
      expectCompositionGeometry(geometry);
      if (baseline) expectParticipantParity(geometry, baseline);
      else baseline = geometry;

      const chrome = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__chrome");
      const controls = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__controls");
      expect(stage.contains(chrome)).toBe(true);
      expect(canvas.contains(chrome)).toBe(false);
      expect(canvas.contains(controls)).toBe(false);
      const matrix = new DOMMatrix(getComputedStyle(chrome).transform);
      expect(matrix.a).toBeCloseTo(1, 5);
      expect(matrix.d).toBeCloseTo(1, 5);
      const stageRect = stage.getBoundingClientRect();
      const chromeRect = chrome.getBoundingClientRect();
      expect(chromeRect.left + chromeRect.width / 2).toBeCloseTo(
        stageRect.left + stageRect.width / 2,
        2,
      );
      expect(
        Math.min(stageRect.bottom, chromeRect.bottom) - Math.max(stageRect.top, chromeRect.top),
      ).toBeGreaterThan(0);
      if (chromeWidth === null) chromeWidth = chrome.getBoundingClientRect().width;
      else expect(chrome.getBoundingClientRect().width).toBeCloseTo(chromeWidth, 2);
    }

    expect(runtimeEditor.getJSON()).toEqual(initialDocument);
  });

  it("uses a responsive intrinsic stage with a visible boundary and no painted surround", async () => {
    const state = expandSlideCompositionCases().find(
      (candidate) => candidate.composition === "content" && candidate.title === "visible",
    );
    if (!state) throw new Error("Content embedded player acceptance state is not registered.");

    const initialContent = createCompositionDocumentForTest(state);
    let editor: TiptapEditor | null = null;
    host = document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0 auto auto 0";
    host.style.width = `${EMBEDDED_PLAYER_BOUNDS[0].hostWidth}px`;
    host.style.height = `${EMBEDDED_PLAYER_BOUNDS[0].hostHeight}px`;
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <SlideshowPlayer
        initialContent={initialContent}
        surfaceIds={[`geometry-${state.composition}`]}
        sizing="embedded"
        onRendererReady={(readyEditor) => {
          editor = readyEditor;
        }}
      />,
    );

    await waitForCondition(() => editor !== null && host?.querySelector(".sc-slideshow-player"));
    const player = uniqueElement<HTMLElement>(host, ".sc-slideshow-player");
    const viewport = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    const runtimeEditor = requireEditor(editor);
    const initialDocument = runtimeEditor.getJSON();
    let baseline: CompositionGeometrySample | null = null;

    expect(player.getAttribute("data-slideshow-sizing")).toBe("embedded");
    expect(getComputedStyle(player).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(viewport).padding).toBe("0px");

    for (const bounds of EMBEDDED_PLAYER_BOUNDS) {
      host.style.width = `${bounds.hostWidth}px`;
      host.style.height = `${bounds.hostHeight}px`;
      await waitForEmbeddedPlayerBounds(player, viewport, bounds);

      const stage = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__stage");
      const canvas = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__canvas");
      const stageRect = stage.getBoundingClientRect();
      const playerRect = player.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const stageBoundary = getComputedStyle(stage, "::after");
      expect(stageRect.width).toBeCloseTo(bounds.stageWidth, 2);
      expect(stageRect.height).toBeCloseTo(bounds.stageHeight, 2);
      expect(playerRect.height).toBeCloseTo(bounds.stageHeight, 2);
      expect(viewportRect.height).toBeCloseTo(bounds.stageHeight, 2);
      expect(stageRect.top).toBeCloseTo(playerRect.top, 2);
      expect(getComputedStyle(stage).borderRadius).not.toBe("0px");
      expect(stageBoundary.borderTopWidth).toBe("1px");
      expect(stageBoundary.borderTopStyle).toBe("solid");
      expect(stageBoundary.borderTopColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(stageBoundary.pointerEvents).toBe("none");
      expect(canvas.style.width).toBe("1024px");
      expect(canvas.style.height).toBe("576px");
      expect(canvas.style.transform).toBe(`scale(${bounds.scale})`);

      const geometry = measureCompositionGeometry(
        { renderer: "runtime", host: player, editor: runtimeEditor },
        state,
      );
      expectCompositionGeometry(geometry);
      if (baseline) expectParticipantParity(geometry, baseline);
      else baseline = geometry;

      const chrome = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__chrome");
      const controls = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__controls");
      expect(stage.contains(chrome)).toBe(true);
      expect(canvas.contains(chrome)).toBe(false);
      expect(canvas.contains(controls)).toBe(false);
      const matrix = new DOMMatrix(getComputedStyle(chrome).transform);
      expect(matrix.a).toBeCloseTo(1, 5);
      expect(matrix.d).toBeCloseTo(1, 5);
    }

    expect(runtimeEditor.getJSON()).toEqual(initialDocument);
  });

  it("keeps stage, canvas, and controls stable while overlays retarget", async () => {
    installFullscreenHarness();
    const initialContent = slideshowDocumentWithRuntimeHint();
    let editor: TiptapEditor | null = null;
    host = document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0 auto auto 0";
    host.style.width = `${PLAYER_BOUNDS[0].hostWidth}px`;
    host.style.height = `${PLAYER_BOUNDS[0].hostHeight}px`;
    document.body.append(host);
    root = createRoot(host);
    root.render(
      <ScaffoldArtifactIdentityProvider artifactId="artifact-slideshow-overlay-geometry">
        <AssessmentRuntimeProvider>
          <SlideshowPlayer
            artifactId="artifact-slideshow-overlay-geometry"
            initialContent={initialContent}
            surfaceIds={["slide-overlay-geometry"]}
            onRendererReady={(readyEditor) => {
              editor = readyEditor;
            }}
          />
        </AssessmentRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>,
    );

    await waitForCondition(() => editor !== null && host?.querySelector(".sc-slideshow-player"));
    const player = uniqueElement<HTMLElement>(host, ".sc-slideshow-player");
    const viewport = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.minHeight = "0";
    viewport.style.padding = "0";

    for (const bounds of PLAYER_BOUNDS) {
      host.style.width = `${bounds.hostWidth}px`;
      host.style.height = `${bounds.hostHeight}px`;
      await waitForPlayerBounds(player, viewport, bounds);

      const canvas = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__canvas");
      const baseline = measureSlideshowShell(player);
      const normalHost = uniqueElement<HTMLElement>(document, "[data-scaffold-overlay-host]");
      expect(normalHost.parentElement).toBe(document.body);
      expect(canvas.contains(normalHost)).toBe(false);

      runtimeHintTrigger(player).click();
      await waitForCondition(() => document.querySelector(".sc-assessment-hint-popover--runtime"));
      let popover = uniqueElement<HTMLElement>(document, ".sc-assessment-hint-popover--runtime");
      expect(normalHost.contains(popover)).toBe(true);
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);

      buttonByName(player, "Enter fullscreen").click();
      await waitForCondition(
        () =>
          buttonByNameOrNull(player, "Exit fullscreen") !== null &&
          viewport.querySelectorAll("[data-scaffold-overlay-host]").length === 1,
      );
      const fullscreenHost = uniqueElement<HTMLElement>(
        viewport,
        ":scope > [data-scaffold-overlay-host]",
      );
      expect(normalHost.isConnected).toBe(false);
      expect(canvas.contains(fullscreenHost)).toBe(false);
      if (!popover.isConnected) {
        popover = await ensureRuntimeHintOpen(player, fullscreenHost);
      }
      expect(fullscreenHost.contains(popover)).toBe(true);
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);

      buttonByName(player, "Exit fullscreen").click();
      await waitForCondition(
        () =>
          buttonByNameOrNull(player, "Enter fullscreen") !== null &&
          viewport.querySelector("[data-scaffold-overlay-host]") === null,
      );
      const restoredHost = uniqueElement<HTMLElement>(document, "[data-scaffold-overlay-host]");
      expect(fullscreenHost.isConnected).toBe(false);
      expect(restoredHost.parentElement).toBe(document.body);
      if (!popover.isConnected) {
        popover = await ensureRuntimeHintOpen(player, restoredHost);
      }
      expect(restoredHost.contains(popover)).toBe(true);
      expect(canvas.contains(restoredHost)).toBe(false);
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);

      popover.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }),
      );
      await waitForCondition(
        () => document.querySelector(".sc-assessment-hint-popover--runtime") === null,
      );
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);
    }
  });
});

interface SlideshowShellGeometry {
  canvasRect: DOMRect;
  canvasTransform: string;
  controlsRect: DOMRect;
  controlsTransform: DOMMatrix;
  stageRect: DOMRect;
}

function measureSlideshowShell(player: HTMLElement): SlideshowShellGeometry {
  const stage = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__stage");
  const canvas = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__canvas");
  const controls = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__controls");
  return {
    canvasRect: canvas.getBoundingClientRect(),
    canvasTransform: canvas.style.transform,
    controlsRect: controls.getBoundingClientRect(),
    controlsTransform: new DOMMatrix(getComputedStyle(controls).transform),
    stageRect: stage.getBoundingClientRect(),
  };
}

function expectSlideshowShellUnchanged(
  actual: SlideshowShellGeometry,
  expected: SlideshowShellGeometry,
): void {
  for (const rect of ["stageRect", "canvasRect", "controlsRect"] as const) {
    for (const field of ["x", "y", "width", "height"] as const) {
      expect(actual[rect][field]).toBeCloseTo(expected[rect][field], 2);
    }
  }
  expect(actual.canvasTransform).toBe(expected.canvasTransform);
  expect(actual.controlsTransform.a).toBeCloseTo(expected.controlsTransform.a, 5);
  expect(actual.controlsTransform.d).toBeCloseTo(expected.controlsTransform.d, 5);
}

function slideshowDocumentWithRuntimeHint(): JSONContent {
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "slide-overlay-geometry",
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];
  if (!courseDocument || !surface) throw new Error("Missing overlay geometry slideshow surface.");
  courseDocument.attrs = { ...courseDocument.attrs, mode: "slideshow" };
  surface.attrs = { ...surface.attrs, id: "slide-overlay-geometry", variant: "slide-cover" };
  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: "mcq-slideshow-overlay-geometry",
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

function runtimeHintTrigger(rootNode: ParentNode): HTMLButtonElement {
  const button = Array.from(rootNode.querySelectorAll("button")).find((candidate) =>
    /^Show(?: a| \d+) hints?$/.test(candidate.textContent?.trim() ?? ""),
  );
  if (button === undefined) throw new Error("Expected runtime hint trigger.");
  return button;
}

async function ensureRuntimeHintOpen(
  rootNode: ParentNode,
  expectedHost: HTMLElement,
): Promise<HTMLElement> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const current = expectedHost.querySelector<HTMLElement>(".sc-assessment-hint-popover--runtime");
  if (current !== null) return current;

  const hideTrigger = Array.from(rootNode.querySelectorAll("button")).find((candidate) =>
    /^Hide \d+ hints?$/.test(candidate.textContent?.trim() ?? ""),
  );
  if (hideTrigger !== undefined) {
    hideTrigger.click();
    await waitForCondition(() => {
      try {
        return runtimeHintTrigger(rootNode);
      } catch {
        return null;
      }
    });
  }

  runtimeHintTrigger(rootNode).click();
  await waitForCondition(() => expectedHost.querySelector(".sc-assessment-hint-popover--runtime"));
  return uniqueElement<HTMLElement>(expectedHost, ".sc-assessment-hint-popover--runtime");
}

function buttonByName(rootNode: ParentNode, name: string): HTMLButtonElement {
  const button = buttonByNameOrNull(rootNode, name);
  if (button === null) throw new Error(`Expected ${name} button.`);
  return button;
}

function buttonByNameOrNull(rootNode: ParentNode, name: string): HTMLButtonElement | null {
  return (
    Array.from(rootNode.querySelectorAll("button")).find(
      (candidate) =>
        (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
    ) ?? null
  );
}

function installFullscreenHarness(): void {
  const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenEnabled",
  );
  const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "fullscreenElement",
  );
  const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
  const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "requestFullscreen",
  );
  let fullscreenElement: Element | null = null;
  const requestFullscreen = async function requestFullscreen(this: HTMLElement) {
    fullscreenElement = this;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  const exitFullscreen = async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  };

  Object.defineProperties(document, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: { configurable: true, value: exitFullscreen },
  });
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: requestFullscreen,
  });

  restoreFullscreenHarness = () => {
    restoreProperty(document, "fullscreenEnabled", fullscreenEnabledDescriptor);
    restoreProperty(document, "fullscreenElement", fullscreenElementDescriptor);
    restoreProperty(document, "exitFullscreen", exitFullscreenDescriptor);
    restoreProperty(HTMLElement.prototype, "requestFullscreen", requestFullscreenDescriptor);
  };
}

function restoreProperty(
  target: object,
  property: string,
  descriptor: PropertyDescriptor | undefined,
): void {
  if (descriptor) Object.defineProperty(target, property, descriptor);
  else Reflect.deleteProperty(target, property);
}

function requireEditor(editor: TiptapEditor | null): TiptapEditor {
  if (!editor) throw new Error("Slideshow player runtime editor was not ready.");
  return editor;
}

function expectParticipantParity(
  actual: CompositionGeometrySample,
  expected: CompositionGeometrySample,
): void {
  expect(Object.keys(actual.participants)).toEqual(Object.keys(expected.participants));
  for (const key of Object.keys(expected.participants) as (keyof typeof expected.participants)[]) {
    const actualRect = actual.participants[key];
    const expectedRect = expected.participants[key];
    if (!actualRect || !expectedRect) throw new Error(`Missing player participant ${key}.`);
    for (const field of ["x", "y", "width", "height"] as const) {
      expect(actualRect[field]).toBeCloseTo(expectedRect[field], 3);
    }
  }
}

async function waitForPlayerBounds(
  player: HTMLElement,
  viewport: HTMLElement,
  bounds: (typeof PLAYER_BOUNDS)[number],
): Promise<void> {
  await waitForCondition(() => {
    const viewportRect = viewport.getBoundingClientRect();
    const stage = player.querySelector<HTMLElement>(".sc-slideshow-player__stage");
    return (
      Math.abs(viewportRect.width - bounds.hostWidth) < 0.01 &&
      Math.abs(viewportRect.height - bounds.hostHeight) < 0.01 &&
      stage?.style.width === `${bounds.stageWidth}px` &&
      stage.style.height === `${bounds.stageHeight}px`
    );
  });
}

async function waitForEmbeddedPlayerBounds(
  player: HTMLElement,
  viewport: HTMLElement,
  bounds: (typeof EMBEDDED_PLAYER_BOUNDS)[number],
): Promise<void> {
  await waitForCondition(() => {
    const playerRect = player.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = player
      .querySelector<HTMLElement>(".sc-slideshow-player__stage")
      ?.getBoundingClientRect();
    const canvas = player.querySelector<HTMLElement>(".sc-slideshow-player__canvas");
    return (
      Math.abs(playerRect.width - bounds.hostWidth) < 0.01 &&
      Math.abs(playerRect.height - bounds.stageHeight) < 0.01 &&
      Math.abs(viewportRect.height - bounds.stageHeight) < 0.01 &&
      Math.abs((stageRect?.width ?? 0) - bounds.stageWidth) < 0.01 &&
      Math.abs((stageRect?.height ?? 0) - bounds.stageHeight) < 0.01 &&
      canvas?.style.transform === `scale(${bounds.scale})`
    );
  });
}

function uniqueElement<T extends Element>(rootNode: ParentNode, selector: string): T {
  const matches = rootNode.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for player browser state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
