import { fireEvent } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { TestInteractionDragEnvironment } from "../testing/TestInteractionDragEnvironment";
import type { DragCancellationReason } from "../model/interaction-drag-event";
import "@/styles/globals.css";

import { InteractionDragSession, useInteractionDragSessionAdapter } from "./InteractionDragSession";
import { InteractionDragEnvironmentProvider } from "./interaction-drag-environment";
import { useInteractionDragSource } from "./use-interaction-drag-source";
import { useInteractionDropTarget } from "./use-interaction-drop-target";

type EnvironmentMode = "unscoped" | "pending" | "ready";

interface LifecycleHarness {
  readonly cancellations: DragCancellationReason[];
  readonly endings: string[];
  readonly mountHost: HTMLElement;
  readonly overlayHost: HTMLElement;
  readonly rendered: RenderResult;
  dispose(): Promise<void>;
  overlay(): HTMLElement | null;
  removeSource(): void;
  source(): HTMLButtonElement | null;
  waitForIdle(): Promise<void>;
}

const mounted: LifecycleHarness[] = [];
let restoreReducedMotion: (() => void) | null = null;

afterEach(async () => {
  while (mounted.length > 0) await mounted.pop()!.dispose();
  restoreReducedMotion?.();
  restoreReducedMotion = null;
});

describe("InteractionDragSession browser lifecycle", () => {
  it("gates unscoped and pending sources until a ready owner environment exists", async () => {
    await page.viewport(900, 700);
    for (const mode of ["unscoped", "pending"] as const) {
      const harness = await mountLifecycleHarness(mode);
      mounted.push(harness);
      const source = requiredSource(harness);
      expect(source).toHaveAttribute("aria-disabled", "true");

      await startPointerDrag(source);
      expect(harness.overlay()).toBeNull();
      expect(source).not.toHaveAttribute("data-interaction-drag-placeholder");
      expect(harness.cancellations).toEqual([]);
      await harness.dispose();
      mounted.pop();
    }

    const ready = await mountLifecycleHarness("ready");
    mounted.push(ready);
    const source = requiredSource(ready);
    expect(source).toHaveAttribute("aria-disabled", "false");
    await startPointerDrag(source);
    expect(ready.overlay()).not.toBeNull();
    expect(source).toHaveAttribute("data-interaction-drag-placeholder", "");
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await ready.waitForIdle();
  });

  it("cancels on Escape with cleanup, focus restoration, and a live announcement", async () => {
    await page.viewport(900, 700);
    const harness = await mountLifecycleHarness("ready");
    mounted.push(harness);
    const source = requiredSource(harness);
    source.focus({ preventScroll: true });

    await startPointerDrag(source);
    await waitFor(() => announcementText(harness.overlayHost).includes("Picked up Alpha"));
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await harness.waitForIdle();

    expect(harness.cancellations).toContain("escape");
    expect(document.activeElement).toBe(source);
    expect(source).not.toHaveAttribute("data-interaction-drag-placeholder");
    await waitFor(() => announcementText(harness.overlayHost).includes("Cancelled moving Alpha"));
  });

  it("cancels on owner-window blur and clears the active presentation", async () => {
    await page.viewport(900, 700);
    const harness = await mountLifecycleHarness("ready");
    mounted.push(harness);
    const source = requiredSource(harness);
    source.focus({ preventScroll: true });

    await startPointerDrag(source);
    window.dispatchEvent(new Event("blur"));
    await harness.waitForIdle();

    expect(harness.cancellations).toEqual(["owner-window-blur"]);
    expect(harness.source()).not.toHaveAttribute("data-interaction-drag-placeholder");
    expect(harness.overlay()).toBeNull();
  });

  it("cancels and clears presentation when the source or owner environment disappears", async () => {
    await page.viewport(900, 700);
    const sourceRemoval = await mountLifecycleHarness("ready");
    mounted.push(sourceRemoval);
    await startPointerDrag(requiredSource(sourceRemoval));
    sourceRemoval.removeSource();
    await animationFrames(3);
    expect(sourceRemoval.source()).toBeNull();
    expect(sourceRemoval.cancellations).toEqual(["source-removed"]);
    expect(sourceRemoval.mountHost.querySelector("[data-interaction-drag-placeholder]")).toBeNull();
    expect(sourceRemoval.overlay()).toBeNull();

    const environmentLoss = await mountLifecycleHarness("ready");
    mounted.push(environmentLoss);
    const liveSource = requiredSource(environmentLoss);
    await startPointerDrag(liveSource);
    environmentLoss.overlayHost.remove();
    await movePointer({ x: 340, y: 230 });
    await environmentLoss.waitForIdle();
    expect(environmentLoss.cancellations).toEqual(["environment-lost"]);
    expect(environmentLoss.source()).not.toHaveAttribute("data-interaction-drag-placeholder");
  });

  it("reports unmount cancellation and leaves no session presentation behind", async () => {
    await page.viewport(900, 700);
    const harness = await mountLifecycleHarness("ready");
    mounted.push(harness);
    await startPointerDrag(requiredSource(harness));
    expect(harness.overlay()).not.toBeNull();

    await harness.rendered.unmount();
    await animationFrames(1);

    expect(harness.cancellations).toEqual(["unmount"]);
    expect(harness.mountHost.querySelector("[data-interaction-drag-placeholder]")).toBeNull();
    expect(harness.overlay()).toBeNull();
  });

  it("removes preview and drop motion while completing a reduced-motion drag", async () => {
    await page.viewport(900, 700);
    restoreReducedMotion = emulateReducedMotionPreference();
    const harness = await mountLifecycleHarness("ready");
    mounted.push(harness);
    await waitFor(
      () =>
        requiredElement<HTMLElement>(harness.mountHost, "[data-reduced-motion]").dataset
          .reducedMotion === "true",
    );

    await startPointerDrag(requiredSource(harness));
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    const overlay = requiredElement<HTMLElement>(
      harness.overlayHost,
      "[data-interaction-drag-overlay]",
    );
    const previewBeforeMove = overlay.getBoundingClientRect();
    const overlayStyle = window.getComputedStyle(overlay);
    expect(durationsAreZero(overlayStyle.transitionDuration)).toBe(true);
    expect(durationsAreZero(overlayStyle.animationDuration)).toBe(true);
    expect(harness.overlayHost.getAnimations({ subtree: true })).toHaveLength(0);

    const destination = centerOf(
      requiredElement<HTMLElement>(
        harness.mountHost,
        "[data-lifecycle-target]",
      ).getBoundingClientRect(),
    );
    await movePointer(destination);
    const previewAfterMove = overlay.getBoundingClientRect();
    expect(Math.abs(previewAfterMove.left - previewBeforeMove.left)).toBeGreaterThan(1);
    expect(Math.abs(previewAfterMove.top - previewBeforeMove.top)).toBeGreaterThan(1);
    expect(harness.overlayHost.getAnimations({ subtree: true })).toHaveLength(0);

    finishPointerDrag(destination);
    await animationFrames(1);
    expect(harness.overlayHost.getAnimations({ subtree: true })).toHaveLength(0);
    await harness.waitForIdle();
    expect(harness.endings).toEqual(["lifecycle-source:lifecycle-target"]);
    expect(harness.cancellations).toEqual([]);
  });
});

async function mountLifecycleHarness(mode: EnvironmentMode): Promise<LifecycleHarness> {
  const mountHost = document.createElement("div");
  mountHost.style.cssText =
    "position: absolute; left: 80px; top: 64px; width: 620px; height: 420px";
  const root = document.createElement("div");
  root.style.cssText =
    "position: relative; width: 520px; height: 320px; border: 1px solid transparent";
  const reactElement = document.createElement("div");
  root.append(reactElement);
  mountHost.append(root);
  const overlayHost = document.createElement("div");
  overlayHost.style.cssText =
    "position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none";
  document.body.append(mountHost, overlayHost);
  const cancellations: DragCancellationReason[] = [];
  const endings: string[] = [];
  let removeSource: () => void = () => {
    throw new Error("Lifecycle source-removal control is not ready.");
  };
  let disposed = false;

  const rendered = await renderBrowserReact(
    <Environment mode={mode} overlayHost={overlayHost} root={root}>
      <LifecycleFixture
        cancellations={cancellations}
        endings={endings}
        registerRemoveSource={(remove) => {
          removeSource = remove;
        }}
      />
    </Environment>,
    { baseElement: document.body, container: reactElement },
  );
  await animationFrames(2);

  const harness: LifecycleHarness = {
    cancellations,
    endings,
    mountHost,
    overlayHost,
    rendered,
    dispose: async () => {
      if (disposed) return;
      disposed = true;
      await rendered.unmount();
      mountHost.remove();
      overlayHost.remove();
    },
    overlay: () => overlayHost.querySelector<HTMLElement>("[data-interaction-drag-overlay]"),
    removeSource: () => flushSync(() => removeSource()),
    source: () => mountHost.querySelector<HTMLButtonElement>("[data-lifecycle-source]"),
    waitForIdle: () =>
      waitFor(
        () =>
          mountHost.querySelector("[data-interaction-drag-placeholder]") === null &&
          overlayHost.querySelector("[data-interaction-drag-overlay]") === null,
      ),
  };
  return harness;
}

function Environment({
  children,
  mode,
  overlayHost,
  root,
}: {
  children: ReactNode;
  mode: EnvironmentMode;
  overlayHost: HTMLElement;
  root: HTMLElement;
}) {
  if (mode === "unscoped") return children;
  if (mode === "pending") {
    return (
      <InteractionDragEnvironmentProvider coordinateRoot={null} coordinateSpace={null}>
        {children}
      </InteractionDragEnvironmentProvider>
    );
  }
  return (
    <TestInteractionDragEnvironment
      collisionBoundary={root}
      coordinateKind="viewport"
      overlayHost={overlayHost}
      root={root}
    >
      {children}
    </TestInteractionDragEnvironment>
  );
}

function LifecycleFixture({
  cancellations,
  endings,
  registerRemoveSource,
}: {
  cancellations: DragCancellationReason[];
  endings: string[];
  registerRemoveSource: (remove: () => void) => void;
}) {
  const [showSource, setShowSource] = useState(true);
  registerRemoveSource(() => setShowSource(false));
  return (
    <InteractionDragSession<{ title: string }, { title: string }>
      accessibilityMode="draggable"
      collisionPolicy="pointer"
      labels={{ draggable: "Card", instructions: "Move the card" }}
      onCancel={(reason) => cancellations.push(reason)}
      onEnd={(event) => endings.push(`${event.active.id}:${event.over?.id ?? "none"}`)}
      profile="pointer"
      renderPreview={(active) => <span data-lifecycle-preview="">{active.title}</span>}
      sessionId="browser-lifecycle"
    >
      <MotionProbe />
      {showSource ? <Source /> : null}
      <Target />
    </InteractionDragSession>
  );
}

function MotionProbe() {
  const session = useInteractionDragSessionAdapter();
  return <output data-reduced-motion={String(session.reducedMotion)} />;
}

function Source() {
  const drag = useInteractionDragSource({
    data: { title: "Alpha" },
    id: "lifecycle-source",
    label: "Alpha",
  });
  return (
    <button
      {...drag.activatorProps}
      {...drag.sourceProps}
      ref={(element) => {
        drag.setNodeRef(element);
        drag.setActivatorNodeRef(element);
      }}
      data-lifecycle-source=""
      style={{ position: "absolute", left: 40, top: 40, width: 100, height: 56 }}
      type="button"
    >
      Alpha
    </button>
  );
}

function Target() {
  const drop = useInteractionDropTarget({
    data: { title: "Destination" },
    id: "lifecycle-target",
  });
  return (
    <div
      {...drop.targetProps}
      ref={drop.setNodeRef}
      data-lifecycle-target=""
      style={{ position: "absolute", left: 280, top: 150, width: 140, height: 84 }}
    >
      Destination
    </div>
  );
}

async function startPointerDrag(source: HTMLElement) {
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
  await movePointer({ x: start.x + 8, y: start.y + 8 });
  await animationFrames(2);
}

async function movePointer(point: Readonly<{ x: number; y: number }>) {
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
}

function finishPointerDrag(point: Readonly<{ x: number; y: number }>) {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
}

function durationsAreZero(value: string): boolean {
  return value.split(",").every((duration) => Number.parseFloat(duration) === 0);
}

function announcementText(host: HTMLElement): string {
  return Array.from(host.querySelectorAll<HTMLElement>('[role="status"]'))
    .map((element) => element.textContent?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function requiredSource(harness: LifecycleHarness): HTMLButtonElement {
  const source = harness.source();
  if (!source) throw new Error("Expected lifecycle drag source.");
  return source;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

async function animationFrames(count: number) {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for drag lifecycle state.");
    await animationFrames(1);
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
