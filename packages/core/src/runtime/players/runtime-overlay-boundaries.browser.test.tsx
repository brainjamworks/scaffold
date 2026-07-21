import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";
import { PagePlayer } from "@/runtime/players/page/PagePlayer";
import { SlideshowPlayer } from "@/runtime/players/slideshow/SlideshowPlayer";
import "@/styles/globals.css";

const PAGE_CASES = [
  { name: "wide", width: 1120, height: 760 },
  { name: "narrow", width: 390, height: 760 },
] as const;

const SLIDESHOW_CASES = [
  {
    name: "exact",
    hostWidth: 1024,
    hostHeight: 576,
    stageWidth: 1024,
    stageHeight: 576,
    scale: 1,
  },
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
] as const;

interface ForeignOwner {
  document: Document;
  frame: HTMLIFrameElement;
  window: Window;
}

interface MountedRuntime {
  dispose: () => void;
  editor: TiptapEditor;
  host: HTMLElement;
  player: HTMLElement;
  root: Root;
}

interface SlideshowShellSample {
  canvasRect: DOMRect;
  canvasTransform: string;
  controlsRect: DOMRect;
  controlsTransform: DOMMatrix;
  stageRect: DOMRect;
}

const mountedRuntimes: MountedRuntime[] = [];
const foreignOwners: ForeignOwner[] = [];
const fullscreenRestorers: Array<() => void> = [];

afterEach(() => {
  while (mountedRuntimes.length > 0) mountedRuntimes.pop()?.dispose();
  while (fullscreenRestorers.length > 0) fullscreenRestorers.pop()?.();
  while (foreignOwners.length > 0) foreignOwners.pop()?.frame.remove();
});

describe("runtime overlay boundary contract", () => {
  it("keeps wide and narrow Page overlays out of root geometry in their owner document", async () => {
    await page.viewport(1280, 900);

    for (const geometry of PAGE_CASES) {
      const owner = await createForeignOwner(geometry.width, geometry.height);
      const mounted = await mountPage(owner);
      const trigger = buttonByName(mounted.player, "Show a hint");
      const playerStyle = getComputedStyle(mounted.player);
      const before = mounted.player.getBoundingClientRect();

      expect(mounted.player.ownerDocument).toBe(owner.document);
      expect(playerStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(playerStyle.borderTopWidth).toBe("0px");
      expect(playerStyle.boxShadow).toBe("none");
      expect(playerStyle.minHeight).toBe("0px");
      expect(mounted.player.querySelectorAll(":scope > [data-scaffold-overlay-host]")).toHaveLength(
        1,
      );

      owner.window.scrollTo(0, 120);
      await waitForCondition(() => mounted.player.getBoundingClientRect().top < before.top - 80);
      const scrolled = mounted.player.getBoundingClientRect();
      expect(scrolled.width).toBeCloseTo(before.width, 3);
      expect(scrolled.height).toBeCloseTo(before.height, 3);

      trigger.focus({ preventScroll: true });
      expect(owner.document.activeElement).toBe(trigger);
      expect(trigger.matches(":focus-visible")).toBe(true);
      expect(getComputedStyle(trigger).outlineStyle).not.toBe("none");
      trigger.click();
      const popover = await waitForElement<HTMLElement>(
        mounted.player,
        '.sc-assessment-hint-popover--runtime[role="dialog"]',
      );
      const overlayHost = uniqueElement<HTMLElement>(
        mounted.player,
        ":scope > [data-scaffold-overlay-host]",
      );
      const containedRect = popover.getBoundingClientRect();

      expect(popover.getAttribute("aria-label")).toMatch(/^Hint(?:s| 1 of 1)$/);
      expect(overlayHost.contains(popover)).toBe(true);
      expect(overlayHost.ownerDocument).toBe(owner.document);
      expect(overlayHost.parentElement).toBe(mounted.player);
      expect(getComputedStyle(overlayHost).position).toBe("fixed");
      expect(containedRect.left).toBeGreaterThanOrEqual(-1);
      expect(containedRect.right).toBeLessThanOrEqual(
        owner.document.documentElement.clientWidth + 1,
      );

      popover.style.cssText += `; height: ${before.height + 480}px; max-height: none; max-width: none; width: ${geometry.width + 480}px;`;
      await nextAnimationFrame();
      const open = mounted.player.getBoundingClientRect();
      expect(open.width).toBeCloseTo(before.width, 3);
      expect(open.height).toBeCloseTo(before.height, 3);

      const escape = dispatchEscape(popover);
      expect(escape.defaultPrevented).toBe(true);
      await waitForCondition(() => !popover.isConnected);
      expect(owner.document.activeElement).toBe(trigger);
      expect(trigger.matches(":focus-visible")).toBe(true);
      const closed = mounted.player.getBoundingClientRect();
      expect(closed.width).toBeCloseTo(before.width, 3);
      expect(closed.height).toBeCloseTo(before.height, 3);

      const oldHost = overlayHost;
      mounted.dispose();
      expect(oldHost.isConnected).toBe(false);
      expect(owner.document.querySelector("[data-scaffold-overlay-host]")).toBeNull();
      const remounted = await mountPage(owner);
      expect(owner.document.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
      expect(remounted.player.getBoundingClientRect().width).toBeCloseTo(before.width, 3);
      remounted.dispose();
    }
  });

  it("keeps Slideshow shell geometry stable across overlays and fullscreen retargeting", async () => {
    await page.viewport(1280, 900);
    const owner = await createForeignOwner(1100, 850);
    fullscreenRestorers.push(installFullscreenHarness(owner.document, owner.window));
    const mounted = await mountSlideshow(owner);
    const player = mounted.player;
    const viewport = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__viewport");
    player.style.width = "100%";
    player.style.height = "100%";
    player.style.minHeight = "0";
    viewport.style.padding = "0";

    for (const geometry of SLIDESHOW_CASES) {
      owner.frame.style.width = `${geometry.hostWidth}px`;
      owner.frame.style.height = `${Math.max(geometry.hostHeight, 360)}px`;
      mounted.host.style.width = `${geometry.hostWidth}px`;
      mounted.host.style.height = `${geometry.hostHeight}px`;
      await waitForSlideshowBounds(player, viewport, geometry);

      const stage = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__stage");
      const canvas = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__canvas");
      const controls = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__controls");
      const baseline = measureSlideshowShell(player);
      const normalHost = uniqueElement<HTMLElement>(
        owner.document,
        "body > [data-scaffold-overlay-host]",
      );
      const trigger = runtimeHintTrigger(player);

      expect(baseline.stageRect.width / baseline.stageRect.height).toBeCloseTo(16 / 9, 5);
      expect(baseline.stageRect.width).toBeCloseTo(geometry.stageWidth, 2);
      expect(baseline.stageRect.height).toBeCloseTo(geometry.stageHeight, 2);
      expect(canvas.style.width).toBe("1024px");
      expect(canvas.style.height).toBe("576px");
      expect(canvas.style.transform).toBe(`scale(${geometry.scale})`);
      expect(stage.contains(controls)).toBe(true);
      expect(canvas.contains(controls)).toBe(false);
      expect(canvas.contains(normalHost)).toBe(false);
      expect(normalHost.ownerDocument).toBe(owner.document);
      expect(owner.document.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);

      trigger.focus({ preventScroll: true });
      expect(trigger.matches(":focus-visible")).toBe(true);
      expect(getComputedStyle(trigger).outlineStyle).not.toBe("none");
      trigger.click();
      const popover = await waitForElement<HTMLElement>(
        normalHost,
        '.sc-assessment-hint-popover--runtime[role="dialog"]',
      );
      const containedRect = popover.getBoundingClientRect();

      expect(popover.getAttribute("aria-label")).toBe("Hint 1 of 1");
      expect(popover.ownerDocument).toBe(owner.document);
      expect(containedRect.left).toBeGreaterThanOrEqual(-1);
      expect(containedRect.right).toBeLessThanOrEqual(
        owner.document.documentElement.clientWidth + 1,
      );
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);

      popover.style.cssText += `; height: ${geometry.hostHeight + 400}px; max-height: none; max-width: none; width: ${geometry.hostWidth + 400}px;`;
      await nextAnimationFrame();
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);

      const escape = dispatchEscape(popover);
      expect(escape.defaultPrevented).toBe(true);
      await waitForCondition(() => !popover.isConnected);
      expect(owner.document.activeElement).toBe(trigger);
      expect(trigger.matches(":focus-visible")).toBe(true);
      expectSlideshowShellUnchanged(measureSlideshowShell(player), baseline);
    }

    const canvas = uniqueElement<HTMLElement>(player, ".sc-slideshow-player__canvas");
    const shellBeforeScroll = measureSlideshowShell(player);
    owner.document.body.style.minHeight = "1400px";
    owner.window.scrollTo(0, 80);
    await waitForCondition(
      () => measureSlideshowShell(player).stageRect.top < shellBeforeScroll.stageRect.top - 40,
    );
    const shellAfterScroll = measureSlideshowShell(player);
    expect(shellAfterScroll.stageRect.width).toBeCloseTo(shellBeforeScroll.stageRect.width, 2);
    expect(shellAfterScroll.stageRect.height).toBeCloseTo(shellBeforeScroll.stageRect.height, 2);
    owner.window.scrollTo(0, 0);
    await waitForCondition(
      () =>
        Math.abs(measureSlideshowShell(player).stageRect.top - shellBeforeScroll.stageRect.top) < 1,
    );

    const fullscreenBaseline = measureSlideshowShell(player);
    let normalHost = uniqueElement<HTMLElement>(
      owner.document,
      "body > [data-scaffold-overlay-host]",
    );
    let popover = await ensureRuntimeHintOpen(player, normalHost);
    expect(normalHost.contains(popover)).toBe(true);
    buttonByName(player, "Enter fullscreen").click();
    await waitForCondition(
      () =>
        buttonByNameOrNull(player, "Exit fullscreen") !== null &&
        viewport.querySelectorAll(":scope > [data-scaffold-overlay-host]").length === 1,
    );
    const fullscreenHost = uniqueElement<HTMLElement>(
      viewport,
      ":scope > [data-scaffold-overlay-host]",
    );

    expect(normalHost.isConnected).toBe(false);
    expect(fullscreenHost.ownerDocument).toBe(owner.document);
    expect(canvas.contains(fullscreenHost)).toBe(false);
    expect(owner.document.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    popover = popover.isConnected ? popover : await ensureRuntimeHintOpen(player, fullscreenHost);
    expect(fullscreenHost.contains(popover)).toBe(true);
    expectSlideshowShellUnchanged(measureSlideshowShell(player), fullscreenBaseline);

    buttonByName(player, "Exit fullscreen").click();
    await waitForCondition(
      () =>
        buttonByNameOrNull(player, "Enter fullscreen") !== null &&
        viewport.querySelector("[data-scaffold-overlay-host]") === null,
    );
    normalHost = uniqueElement<HTMLElement>(owner.document, "body > [data-scaffold-overlay-host]");
    expect(fullscreenHost.isConnected).toBe(false);
    expect(normalHost.ownerDocument).toBe(owner.document);
    expect(canvas.contains(normalHost)).toBe(false);
    expect(owner.document.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    popover = popover.isConnected ? popover : await ensureRuntimeHintOpen(player, normalHost);
    expect(normalHost.contains(popover)).toBe(true);
    expectSlideshowShellUnchanged(measureSlideshowShell(player), fullscreenBaseline);

    const trigger = runtimeHintToggle(player);
    const escape = dispatchEscape(popover);
    expect(escape.defaultPrevented).toBe(true);
    await waitForCondition(() => !popover.isConnected);
    expect(owner.document.activeElement).toBe(trigger);
    expectSlideshowShellUnchanged(measureSlideshowShell(player), fullscreenBaseline);

    const oldHost = normalHost;
    mounted.dispose();
    expect(oldHost.isConnected).toBe(false);
    expect(owner.document.querySelector("[data-scaffold-overlay-host]")).toBeNull();
    const remounted = await mountSlideshow(owner);
    expect(owner.document.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    expect(uniqueElement(remounted.player, ".sc-slideshow-player__canvas").ownerDocument).toBe(
      owner.document,
    );
    remounted.dispose();
  });
});

async function createForeignOwner(width: number, height: number): Promise<ForeignOwner> {
  const frame = document.createElement("iframe");
  frame.style.cssText = `border: 0; display: block; height: ${height}px; width: ${width}px;`;
  document.body.append(frame);
  const ownerDocument = frame.contentDocument;
  const ownerWindow = frame.contentWindow;
  if (!ownerDocument || !ownerWindow) throw new Error("Expected iframe owner document and window.");

  ownerDocument.documentElement.style.margin = "0";
  ownerDocument.body.style.cssText = "margin: 0; min-height: 1200px;";
  for (const styleNode of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
    ownerDocument.head.append(styleNode.cloneNode(true));
  }
  await waitForCondition(() => ownerWindow.innerWidth === width);

  const owner = { document: ownerDocument, frame, window: ownerWindow };
  foreignOwners.push(owner);
  return owner;
}

async function mountPage(owner: ForeignOwner): Promise<MountedRuntime> {
  let editor: TiptapEditor | null = null;
  const host = owner.document.createElement("div");
  host.style.cssText = "margin-top: 320px; width: 100%;";
  owner.document.body.append(host);
  const root = createRoot(host);
  root.render(
    createAssessmentRuntimeTestRoot({
      children: (
        <PagePlayer
          initialContent={runtimeHintDocument("page", "runtime-page")}
          surfaceId="runtime-page"
          onRendererReady={(readyEditor) => {
            editor = readyEditor;
          }}
        />
      ),
    }),
  );

  await waitForCondition(() => editor !== null && host.querySelector(".sc-page-player") !== null);
  return registerMountedRuntime({
    editor: requireEditor(editor),
    host,
    player: uniqueElement<HTMLElement>(host, ".sc-page-player"),
    root,
  });
}

async function mountSlideshow(owner: ForeignOwner): Promise<MountedRuntime> {
  let editor: TiptapEditor | null = null;
  const host = owner.document.createElement("div");
  host.style.cssText = "height: 576px; position: absolute; top: 0; width: 1024px;";
  owner.document.body.append(host);
  const root = createRoot(host);
  root.render(
    createAssessmentRuntimeTestRoot({
      children: (
        <SlideshowPlayer
          artifactId="runtime-boundary-contract"
          initialContent={runtimeHintDocument("slideshow", "runtime-slide")}
          surfaceIds={["runtime-slide"]}
          onRendererReady={(readyEditor) => {
            editor = readyEditor;
          }}
        />
      ),
    }),
  );

  await waitForCondition(
    () =>
      editor !== null &&
      host.querySelector(".sc-slideshow-player__canvas") !== null &&
      buttonByNameOrNull(host, "Enter fullscreen") !== null,
  );
  return registerMountedRuntime({
    editor: requireEditor(editor),
    host,
    player: uniqueElement<HTMLElement>(host, ".sc-slideshow-player"),
    root,
  });
}

function registerMountedRuntime(input: Omit<MountedRuntime, "dispose">): MountedRuntime {
  let disposed = false;
  const mounted: MountedRuntime = {
    ...input,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      mounted.root.unmount();
      mounted.host.remove();
      const index = mountedRuntimes.indexOf(mounted);
      if (index >= 0) mountedRuntimes.splice(index, 1);
    },
  };
  mountedRuntimes.push(mounted);
  return mounted;
}

function runtimeHintDocument(mode: "page" | "slideshow", surfaceId: string): JSONContent {
  const content = createScaffoldDocumentContent({ mode, surfaceId });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];
  if (!courseDocument || !surface) throw new Error("Missing runtime contract surface.");
  courseDocument.attrs = { ...courseDocument.attrs, mode };
  surface.attrs = {
    ...surface.attrs,
    id: surfaceId,
    ...(mode === "slideshow" ? { variant: "slide-cover" } : {}),
  };
  surface.content = [
    {
      type: "mcq",
      attrs: {
        id: `mcq-${surfaceId}`,
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

function measureSlideshowShell(player: HTMLElement): SlideshowShellSample {
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
  actual: SlideshowShellSample,
  expected: SlideshowShellSample,
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

async function waitForSlideshowBounds(
  player: HTMLElement,
  viewport: HTMLElement,
  geometry: (typeof SLIDESHOW_CASES)[number],
): Promise<void> {
  await waitForCondition(() => {
    const viewportRect = viewport.getBoundingClientRect();
    const stage = player.querySelector<HTMLElement>(".sc-slideshow-player__stage");
    const canvas = player.querySelector<HTMLElement>(".sc-slideshow-player__canvas");
    return (
      Math.abs(viewportRect.width - geometry.hostWidth) < 0.01 &&
      Math.abs(viewportRect.height - geometry.hostHeight) < 0.01 &&
      stage?.style.width === `${geometry.stageWidth}px` &&
      stage.style.height === `${geometry.stageHeight}px` &&
      canvas?.style.transform === `scale(${geometry.scale})`
    );
  });
}

async function ensureRuntimeHintOpen(
  player: HTMLElement,
  expectedHost: HTMLElement,
): Promise<HTMLElement> {
  const current = expectedHost.querySelector<HTMLElement>(".sc-assessment-hint-popover--runtime");
  if (current) return current;

  const hideTrigger = Array.from(player.querySelectorAll("button")).find((candidate) =>
    /^Hide \d+ hints?$/.test(candidate.textContent?.trim() ?? ""),
  );
  if (hideTrigger) {
    hideTrigger.click();
    await waitForCondition(() => runtimeHintTriggerOrNull(player) !== null);
  }

  runtimeHintTrigger(player).click();
  return waitForElement<HTMLElement>(expectedHost, ".sc-assessment-hint-popover--runtime");
}

function runtimeHintTrigger(root: ParentNode): HTMLButtonElement {
  const trigger = runtimeHintTriggerOrNull(root);
  if (!trigger) throw new Error("Expected runtime hint trigger.");
  return trigger;
}

function runtimeHintToggle(root: ParentNode): HTMLButtonElement {
  return uniqueElement<HTMLButtonElement>(root, ".sc-assessment-hints__toggle");
}

function runtimeHintTriggerOrNull(root: ParentNode): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll("button")).find((candidate) =>
      /^Show(?: a| \d+) hints?$/.test(candidate.textContent?.trim() ?? ""),
    ) ?? null
  );
}

function installFullscreenHarness(ownerDocument: Document, ownerWindow: Window): () => void {
  const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;
  const OwnerEvent = (ownerWindow as Window & typeof globalThis).Event;
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

  Object.defineProperties(ownerDocument, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: {
      configurable: true,
      value: async () => {
        fullscreenElement = null;
        ownerDocument.dispatchEvent(new OwnerEvent("fullscreenchange"));
      },
    },
  });
  Object.defineProperty(OwnerHTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: async () => {
      fullscreenElement = ownerDocument.querySelector(".sc-slideshow-player__viewport");
      ownerDocument.dispatchEvent(new OwnerEvent("fullscreenchange"));
    },
  });

  return () => {
    restoreProperty(ownerDocument, "fullscreenEnabled", fullscreenEnabledDescriptor);
    restoreProperty(ownerDocument, "fullscreenElement", fullscreenElementDescriptor);
    restoreProperty(ownerDocument, "exitFullscreen", exitFullscreenDescriptor);
    restoreProperty(OwnerHTMLElement.prototype, "requestFullscreen", requestFullscreenDescriptor);
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
  if (!editor) throw new Error("Runtime renderer was not ready.");
  return editor;
}

function buttonByName(root: ParentNode, name: string): HTMLButtonElement {
  const button = buttonByNameOrNull(root, name);
  if (!button) throw new Error(`Expected ${name} button.`);
  return button;
}

function buttonByNameOrNull(root: ParentNode, name: string): HTMLButtonElement | null {
  return (
    Array.from(root.querySelectorAll("button")).find(
      (candidate) =>
        (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === name,
    ) ?? null
  );
}

function dispatchEscape(target: Element): KeyboardEvent {
  const OwnerKeyboardEvent = (target.ownerDocument.defaultView as Window & typeof globalThis)
    .KeyboardEvent;
  const event = new OwnerKeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Escape",
  });
  target.dispatchEvent(event);
  return event;
}

function uniqueElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector) !== null);
  return uniqueElement<T>(root, selector);
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for runtime boundary browser state.");
    }
    await nextAnimationFrame();
  }
  await nextAnimationFrame();
}

function nextAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
