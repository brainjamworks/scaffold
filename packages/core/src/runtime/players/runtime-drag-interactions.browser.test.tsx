import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import {
  mountRuntimeDragHarness,
  type RuntimeDragBrowserHarness,
} from "./tests/runtime-drag-browser-harness";

const mounted: RuntimeDragBrowserHarness[] = [];
let restoreReducedMotion: (() => void) | null = null;
let restoreFullscreen: (() => void) | null = null;

const invalidDropMatrix = [
  { label: "Page", surface: "page" as const, scale: 1 },
  { label: "Slideshow 0.5", surface: "slideshow" as const, scale: 0.5 },
  { label: "Slideshow 0.83", surface: "slideshow" as const, scale: 0.83 },
  { label: "Slideshow 1", surface: "slideshow" as const, scale: 1 },
  { label: "Slideshow 2", surface: "slideshow" as const, scale: 2 },
] as const;

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.dispose();
  restoreReducedMotion?.();
  restoreReducedMotion = null;
  restoreFullscreen?.();
  restoreFullscreen = null;
});

describe("Runtime document accessibility", () => {
  it.each([
    { label: "Page", surface: "page" as const },
    { label: "Slideshow", surface: "slideshow" as const },
  ])(
    "exposes named read-only content and native assessment controls on $label",
    async ({ surface }) => {
      await page.viewport(1024, 768);
      const harness = await mountRuntimeDragHarness({ interaction: "matching", surface });
      mounted.push(harness);

      const runtimeDocument = harness.player.querySelector<HTMLElement>(".ProseMirror");
      expect(runtimeDocument).not.toBeNull();
      expect(page.getByRole("document", { name: "Course content" }).elements()).toContain(
        runtimeDocument,
      );
      expect(runtimeDocument).toHaveAttribute("contenteditable", "false");
      expect(
        page
          .getByRole("textbox")
          .elements()
          .filter((element) => harness.player.contains(element)),
      ).toHaveLength(0);

      const source = matchingSource(harness, "matchitem001");
      expect(page.getByRole("button").elements()).toContain(source);
      source.focus();
      expect(harness.ownerDocument.activeElement).toBe(source);
      source.click();
      await animationFrames(harness, 1);
      matchingTarget(harness, "matchtarg001").click();
      await harness.waitForMatches({ matchitem001: "matchtarg001" }, 1);
    },
  );
});

describe("Sequencing shared drag runtime", () => {
  it.each([
    { label: "Page", surface: "page" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 0.5", surface: "slideshow" as const, scale: 0.5, targetClientSize: 22 },
    { label: "Slideshow 0.8", surface: "slideshow" as const, scale: 0.8, targetClientSize: 35.2 },
    {
      label: "Slideshow 0.83",
      surface: "slideshow" as const,
      scale: 0.83,
      targetClientSize: 36.52,
    },
    { label: "Slideshow 1", surface: "slideshow" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 2", surface: "slideshow" as const, scale: 2, targetClientSize: 88 },
  ])(
    "reorders exactly with hit-tested, scale-safe geometry on $label",
    async ({ surface, scale, targetClientSize }) => {
      await page.viewport(Math.max(1024, Math.ceil(scale * 1024 + 100)), 900);
      const harness = await mountRuntimeDragHarness({ surface, scale });
      mounted.push(harness);

      expect(harness.getEnvironment().status).toBe("ready");
      const clientScale = surface === "slideshow" ? harness.getCanvasRect().width / 1024 : 1;
      expect(clientScale).toBeCloseTo(scale, 2);

      const targets = harness.getTargets();
      const activators = harness.getActivationAreas();
      const handles = harness.getTargets("[data-runtime-sequencing-handle]");
      const before = harness.getResponseOrder();
      expect(targets.map((target) => target.dataset.id)).toEqual(before);
      expect(harness.getResponseRevision()).toBe(0);
      assertActivationGeometry(harness, activators, handles, targetClientSize);

      const sourceRect = targets[0]!.getBoundingClientRect();
      const drag = await startPointerDrag(
        harness,
        activators[0]!,
        centerOf(targets[2]!.getBoundingClientRect()),
        scale === 0.5 ? "touch" : "mouse",
      );

      const placeholder = harness.getPlaceholder();
      expect(placeholder).toBe(targets[0]);
      expect(harness.ownerWindow.getComputedStyle(placeholder!).visibility).toBe("visible");
      expect(harness.ownerWindow.getComputedStyle(placeholder!).pointerEvents).toBe("none");
      expect(
        harness.ownerWindow.getComputedStyle(
          placeholder!.querySelector<HTMLElement>(".sc-course-sequencing__item-content")!,
        ).visibility,
      ).toBe("hidden");
      const placeholderHandle = placeholder!.querySelector<HTMLElement>(
        "[data-runtime-sequencing-handle]",
      );
      expect(placeholderHandle).not.toBeNull();
      expect(harness.ownerWindow.getComputedStyle(placeholderHandle!).visibility).toBe("visible");

      const overlay = requiredOverlay(harness);
      expect(overlay.hasAttribute("inert")).toBe(true);
      expect(overlay.getAttribute("aria-hidden")).not.toBeNull();
      expect(overlay.querySelector("button, [data-runtime-sequencing-handle]")).toBeNull();
      const overlayRect = overlay.getBoundingClientRect();
      expectClose(overlayRect.width, sourceRect.width, 1);
      expectClose(overlayRect.height, sourceRect.height, 1);
      expectClose(overlayRect.left, sourceRect.left, 2);
      const expectedOverlayTop = drag.pointer.y - (drag.start.y - sourceRect.top);
      expectClose(overlayRect.top, expectedOverlayTop, 3);

      const expected = [...before.slice(1), before[0]!];
      await finishPointerDrag(harness, drag.pointer, drag.pointerType);
      await harness.waitForResponse(expected, 1);
      await harness.waitForIdle();
      expect(harness.getResponseOrder()).toEqual(expected);
      expect(harness.getResponseRevision()).toBe(1);
      expect(harness.getPlaceholder()).toBeNull();
    },
  );

  it("reorders by keyboard, announces the move, restores focus, and disables motion", async () => {
    await page.viewport(1024, 768);
    restoreReducedMotion = emulateReducedMotionPreference();
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);

    const before = harness.getResponseOrder();
    const source = harness.getActivationAreas()[0]!;
    source.focus();
    fireEvent.keyDown(source, { code: "Space", key: " " });
    await animationFrames(harness, 2);
    expect(harness.getPlaceholder()).not.toBeNull();
    expect(requiredOverlay(harness)).not.toBeNull();
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Drag sequencing item 1 moved to position 1.",
    );

    fireEvent.keyDown(source, { code: "ArrowDown", key: "ArrowDown" });
    await animationFrames(harness, 2);
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Drag sequencing item 1 moved to position 2.",
    );
    expect(harness.getTargets().every((target) => target.style.transition === "")).toBe(true);

    fireEvent.keyDown(source, { code: "Space", key: " " });
    const expected = [before[1]!, before[0]!, before[2]!];
    await harness.waitForResponse(expected, 1);
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(expected);
    expect(harness.getResponseRevision()).toBe(1);
    expect(harness.getAnnouncements().join(" ")).toContain("Dropped Drag sequencing item 1");
    expect(harness.ownerDocument.activeElement).toHaveAttribute("data-runtime-sequencing-handle");
  });

  it("cancels an active drag without a response write and restores focus", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);
    const source = harness.getActivationAreas()[0]!;
    const before = harness.getResponseOrder();
    source.focus();
    await startPointerDrag(
      harness,
      source,
      centerOf(harness.getTargets()[2]!.getBoundingClientRect()),
      "mouse",
    );
    expect(harness.getPlaceholder()).not.toBeNull();
    expect(requiredOverlay(harness)).not.toBeNull();

    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(before);
    expect(harness.getResponseRevision()).toBe(0);
    expect(harness.ownerDocument.activeElement).toBe(source);
    expect(harness.getAnnouncements().join(" ")).toContain(
      "Cancelled moving Drag sequencing item 1.",
    );
  });

  it.each(invalidDropMatrix)(
    "does not write when a completed drag reaches no target on $label",
    async ({ surface, scale }) => {
      await page.viewport(
        Math.max(1024, Math.ceil(scale * 1024 + 100)),
        Math.max(768, Math.ceil(scale * 576 + 100)),
      );
      const harness = await mountRuntimeDragHarness({ surface, scale });
      mounted.push(harness);
      const source = harness.getActivationAreas()[0]!;
      const sourceRect = source.getBoundingClientRect();
      const before = harness.getResponseOrder();
      const drag = await startPointerDrag(
        harness,
        source,
        { x: sourceRect.left + 2, y: sourceRect.top - 16 },
        scale === 0.5 ? "touch" : "mouse",
      );
      expect(harness.getPlaceholder()).not.toBeNull();

      await finishPointerDrag(harness, drag.pointer, drag.pointerType);
      await harness.waitForIdle();
      expect(harness.getResponseOrder()).toEqual(before);
      expect(harness.getResponseRevision()).toBe(0);
    },
  );

  it("fails closed for an unsupported Slideshow transform", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "slideshow", scale: 0.5 });
    mounted.push(harness);

    harness.setCanvasTransform("rotate(5deg)");
    await harness.waitForEnvironment("pending");
    expect(harness.getEnvironment().reason).toBe("invalid");
  });

  it("keeps a long Page drag overlay in viewport coordinates while the page scrolls", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ surface: "page" });
    mounted.push(harness);
    harness.host.style.height = "300px";
    harness.host.style.overflow = "auto";
    harness.player.style.minHeight = "900px";
    await animationFrames(harness, 2);
    expect(harness.host.scrollHeight).toBeGreaterThan(harness.host.clientHeight);

    const before = harness.getResponseOrder();
    const targets = harness.getTargets();
    const source = harness.getActivationAreas()[0]!;
    const targetRects = targets.map((target) => target.getBoundingClientRect());
    const drag = await startPointerDrag(harness, source, centerOf(targetRects[1]!), "mouse");
    const overlayBeforeScroll = requiredOverlay(harness).getBoundingClientRect();
    const overlayHost = harness.getOverlayHost();
    expect(overlayHost).not.toBeNull();
    expect(overlayHost).toHaveClass("sc-course", "sc-course-theme-scaffold-flow-v1");
    expect(overlayHost?.ownerDocument).toBe(harness.ownerDocument);
    expect(
      harness.ownerWindow.getComputedStyle(overlayHost!).getPropertyValue("--color-background"),
    ).not.toBe("");
    expect(requiredOverlay(harness).ownerDocument).toBe(harness.ownerDocument);
    expect(harness.getEnvironment().positionStrategy).toBe("fixed");
    expect(harness.getCanvas()).toBeNull();

    const initialExpected = [before[1]!, before[0]!, before[2]!];
    const rowPitch = targetRects[2]!.top - targetRects[1]!.top;
    expect(rowPitch).toBeGreaterThan(0);

    harness.host.scrollTop = rowPitch;
    harness.host.dispatchEvent(new Event("scroll"));
    await animationFrames(harness, 3);
    expect(harness.host.scrollTop).toBeGreaterThanOrEqual(rowPitch - 1);
    const overlayAfterScroll = requiredOverlay(harness).getBoundingClientRect();
    expectClose(overlayAfterScroll.left, overlayBeforeScroll.left, 1);
    expectClose(overlayAfterScroll.top, overlayBeforeScroll.top, 1);

    expect(requiredOverlay(harness).ownerDocument).toBe(harness.ownerDocument);

    await finishPointerDrag(harness, drag.pointer, "mouse");
    await harness.waitForResponse(initialExpected, 1);
    await harness.waitForIdle();
    expect(harness.getResponseOrder()).toEqual(initialExpected);
    expect(harness.getResponseRevision()).toBe(1);
  });
});

describe("Matching connector coordinate gate", () => {
  it("round-trips the real no-viewBox SVG through its Slideshow screen CTM", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({
      interaction: "matching",
      surface: "slideshow",
      scale: 0.5,
    });
    mounted.push(harness);

    harness.getSource('[data-item-id="matchitem001"]')?.click();
    await animationFrames(harness, 1);
    harness.getSource('[data-matching-drop-target][data-target-id="matchtarg001"]')?.click();
    await harness.waitForMatches({ matchitem001: "matchtarg001" }, 1);
    await animationFrames(harness, 2);

    const connectorSvg = harness.player.querySelector<SVGSVGElement>(
      "svg[data-matching-connectors]",
    );
    expect(connectorSvg).not.toBeNull();
    expect(connectorSvg?.getAttribute("viewBox")).toBeNull();
    const matrix = connectorSvg?.getScreenCTM();
    expect(matrix).not.toBeNull();
    expect(matrix?.b).toBeCloseTo(0, 6);
    expect(matrix?.c).toBeCloseTo(0, 6);
    expect(matrix?.a).toBeCloseTo(harness.getCanvasRect().width / 1024, 2);
    expect(matrix?.d).toBeCloseTo(harness.getCanvasRect().height / 576, 2);

    const local = connectorSvg!.createSVGPoint();
    local.x = 0;
    local.y = 0;
    const client = local.matrixTransform(matrix!);
    const rect = connectorSvg!.getBoundingClientRect();
    expectClose(client.x, rect.left, 0.5);
    expectClose(client.y, rect.top, 0.5);
  });
});

describe("Matching shared drag runtime", () => {
  it.each([
    { label: "Page", surface: "page" as const, scale: 1 },
    { label: "Slideshow 0.5", surface: "slideshow" as const, scale: 0.5 },
    { label: "Slideshow 0.83", surface: "slideshow" as const, scale: 0.83 },
    { label: "Slideshow 1", surface: "slideshow" as const, scale: 1 },
    { label: "Slideshow 2", surface: "slideshow" as const, scale: 2 },
  ])("pairs once with aligned connector geometry on $label", async ({ surface, scale }) => {
    await page.viewport(Math.max(1024, Math.ceil(scale * 1024 + 100)), 900);
    const harness = await mountRuntimeDragHarness({ interaction: "matching", surface, scale });
    mounted.push(harness);
    const source = matchingSource(harness, "matchitem001");
    const target = matchingTarget(harness, "matchtarg001");
    assertMatchingActivationGeometry(harness, scale === 0.5 ? 27.5 : 44);
    expect(harness.getResponseMatches()).toEqual({});
    expect(harness.getResponseRevision()).toBe(0);

    source.focus();
    const sourceRect = source.getBoundingClientRect();
    const drag = await startPointerDrag(
      harness,
      source,
      centerOf(target.getBoundingClientRect()),
      scale === 0.5 ? "touch" : "mouse",
      centerOf(source.getBoundingClientRect()),
    );
    const placeholder = harness.getPlaceholder();
    expect(placeholder).toBe(source);
    expect(harness.ownerWindow.getComputedStyle(placeholder!).pointerEvents).toBe("none");
    expect(
      harness.ownerWindow.getComputedStyle(
        placeholder!.querySelector<HTMLElement>("[data-runtime-matching-handle]")!,
      ).visibility,
    ).toBe("hidden");
    const overlay = requiredOverlay(harness);
    expect(overlay.hasAttribute("inert")).toBe(true);
    expect(overlay.querySelector("button, [data-runtime-matching-handle]")).toBeNull();
    expectClose(overlay.getBoundingClientRect().width, sourceRect.width, 1);
    expectClose(overlay.getBoundingClientRect().height, sourceRect.height, 1);

    await finishPointerDrag(harness, drag.pointer, drag.pointerType);
    await harness.waitForMatches({ matchitem001: "matchtarg001" }, 1);
    await harness.waitForIdle();
    await animationFrames(harness, 2);
    expect(harness.getResponseMatches()).toEqual({ matchitem001: "matchtarg001" });
    expect(harness.getResponseRevision()).toBe(1);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");
    expect(harness.getAnnouncements()).toEqual([]);
  });

  it("cancels a Page pointer drop without a response write", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ interaction: "matching", surface: "page" });
    mounted.push(harness);
    const source = matchingSource(harness, "matchitem001");
    source.focus();
    await startPointerDrag(
      harness,
      source,
      centerOf(matchingTarget(harness, "matchtarg001").getBoundingClientRect()),
      "mouse",
      centerOf(source.getBoundingClientRect()),
    );
    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
    expect(harness.getResponseMatches()).toEqual({});
    expect(harness.getResponseRevision()).toBe(0);
    expect(harness.ownerDocument.activeElement).toBe(source);
  });

  it.each(invalidDropMatrix)(
    "rejects an invalid pointer drop without a response write on $label",
    async ({ surface, scale }) => {
      await page.viewport(
        Math.max(1024, Math.ceil(scale * 1024 + 100)),
        Math.max(768, Math.ceil(scale * 576 + 100)),
      );
      const harness = await mountRuntimeDragHarness({ interaction: "matching", surface, scale });
      mounted.push(harness);
      const source = matchingSource(harness, "matchitem001");
      const invalid = await startPointerDrag(
        harness,
        source,
        { x: source.getBoundingClientRect().left, y: source.getBoundingClientRect().top - 20 },
        scale === 0.5 ? "touch" : "mouse",
        centerOf(source.getBoundingClientRect()),
      );

      await finishPointerDrag(harness, invalid.pointer, invalid.pointerType);
      await harness.waitForIdle();
      expect(harness.getResponseMatches()).toEqual({});
      expect(harness.getResponseRevision()).toBe(0);
    },
  );

  it("uses Enter then Space selection without draggable announcements", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({ interaction: "matching", surface: "page" });
    mounted.push(harness);
    const source = matchingSource(harness, "matchitem001");
    const target = matchingTarget(harness, "matchtarg002");
    expect(source).not.toHaveAttribute("aria-roledescription");
    expect(source).not.toHaveAttribute("aria-description");

    fireEvent.keyDown(source, { code: "Enter", key: "Enter" });
    await animationFrames(harness, 1);
    fireEvent.keyDown(target, { code: "Space", key: " " });
    await harness.waitForMatches({ matchitem001: "matchtarg002" }, 1);
    expect(harness.getResponseRevision()).toBe(1);
    expect(harness.getAnnouncements()).toEqual([]);
  });

  it("refreshes connectors through resize, scroll, fullscreen, unpairing, and endpoint loss", async () => {
    await page.viewport(1200, 900);
    restoreFullscreen = installFullscreenHarness(document, window);
    const harness = await mountRuntimeDragHarness({
      interaction: "matching",
      surface: "slideshow",
      scale: 0.83,
    });
    mounted.push(harness);
    matchingSource(harness, "matchitem001").click();
    await animationFrames(harness, 1);
    matchingTarget(harness, "matchtarg001").click();
    await harness.waitForMatches({ matchitem001: "matchtarg001" }, 1);
    await animationFrames(harness, 2);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");

    harness.setPlayerSize(720, 500);
    await animationFrames(harness, 4);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");

    const scrollLane = harness.player.querySelector<HTMLElement>(".sc-course-matching__scroll")!;
    scrollLane.style.height = "180px";
    scrollLane.style.overflow = "auto";
    await animationFrames(harness, 2);
    expect(scrollLane.scrollHeight).toBeGreaterThan(scrollLane.clientHeight);
    const sourceBeforeScroll = matchingSource(harness, "matchitem001").getBoundingClientRect();
    const targetBeforeScroll = matchingTarget(harness, "matchtarg001").getBoundingClientRect();
    scrollLane.scrollTop = Math.min(40, scrollLane.scrollHeight - scrollLane.clientHeight);
    expect(scrollLane.scrollTop).toBeGreaterThan(0);
    scrollLane.dispatchEvent(new Event("scroll"));
    await animationFrames(harness, 2);
    const sourceAfterScroll = matchingSource(harness, "matchitem001").getBoundingClientRect();
    const targetAfterScroll = matchingTarget(harness, "matchtarg001").getBoundingClientRect();
    expect(Math.abs(sourceAfterScroll.top - sourceBeforeScroll.top)).toBeGreaterThan(1);
    expect(Math.abs(targetAfterScroll.top - targetBeforeScroll.top)).toBeGreaterThan(1);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");

    const canvasBeforeFullscreen = harness.getCanvasRect();
    const enterFullscreen = harness.getFullscreenControl();
    expect(enterFullscreen).toHaveAttribute("aria-label", "Enter fullscreen");
    enterFullscreen!.click();
    await animationFrames(harness, 4);
    expect(harness.ownerDocument.fullscreenElement).not.toBeNull();
    const canvasInFullscreen = harness.getCanvasRect();
    expect(Math.abs(canvasInFullscreen.width - canvasBeforeFullscreen.width)).toBeGreaterThan(1);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");

    const exitFullscreen = harness.getFullscreenControl();
    expect(exitFullscreen).toHaveAttribute("aria-label", "Exit fullscreen");
    exitFullscreen!.click();
    await animationFrames(harness, 4);
    expect(harness.ownerDocument.fullscreenElement).toBeNull();
    const canvasAfterFullscreen = harness.getCanvasRect();
    expect(Math.abs(canvasAfterFullscreen.width - canvasInFullscreen.width)).toBeGreaterThan(1);
    assertMatchingConnectorAligned(harness, "matchitem001", "matchtarg001");

    const remove = matchingTarget(harness, "matchtarg001").querySelector<HTMLButtonElement>(
      'button[aria-label^="Remove match"]',
    );
    expect(remove).not.toBeNull();
    remove!.click();
    await harness.waitForMatches({}, 2);
    await animationFrames(harness, 2);
    expect(harness.player.querySelector("[data-matching-connector-item-id]")).toBeNull();

    matchingSource(harness, "matchitem002").click();
    await animationFrames(harness, 1);
    matchingTarget(harness, "matchtarg002").click();
    await harness.waitForMatches({ matchitem002: "matchtarg002" }, 3);
    await animationFrames(harness, 2);
    assertMatchingConnectorAligned(harness, "matchitem002", "matchtarg002");
    matchingTarget(harness, "matchtarg002").remove();
    await animationFrames(harness, 2);
    expect(harness.player.querySelector("[data-matching-connector-item-id]")).toBeNull();
  });
});

describe("Categorise shared drag runtime", () => {
  it.each([
    { label: "Page", surface: "page" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 0.5", surface: "slideshow" as const, scale: 0.5, targetClientSize: 27.5 },
    { label: "Slideshow 0.83", surface: "slideshow" as const, scale: 0.83, targetClientSize: 44 },
    { label: "Slideshow 1", surface: "slideshow" as const, scale: 1, targetClientSize: 44 },
    { label: "Slideshow 2", surface: "slideshow" as const, scale: 2, targetClientSize: 44 },
  ])(
    "assigns exactly with non-overlapping hit-tested geometry on $label",
    async ({ surface, scale, targetClientSize }) => {
      await page.viewport(
        Math.max(1024, Math.ceil(scale * 1024 + 100)),
        Math.max(900, Math.ceil(scale * 576 + 100)),
      );
      const harness = await mountRuntimeDragHarness({
        interaction: "categorise",
        surface,
        scale,
      });
      mounted.push(harness);
      const source = harness.getActivationAreas()[0]!;
      const itemId = source.dataset.id;
      expect(itemId).toBeTruthy();
      const target = categoriseCategory(harness, "catbirds0001");
      assertCategoriseActivationGeometry(harness, targetClientSize);
      expect(harness.getResponsePlacements()).toEqual({});

      const sourceRect = source.getBoundingClientRect();
      const drag = await startPointerDrag(
        harness,
        source,
        centerOf(target.getBoundingClientRect()),
        scale === 0.5 ? "touch" : "mouse",
        centerOf(sourceRect),
      );
      const placeholder = harness.getPlaceholder();
      expect(placeholder).toBe(source);
      expect(harness.ownerWindow.getComputedStyle(placeholder!).pointerEvents).toBe("none");
      const overlay = requiredOverlay(harness);
      expect(overlay.hasAttribute("inert")).toBe(true);
      expect(overlay.querySelector("button, [data-interaction-drag-activation-area]")).toBeNull();
      expectClose(overlay.getBoundingClientRect().width, sourceRect.width, 1);
      expectClose(overlay.getBoundingClientRect().height, sourceRect.height, 1);

      await finishPointerDrag(harness, drag.pointer, drag.pointerType);
      await harness.waitForPlacements({ [itemId!]: "catbirds0001" }, 1);
      await harness.waitForIdle();
      expect(harness.getResponsePlacements()).toEqual({ [itemId!]: "catbirds0001" });
      expect(harness.getResponseRevision()).toBe(1);
      expect(target.querySelector(`[data-placed-item-id="${itemId}"]`)).not.toBeNull();
      expect(harness.getAnnouncements()).toEqual([]);
    },
  );

  it("cancels a Page pointer assignment without a response write", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({
      interaction: "categorise",
      surface: "page",
    });
    mounted.push(harness);
    const source = harness.getActivationAreas()[0]!;
    source.focus();
    await startPointerDrag(
      harness,
      source,
      centerOf(categoriseCategory(harness, "catbirds0001").getBoundingClientRect()),
      "mouse",
      centerOf(source.getBoundingClientRect()),
    );
    await userEvent.keyboard("{Escape}");
    await harness.waitForIdle();
    expect(harness.getResponsePlacements()).toEqual({});
    expect(harness.getResponseRevision()).toBe(0);
    expect(harness.ownerDocument.activeElement).toBe(source);
  });

  it.each(invalidDropMatrix)(
    "rejects an invalid pointer assignment without a response write on $label",
    async ({ surface, scale }) => {
      await page.viewport(
        Math.max(1024, Math.ceil(scale * 1024 + 100)),
        Math.max(768, Math.ceil(scale * 576 + 100)),
      );
      const harness = await mountRuntimeDragHarness({
        interaction: "categorise",
        surface,
        scale,
      });
      mounted.push(harness);
      const source = harness.getActivationAreas()[0]!;
      const invalid = await startPointerDrag(
        harness,
        source,
        { x: source.getBoundingClientRect().left, y: source.getBoundingClientRect().top - 20 },
        scale === 0.5 ? "touch" : "mouse",
        centerOf(source.getBoundingClientRect()),
      );

      await finishPointerDrag(harness, invalid.pointer, invalid.pointerType);
      await harness.waitForIdle();
      expect(harness.getResponsePlacements()).toEqual({});
      expect(harness.getResponseRevision()).toBe(0);
    },
  );

  it("uses Enter then Space selection without draggable announcements", async () => {
    await page.viewport(1024, 768);
    const harness = await mountRuntimeDragHarness({
      interaction: "categorise",
      surface: "page",
    });
    mounted.push(harness);
    const source = harness.getActivationAreas()[0]!;
    const itemId = source.dataset.id!;
    const target = categoriseCategory(harness, "catfish00001");
    expect(source).not.toHaveAttribute("aria-roledescription");
    expect(source).not.toHaveAttribute("aria-description");

    fireEvent.keyDown(source, { code: "Enter", key: "Enter" });
    await animationFrames(harness, 1);
    fireEvent.keyDown(target, { code: "Space", key: " " });
    await harness.waitForPlacements({ [itemId]: "catfish00001" }, 1);
    expect(harness.getResponseRevision()).toBe(1);
    expect(harness.getAnnouncements()).toEqual([]);
  });
});

function categoriseCategory(harness: RuntimeDragBrowserHarness, categoryId: string): HTMLElement {
  const category = harness.player.querySelector<HTMLElement>(
    `.sc-course-categorise__runtime-bin[data-id="${categoryId}"]`,
  );
  if (!category) throw new Error(`Expected Categorise category ${categoryId}.`);
  return category;
}

function assertCategoriseActivationGeometry(
  harness: RuntimeDragBrowserHarness,
  targetClientSize: number,
) {
  const activators = harness.getActivationAreas();
  expect(activators).toHaveLength(2);
  const sourceRects = activators.map((activator, index) => {
    expect(activator.tagName).toBe("BUTTON");
    const rect = activator.getBoundingClientRect();
    expect(rect.height).toBeGreaterThanOrEqual(targetClientSize - 0.75);
    if (index === 0) {
      const hit = harness.ownerDocument.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      expect(hit).not.toBeNull();
      expect(activator.contains(hit)).toBe(true);
    }
    return rect;
  });
  expect(rectanglesOverlap(sourceRects[0]!, sourceRects[1]!)).toBe(false);
  const categoryRects = ["catbirds0001", "catfish00001"].map((id) =>
    categoriseCategory(harness, id).getBoundingClientRect(),
  );
  expect(rectanglesOverlap(categoryRects[0]!, categoryRects[1]!)).toBe(false);
}

function rectanglesOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function matchingSource(harness: RuntimeDragBrowserHarness, itemId: string): HTMLElement {
  const source = harness.player.querySelector<HTMLElement>(
    `[data-matching-draggable-item][data-item-id="${itemId}"]`,
  );
  if (!source) throw new Error(`Expected Matching source ${itemId}.`);
  return source;
}

function matchingTarget(harness: RuntimeDragBrowserHarness, targetId: string): HTMLElement {
  const target = harness.player.querySelector<HTMLElement>(
    `[data-matching-drop-target][data-target-id="${targetId}"]`,
  );
  if (!target) throw new Error(`Expected Matching target ${targetId}.`);
  return target;
}

function assertMatchingActivationGeometry(
  harness: RuntimeDragBrowserHarness,
  expectedClientSize: number,
) {
  const activators = harness.getActivationAreas();
  expect(activators).toHaveLength(2);
  const rects = activators.map((activator, index) => {
    expect(activator.tagName).toBe("BUTTON");
    const rect = activator.getBoundingClientRect();
    expect(rect.width).toBeGreaterThanOrEqual(expectedClientSize - 0.75);
    expect(rect.height).toBeGreaterThanOrEqual(expectedClientSize - 0.75);
    if (expectedClientSize === 27.5) {
      expect(activator.style.getPropertyValue("--sc-interaction-drag-target-min-height")).toBe(
        "55px",
      );
      expect(rect.width).toBeGreaterThanOrEqual(24);
      expect(rect.height).toBeGreaterThanOrEqual(24);
    }
    if (index === 0) {
      const hit = harness.ownerDocument.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      expect(hit).not.toBeNull();
      expect(activator.contains(hit)).toBe(true);
    }
    return rect;
  });
  expect(rects[0]!.bottom).toBeLessThanOrEqual(rects[1]!.top);
}

function assertMatchingConnectorAligned(
  harness: RuntimeDragBrowserHarness,
  itemId: string,
  targetId: string,
) {
  const group = harness.player.querySelector<SVGGElement>(
    `[data-matching-connector-item-id="${itemId}"][data-matching-connector-target-id="${targetId}"]`,
  );
  expect(group).not.toBeNull();
  const svg = group!.ownerSVGElement!;
  const matrix = svg.getScreenCTM();
  expect(matrix).not.toBeNull();
  const start = group!.querySelector<SVGCircleElement>(
    '[data-matching-connector-endpoint="start"]',
  )!;
  const end = group!.querySelector<SVGCircleElement>('[data-matching-connector-endpoint="end"]')!;
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  const startClient = svg.createSVGPoint();
  startClient.x = start.cx.baseVal.value - start.r.baseVal.value;
  startClient.y = start.cy.baseVal.value;
  const startEdge = startClient.matrixTransform(matrix!);
  const endClient = svg.createSVGPoint();
  endClient.x = end.cx.baseVal.value + end.r.baseVal.value;
  endClient.y = end.cy.baseVal.value;
  const endEdge = endClient.matrixTransform(matrix!);
  const itemRect = matchingSource(harness, itemId).getBoundingClientRect();
  const targetRect = matchingTarget(harness, targetId).getBoundingClientRect();
  expectClose(startEdge.x, itemRect.right, 1);
  expectClose(startEdge.y, itemRect.top + itemRect.height / 2, 1);
  expectClose(endEdge.x, targetRect.left, 1);
  expectClose(endEdge.y, targetRect.top + targetRect.height / 2, 1);
}

function assertActivationGeometry(
  harness: RuntimeDragBrowserHarness,
  activators: readonly HTMLElement[],
  handles: readonly HTMLElement[],
  expectedClientSize: number,
) {
  expect(activators).toHaveLength(3);
  expect(handles).toHaveLength(3);
  const rects = activators.map((activator, index) => {
    expect(activator).toBe(handles[index]);
    expect(activator.tagName).toBe("BUTTON");
    const rect = activator.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expectClose(rect.width, expectedClientSize, 0.75);
    expectClose(rect.height, expectedClientSize, 0.75);
    const hit = harness.ownerDocument.elementFromPoint(rect.left + 2, rect.top + rect.height / 2);
    expect(hit).not.toBeNull();
    expect(activator.contains(hit)).toBe(true);
    return rect;
  });
  for (let index = 1; index < rects.length; index += 1) {
    expect(rects[index - 1]!.bottom).toBeLessThanOrEqual(rects[index]!.top);
  }
}

async function startPointerDrag(
  harness: RuntimeDragBrowserHarness,
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
  activationPoint?: Readonly<{ x: number; y: number }>,
) {
  const sourceRect = source.getBoundingClientRect();
  const start = activationPoint ?? {
    x: sourceRect.left + 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  const hit = harness.ownerDocument.elementFromPoint(start.x, start.y);
  if (!(hit instanceof Element) || !source.contains(hit)) {
    throw new Error("Activation point did not hit the Sequencing activator.");
  }
  fireEvent.pointerDown(hit, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  const activationDirection = destination.y >= start.y ? 1 : -1;
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y + activationDirection * 6,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 1);
  const pointer = { x: destination.x, y: destination.y + 2 };
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  fireEvent.pointerMove(harness.ownerDocument, {
    button: 0,
    buttons: 1,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 2);
  return { pointer, pointerType, start };
}

async function finishPointerDrag(
  harness: RuntimeDragBrowserHarness,
  pointer: Readonly<{ x: number; y: number }>,
  pointerType: "mouse" | "touch",
) {
  fireEvent.pointerUp(harness.ownerDocument, {
    buttons: 0,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType,
  });
  await animationFrames(harness, 1);
}

function requiredOverlay(harness: RuntimeDragBrowserHarness): HTMLElement {
  const overlay = harness
    .getOverlayHost()
    ?.querySelector<HTMLElement>("[data-interaction-drag-overlay]");
  if (!overlay) throw new Error("Expected an active Sequencing drag overlay.");
  return overlay;
}

function centerOf(rect: DOMRect): Readonly<{ x: number; y: number }> {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function expectClose(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

async function animationFrames(harness: RuntimeDragBrowserHarness, count: number) {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) =>
      harness.ownerWindow.requestAnimationFrame(() => resolve()),
    );
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

function installFullscreenHarness(ownerDocument: Document, ownerWindow: Window): () => void {
  const fullscreenEnabledDescriptor = Object.getOwnPropertyDescriptor(
    ownerDocument,
    "fullscreenEnabled",
  );
  const fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(
    ownerDocument,
    "fullscreenElement",
  );
  const exitFullscreenDescriptor = Object.getOwnPropertyDescriptor(ownerDocument, "exitFullscreen");
  const OwnerHTMLElement = (ownerWindow as Window & typeof globalThis).HTMLElement;
  const requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(
    OwnerHTMLElement.prototype,
    "requestFullscreen",
  );
  let fullscreenElement: Element | null = null;
  let fullscreenSize: Readonly<{ element: HTMLElement; height: string; width: string }> | undefined;
  const restoreFullscreenSize = () => {
    if (!fullscreenSize) return;
    fullscreenSize.element.style.width = fullscreenSize.width;
    fullscreenSize.element.style.height = fullscreenSize.height;
    fullscreenSize = undefined;
  };
  Object.defineProperties(ownerDocument, {
    fullscreenEnabled: { configurable: true, value: true },
    fullscreenElement: { configurable: true, get: () => fullscreenElement },
    exitFullscreen: {
      configurable: true,
      value: async () => {
        restoreFullscreenSize();
        fullscreenElement = null;
        ownerDocument.dispatchEvent(new Event("fullscreenchange"));
      },
    },
  });
  Object.defineProperty(OwnerHTMLElement.prototype, "requestFullscreen", {
    configurable: true,
    value: async function requestFullscreen(this: HTMLElement) {
      restoreFullscreenSize();
      fullscreenSize = {
        element: this,
        height: this.style.height,
        width: this.style.width,
      };
      this.style.width = `${ownerWindow.innerWidth}px`;
      this.style.height = `${ownerWindow.innerHeight}px`;
      fullscreenElement = this;
      ownerDocument.dispatchEvent(new Event("fullscreenchange"));
    },
  });
  return () => {
    restoreFullscreenSize();
    restoreProperty(ownerDocument, "fullscreenEnabled", fullscreenEnabledDescriptor);
    restoreProperty(ownerDocument, "fullscreenElement", fullscreenElementDescriptor);
    restoreProperty(ownerDocument, "exitFullscreen", exitFullscreenDescriptor);
    restoreProperty(OwnerHTMLElement.prototype, "requestFullscreen", requestFullscreenDescriptor);
  };
}

function restoreProperty(
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}
