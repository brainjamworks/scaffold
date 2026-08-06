import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./NumberedList.css";
import "./NumberedListAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Numbered List presentation", () => {
  it("keeps Flow marker alignment while App controls retain App-owned interaction colours", async () => {
    const host = document.createElement("div");
    host.style.width = "480px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <NumberedListSpecimen />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-numbered-list__marker"));
    const application = requiredElement<HTMLElement>(host, ".sc-app");
    const course = requiredElement<HTMLElement>(host, ".sc-course");
    application.style.setProperty("--sc-app-color-text-muted", "rgb(82 82 91)");
    application.style.setProperty("--sc-app-color-error", "rgb(185 28 28)");
    application.style.setProperty("--sc-app-color-error-background", "rgb(254 226 226)");
    course.style.setProperty("--sc-course-state-current-background", "rgb(219 234 254)");

    const items = requiredElement<HTMLElement>(host, ".sc-course-numbered-list__items");
    const marker = requiredElement<HTMLButtonElement>(
      items,
      '.sc-course-numbered-list__marker[data-course-state="current"]',
    );
    const content = requiredElement<HTMLElement>(items, ".sc-course-numbered-list__item-content");
    const runtimeCurrentMarker = requiredElement<HTMLElement>(
      items,
      'span.sc-course-numbered-list__marker[data-course-state="current"]',
    );
    const runtimeCurrentDot = requiredElement<HTMLElement>(
      runtimeCurrentMarker,
      ".sc-course-numbered-list__marker-dot",
    );
    const deleteButton = requiredElement<HTMLButtonElement>(host, ".sc-app-numbered-list-delete");
    const addButton = requiredElement<HTMLButtonElement>(host, ".sc-app-numbered-list-add");
    const addMarker = requiredElement<HTMLElement>(addButton, ".sc-app-numbered-list-add__marker");

    const markerRect = marker.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    expect(markerRect.width).toBeCloseTo(36, 0);
    expect(markerRect.height).toBeCloseTo(36, 0);
    expect(contentRect.left - markerRect.right).toBeCloseTo(14, 0);
    expect(getComputedStyle(items, "::before").width).toBe("1px");
    expect(getComputedStyle(marker).backgroundColor).toBe("rgb(219, 234, 254)");
    expect(runtimeCurrentDot.getBoundingClientRect().width).toBeCloseTo(10, 0);
    expect(runtimeCurrentDot.getBoundingClientRect().height).toBeCloseTo(10, 0);
    expect(getComputedStyle(deleteButton).opacity).toBe("1");
    expect(getComputedStyle(deleteButton).color).toBe("rgb(82, 82, 91)");
    expect(addMarker.textContent).toContain("+");

    const courseCircles = host.querySelectorAll<HTMLElement>(
      ".sc-course-numbered-list__header-icon, .sc-course-numbered-list__marker, .sc-course-numbered-list__marker-dot",
    );
    expect(courseCircles).toHaveLength(7);
    for (const circle of courseCircles) {
      expect(circle.getBoundingClientRect().width).toBeCloseTo(
        circle.getBoundingClientRect().height,
        0,
      );
      expect(getComputedStyle(circle).borderRadius).toBe("50%");
    }
    expect(addMarker.getBoundingClientRect().width).toBeCloseTo(
      addMarker.getBoundingClientRect().height,
      0,
    );
    expect(Number.parseFloat(getComputedStyle(addMarker).borderRadius)).toBeGreaterThanOrEqual(18);

    await userEvent.hover(deleteButton);
    await waitForCondition(() => getComputedStyle(deleteButton).color === "rgb(185, 28, 28)");
    expect(host.querySelector(".sc-numbered-list")).toBeNull();
  });
});

function NumberedListSpecimen() {
  return (
    <div className="sc-course-numbered-list">
      <section className="sc-course-numbered-list__section" aria-label="Numbered list" role="list">
        <div className="sc-course-numbered-list__items">
          <div className="sc-course-numbered-list__title">
            <span className="sc-course-numbered-list__header-icon" aria-hidden>
              #
            </span>
            <div className="sc-course-numbered-list__title-content">Launch checklist</div>
          </div>
          <div className="sc-course-numbered-list__item" role="listitem">
            <div className="sc-course-numbered-list__item-shell">
              <button
                type="button"
                className="sc-course-numbered-list__marker sc-course-numbered-list__marker--inProgress sc-app-numbered-list-status-cycle"
                data-status="inProgress"
                data-course-state="current"
                aria-label="Set item 1 status. Current: in progress."
              >
                <span className="sc-course-numbered-list__marker-dot" aria-hidden />
              </button>
              <div className="sc-course-numbered-list__item-content">Publish the course</div>
              <button
                type="button"
                className="sc-app-numbered-list-delete"
                aria-label="Delete numbered list item 1"
              >
                Delete
              </button>
            </div>
          </div>
          <div className="sc-course-numbered-list__item" role="listitem">
            <div className="sc-course-numbered-list__item-shell">
              <span
                className="sc-course-numbered-list__marker sc-course-numbered-list__marker--inProgress"
                data-status="inProgress"
                data-course-state="current"
              >
                <span aria-hidden className="sc-course-numbered-list__marker-visual">
                  <span className="sc-course-numbered-list__marker-dot" />
                </span>
                <span className="sc-course-numbered-list__runtime-status">Item 2, in progress</span>
              </span>
              <div className="sc-course-numbered-list__item-content">Verify the learner view</div>
            </div>
          </div>
          <div className="sc-course-numbered-list__item" role="listitem">
            <div className="sc-course-numbered-list__item-shell">
              <span
                className="sc-course-numbered-list__marker sc-course-numbered-list__marker--neutral"
                data-status="neutral"
              >
                2
              </span>
              <div className="sc-course-numbered-list__item-content">Prepare the learner view</div>
            </div>
          </div>
          <div className="sc-course-numbered-list__item" role="listitem">
            <div className="sc-course-numbered-list__item-shell">
              <span
                className="sc-course-numbered-list__marker sc-course-numbered-list__marker--complete"
                data-status="complete"
                data-course-state="completed"
              >
                ✓
              </span>
              <div className="sc-course-numbered-list__item-content">Complete publication</div>
            </div>
          </div>
        </div>
        <button
          type="button"
          className="sc-app-block-add sc-app-block-add--item sc-app-numbered-list-add"
          aria-label="Add item"
        >
          <span aria-hidden className="sc-app-numbered-list-add__marker">
            +
          </span>
          <span>Add item</span>
        </button>
      </section>
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
      throw new Error("Timed out waiting for Numbered List state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
