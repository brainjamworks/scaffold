import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import "@/editor/frame/view/bounded-placement.css";
import { slideContentSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-content";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { EmbeddedNodeId } from "@scaffold/contracts";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { LearnerActivityRuntimeProvider } from "@/runtime/learner-activity";
import { CourseDocumentRuntimeRenderer } from "@/runtime/renderer/CourseDocumentRuntimeRenderer";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/styles/globals.css";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "./content";
import "./FlashcardAuthoringControls.css";
import "./flashcard.css";

const mountedPairs: MountedFlashcardPair[] = [];
const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();
const coreRuntimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  for (const pair of mountedPairs.splice(0)) pair.dispose();
  document.body.replaceChildren();
});

describe("Flashcard authoring filmstrip", () => {
  it("selects cards and commits one pointer reorder after a local thumbnail projection", async () => {
    await page.viewport(1400, 900);
    const pair = await mountRealFlashcardPair();
    mountedPairs.push(pair);

    const strip = requiredElement<HTMLElement>(pair.authoring.frame, "[data-flashcard-filmstrip]");
    const thumbnails = Array.from(
      strip.querySelectorAll<HTMLElement>("[data-flashcard-filmstrip-card]"),
    );
    expect(thumbnails).toHaveLength(3);
    expect(pair.runtime.frame.querySelector("[data-flashcard-filmstrip]")).toBeNull();
    expect(strip.querySelector(".sc-app-flashcard-add-card")).not.toBeNull();
    expect(thumbnails[0]).toHaveTextContent("Front card one");
    expect(thumbnails[0]?.querySelector('[contenteditable="true"], input, textarea')).toBeNull();

    const secondSelector = filmstripHandle(strip, "flashcard002");
    secondSelector.click();
    await waitForCondition(
      () =>
        secondSelector.getAttribute("aria-current") === "true" &&
        pair.authoring.frame.querySelector(
          '[data-node="flashcard-card"][data-id="flashcard002"].sc-course-flashcard-card',
        ) !== null,
    );

    const before = flashcardCardOrder(pair.authoring.editor);
    let documentWrites = 0;
    const countDocumentWrites = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    pair.authoring.editor.on("transaction", countDocumentWrites);

    const source = filmstripHandle(strip, "flashcard001");
    const target = filmstripCard(strip, "flashcard003");
    const pointer = centerOf(target.getBoundingClientRect());
    source.focus({ preventScroll: true });
    await startPointerDrag(source, pointer);

    expect(flashcardCardOrder(pair.authoring.editor)).toEqual(before);
    expect(filmstripCard(strip, "flashcard001")).toHaveAttribute(
      "data-interaction-drag-placeholder",
    );
    expect(pair.authoring.host.querySelector("[data-interaction-drag-overlay]")).not.toBeNull();
    expect(
      pair.authoring.host.querySelector('[data-flashcard-filmstrip-preview="flashcard001"]'),
    ).not.toBeNull();

    await finishPointerDrag(pointer);
    await waitForCondition(
      () =>
        flashcardCardOrder(pair.authoring.editor).join("|") ===
        "flashcard002|flashcard003|flashcard001",
    );
    await waitForCondition(
      () => !pair.authoring.host.querySelector("[data-interaction-drag-overlay]"),
    );
    pair.authoring.editor.off("transaction", countDocumentWrites);

    expect(documentWrites).toBe(1);
    expect(filmstripHandle(strip, "flashcard001")).toHaveAttribute("aria-current", "true");
  });

  it("reorders with Left and Right, cancels with Escape, and restores focus", async () => {
    await page.viewport(1400, 900);
    const pair = await mountRealFlashcardPair();
    mountedPairs.push(pair);
    const strip = requiredElement<HTMLElement>(pair.authoring.frame, "[data-flashcard-filmstrip]");
    const source = filmstripHandle(strip, "flashcard002");

    source.focus({ preventScroll: true });
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await nextLayoutFrames(2);
    expect(filmstripCard(strip, "flashcard002")).toHaveAttribute(
      "data-interaction-drag-placeholder",
    );

    fireEvent.keyDown(source, { code: "ArrowLeft", key: "ArrowLeft" });
    await nextLayoutFrames(2);
    expect(filmstripVisualOrder(strip)).toEqual(["flashcard002", "flashcard001", "flashcard003"]);

    await userEvent.keyboard("{Escape}");
    await waitForCondition(
      () => !pair.authoring.host.querySelector("[data-interaction-drag-overlay]"),
    );
    expect(flashcardCardOrder(pair.authoring.editor)).toEqual([
      "flashcard001",
      "flashcard002",
      "flashcard003",
    ]);
    await waitForCondition(() => document.activeElement === source);
    expect(document.activeElement).toBe(source);

    fireEvent.keyDown(source, { code: "Space", key: " " });
    await nextLayoutFrames(2);
    fireEvent.keyDown(source, { code: "ArrowRight", key: "ArrowRight" });
    await nextLayoutFrames(2);
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await waitForCondition(
      () =>
        flashcardCardOrder(pair.authoring.editor).join("|") ===
        "flashcard001|flashcard003|flashcard002",
    );
    expect(document.activeElement).toBe(source);
  });
});

describe("Flashcard authoring delete presentation", () => {
  it("uses App destructive semantics inside Course content", async () => {
    const host = document.createElement("div");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1";
    host.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
    host.style.setProperty("--sc-app-color-error-background", "rgb(254 226 226)");
    host.style.setProperty("--sc-app-color-focus-outline", "rgb(79 70 229)");

    const deleteButton = document.createElement("button");
    deleteButton.className = "sc-app-flashcard-card-delete";
    deleteButton.ariaLabel = "Delete flashcard card 1";
    deleteButton.style.transition = "none";
    host.append(deleteButton);
    document.body.append(host);

    expect(deleteButton.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(deleteButton.getBoundingClientRect().height).toBeCloseTo(44, 0);

    await userEvent.tab();
    expect(document.activeElement).toBe(deleteButton);
    expect(getComputedStyle(deleteButton).color).toBe("rgb(185, 28, 28)");
    expect(getComputedStyle(deleteButton).backgroundColor).toBe("rgb(254, 226, 226)");
    expect(getComputedStyle(deleteButton).outlineColor).toBe("rgb(79, 70, 229)");
  });
});

describe("Flashcard shared presentation invariants", () => {
  it("keeps status and learner controls usable without a Course design recipe", async () => {
    const block = document.createElement("section");
    block.className = "sc-course-flashcard-block";
    block.style.width = "480px";
    block.innerHTML = `
      <div class="sc-course-flashcard-deck">
        <div class="sc-course-flashcard-deck-header">
          <div class="sc-course-flashcard-deck-header__row">
            <span class="sc-course-flashcard-deck-header__status">Flip to study, rate as you go</span>
            <span class="sc-course-flashcard-deck-header__counter">1 / 3</span>
          </div>
        </div>
        <div class="sc-course-flashcard-reader-controls">
          <div class="sc-course-flashcard-reader-controls__nav">
            <button class="rt-reset rt-BaseButton rt-r-size-2 rt-variant-surface rt-IconButton sc-course-icon-action sc-course-flashcard-reader-controls__icon-button" type="button">Previous</button>
            <button class="sc-course-flashcard-reader-controls__flip-button" type="button">Flip card</button>
            <button class="rt-reset rt-BaseButton rt-r-size-2 rt-variant-surface rt-IconButton sc-course-icon-action sc-course-flashcard-reader-controls__icon-button" type="button">Next</button>
          </div>
          <div class="sc-course-flashcard-reader-controls__ratings">
            <button class="sc-course-flashcard-rating-button" type="button">Not yet</button>
            <button class="sc-course-flashcard-rating-button" type="button">Got it</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(block);
    await nextLayoutFrame();

    const headerRow = requiredElement<HTMLElement>(block, ".sc-course-flashcard-deck-header__row");
    const counter = requiredElement<HTMLElement>(
      block,
      ".sc-course-flashcard-deck-header__counter",
    );
    const controls = requiredElement<HTMLElement>(block, ".sc-course-flashcard-reader-controls");
    const nav = requiredElement<HTMLElement>(block, ".sc-course-flashcard-reader-controls__nav");
    const ratings = requiredElement<HTMLElement>(
      block,
      ".sc-course-flashcard-reader-controls__ratings",
    );
    const iconButtons = block.querySelectorAll<HTMLElement>(
      ".sc-course-flashcard-reader-controls__icon-button",
    );

    expect(getComputedStyle(headerRow).display).toBe("flex");
    expect(getComputedStyle(headerRow).justifyContent).toBe("space-between");
    expect(getComputedStyle(counter).whiteSpace).toBe("nowrap");
    expect(getComputedStyle(controls).display).toBe("flex");
    expect(getComputedStyle(controls).flexDirection).toBe("column");
    expect(getComputedStyle(nav).display).toBe("flex");
    expect(getComputedStyle(nav).justifyContent).toBe("space-between");
    expect(getComputedStyle(ratings).display).toBe("grid");
    expect(getComputedStyle(ratings).gridTemplateColumns.split(" ")).toHaveLength(2);
    for (const button of iconButtons) {
      expect(button.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
  });

  it("keeps navigation inside a narrow Flashcard container", async () => {
    const block = document.createElement("section");
    block.className = "sc-course-flashcard-block";
    block.style.width = "300px";
    block.innerHTML = `
      <div class="sc-course-flashcard-deck">
        <div class="sc-course-flashcard-reader-controls">
          <div class="sc-course-flashcard-reader-controls__nav">
            <button class="rt-reset rt-BaseButton rt-r-size-2 rt-variant-surface rt-IconButton sc-course-icon-action sc-course-flashcard-reader-controls__icon-button" type="button">Previous</button>
            <button class="sc-course-flashcard-reader-controls__flip-button" type="button">
              Flip card <kbd class="sc-course-flashcard-keycap">Space</kbd>
            </button>
            <button class="rt-reset rt-BaseButton rt-r-size-2 rt-variant-surface rt-IconButton sc-course-icon-action sc-course-flashcard-reader-controls__icon-button" type="button">Next</button>
          </div>
        </div>
      </div>
    `;
    document.body.append(block);
    await nextLayoutFrame();

    const nav = requiredElement<HTMLElement>(block, ".sc-course-flashcard-reader-controls__nav");
    const flip = requiredElement<HTMLElement>(
      block,
      ".sc-course-flashcard-reader-controls__flip-button",
    );
    const keycap = requiredElement<HTMLElement>(block, ".sc-course-flashcard-keycap");

    expect(getComputedStyle(nav).display).toBe("grid");
    expect(getComputedStyle(nav).gridTemplateColumns.split(" ")).toHaveLength(3);
    expect(flip.getBoundingClientRect().right).toBeLessThanOrEqual(
      nav.getBoundingClientRect().right + 1,
    );
    expect(getComputedStyle(keycap).display).toBe("none");
  });
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
      const deck = requiredElement<HTMLElement>(frame, ".sc-course-flashcard-deck");
      const header = requiredElement<HTMLElement>(frame, ".sc-course-flashcard-deck-header");
      const controls = requiredElement<HTMLElement>(frame, ".sc-course-flashcard-reader-controls");

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
        const addCard = requiredElement<HTMLElement>(frame, ".sc-app-flashcard-add-card");
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

    expect(pair.authoring.frame.querySelector(".sc-app-flashcard-card-chrome")).not.toBeNull();
    expect(pair.authoring.frame.querySelector(".sc-app-flashcard-card-delete")).not.toBeNull();
    expect(pair.authoring.frame.querySelector(".sc-course-flashcard__delete")).toBeNull();
    expect(pair.authoring.frame.querySelector(".sc-course-flashcard-rating-button")).toBeNull();
    expect(pair.authoring.frame.querySelector('[role="progressbar"]')).toBeNull();
    expect(pair.runtime.frame.querySelector('[class*="sc-app-flashcard-"]')).toBeNull();
    expect(pair.runtime.frame.querySelector('[role="progressbar"]')).not.toBeNull();

    const authoringCard = currentFlashcard(pair.authoring.frame);
    const authoringFront = await waitForElement<HTMLElement>(
      authoringCard,
      '[data-slot="flashcard-card-front"]',
    );
    const authoringBack = requiredElement<HTMLElement>(
      authoringCard,
      '[data-slot="flashcard-card-back"]',
    );
    await waitForCondition(
      () =>
        authoringFront.getAttribute("aria-hidden") === "false" &&
        authoringBack.getAttribute("aria-hidden") === "true",
    );
    requiredElement<HTMLButtonElement>(
      pair.authoring.frame,
      ".sc-course-flashcard-reader-controls__flip-button",
    ).click();
    await waitForCondition(
      () =>
        authoringFront.getAttribute("aria-hidden") === "true" &&
        authoringBack.getAttribute("aria-hidden") === "false",
    );
  });

  it("scrolls the visible runtime face by keyboard and excludes the hidden face", async () => {
    await page.viewport(1400, 900);
    const pair = await mountRealFlashcardPair();
    mountedPairs.push(pair);
    pair.runtime.frame.style.height = "360px";
    pair.runtime.frame.style.maxHeight = "360px";
    await nextLayoutFrames(3);

    const runtimeCard = currentFlashcard(pair.runtime.frame);
    const front = await waitForElement<HTMLElement>(
      runtimeCard,
      '[data-slot="flashcard-card-front"]',
    );
    const back = requiredElement<HTMLElement>(runtimeCard, '[data-slot="flashcard-card-back"]');
    await waitForCondition(
      () =>
        front.getAttribute("aria-hidden") === "false" &&
        back.getAttribute("aria-hidden") === "true",
    );
    const rotator = requiredElement<HTMLElement>(runtimeCard, ".sc-course-flashcard-card__rotator");

    expect(rotator.hasAttribute("aria-hidden")).toBe(false);
    expect(
      requiredElement<HTMLElement>(runtimeCard, ".sc-course-flashcard-card__surface").tabIndex,
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
        front.getAttribute("aria-hidden") === "true" &&
        back.getAttribute("aria-hidden") === "false",
    );
    const flippedFront = front;
    const flippedBack = back;
    const flippedFrontLink = requiredElement<HTMLAnchorElement>(flippedFront, "a");
    const flippedBackLink = requiredElement<HTMLAnchorElement>(flippedBack, "a");
    expect(document.activeElement).toBe(flippedBack);
    expect(flippedFront.tabIndex).toBe(-1);
    expect(flippedFront.inert).toBe(true);
    expect(flippedBack.tabIndex).toBe(0);
    expect(flippedBack.inert).toBe(false);
    expect(flippedBack.getAttribute("role")).toBe("region");
    expect(flippedBack.getAttribute("aria-label")).toBe("Flashcard back content");
    expect(flippedBack.clientHeight).toBeGreaterThan(0);

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
    const surfaceRect = fixture.surface.getBoundingClientRect();
    expect(surfaceRect.width / surfaceRect.height).toBeCloseTo(5 / 3, 2);
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
    frame.className = "sc-course-flashcard-block";
    frame.dataset["runtimeFrame"] = "block";
    frame.dataset["boundedPlacement"] = "fill";

    const mastered = document.createElement("div");
    mastered.className = "sc-course-flashcard-mastered";
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
  frame.className = "sc-course-flashcard-block";
  frame.setAttribute(
    input.kind === "authoring" ? "data-authoring-frame" : "data-runtime-frame",
    "block",
  );
  if (input.bounded) frame.dataset["boundedPlacement"] = "fill";

  const deck = document.createElement("div");
  deck.className = "sc-course-flashcard-deck";

  const header = document.createElement("div");
  header.className = "sc-course-flashcard-deck-header";
  header.style.height = "28px";
  deck.append(header);

  if (input.kind === "authoring") {
    const addCard = document.createElement("button");
    addCard.className = "sc-app-flashcard-add-card";
    addCard.textContent = "Add card";
    deck.append(addCard);
  }

  const stack = document.createElement("div");
  stack.className = "sc-course-flashcard-stack";

  const card = document.createElement("div");
  card.className = "sc-course-flashcard-card";

  const surface = document.createElement("div");
  surface.className = "sc-course-flashcard-card__surface";

  const rotator = document.createElement("div");
  rotator.className = "sc-course-flashcard-card__rotator";

  const side = document.createElement("div");
  side.className = "sc-course-flashcard-side sc-course-flashcard-side--front";

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
  controls.className = "sc-course-flashcard-reader-controls";
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
  const surfaceId = createEmbeddedNodeId();
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
    createElement(CourseThemeProvider, {
      appearance: "light",
      theme: createDefaultPersistedCourseTheme(),
      children: createElement(CourseDocumentEditor, {
        composition: coreAuthoringComposition,
        source: { mode: "document", content: cloneJSON(initialContent) },
        editable: true,
        onReady: (editor) => {
          authoringEditor = editor;
        },
      }),
    }),
  );
  runtimeRoot.render(
    createElement(CourseThemeProvider, {
      appearance: "light",
      theme: createDefaultPersistedCourseTheme(),
      children: createElement(ScaffoldArtifactIdentityProvider, {
        artifactId: "flashcard-browser-artifact",
        children: createElement(LearnerActivityRuntimeProvider, {
          children: createElement(CourseDocumentRuntimeRenderer, {
            composition: coreRuntimeComposition,
            artifactId: "flashcard-browser-artifact",
            initialContent: cloneJSON(initialContent),
            productAccess: { scaffoldPlusAuthorized: false },
            visibleSurfaceId: surfaceId,
            onReady: (editor) => {
              runtimeEditor = editor;
            },
          }),
        }),
      }),
    }),
  );

  await waitForCondition(
    () =>
      authoringEditor !== null &&
      runtimeEditor !== null &&
      authoringHost.querySelector('.sc-course-flashcard-block[data-bounded-placement="fill"]') &&
      runtimeHost.querySelector('.sc-course-flashcard-block[data-bounded-placement="fill"]'),
  );
  if (!authoringEditor || !runtimeEditor) {
    throw new Error("Flashcard browser editors were not ready.");
  }
  await nextLayoutFrames(2);

  const pair: MountedFlashcardPair = {
    authoring: {
      editor: authoringEditor,
      frame: requiredElement<HTMLElement>(authoringHost, ".sc-course-flashcard-block"),
      host: authoringHost,
      kind: "authoring",
    },
    runtime: {
      editor: runtimeEditor,
      frame: requiredElement<HTMLElement>(runtimeHost, ".sc-course-flashcard-block"),
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

function boundedFlashcardDocument(surfaceId: EmbeddedNodeId): JSONContent {
  const surface = slideContentSurfaceDefinition.createSurface({ surfaceId });
  const region = surface.content?.find((child) => child.type === "region");
  if (!region) throw new Error("Slide content fixture is missing its Region.");

  region.content = [
    {
      type: FLASHCARD_NODE,
      attrs: {
        id: "flashdeck001",
        data: { type: "flashcard", shuffle: false },
      },
      content: [
        {
          type: FLASHCARD_CARD_NODE,
          attrs: { id: "flashcard001" },
          content: [
            flashcardSide(FLASHCARD_CARD_FRONT_NODE, "Front card one", 18),
            flashcardSide(FLASHCARD_CARD_BACK_NODE, "Back card one", 1),
          ],
        },
        {
          type: FLASHCARD_CARD_NODE,
          attrs: { id: "flashcard002" },
          content: [
            flashcardSide(FLASHCARD_CARD_FRONT_NODE, "Front card two", 1),
            flashcardSide(FLASHCARD_CARD_BACK_NODE, "Back card two", 1),
          ],
        },
        {
          type: FLASHCARD_CARD_NODE,
          attrs: { id: "flashcard003" },
          content: [
            flashcardSide(FLASHCARD_CARD_FRONT_NODE, "Front card three", 1),
            flashcardSide(FLASHCARD_CARD_BACK_NODE, "Back card three", 1),
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

function filmstripCard(root: ParentNode, cardId: string): HTMLElement {
  return requiredElement<HTMLElement>(root, `[data-flashcard-filmstrip-card="${cardId}"]`);
}

function currentFlashcard(root: ParentNode): HTMLElement {
  return requiredElement<HTMLElement>(
    root,
    ".sc-course-flashcard-card:not(.sc-course-flashcard-card--inactive)",
  );
}

function filmstripHandle(root: ParentNode, cardId: string): HTMLButtonElement {
  return requiredElement<HTMLButtonElement>(
    filmstripCard(root, cardId),
    "[data-flashcard-filmstrip-drag-handle]",
  );
}

function filmstripVisualOrder(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-flashcard-filmstrip-card]"))
    .filter((element) => !element.closest("[data-interaction-drag-overlay]"))
    .map((element) => element.dataset["flashcardFilmstripCard"] ?? "");
}

function flashcardCardOrder(editor: TiptapEditor): string[] {
  const result: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== FLASHCARD_CARD_NODE) return true;
    const id = node.attrs["id"];
    if (typeof id === "string") result.push(id);
    return false;
  });
  return result;
}

async function startPointerDrag(
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const start = centerOf(source.getBoundingClientRect());
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: start.x + 6,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await nextLayoutFrame();
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await nextLayoutFrames(2);
}

async function finishPointerDrag(pointer: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await nextLayoutFrames(2);
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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
