import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import "@/editor/frame/view/bounded-placement.css";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { LearnerActivityRuntimeProvider } from "@/runtime/learner-activity";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/styles/globals.css";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "./content";
import "./flashcard.css";

const mountedPairs: MountedFlashcardPair[] = [];

afterEach(() => {
  for (const pair of mountedPairs.splice(0)) pair.dispose();
  document.body.replaceChildren();
});

describe("Flashcard bounded geometry", () => {
  it.each(["authoring", "runtime"] as const)(
    "scales a %s card down at 5:3 while keeping chrome and scrolling internal",
    async (kind) => {
      const fixture = createFlashcardFixture({
        bounded: true,
        height: 360,
        kind,
        width: 720,
      });
      await nextLayoutFrame();

      const frameRect = fixture.frame.getBoundingClientRect();
      const deckRect = fixture.deck.getBoundingClientRect();
      const stackRect = fixture.stack.getBoundingClientRect();
      const surfaceRect = fixture.surface.getBoundingClientRect();
      const controlsRect = fixture.controls.getBoundingClientRect();

      expect(frameRect.height).toBeCloseTo(360, 0);
      expect(deckRect.height).toBeCloseTo(frameRect.height, 0);
      expect(fixture.header.getBoundingClientRect().bottom).toBeLessThanOrEqual(stackRect.top + 1);
      expect(stackRect.bottom).toBeLessThanOrEqual(controlsRect.top + 1);
      expect(controlsRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
      expect(surfaceRect.width / surfaceRect.height).toBeCloseTo(5 / 3, 2);
      expect(surfaceRect.width).toBeLessThan(stackRect.width);
      expect(surfaceRect.height).toBeLessThanOrEqual(stackRect.height + 1);
      expect(fixture.side.scrollHeight).toBeGreaterThan(fixture.side.clientHeight);
      expect(getComputedStyle(fixture.side).overflowY).toBe("auto");
      expect(fixture.frame.scrollHeight).toBeLessThanOrEqual(fixture.frame.clientHeight + 1);
      expect(fixture.deck.scrollHeight).toBeLessThanOrEqual(fixture.deck.clientHeight + 1);
    },
  );

  it("mounts production authoring and runtime node views with reachable short-frame controls", async () => {
    await page.viewport(1400, 900);
    const pair = await mountRealFlashcardPair();
    mountedPairs.push(pair);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const frameHeight = mounted.kind === "authoring" ? 220 : 180;
      mounted.frame.style.height = `${frameHeight}px`;
      mounted.frame.style.maxHeight = `${frameHeight}px`;
    }
    await nextLayoutFrames(3);

    for (const mounted of [pair.authoring, pair.runtime]) {
      const { frame } = mounted;
      const deck = requiredElement<HTMLElement>(frame, ".sc-flashcard-deck");
      const header = requiredElement<HTMLElement>(frame, ".sc-flashcard-deck-header");
      const controls = requiredElement<HTMLElement>(frame, ".sc-flashcard-reader-controls");

      expect(frame.dataset["boundedPlacement"]).toBe("fill");
      expect(getComputedStyle(deck).overflowY).toBe("auto");
      expect(deck.scrollHeight).toBeGreaterThan(deck.clientHeight);
      expect(frame.scrollHeight).toBeLessThanOrEqual(frame.clientHeight + 1);

      deck.scrollTop = 0;
      await nextLayoutFrame();
      expect(header.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        deck.getBoundingClientRect().top - 1,
      );
      if (mounted.kind === "authoring") {
        const addCard = requiredElement<HTMLElement>(frame, ".sc-flashcard-add-card");
        expect(addCard.getBoundingClientRect().bottom).toBeLessThanOrEqual(
          deck.getBoundingClientRect().bottom + 1,
        );
      }

      deck.scrollTop = deck.scrollHeight;
      await nextLayoutFrame();
      expect(controls.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        deck.getBoundingClientRect().top - 1,
      );
      expect(controls.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        deck.getBoundingClientRect().bottom + 1,
      );
    }

    const authoringFront = await waitForElement<HTMLElement>(
      pair.authoring.frame,
      '[data-slot="flashcard-card-front"]',
    );
    const authoringBack = requiredElement<HTMLElement>(
      pair.authoring.frame,
      '[data-slot="flashcard-card-back"]',
    );
    await waitForCondition(
      () =>
        authoringFront.getAttribute("aria-hidden") === "false" &&
        authoringBack.getAttribute("aria-hidden") === "true",
    );
    requiredElement<HTMLButtonElement>(
      pair.authoring.frame,
      ".sc-flashcard-reader-controls__flip-button",
    ).click();
    await waitForCondition(
      () =>
        pair.authoring.frame.querySelector(
          '[data-slot="flashcard-card-front"][aria-hidden="true"]',
        ) !== null &&
        pair.authoring.frame.querySelector(
          '[data-slot="flashcard-card-back"][aria-hidden="false"]',
        ) !== null,
    );
  });

  it("scrolls the visible runtime face by keyboard and excludes the hidden face", async () => {
    await page.viewport(1400, 900);
    const pair = await mountRealFlashcardPair();
    mountedPairs.push(pair);
    pair.runtime.frame.style.height = "240px";
    pair.runtime.frame.style.maxHeight = "240px";
    await nextLayoutFrames(3);

    const front = await waitForElement<HTMLElement>(
      pair.runtime.frame,
      '[data-slot="flashcard-card-front"]',
    );
    const back = requiredElement<HTMLElement>(
      pair.runtime.frame,
      '[data-slot="flashcard-card-back"]',
    );
    await waitForCondition(
      () =>
        front.getAttribute("aria-hidden") === "false" &&
        back.getAttribute("aria-hidden") === "true",
    );
    const rotator = requiredElement<HTMLElement>(pair.runtime.frame, ".sc-flashcard-card__rotator");

    expect(rotator.hasAttribute("aria-hidden")).toBe(false);
    expect(
      requiredElement<HTMLElement>(pair.runtime.frame, ".sc-flashcard-card__surface").tabIndex,
    ).toBe(-1);
    expect(front.getAttribute("role")).toBe("region");
    expect(front.getAttribute("aria-label")).toBe("Flashcard front content");
    expect(front.tabIndex).toBe(0);
    expect(front.inert).toBe(false);
    expect(back.getAttribute("aria-hidden")).toBe("true");
    expect(back.tabIndex).toBe(-1);
    expect(back.inert).toBe(true);
    expect(front.scrollHeight).toBeGreaterThan(front.clientHeight);

    const frontLink = requiredElement<HTMLAnchorElement>(front, "a");
    const backLink = requiredElement<HTMLAnchorElement>(back, "a");
    front.focus({ preventScroll: true });
    await userEvent.tab();
    expect(document.activeElement).toBe(frontLink);
    await userEvent.tab();
    expect(back.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).not.toBe(backLink);

    const documentScrollBefore = window.scrollY;
    front.focus({ preventScroll: true });
    await userEvent.keyboard("{PageDown}");
    await waitForCondition(() => front.scrollTop > 0);
    expect(document.activeElement).toBe(front);
    expect(window.scrollY).toBe(documentScrollBefore);

    front.scrollTop = front.scrollHeight;
    await userEvent.keyboard("{PageDown}");
    await nextLayoutFrame();
    expect(front.scrollTop).toBe(front.scrollHeight - front.clientHeight);
    expect(window.scrollY).toBe(documentScrollBefore);

    await userEvent.keyboard("{Enter}");
    await waitForCondition(
      () =>
        pair.runtime.frame.querySelector(
          '[data-slot="flashcard-card-front"][aria-hidden="true"]',
        ) !== null &&
        pair.runtime.frame.querySelector(
          '[data-slot="flashcard-card-back"][aria-hidden="false"]',
        ) !== null,
    );
    const flippedFront = requiredElement<HTMLElement>(
      pair.runtime.frame,
      '[data-slot="flashcard-card-front"]',
    );
    const flippedBack = requiredElement<HTMLElement>(
      pair.runtime.frame,
      '[data-slot="flashcard-card-back"]',
    );
    const flippedFrontLink = requiredElement<HTMLAnchorElement>(flippedFront, "a");
    const flippedBackLink = requiredElement<HTMLAnchorElement>(flippedBack, "a");
    expect(document.activeElement).toBe(flippedBack);
    expect(flippedFront.tabIndex).toBe(-1);
    expect(flippedFront.inert).toBe(true);
    expect(flippedBack.tabIndex).toBe(0);
    expect(flippedBack.inert).toBe(false);
    expect(flippedBack.getAttribute("role")).toBe("region");
    expect(flippedBack.getAttribute("aria-label")).toBe("Flashcard back content");
    expect(flippedBack.scrollHeight).toBeLessThanOrEqual(flippedBack.clientHeight);

    await userEvent.keyboard("{PageDown}");
    await nextLayoutFrame();
    expect(window.scrollY).toBe(documentScrollBefore);

    await userEvent.tab();
    expect(document.activeElement).toBe(flippedBackLink);
    await userEvent.tab();
    expect(flippedFront.contains(document.activeElement)).toBe(false);
    expect(document.activeElement).not.toBe(flippedFrontLink);
  });

  it("retains intrinsic page-flow sizing when no finite rectangle is supplied", async () => {
    const fixture = createFlashcardFixture({
      bounded: false,
      kind: "runtime",
      width: 320,
    });
    await nextLayoutFrame();

    expect(fixture.frame.hasAttribute("data-bounded-placement")).toBe(false);
    expect(fixture.surface.getBoundingClientRect().height).toBeGreaterThanOrEqual(288);
    expect(fixture.frame.scrollHeight).toBe(fixture.frame.clientHeight);
  });

  it("uses the full available width when width limits the 5:3 card", async () => {
    const fixture = createFlashcardFixture({
      bounded: true,
      height: 640,
      kind: "runtime",
      width: 320,
    });
    await nextLayoutFrame();

    const stackRect = fixture.stack.getBoundingClientRect();
    const surfaceRect = fixture.surface.getBoundingClientRect();

    expect(surfaceRect.width).toBeCloseTo(stackRect.width, 0);
    expect(surfaceRect.width / surfaceRect.height).toBeCloseTo(5 / 3, 2);
    expect(surfaceRect.height).toBeLessThanOrEqual(stackRect.height + 1);
  });

  it("centres the completed state without overflowing a bounded frame", async () => {
    const host = document.createElement("div");
    host.style.width = "720px";
    host.style.height = "360px";

    const frame = document.createElement("div");
    frame.className = "sc-flashcard-block";
    frame.dataset["runtimeFrame"] = "block";
    frame.dataset["boundedPlacement"] = "fill";

    const mastered = document.createElement("div");
    mastered.className = "sc-flashcard-mastered";
    mastered.textContent = "Deck complete.";
    frame.append(mastered);
    host.append(frame);
    document.body.append(host);
    await nextLayoutFrame();

    const frameRect = frame.getBoundingClientRect();
    const masteredRect = mastered.getBoundingClientRect();

    expect(masteredRect.bottom).toBeLessThanOrEqual(frameRect.bottom + 1);
    expect(masteredRect.top).toBeGreaterThanOrEqual(frameRect.top - 1);
    expect(masteredRect.top + masteredRect.height / 2).toBeCloseTo(
      frameRect.top + frameRect.height / 2,
      0,
    );
  });
});

function createFlashcardFixture(input: {
  bounded: boolean;
  height?: number;
  kind: "authoring" | "runtime";
  width: number;
}) {
  const host = document.createElement("div");
  host.style.width = `${input.width}px`;
  if (input.height !== undefined) host.style.height = `${input.height}px`;

  const frame = document.createElement("div");
  frame.className = "sc-flashcard-block";
  frame.setAttribute(
    input.kind === "authoring" ? "data-authoring-frame" : "data-runtime-frame",
    "block",
  );
  if (input.bounded) frame.dataset["boundedPlacement"] = "fill";

  const deck = document.createElement("div");
  deck.className = "sc-flashcard-deck";

  const header = document.createElement("div");
  header.className = "sc-flashcard-deck-header";
  header.style.height = "28px";
  deck.append(header);

  if (input.kind === "authoring") {
    const addCard = document.createElement("button");
    addCard.className = "sc-flashcard-add-card";
    addCard.textContent = "Add card";
    deck.append(addCard);
  }

  const stack = document.createElement("div");
  stack.className = "sc-flashcard-stack";

  const card = document.createElement("div");
  card.className = "sc-flashcard-card";

  const surface = document.createElement("div");
  surface.className = "sc-flashcard-card__surface";

  const rotator = document.createElement("div");
  rotator.className = "sc-flashcard-card__rotator";

  const side = document.createElement("div");
  side.className = "sc-flashcard-side sc-flashcard-side--front";

  const longContent = document.createElement("div");
  longContent.style.height = "600px";
  longContent.style.flex = "0 0 auto";
  side.append(longContent);
  rotator.append(side);
  surface.append(rotator);
  card.append(surface);
  stack.append(card);
  deck.append(stack);

  const controls = document.createElement("div");
  controls.className = "sc-flashcard-reader-controls";
  controls.style.height = "88px";
  deck.append(controls);

  frame.append(deck);
  host.append(frame);
  document.body.append(host);

  return { controls, deck, frame, header, side, stack, surface };
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function nextLayoutFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) await nextLayoutFrame();
}

type RendererKind = "authoring" | "runtime";

interface MountedFlashcardRenderer {
  editor: TiptapEditor;
  frame: HTMLElement;
  host: HTMLElement;
  kind: RendererKind;
}

interface MountedFlashcardPair {
  authoring: MountedFlashcardRenderer;
  runtime: MountedFlashcardRenderer;
  dispose: () => void;
}

async function mountRealFlashcardPair(): Promise<MountedFlashcardPair> {
  const surfaceId = "flashcard-browser-surface";
  const initialContent = boundedFlashcardDocument(surfaceId);
  const outer = document.createElement("div");
  outer.style.display = "grid";
  outer.style.gridTemplateColumns = "repeat(2, 640px)";
  outer.style.width = "1280px";
  const scrollSentinel = document.createElement("div");
  scrollSentinel.style.height = "1200px";
  const authoringHost = rendererHost("authoring");
  const runtimeHost = rendererHost("runtime");
  outer.append(authoringHost, runtimeHost);
  document.body.append(outer, scrollSentinel);

  const authoringRoot = createRoot(authoringHost);
  const runtimeRoot = createRoot(runtimeHost);
  let authoringEditor: TiptapEditor | null = null;
  let runtimeEditor: TiptapEditor | null = null;

  authoringRoot.render(
    createElement(CourseDocumentEditor, {
      source: { mode: "document", content: cloneJSON(initialContent) },
      editable: true,
      onReady: (editor) => {
        authoringEditor = editor;
      },
    }),
  );
  runtimeRoot.render(
    createElement(ScaffoldArtifactIdentityProvider, {
      artifactId: "flashcard-browser-artifact",
      children: createElement(LearnerActivityRuntimeProvider, {
        children: createElement(CourseDocumentRuntimeRenderer, {
          artifactId: "flashcard-browser-artifact",
          initialContent: cloneJSON(initialContent),
          visibleSurfaceId: surfaceId,
          onReady: (editor) => {
            runtimeEditor = editor;
          },
        }),
      }),
    }),
  );

  await waitForCondition(
    () =>
      authoringEditor !== null &&
      runtimeEditor !== null &&
      authoringHost.querySelector('.sc-flashcard-block[data-bounded-placement="fill"]') &&
      runtimeHost.querySelector('.sc-flashcard-block[data-bounded-placement="fill"]'),
  );
  if (!authoringEditor || !runtimeEditor) {
    throw new Error("Flashcard browser editors were not ready.");
  }
  await nextLayoutFrames(2);

  const pair: MountedFlashcardPair = {
    authoring: {
      editor: authoringEditor,
      frame: requiredElement<HTMLElement>(authoringHost, ".sc-flashcard-block"),
      host: authoringHost,
      kind: "authoring",
    },
    runtime: {
      editor: runtimeEditor,
      frame: requiredElement<HTMLElement>(runtimeHost, ".sc-flashcard-block"),
      host: runtimeHost,
      kind: "runtime",
    },
    dispose() {
      authoringRoot.unmount();
      runtimeRoot.unmount();
      authoringEditor?.destroy();
      runtimeEditor?.destroy();
      outer.remove();
      scrollSentinel.remove();
    },
  };
  return pair;
}

function boundedFlashcardDocument(surfaceId: string): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Slide content fixture is missing its Region.");

  region.content = [
    {
      type: FLASHCARD_NODE,
      attrs: {
        id: "flashcard-browser-deck",
        data: { type: "flashcard", shuffle: false },
      },
      content: [
        {
          type: FLASHCARD_CARD_NODE,
          attrs: { id: "flashcard-browser-card" },
          content: [
            flashcardSide(FLASHCARD_CARD_FRONT_NODE, "Front", 18),
            flashcardSide(FLASHCARD_CARD_BACK_NODE, "Back", 1),
          ],
        },
      ],
    },
  ];

  const content = createScaffoldDocumentContent({ mode: "slideshow", surfaceId });
  const courseDocument = content.content?.[0];
  if (!courseDocument) throw new Error("Slideshow fixture has no courseDocument.");
  courseDocument.content = [surface];
  return content;
}

function flashcardSide(
  type: typeof FLASHCARD_CARD_FRONT_NODE | typeof FLASHCARD_CARD_BACK_NODE,
  label: string,
  paragraphCount: number,
): JSONContent {
  return {
    type,
    content: Array.from({ length: paragraphCount }, (_, index) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text:
            paragraphCount === 1
              ? `${label} link`
              : `${label} study detail ${index + 1} with enough text to require internal scrolling.`,
          ...(index === 0
            ? {
                marks: [
                  {
                    type: "link",
                    attrs: { href: `https://example.com/${label.toLowerCase()}` },
                  },
                ],
              }
            : {}),
        },
      ],
    })),
  };
}

function rendererHost(kind: RendererKind): HTMLElement {
  const host = document.createElement("div");
  host.style.width = "640px";
  host.style.height = "360px";
  if (kind === "runtime") {
    host.className = "sc-slideshow-player__viewport sc-slideshow-player__canvas";
  }
  return host;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector));
  return requiredElement<T>(root, selector);
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Flashcard browser state.");
    }
    await nextLayoutFrame();
  }
}

function cloneJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
