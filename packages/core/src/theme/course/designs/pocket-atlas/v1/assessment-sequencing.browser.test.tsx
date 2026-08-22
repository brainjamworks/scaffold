import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/blocks/assessment/sequencing/Sequencing.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Sequencing recipe", () => {
  it.each(["light", "dark"] as const)(
    "keeps rows distinct and the runtime drag affordance visible in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      mountedRoots.push(root);

      root.render(
        <CourseThemeProvider
          appearance={appearance}
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <section className="sc-course-assessment-sequencing">
            <div className="sc-course-sequencing__group">
              <div className="sc-course-sequencing__scroll">
                <ul className="sc-course-sequencing__list">
                  <SequencingItem label="First field note" />
                  <SequencingItem label="Second field note" />
                </ul>
              </div>
            </div>
            <div className="sc-course-sequencing__drag-preview" data-testid="drag-preview">
              <div className="sc-course-sequencing__item-content">First field note</div>
            </div>
          </section>
        </CourseThemeProvider>,
      );

      await waitForCondition(() => host.querySelector(".sc-course-sequencing__item") !== null);

      const list = requiredElement<HTMLElement>(host, ".sc-course-sequencing__list");
      const item = requiredElement<HTMLElement>(host, ".sc-course-sequencing__item");
      const handle = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-sequencing__runtime-handle",
      );
      const dragPreview = requiredElement<HTMLElement>(host, '[data-testid="drag-preview"]');
      const itemStyle = getComputedStyle(item);
      const shadowBlockEnd = readShadowBlockEnd(itemStyle.boxShadow);

      expect(Number.parseFloat(getComputedStyle(list).rowGap)).toBeGreaterThanOrEqual(
        shadowBlockEnd,
      );
      expect(Number.parseFloat(itemStyle.columnGap)).toBeGreaterThan(0);
      expect(getComputedStyle(dragPreview).borderTopWidth).toBe(itemStyle.borderTopWidth);
      expect(getComputedStyle(dragPreview).backgroundColor).toBe(itemStyle.backgroundColor);
      expect(getComputedStyle(dragPreview).boxShadow).not.toBe("none");
      expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(handle.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

      const restingHandleBackground = getComputedStyle(handle).backgroundColor;
      const restingItemBackground = getComputedStyle(item).backgroundColor;
      await userEvent.hover(handle);
      await waitForCondition(
        () => getComputedStyle(handle).backgroundColor !== restingHandleBackground,
      );
      expect(getComputedStyle(handle).backgroundColor).not.toBe(restingHandleBackground);
      expect(getComputedStyle(item).backgroundColor).not.toBe(restingItemBackground);

      await userEvent.unhover(handle);
      handle.focus();
      expect(document.activeElement).toBe(handle);
      expect(getComputedStyle(handle).outlineStyle).toBe("solid");
      expect(getComputedStyle(handle).outlineWidth).toBe("3px");
    },
  );
});

function SequencingItem({ label }: { label: string }) {
  return (
    <li className="sc-course-sequencing__item" data-draggable="">
      <button
        aria-label={`Drag ${label}`}
        className="sc-course-sequencing__runtime-handle"
        type="button"
      >
        Drag
      </button>
      <div className="sc-course-sequencing__item-content">{label}</div>
    </li>
  );
}

function readShadowBlockEnd(boxShadow: string): number {
  const match = boxShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  if (!match) throw new Error(`Expected a pixel offset shadow, received: ${boxShadow}`);
  return Math.max(0, Number(match[2]));
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for browser render");
}
