import { fireEvent } from "@testing-library/react";
import { useState } from "react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { TestInteractionDragEnvironment } from "@/editor/interactions/drag/testing/TestInteractionDragEnvironment";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

import { FlashcardFilmstrip } from "./FlashcardFilmstrip";

interface ReorderCall {
  readonly sourceId: string;
  readonly targetId: string;
}

interface FilmstripHarness {
  readonly host: HTMLElement;
  readonly reorderCalls: ReorderCall[];
  readonly rendered: RenderResult;
  card(cardId: string): HTMLElement;
  handle(cardId: string): HTMLButtonElement;
  order(): string[];
  waitForIdle(): Promise<void>;
}

const mounted: FilmstripHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.host.remove();
  }
});

describe("FlashcardFilmstrip", () => {
  it("selects inert previews and commits one non-adjacent pointer reorder", async () => {
    await page.viewport(1000, 700);
    const harness = await mountFilmstrip();
    mounted.push(harness);

    const cards = harness.host.querySelectorAll("[data-flashcard-filmstrip-card]");
    expect(cards).toHaveLength(5);
    expect(harness.card("card-a")).toHaveTextContent("What is photosynthesis?");
    expect(
      harness.host.querySelector(
        '[data-flashcard-filmstrip-card] :is([contenteditable="true"], input, textarea)',
      ),
    ).toBeNull();
    expect(requiredElement(harness.host, ".sc-app-flashcard-add-card")).toHaveTextContent(
      "Add card",
    );

    harness.handle("card-b").click();
    await animationFrames(1);
    expect(harness.handle("card-b")).toHaveAttribute("aria-current", "true");

    const source = harness.handle("card-a");
    const targetCenter = centerOf(harness.card("card-c").getBoundingClientRect());
    source.focus({ preventScroll: true });
    await startPointerDrag(source, targetCenter);

    expect(harness.reorderCalls).toEqual([]);
    expect(harness.order()).toEqual(["card-b", "card-c", "card-a", "card-d", "card-e"]);
    expect(harness.card("card-a")).toHaveAttribute("data-interaction-drag-placeholder");
    expect(getComputedStyle(harness.card("card-a")).borderStyle).toBe("dashed");
    const overlay = requiredElement<HTMLElement>(harness.host, "[data-interaction-drag-overlay]");
    expect(overlay).toHaveAttribute("inert");
    expect(overlay.querySelector('[data-flashcard-filmstrip-preview="card-a"]')).not.toBeNull();
    expect(overlay.querySelector("button")).toBeNull();

    await finishPointerDrag(targetCenter);
    await waitFor(() => harness.reorderCalls.length === 1);
    await harness.waitForIdle();

    expect(harness.reorderCalls).toEqual([{ sourceId: "card-a", targetId: "card-c" }]);
    expect(harness.order()).toEqual(["card-b", "card-c", "card-a", "card-d", "card-e"]);
    expect(harness.handle("card-a")).toHaveAttribute("aria-current", "true");
  });

  it("projects with Left and Right, cancels cleanly, and restores focus", async () => {
    await page.viewport(1000, 700);
    const harness = await mountFilmstrip();
    mounted.push(harness);
    const source = harness.handle("card-b");

    source.focus({ preventScroll: true });
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await animationFrames(2);
    fireEvent.keyDown(source, { code: "ArrowLeft", key: "ArrowLeft" });
    await animationFrames(2);
    expect(harness.order()).toEqual(["card-b", "card-a", "card-c", "card-d", "card-e"]);

    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
    expect(harness.order()).toEqual(["card-a", "card-b", "card-c", "card-d", "card-e"]);
    expect(harness.reorderCalls).toEqual([]);
    await waitFor(() => document.activeElement === source);
    expect(document.activeElement).toBe(source);

    fireEvent.keyDown(source, { code: "Space", key: " " });
    await animationFrames(2);
    fireEvent.keyDown(source, { code: "ArrowRight", key: "ArrowRight" });
    await animationFrames(2);
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await waitFor(() => harness.reorderCalls.length === 1);
    await harness.waitForIdle();
    expect(harness.reorderCalls).toEqual([{ sourceId: "card-b", targetId: "card-c" }]);
    expect(harness.order()).toEqual(["card-a", "card-c", "card-b", "card-d", "card-e"]);
    expect(document.activeElement).toBe(source);
  });

  it("places Add card after the final thumbnail when the strip overflows", async () => {
    await page.viewport(1000, 700);
    const harness = await mountFilmstrip();
    mounted.push(harness);
    const strip = requiredElement<HTMLElement>(harness.host, "[data-flashcard-filmstrip]");
    const finalCard = harness.card("card-e").getBoundingClientRect();
    const add = requiredElement<HTMLElement>(
      harness.host,
      ".sc-app-flashcard-filmstrip__add",
    ).getBoundingClientRect();

    expect(strip.scrollWidth).toBeGreaterThan(strip.clientWidth);
    expect(add.left).toBeGreaterThanOrEqual(finalCard.right + 9);
  });
});

async function mountFilmstrip(): Promise<FilmstripHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "position:absolute;left:80px;top:64px;width:760px;height:320px;padding:24px;box-sizing:border-box";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.cssText =
    "position:relative;width:680px;height:240px;padding:20px;box-sizing:border-box;overflow:hidden";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);
  const reorderCalls: ReorderCall[] = [];

  const rendered = await renderBrowserReact(
    <TestInteractionDragEnvironment
      collisionBoundary={ownerRoot}
      coordinateKind="viewport"
      overlayHost={host}
      root={ownerRoot}
    >
      <FilmstripTestApp reorderCalls={reorderCalls} />
    </TestInteractionDragEnvironment>,
    { baseElement: host, container: reactElement },
  );
  await animationFrames(2);

  return {
    host,
    reorderCalls,
    rendered,
    card: (cardId) => filmstripCard(host, cardId),
    handle: (cardId) =>
      requiredElement<HTMLButtonElement>(
        filmstripCard(host, cardId),
        "[data-flashcard-filmstrip-drag-handle]",
      ),
    order: () => filmstripOrder(host),
    waitForIdle: () =>
      waitFor(
        () =>
          !host.querySelector("[data-interaction-drag-overlay]") &&
          !host.querySelector("[data-interaction-drag-placeholder]"),
      ),
  };
}

function FilmstripTestApp({ reorderCalls }: { reorderCalls: ReorderCall[] }) {
  const [cards, setCards] = useState([
    { id: "card-a", frontText: "What is photosynthesis?" },
    { id: "card-b", frontText: "What is the capital of France?" },
    { id: "card-c", frontText: "Newton's first law" },
    { id: "card-d", frontText: "Blank front" },
    { id: "card-e", frontText: "Blank front" },
  ]);
  const [currentCardId, setCurrentCardId] = useState("card-a");

  return (
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <div className="sc-course-flashcard-block">
        <FlashcardFilmstrip
          cards={cards}
          currentCardId={currentCardId}
          addCard={<button className="sc-app-flashcard-add-card">Add card</button>}
          onReorder={(sourceId, targetId) => {
            reorderCalls.push({ sourceId, targetId });
            setCards((current) => reorderToTarget(current, sourceId, targetId));
            setCurrentCardId(sourceId);
          }}
          onSelect={setCurrentCardId}
        />
      </div>
    </CourseThemeProvider>
  );
}

function reorderToTarget<T extends { id: string }>(
  cards: readonly T[],
  sourceId: string,
  targetId: string,
): T[] {
  const sourceIndex = cards.findIndex((card) => card.id === sourceId);
  const targetIndex = cards.findIndex((card) => card.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...cards];
  const next = [...cards];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return next;
  next.splice(targetIndex, 0, source);
  return next;
}

function filmstripCard(root: ParentNode, cardId: string): HTMLElement {
  return requiredElement<HTMLElement>(root, `[data-flashcard-filmstrip-card="${cardId}"]`);
}

function filmstripOrder(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-flashcard-filmstrip-card]"))
    .filter((element) => !element.closest("[data-interaction-drag-overlay]"))
    .map((element) => element.dataset["flashcardFilmstripCard"] ?? "");
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
  await animationFrames(1);
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
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
  await animationFrames(2);
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitFor(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for filmstrip state.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
