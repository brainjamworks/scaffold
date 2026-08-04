import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./KeyValueList.css";
import "./KeyValueListAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Key-Value List presentation", () => {
  it("preserves every layout and key width while collapsing from container width alone", async () => {
    await page.viewport(900, 700);
    const host = document.createElement("div");
    host.style.width = "600px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <KeyValueListSpecimen />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-key-value-list__list"));
    const list = requiredElement<HTMLElement>(host, ".sc-course-key-value-list__list");
    const row = requiredElement<HTMLElement>(list, ".sc-course-key-value-list__row");
    const key = requiredElement<HTMLElement>(row, ".sc-course-key-value-list__key");
    const value = requiredElement<HTMLElement>(row, ".sc-course-key-value-list__value");

    expect(getComputedStyle(list).display).toBe("flex");
    expect(getComputedStyle(row).flexDirection).toBe("column");
    expect(value.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      key.getBoundingClientRect().bottom,
    );

    list.dataset["layout"] = "inline";
    await waitForCondition(() => getComputedStyle(row).flexDirection === "row");
    const autoWidth = key.getBoundingClientRect().width;
    expect(autoWidth).toBeGreaterThan(0);

    for (const [keyWidth, expectedWidth] of [
      ["narrow", 80],
      ["medium", 120],
      ["wide", 180],
    ] as const) {
      list.dataset["keyWidth"] = keyWidth;
      await waitForCondition(
        () => Math.abs(key.getBoundingClientRect().width - expectedWidth) <= 1,
      );
      expect(key.getBoundingClientRect().width).toBeCloseTo(expectedWidth, 0);
    }
    expect(autoWidth).not.toBeCloseTo(80, 0);
    expect(autoWidth).not.toBeCloseTo(120, 0);
    expect(autoWidth).not.toBeCloseTo(180, 0);

    list.dataset["layout"] = "grid";
    list.dataset["keyWidth"] = "wide";
    await waitForCondition(
      () =>
        getComputedStyle(list).display === "grid" && getComputedStyle(row).display === "contents",
    );
    expect(key.getBoundingClientRect().width).toBeCloseTo(180, 0);
    expect(value.getBoundingClientRect().left).toBeGreaterThan(key.getBoundingClientRect().right);
    expect(getComputedStyle(key).textAlign).toBe("right");

    list.dataset["keyWidth"] = "auto";
    await waitForCondition(() => key.getBoundingClientRect().width !== 180);
    expect(key.getBoundingClientRect().width).toBeGreaterThan(0);

    host.style.width = "320px";
    list.dataset["keyWidth"] = "wide";
    await waitForCondition(
      () => getComputedStyle(list).display === "flex" && getComputedStyle(row).display === "flex",
    );
    expect(getComputedStyle(row).flexDirection).toBe("column");
    expect(getComputedStyle(key).textAlign).toBe("left");
    expect(key.getBoundingClientRect().width).toBeLessThan(180);
    expect(window.innerWidth).toBe(900);

    list.dataset["layout"] = "inline";
    await waitForCondition(() => getComputedStyle(row).flexDirection === "column");
    expect(key.getBoundingClientRect().width).toBeLessThan(180);
    expect(window.innerWidth).toBe(900);
  });

  it("recolours Course content without recolouring App placeholders or Add controls", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <KeyValueListSpecimen label="Light list" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <KeyValueListSpecimen label="Dark list" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelectorAll(".sc-course-key-value-list__key").length === 4,
    );
    const keys = host.querySelectorAll<HTMLElement>(".sc-course-key-value-list__key");
    const placeholders = host.querySelectorAll<HTMLElement>(
      ".sc-course-key-value-list__key [data-node-view-content-react] > p.is-empty",
    );
    const addButtons = host.querySelectorAll<HTMLElement>(".sc-app-key-value-list-add");

    expect(getComputedStyle(keys[0]!).color).not.toBe(getComputedStyle(keys[2]!).color);
    expect(getComputedStyle(placeholders[0]!, "::before").color).toBe(
      getComputedStyle(placeholders[1]!, "::before").color,
    );
    expect(getComputedStyle(addButtons[0]!).color).toBe(getComputedStyle(addButtons[1]!).color);
  });
});

function KeyValueListSpecimen({ label = "Key-value list" }: { label?: string }) {
  return (
    <div className="sc-course-key-value-list" aria-label={label}>
      <dl
        data-node="key-value-list"
        data-layout="stacked"
        data-key-width="auto"
        className="sc-course-key-value-list__list"
      >
        <div data-node="key-value-row" className="sc-course-key-value-list__row">
          <dt data-slot="key-value-row-key" className="sc-course-key-value-list__key">
            <div data-node-view-content-react="">
              <p>Duration</p>
            </div>
          </dt>
          <dd data-slot="key-value-row-value" className="sc-course-key-value-list__value">
            <div data-node-view-content-react="">
              <p>Six weeks</p>
            </div>
          </dd>
        </div>
        <div data-node="key-value-row" className="sc-course-key-value-list__row">
          <dt data-slot="key-value-row-key" className="sc-course-key-value-list__key">
            <div data-node-view-content-react="">
              <p className="is-empty" />
            </div>
          </dt>
          <dd data-slot="key-value-row-value" className="sc-course-key-value-list__value">
            <div data-node-view-content-react="">
              <p className="is-empty" />
            </div>
          </dd>
        </div>
      </dl>
      <button type="button" className="sc-app-block-add sc-app-block-add--item sc-app-key-value-list-add">
        Add item
      </button>
    </div>
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Key-Value List state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
