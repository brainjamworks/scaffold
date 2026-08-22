import { createRoot, type Root } from "react-dom/client";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

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
  it("preserves Course content while the author-only delete action uses App presentation", async () => {
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
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(host, ".sc-app"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const errorColour = computedColor(appStyle.getPropertyValue("--sc-app-color-error"));
    const errorBackground = computedColor(
      appStyle.getPropertyValue("--sc-app-color-error-background"),
      "background",
    );
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));

    const light = requiredElement<HTMLElement>(host, '[data-specimen="light"]');
    const dark = requiredElement<HTMLElement>(host, '[data-specimen="dark"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="runtime"]');
    const lightSurface = requiredElement<HTMLElement>(light, ".sc-course-comparison__surface");
    const darkSurface = requiredElement<HTMLElement>(dark, ".sc-course-comparison__surface");
    const lightTable = requiredElement<HTMLElement>(light, ".sc-course-comparison__table");
    const lightHeader = requiredElement<HTMLElement>(light, ".sc-course-comparison__header");
    const lightHeaderRow = requiredElement<HTMLElement>(light, ".sc-course-comparison__header-row");
    const darkHeaderRow = requiredElement<HTMLElement>(dark, ".sc-course-comparison__header-row");
    const lightDelete = requiredElement<HTMLButtonElement>(light, ".sc-app-comparison-delete");
    const darkDelete = requiredElement<HTMLButtonElement>(dark, ".sc-app-comparison-delete");

    expect(lightTable.getAttribute("aria-label")).toBe("Before compared with After");
    expect(light.querySelectorAll('[role="columnheader"]')).toHaveLength(2);
    expect(light.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(light.querySelectorAll('[role="cell"]')).toHaveLength(3);
    expect(light.querySelectorAll(".sc-course-comparison__cell")).toHaveLength(2);
    expect(lightHeader.hasAttribute("aria-hidden")).toBe(false);
    expect(host.querySelector('[class^="sc-comparison"], [class*=" sc-comparison"]')).toBeNull();

    expect(light.querySelector(".sc-app-comparison-add")).not.toBeNull();
    expect(light.querySelector(".sc-app-comparison-delete")).not.toBeNull();
    expect(lightTable.contains(lightDelete)).toBe(true);
    expect(lightDelete.parentElement).toHaveClass("sc-app-comparison-row-actions");
    expect(lightDelete.parentElement).toHaveAttribute("role", "cell");
    expect(runtime.querySelector('[class*="sc-app-comparison-"]')).toBeNull();
    expect(runtime.querySelector("button")).toBeNull();

    expect(getComputedStyle(lightSurface).backgroundColor).not.toBe(
      getComputedStyle(darkSurface).backgroundColor,
    );
    expect(getComputedStyle(lightSurface).color).not.toBe(getComputedStyle(darkSurface).color);
    expect(getComputedStyle(lightHeaderRow).backgroundColor).not.toBe(
      getComputedStyle(darkHeaderRow).backgroundColor,
    );
    expect(lightDelete).not.toHaveClass("sc-course-comparison__delete");
    expect(darkDelete).not.toHaveClass("sc-course-comparison__delete");
    expect(getComputedStyle(lightDelete).color).toBe(mutedColour);
    expect(getComputedStyle(lightDelete).color).toBe(getComputedStyle(darkDelete).color);
    expect(getComputedStyle(lightDelete).width).toBe("28px");
    expect(getComputedStyle(lightDelete).height).toBe("28px");
    expect(getComputedStyle(lightDelete).borderTopWidth).toBe("0px");
    expect(Number.parseFloat(getComputedStyle(lightDelete).borderTopLeftRadius)).toBeCloseTo(
      controlRadius,
      1,
    );
    expect(getComputedStyle(lightDelete).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(lightDelete).opacity).toBe("1");

    const row = requiredElement<HTMLElement>(light, ".sc-course-comparison__row");
    const leftContent = requiredElement<HTMLElement>(
      light,
      ".sc-course-comparison__cell--left .sc-course-comparison__cell-content",
    );
    const rightContent = requiredElement<HTMLElement>(
      light,
      ".sc-course-comparison__cell--right .sc-course-comparison__cell-content",
    );
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
    expect(getComputedStyle(lightDelete).position).toBe("absolute");
    expect(getComputedStyle(row).position).toBe("relative");
    expect(getComputedStyle(lightDelete).insetInlineEnd).toBe("8px");
    expect(getComputedStyle(rightContent).marginInlineEnd).toBe("44px");

    await userEvent.hover(lightDelete);
    await waitForCondition(() => getComputedStyle(lightDelete).color === errorColour);
    expect(getComputedStyle(lightDelete).backgroundColor).toBe(errorBackground);

    await userEvent.unhover(lightDelete);
    lightDelete.focus();
    await waitForCondition(() => getComputedStyle(lightDelete).color === errorColour);

    lightDelete.setAttribute("aria-disabled", "true");
    await waitForCondition(
      () =>
        getComputedStyle(lightDelete).opacity === "0.45" &&
        getComputedStyle(lightDelete).color === mutedColour,
    );
    expect(document.activeElement).toBe(lightDelete);
    expect(getComputedStyle(lightDelete).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(lightDelete).cursor).toBe("not-allowed");
    expect(getComputedStyle(lightDelete).outlineStyle).toBe("solid");

    light.style.width = "300px";
    await waitForCondition(() => getComputedStyle(row).gridTemplateColumns.split(" ").length === 1);

    expect(
      getComputedStyle(requiredElement(light, ".sc-course-comparison__cell-label")).display,
    ).toBe("block");
    expect(cells[1]!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      cells[0]!.getBoundingClientRect().bottom,
    );
    expect(lightHeader.getBoundingClientRect().width).toBeCloseTo(1, 0);
    expect(getComputedStyle(rightContent).marginInlineEnd).toBe("0px");
    expect(getComputedStyle(leftContent).marginInlineEnd).toBe("44px");
    expect(getComputedStyle(lightDelete).insetBlockStart).toBe("8px");
    expect(getComputedStyle(lightDelete).transform).toBe("none");

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
      <div className="sc-course-comparison__surface">
        <div
          role="table"
          aria-label="Before compared with After"
          className="sc-course-comparison__table"
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
                <div
                  role="cell"
                  aria-label="Actions for comparison row 1"
                  className="sc-app-comparison-row-actions"
                >
                  <button
                    type="button"
                    className="sc-app-comparison-delete"
                    aria-label="Delete comparison row 1"
                  >
                    <Trash size={14} aria-hidden />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {authoring ? (
          <button type="button" className="sc-app-block-add sc-app-comparison-add">
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

function computedColor(value: string, property: "color" | "background" = "color"): string {
  const probe = document.createElement("span");
  probe.style[property] = value;
  document.body.append(probe);
  const resolved = getComputedStyle(probe)[property === "background" ? "backgroundColor" : "color"];
  probe.remove();
  return resolved;
}

function computedLength(value: string): number {
  const probe = document.createElement("span");
  probe.style.borderRadius = value;
  document.body.append(probe);
  const resolved = Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius);
  probe.remove();
  return resolved;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Comparison state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
