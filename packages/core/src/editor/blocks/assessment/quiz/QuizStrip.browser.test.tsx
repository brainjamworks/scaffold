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

import { QuizStrip } from "./QuizStrip";
import "./Quiz.css";

interface MoveCall {
  readonly childKey: string;
  readonly direction: "up" | "down";
  readonly index: number;
}

interface ReorderCall {
  readonly sourceKey: string;
  readonly targetKey: string;
}

interface QuizStripBrowserHarness {
  readonly host: HTMLElement;
  readonly moveCalls: MoveCall[];
  readonly reorderCalls: ReorderCall[];
  readonly rendered: RenderResult;
  handle(childKey: string): HTMLButtonElement;
  order(): string[];
  overlay(): HTMLElement | null;
  placeholder(): HTMLElement | null;
  waitForIdle(): Promise<void>;
}

const mounted: QuizStripBrowserHarness[] = [];
let restoreReducedMotion: (() => void) | null = null;

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.host.remove();
  }
  restoreReducedMotion?.();
  restoreReducedMotion = null;
});

describe("QuizStrip shared horizontal sorting", () => {
  it("commits one non-adjacent pointer reorder and keeps central presentation and focus", async () => {
    await page.viewport(1000, 700);
    const harness = await mountQuizStrip();
    mounted.push(harness);
    const source = harness.handle("question-a");
    const target = harness.handle("question-c");
    const targetCenter = centerOf(target.getBoundingClientRect());
    const pointer = targetCenter;

    expect(source).toHaveAttribute("data-interaction-drag-activation-valid", "true");
    expect(source.getBoundingClientRect().width).toBeGreaterThanOrEqual(43.5);
    expect(source.getBoundingClientRect().height).toBeGreaterThanOrEqual(43.5);
    source.focus({ preventScroll: true });
    await startPointerDrag(source, pointer);

    expect(harness.placeholder()).toBe(pill(harness.host, "question-a"));
    const overlay = requiredElement<HTMLElement>(harness.host, "[data-interaction-drag-overlay]");
    expect(overlay).toHaveAttribute("inert");
    expect(overlay.querySelector("button, [data-quiz-strip-drag-handle]")).toBeNull();
    expect(overlay.querySelector('[data-quiz-strip-preview="question-a"]')).not.toBeNull();

    await finishPointerDrag(pointer);
    await waitFor(() => harness.reorderCalls.length === 1);
    await harness.waitForIdle();

    expect(harness.order()).toEqual(["question-b", "question-c", "question-a"]);
    expect(harness.reorderCalls).toEqual([{ sourceKey: "question-a", targetKey: "question-c" }]);
    expect(harness.moveCalls).toEqual([]);
    expect(document.activeElement).toBe(source);
  });

  it("reorders horizontally by keyboard, restores focus, and disables motion", async () => {
    await page.viewport(1000, 700);
    restoreReducedMotion = emulateReducedMotionPreference();
    const harness = await mountQuizStrip();
    mounted.push(harness);
    const source = harness.handle("question-b");

    source.focus({ preventScroll: true });
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await animationFrames(2);
    expect(harness.placeholder()).toBe(pill(harness.host, "question-b"));
    expect(harness.overlay()).not.toBeNull();
    expect(document.activeElement).toBe(source);
    expect(source.closest('[aria-hidden="true"]')).toBeNull();

    fireEvent.keyDown(source, { code: "ArrowLeft", key: "ArrowLeft" });
    await animationFrames(2);
    expect(harness.order()).toEqual(["question-b", "question-a", "question-c"]);

    fireEvent.keyDown(source, { code: "Space", key: " " });
    await waitFor(() => harness.order().join("|") === "question-b|question-a|question-c");
    await harness.waitForIdle();

    expect(harness.reorderCalls).toEqual([{ sourceKey: "question-b", targetKey: "question-a" }]);
    expect(harness.moveCalls).toEqual([]);
    expect(document.activeElement).toBe(source);
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
  });

  it("cancels without a reorder write and preserves navigation controls", async () => {
    await page.viewport(1000, 700);
    const harness = await mountQuizStrip();
    mounted.push(harness);
    const source = harness.handle("question-a");
    const target = pill(harness.host, "question-c");
    const before = harness.order();

    const secondQuestion = requiredElement<HTMLButtonElement>(
      harness.host,
      'button[aria-label="Question 2"]',
    );
    secondQuestion.click();
    await animationFrames(1);
    expect(secondQuestion).toHaveAttribute("aria-current", "true");
    expect(
      requiredElement<HTMLButtonElement>(harness.host, 'button[aria-label="Question 2 options"]'),
    ).not.toBeDisabled();

    source.focus({ preventScroll: true });
    await startPointerDrag(source, centerOf(target.getBoundingClientRect()));
    expect(harness.placeholder()).not.toBeNull();
    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();

    expect(harness.order()).toEqual(before);
    expect(harness.reorderCalls).toEqual([]);
    expect(harness.moveCalls).toEqual([]);
    await waitFor(() => document.activeElement === source);
    expect(document.activeElement).toBe(source);
  });
});

async function mountQuizStrip(): Promise<QuizStripBrowserHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 80px; top: 64px; width: 760px; height: 300px; padding: 24px; box-sizing: border-box";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.cssText =
    "position: relative; width: 680px; height: 220px; padding: 20px; box-sizing: border-box; overflow: hidden";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);
  const moveCalls: MoveCall[] = [];
  const reorderCalls: ReorderCall[] = [];

  const rendered = await renderBrowserReact(
    <TestInteractionDragEnvironment
      collisionBoundary={ownerRoot}
      coordinateKind="viewport"
      overlayHost={host}
      root={ownerRoot}
    >
      <QuizStripHarness moveCalls={moveCalls} reorderCalls={reorderCalls} />
    </TestInteractionDragEnvironment>,
    { baseElement: host, container: reactElement },
  );
  await animationFrames(2);

  return {
    host,
    moveCalls,
    reorderCalls,
    rendered,
    handle: (childKey) =>
      requiredElement<HTMLButtonElement>(pill(host, childKey), "[data-quiz-strip-drag-handle]"),
    order: () =>
      Array.from(host.querySelectorAll<HTMLElement>("[data-quiz-question-id]"))
        .filter((element) => !element.closest("[data-interaction-drag-overlay]"))
        .map((element) => element.dataset.quizQuestionId ?? ""),
    overlay: () => host.querySelector<HTMLElement>("[data-interaction-drag-overlay]"),
    placeholder: () => host.querySelector<HTMLElement>("[data-interaction-drag-placeholder]"),
    waitForIdle: () => waitFor(() => harnessIsIdle(host)),
  };
}

function QuizStripHarness({
  moveCalls,
  reorderCalls,
}: {
  moveCalls: MoveCall[];
  reorderCalls: ReorderCall[];
}) {
  const [childKeys, setChildKeys] = useState(["question-a", "question-b", "question-c"]);
  const [activeChildKey, setActiveChildKey] = useState<string | null>("question-a");
  const typeByKey: Record<string, string> = {
    "question-a": "mcq",
    "question-b": "mcq",
    "question-c": "mcq",
  };

  return (
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
      <div className="sc-course-quiz">
        <QuizStrip
          activeChildKey={activeChildKey}
          childKeys={childKeys}
          childTypes={childKeys.map((childKey) => typeByKey[childKey] ?? "mcq")}
          items={[]}
          onAdd={() => undefined}
          onMove={(childKey, index, direction) => {
            moveCalls.push({ childKey, direction, index });
            setChildKeys((current) => moveAdjacent(current, childKey, direction));
            setActiveChildKey(childKey);
          }}
          onReorder={(sourceKey, targetKey) => {
            reorderCalls.push({ sourceKey, targetKey });
            setChildKeys((current) => reorderToTarget(current, sourceKey, targetKey));
            setActiveChildKey(sourceKey);
          }}
          onSelect={setActiveChildKey}
        />
      </div>
    </CourseThemeProvider>
  );
}

function reorderToTarget(
  childKeys: readonly string[],
  sourceKey: string,
  targetKey: string,
): string[] {
  const sourceIndex = childKeys.indexOf(sourceKey);
  const targetIndex = childKeys.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return [...childKeys];
  const next = [...childKeys];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return next;
  next.splice(targetIndex, 0, source);
  return next;
}

function moveAdjacent(
  childKeys: readonly string[],
  childKey: string,
  direction: "up" | "down",
): string[] {
  const sourceIndex = childKeys.indexOf(childKey);
  const targetIndex = sourceIndex + (direction === "up" ? -1 : 1);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex >= childKeys.length) {
    return [...childKeys];
  }
  const next = [...childKeys];
  const [source] = next.splice(sourceIndex, 1);
  if (!source) return next;
  next.splice(targetIndex, 0, source);
  return next;
}

function pill(root: ParentNode, childKey: string): HTMLElement {
  return requiredElement<HTMLElement>(root, `[data-quiz-question-id="${childKey}"]`);
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

function harnessIsIdle(host: ParentNode): boolean {
  return (
    !host.querySelector("[data-interaction-drag-overlay]") &&
    !host.querySelector("[data-interaction-drag-placeholder]")
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitFor(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for QuizStrip state.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function emulateReducedMotionPreference(): () => void {
  const original = window.matchMedia.bind(window);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const native = original(query);
      if (query !== "(prefers-reduced-motion: reduce)") return native;
      return new Proxy(native, {
        get(target, property) {
          if (property === "matches") return true;
          if (property === "media") return query;
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  };
}
