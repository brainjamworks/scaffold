import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { OverlayBoundary } from "./OverlayBoundary/OverlayBoundary";
import * as Popover from "./Popover/Popover";

import "./PopoverSurface/PopoverSurface.css";

interface PlacementSample {
  isSentinel: boolean;
  pointerEvents: string;
  visibility: string;
}

let root: Root | null = null;
let mountNode: HTMLElement | null = null;
let boundaryContainer: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  mountNode?.remove();
  boundaryContainer?.remove();
  root = null;
  mountNode = null;
  boundaryContainer = null;
});

describe("owned overlay placement readiness", () => {
  it("stays hidden and non-interactive until Radix commits placement", async () => {
    mountNode = document.createElement("div");
    boundaryContainer = document.createElement("section");
    boundaryContainer.style.cssText =
      "position: fixed; inset: 0; width: 640px; height: 480px; overflow: hidden;";
    document.body.append(mountNode, boundaryContainer);

    const samples: PlacementSample[] = [];
    const capturePlacement = () => {
      const wrapper = boundaryContainer?.querySelector<HTMLElement>(
        "[data-radix-popper-content-wrapper]",
      );
      const content = boundaryContainer?.querySelector<HTMLElement>("[data-placement-contract]");
      if (!wrapper || !content) return;

      const style = getComputedStyle(content);
      samples.push({
        isSentinel: wrapper.style.transform.includes("-200%"),
        pointerEvents: style.pointerEvents,
        visibility: style.visibility,
      });
    };
    const observer = new MutationObserver(capturePlacement);
    observer.observe(boundaryContainer, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    root = createRoot(mountNode);
    root.render(
      <OverlayBoundary container={boundaryContainer} kind="viewport">
        <Popover.Root open>
          <Popover.Trigger
            style={{ position: "fixed", insetInlineStart: 240, insetBlockStart: 180 }}
          >
            Open placement contract
          </Popover.Trigger>
          <Popover.Portal forceMount>
            <Popover.Content data-placement-contract>Placed content</Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </OverlayBoundary>,
    );

    try {
      await waitForAnimationFrameCondition(() => {
        capturePlacement();
        return samples.some(
          (sample) =>
            !sample.isSentinel &&
            sample.visibility === "visible" &&
            sample.pointerEvents === "auto",
        );
      });
    } finally {
      observer.disconnect();
    }

    const measuringSamples = samples.filter((sample) => sample.isSentinel);
    expect(measuringSamples.length).toBeGreaterThan(0);
    for (const sample of measuringSamples) {
      expect(sample.visibility).toBe("hidden");
      expect(sample.pointerEvents).toBe("none");
    }
    expect(samples.at(-1)).toMatchObject({
      isSentinel: false,
      pointerEvents: "auto",
      visibility: "visible",
    });
  });
});

async function waitForAnimationFrameCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for the Radix placement lifecycle.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
