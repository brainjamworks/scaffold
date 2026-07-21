import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { OverlayBoundary } from "../OverlayBoundary/OverlayBoundary";
import { Select } from "../Select/Select";
import { Sheet } from "./Sheet";

import "@/styles/globals.css";

interface SheetGeometryCase {
  label: string;
  outerWidth: number;
  collisionWidth: number;
  sheetLeft: number;
  sheetWidth: number;
}

const geometryCases: readonly SheetGeometryCase[] = [
  {
    label: "wide",
    outerWidth: 1120,
    collisionWidth: 700,
    sheetLeft: 520,
    sheetWidth: 520,
  },
  {
    label: "narrow",
    outerWidth: 420,
    collisionWidth: 200,
    sheetLeft: 24,
    sheetWidth: 372,
  },
];

let root: Root | null = null;
let outerContainer: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  outerContainer?.remove();
  root = null;
  outerContainer = null;
});

describe("Sheet nested rich text geometry", () => {
  for (const geometry of geometryCases) {
    it(`keeps an open Select aligned inside an offset ${geometry.label} Sheet`, async () => {
      await page.viewport(geometry.outerWidth, 720);
      const mount = document.createElement("div");
      const outerCollisionBoundary = document.createElement("div");
      outerCollisionBoundary.dataset.testOuterCollisionBoundary = "";
      outerCollisionBoundary.style.cssText = [
        "height: 560px",
        "left: 0",
        "position: absolute",
        "top: 0",
        `width: ${geometry.collisionWidth}px`,
      ].join(";");
      outerContainer = document.createElement("section");
      outerContainer.style.cssText = [
        "height: 640px",
        "left: 0",
        "position: fixed",
        "top: 0",
        `width: ${geometry.outerWidth}px`,
      ].join(";");
      outerContainer.append(mount, outerCollisionBoundary);
      document.body.append(outerContainer);

      root = createRoot(mount);
      root.render(
        <OverlayBoundary
          collisionBoundary={outerCollisionBoundary}
          container={outerContainer}
          kind="contained"
        >
          <Sheet.Root open>
            <Sheet.Content
              side="right"
              style={{
                animation: "none",
                height: 520,
                left: geometry.sheetLeft,
                right: "auto",
                top: 40,
                width: geometry.sheetWidth,
              }}
            >
              <Sheet.Title>Quiz settings</Sheet.Title>
              <Sheet.Description>Configure the quiz response</Sheet.Description>
              <Sheet.Body style={{ padding: 24 }}>
                <Select.Root open value="single" onValueChange={() => {}}>
                  <Select.Trigger aria-label="Response type" />
                  <Select.Content>
                    <Select.Item value="single">Single answer</Select.Item>
                    <Select.Item value="multiple">Multiple answers</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Sheet.Body>
            </Sheet.Content>
          </Sheet.Root>
        </OverlayBoundary>,
      );

      await waitForCondition(() => {
        const sheet = document.querySelector<HTMLElement>(".sc-sheet-content");
        const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
        return (
          sheet &&
          listbox &&
          getComputedStyle(sheet).transform === "none" &&
          getComputedStyle(listbox).visibility === "visible" &&
          getComputedStyle(listbox).transform === "none"
        );
      });

      const sheet = requireElement<HTMLElement>(document, ".sc-sheet-content");
      const trigger = requireElement<HTMLElement>(sheet, '[role="combobox"]');
      const listbox = requireElement<HTMLElement>(document, '[role="listbox"]');
      const innerHost = sheet.querySelector<HTMLElement>(":scope > [data-scaffold-overlay-host]");
      const outerCollisionRect = outerCollisionBoundary.getBoundingClientRect();
      const sheetRect = sheet.getBoundingClientRect();
      const triggerRect = trigger.getBoundingClientRect();
      const listboxRect = listbox.getBoundingClientRect();

      expect(outerCollisionRect.right).toBeLessThan(triggerRect.right - 8);
      expect(innerHost).not.toBeNull();
      expect(listbox.closest("[data-scaffold-overlay-host]")).toBe(innerHost);
      expect(Math.abs(listboxRect.left - triggerRect.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(listboxRect.width - triggerRect.width)).toBeLessThanOrEqual(1);
      expect(listboxRect.left).toBeGreaterThanOrEqual(sheetRect.left - 1);
      expect(listboxRect.right).toBeLessThanOrEqual(sheetRect.right + 1);
    });
  }
});

function requireElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Sheet Select geometry");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
