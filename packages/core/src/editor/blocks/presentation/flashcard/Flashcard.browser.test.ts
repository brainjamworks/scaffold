import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/frame/view/bounded-placement.css";
import "./flashcard.css";

afterEach(() => {
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
