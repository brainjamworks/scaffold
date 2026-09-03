import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/assessment/categorise/Categorise.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "@/theme/course/designs/scaffold-flow/v1/assessment-categorise.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Categorise runtime geometry", () => {
  it("keeps an empty category at least 44px tall without a Course recipe", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(<CategoriseRuntimeFixture />);
    await waitForCondition(() => host.querySelector(".sc-course-categorise__runtime-bin") !== null);

    const category = requiredElement<HTMLElement>(host, ".sc-course-categorise__runtime-bin");
    expect(category.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });
});

describe("Pocket Atlas Categorise recipe", () => {
  it.each(["light", "dark"] as const)(
    "distinguishes learner items, categories and interaction states in %s mode",
    async (appearance) => {
      const host = document.createElement("div");
      host.style.width = "56rem";
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
          <CategoriseRuntimeFixture />
        </CourseThemeProvider>,
      );

      await waitForCondition(
        () => host.querySelector(".sc-course-categorise__source-item") !== null,
      );

      const sourceGrid = requiredElement<HTMLElement>(host, ".sc-course-categorise__source-grid");
      const sourceItem = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-categorise__source-item",
      );
      const selectedItem = requiredElement<HTMLButtonElement>(
        host,
        ".sc-course-categorise__source-item[data-selected]",
      );
      const category = requiredElement<HTMLElement>(host, ".sc-course-categorise__runtime-bin");
      const readyCategory = requiredElement<HTMLElement>(
        host,
        ".sc-course-categorise__runtime-bin[data-placement-ready]",
      );
      const placedItem = requiredElement<HTMLElement>(host, ".sc-course-categorise__placed-item");
      const handle = requiredElement<HTMLButtonElement>(host, ".sc-course-categorise__item-handle");

      expect(Number.parseFloat(getComputedStyle(sourceGrid).gap)).toBeGreaterThan(0);
      expect(getComputedStyle(sourceItem).borderTopWidth).not.toBe("0px");
      expect(getComputedStyle(sourceItem).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(category).borderTopStyle).toBe("dashed");
      expect(getComputedStyle(category).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(placedItem).boxShadow).not.toBe("none");
      expect(getComputedStyle(selectedItem).backgroundColor).not.toBe(
        getComputedStyle(sourceItem).backgroundColor,
      );
      expect(getComputedStyle(readyCategory).backgroundColor).not.toBe(
        getComputedStyle(category).backgroundColor,
      );
      expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
      expect(handle.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);

      sourceItem.focus();
      expect(getComputedStyle(sourceItem).outlineStyle).toBe("solid");
      expect(getComputedStyle(sourceItem).outlineWidth).toBe("3px");

      const restingBackground = getComputedStyle(sourceItem).backgroundColor;
      await userEvent.hover(sourceItem);
      await waitForCondition(
        () => getComputedStyle(sourceItem).backgroundColor !== restingBackground,
      );
      expect(getComputedStyle(sourceItem).backgroundColor).not.toBe(restingBackground);
    },
  );
});

describe("Scaffold Flow Categorise contrast", () => {
  it("keeps empty-category helper text at AA contrast", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    root.render(
      <CourseThemeProvider
        appearance="light"
        theme={{
          schemaVersion: 1,
          design: { id: "scaffold-flow", revision: "1" },
          colourSystem: { id: "scaffold-indigo", revision: "1" },
          overrides: {},
        }}
      >
        <CategoriseRuntimeFixture />
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-categorise__empty-bin") !== null);
    const category = requiredElement<HTMLElement>(host, ".sc-course-categorise__runtime-bin");
    const empty = requiredElement<HTMLElement>(category, ".sc-course-categorise__empty-bin");

    expect(
      contrastRatio(getComputedStyle(empty).color, getComputedStyle(category).backgroundColor),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

function CategoriseRuntimeFixture() {
  return (
    <section className="sc-course-assessment-categorise">
      <div className="sc-course-categorise__flow">
        <div className="sc-course-categorise__source">
          <div className="sc-course-categorise__source-label">Items</div>
          <div className="sc-course-categorise__source-grid">
            <button className="sc-course-categorise__source-item" type="button">
              Atlas
            </button>
            <button className="sc-course-categorise__source-item" data-selected type="button">
              Compass
            </button>
          </div>
        </div>
        <div className="sc-course-categorise__bin-grid">
          <div className="sc-course-categorise__runtime-bin">
            <div className="sc-course-categorise__runtime-bin-title" />
            <div className="sc-course-categorise__placed-items">
              <span className="sc-course-categorise__empty-bin">Drop items here</span>
            </div>
          </div>
          <div className="sc-course-categorise__runtime-bin" data-placement-ready="">
            <div className="sc-course-categorise__runtime-bin-title">Reference</div>
            <div className="sc-course-categorise__placed-items">
              <div className="sc-course-categorise__placed-item">
                <div className="sc-course-categorise__placed-item-row">
                  <button className="sc-course-categorise__item-handle" type="button">
                    Move
                  </button>
                  <div className="sc-course-categorise__item-content">Field guide</div>
                  <button className="sc-course-categorise__remove-action" type="button">
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
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

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(parseRgb(foreground));
  const backgroundLuminance = relativeLuminance(parseRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  if (!channels || channels.length !== 3)
    throw new Error(`Expected RGB colour, received: ${value}`);
  return channels as [number, number, number];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
}
