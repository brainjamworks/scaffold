import { createRoot, type Root } from "react-dom/client";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./Comparison.css";
import "./ComparisonAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Comparison presentation", () => {
  it("preserves semantic ownership, Course appearance, runtime purity, and intrinsic stacking", async () => {
    await page.viewport(1000, 900);
    const host = document.createElement("div");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <ComparisonSpecimen id="light" mode="authoring" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <ComparisonSpecimen id="dark" mode="authoring" />
            <ComparisonSpecimen id="runtime" mode="runtime" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll('[role="table"]').length === 3);

    const light = requiredElement<HTMLElement>(host, '[data-specimen="light"]');
    const dark = requiredElement<HTMLElement>(host, '[data-specimen="dark"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="runtime"]');
    const lightSurface = requiredElement<HTMLElement>(light, ".sc-course-comparison__surface");
    const darkSurface = requiredElement<HTMLElement>(dark, ".sc-course-comparison__surface");
    const lightHeader = requiredElement<HTMLElement>(light, ".sc-course-comparison__header");
    const lightHeaderRow = requiredElement<HTMLElement>(light, ".sc-course-comparison__header-row");
    const darkHeaderRow = requiredElement<HTMLElement>(dark, ".sc-course-comparison__header-row");
    const lightDelete = requiredElement<HTMLElement>(light, ".sc-course-comparison__delete");
    const darkDelete = requiredElement<HTMLElement>(dark, ".sc-course-comparison__delete");

    expect(lightSurface.getAttribute("aria-label")).toBe("Before compared with After");
    expect(light.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(light.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(light.querySelectorAll('[role="cell"]')).toHaveLength(2);
    expect(lightHeader.hasAttribute("aria-hidden")).toBe(false);
    expect(host.querySelector('[class^="sc-comparison"], [class*=" sc-comparison"]')).toBeNull();

    expect(light.querySelector(".sc-app-comparison-add")).not.toBeNull();
    expect(light.querySelector(".sc-app-comparison-delete")).not.toBeNull();
    expect(runtime.querySelector('[class*="sc-app-comparison-"]')).toBeNull();
    expect(runtime.querySelector("button")).toBeNull();

    expect(getComputedStyle(lightSurface).backgroundColor).not.toBe(
      getComputedStyle(darkSurface).backgroundColor,
    );
    expect(getComputedStyle(lightSurface).color).not.toBe(getComputedStyle(darkSurface).color);
    expect(getComputedStyle(lightHeaderRow).backgroundColor).not.toBe(
      getComputedStyle(darkHeaderRow).backgroundColor,
    );
    expect(getComputedStyle(lightDelete).color).not.toBe(getComputedStyle(darkDelete).color);

    const row = requiredElement<HTMLElement>(light, ".sc-course-comparison__row");
    const headerCells = light.querySelectorAll<HTMLElement>(".sc-course-comparison__header-cell");
    const cells = light.querySelectorAll<HTMLElement>(".sc-course-comparison__cell");
    expect(getComputedStyle(row).gridTemplateColumns.split(" ")).toHaveLength(2);
    expect(headerCells[1]!.getBoundingClientRect().left).toBeCloseTo(
      cells[1]!.getBoundingClientRect().left,
      0,
    );
    expect(cells[1]!.getBoundingClientRect().left).toBeGreaterThan(
      cells[0]!.getBoundingClientRect().left,
    );

    light.style.width = "300px";
    await waitForCondition(() => getComputedStyle(row).gridTemplateColumns.split(" ").length === 1);

    expect(
      getComputedStyle(requiredElement(light, ".sc-course-comparison__cell-label")).display,
    ).toBe("block");
    expect(cells[1]!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      cells[0]!.getBoundingClientRect().bottom,
    );
    expect(lightHeader.getBoundingClientRect().width).toBeCloseTo(1, 0);

    light.style.width = "220px";
    await waitForCondition(() => light.getBoundingClientRect().width === 220);
    expect(lightSurface.scrollWidth).toBeLessThanOrEqual(lightSurface.clientWidth);
    expect(window.innerWidth).toBe(1000);
  });
});

function ComparisonSpecimen({ id, mode }: { id: string; mode: "authoring" | "runtime" }) {
  const authoring = mode === "authoring";
  const leftHeaderId = `${id}-left-header`;
  const rightHeaderId = `${id}-right-header`;

  return (
    <figure data-specimen={id} className="sc-course-comparison" style={{ width: "700px" }}>
      <div
        role="table"
        aria-label="Before compared with After"
        className="sc-course-comparison__surface"
      >
        <div role="rowgroup" className="sc-course-comparison__header">
          <div role="row" className="sc-course-comparison__header-row">
            <span
              id={leftHeaderId}
              role="columnheader"
              className="sc-course-comparison__header-cell"
            >
              Before
            </span>
            <span
              id={rightHeaderId}
              role="columnheader"
              className="sc-course-comparison__header-cell"
            >
              After
            </span>
          </div>
        </div>
        <div role="rowgroup" className="sc-course-comparison__body">
          <div role="row" className="sc-course-comparison__row">
            <div
              role="cell"
              aria-labelledby={leftHeaderId}
              className="sc-course-comparison__cell sc-course-comparison__cell--left"
            >
              <span aria-hidden className="sc-course-comparison__cell-label">
                Before
              </span>
              <div className="sc-course-comparison__cell-content">
                <p>Manual handoffs caused fragmented ownership.</p>
              </div>
            </div>
            <div
              role="cell"
              aria-labelledby={rightHeaderId}
              className="sc-course-comparison__cell sc-course-comparison__cell--right"
            >
              <span aria-hidden className="sc-course-comparison__cell-label">
                After
              </span>
              <div className="sc-course-comparison__cell-content">
                <p>One bounded workflow keeps intent and implementation aligned.</p>
              </div>
            </div>
            {authoring ? (
              <button
                type="button"
                className="sc-app-comparison-delete sc-course-comparison__delete"
                aria-label="Delete comparison row 1"
              >
                <Trash size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
        {authoring ? (
          <button type="button" className="sc-app-comparison-add">
            Add row
          </button>
        ) : null}
      </div>
    </figure>
  );
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Comparison state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
