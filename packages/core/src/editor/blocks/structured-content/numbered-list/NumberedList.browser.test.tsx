import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

import "./NumberedList.css";
import "./NumberedListAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Numbered List presentation", () => {
  it("keeps Flow marker alignment while the delete action uses App interaction colours", async () => {
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
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(host, ".sc-app"));
    const courseStyle = getComputedStyle(requiredElement<HTMLElement>(host, ".sc-course"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const errorColour = computedColor(appStyle.getPropertyValue("--sc-app-color-error"));
    const errorBackground = computedColor(
      appStyle.getPropertyValue("--sc-app-color-error-background"),
      "background",
    );
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));
    const currentBackground = computedColor(
      courseStyle.getPropertyValue("--sc-course-state-current-background"),
    );

    const items = requiredElement<HTMLElement>(host, ".sc-course-numbered-list__items");
    const statusButton = requiredElement<HTMLButtonElement>(
      items,
      ".sc-app-numbered-list-status-cycle",
    );
    const marker = requiredElement<HTMLElement>(
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
    const iconButton = requiredElement<HTMLButtonElement>(
      host,
      ".sc-app-numbered-list-icon-picker",
    );
    const addButton = requiredElement<HTMLButtonElement>(host, ".sc-app-numbered-list-add");
    const addMarker = requiredElement<HTMLElement>(addButton, ".sc-app-numbered-list-add__marker");

    const markerRect = marker.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const deleteRect = deleteButton.getBoundingClientRect();
    expect(statusButton.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(statusButton.getBoundingClientRect().height).toBeCloseTo(44, 0);
    expect(markerRect.width).toBeCloseTo(36, 0);
    expect(markerRect.height).toBeCloseTo(36, 0);
    expect(contentRect.left - markerRect.right).toBeCloseTo(14, 0);
    expect(deleteRect.left - contentRect.right).toBeCloseTo(8, 0);
    expect(deleteRect.width).toBeCloseTo(44, 0);
    expect(deleteRect.height).toBeCloseTo(44, 0);
    expect(iconButton.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(iconButton.getBoundingClientRect().height).toBeCloseTo(44, 0);
    expect(addButton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(items, "::before").width).toBe("1px");
    expect(getComputedStyle(marker).backgroundColor).toBe(currentBackground);
    expect(runtimeCurrentDot.getBoundingClientRect().width).toBeCloseTo(10, 0);
    expect(runtimeCurrentDot.getBoundingClientRect().height).toBeCloseTo(10, 0);
    expect(deleteButton).not.toHaveClass("sc-course-numbered-list__delete");
    expect(Number.parseFloat(getComputedStyle(deleteButton).borderTopLeftRadius)).toBeCloseTo(
      controlRadius,
      1,
    );
    expect(getComputedStyle(deleteButton).opacity).toBe("1");
    expect(getComputedStyle(deleteButton).color).toBe(mutedColour);
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
    await waitForCondition(() => getComputedStyle(deleteButton).color === errorColour);
    expect(getComputedStyle(deleteButton).backgroundColor).toBe(errorBackground);

    await userEvent.unhover(deleteButton);
    deleteButton.focus();
    await waitForCondition(() => getComputedStyle(deleteButton).color === errorColour);

    deleteButton.setAttribute("aria-disabled", "true");
    await waitForCondition(
      () =>
        getComputedStyle(deleteButton).opacity === "0.45" &&
        getComputedStyle(deleteButton).color === mutedColour,
    );
    expect(document.activeElement).toBe(deleteButton);
    expect(getComputedStyle(deleteButton).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(deleteButton).cursor).toBe("not-allowed");
    expect(getComputedStyle(deleteButton).outlineStyle).toBe("solid");
    expect(host.querySelector(".sc-numbered-list")).toBeNull();
  });

  it("lets Course appearance recolour content without recolouring the App-owned delete action", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <NumberedListSpecimen label="Light numbered list" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <NumberedListSpecimen label="Dark numbered list" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelectorAll(".sc-course-numbered-list__item-content").length === 8,
    );
    const contents = host.querySelectorAll<HTMLElement>(".sc-course-numbered-list__item-content");
    const deletes = host.querySelectorAll<HTMLElement>(".sc-app-numbered-list-delete");

    expect(getComputedStyle(contents[0]!).color).not.toBe(getComputedStyle(contents[4]!).color);
    expect(getComputedStyle(deletes[0]!).color).toBe(getComputedStyle(deletes[1]!).color);
  });

  it("gives Pocket Atlas numbered lists an intentional title, spacing, and state hierarchy", async () => {
    const host = document.createElement("div");
    host.style.width = "320px";
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <CourseThemeProvider
          appearance="light"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <NumberedListSpecimen />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-numbered-list__title"));

    const title = requiredElement<HTMLElement>(host, ".sc-course-numbered-list__title");
    const titleContent = requiredElement<HTMLElement>(
      title,
      ".sc-course-numbered-list__title-content",
    );
    const icon = requiredElement<HTMLElement>(title, ".sc-course-numbered-list__header-icon");
    const markerSlot = requiredElement<HTMLElement>(host, ".sc-course-numbered-list__marker-slot");
    const marker = requiredElement<HTMLElement>(
      markerSlot,
      '.sc-course-numbered-list__marker[data-course-state="current"]',
    );
    const completed = requiredElement<HTMLElement>(
      host,
      '.sc-course-numbered-list__marker[data-course-state="completed"]',
    );
    const course = requiredElement<HTMLElement>(host, ".sc-course");

    expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
    expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(16);
    expect(icon.getBoundingClientRect().width).toBe(40);
    expect(titleContent.getBoundingClientRect().left - icon.getBoundingClientRect().right).toBe(14);
    expect(
      requiredElement<HTMLElement>(
        host,
        ".sc-course-numbered-list__item-content",
      ).getBoundingClientRect().left - marker.getBoundingClientRect().right,
    ).toBe(14);
    expect(getComputedStyle(marker).backgroundColor).toBe(
      computedColor(
        getComputedStyle(course).getPropertyValue("--sc-course-state-current-background"),
        "background",
      ),
    );
    expect(getComputedStyle(completed).backgroundColor).toBe(
      computedColor(getComputedStyle(course).getPropertyValue("--pa-mint"), "background"),
    );
    expect(host.scrollWidth).toBeLessThanOrEqual(host.clientWidth);
  });
});

function NumberedListSpecimen({ label = "Numbered list" }: { label?: string }) {
  return (
    <div className="sc-course-numbered-list">
      <section className="sc-course-numbered-list__section" aria-label={label}>
        <div className="sc-course-numbered-list__items">
          <div className="sc-course-numbered-list__title">
            <span className="sc-course-numbered-list__header-icon-slot">
              <button
                type="button"
                className="sc-app-numbered-list-icon-picker"
                aria-label="Choose numbered list icon"
              >
                <span className="sc-course-numbered-list__header-icon" aria-hidden>
                  #
                </span>
              </button>
            </span>
            <div className="sc-course-numbered-list__title-content">Launch checklist</div>
          </div>
          <div
            id="numbered-list-test-item-1"
            className="sc-course-numbered-list__item"
            role="listitem"
          >
            <div className="sc-course-numbered-list__item-shell">
              <span className="sc-course-numbered-list__marker-slot">
                <button
                  type="button"
                  className="sc-app-numbered-list-status-cycle"
                  aria-label="Set item 1 status. Current: in progress."
                >
                  <span
                    aria-hidden
                    className="sc-course-numbered-list__marker sc-course-numbered-list__marker--inProgress"
                    data-status="inProgress"
                    data-course-state="current"
                  >
                    <span className="sc-course-numbered-list__marker-dot" />
                  </span>
                </button>
              </span>
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
          <div
            id="numbered-list-test-item-2"
            className="sc-course-numbered-list__item"
            role="listitem"
          >
            <div className="sc-course-numbered-list__item-shell">
              <span className="sc-course-numbered-list__marker-slot">
                <span
                  className="sc-course-numbered-list__marker sc-course-numbered-list__marker--inProgress"
                  data-status="inProgress"
                  data-course-state="current"
                >
                  <span aria-hidden className="sc-course-numbered-list__marker-visual">
                    <span className="sc-course-numbered-list__marker-dot" />
                  </span>
                  <span className="sc-course-numbered-list__runtime-status">
                    Item 2, in progress
                  </span>
                </span>
              </span>
              <div className="sc-course-numbered-list__item-content">Verify the learner view</div>
            </div>
          </div>
          <div
            id="numbered-list-test-item-3"
            className="sc-course-numbered-list__item"
            role="listitem"
          >
            <div className="sc-course-numbered-list__item-shell">
              <span className="sc-course-numbered-list__marker-slot">
                <span
                  className="sc-course-numbered-list__marker sc-course-numbered-list__marker--neutral"
                  data-status="neutral"
                >
                  2
                </span>
              </span>
              <div className="sc-course-numbered-list__item-content">Prepare the learner view</div>
            </div>
          </div>
          <div
            id="numbered-list-test-item-4"
            className="sc-course-numbered-list__item"
            role="listitem"
          >
            <div className="sc-course-numbered-list__item-shell">
              <span className="sc-course-numbered-list__marker-slot">
                <span
                  className="sc-course-numbered-list__marker sc-course-numbered-list__marker--complete"
                  data-status="complete"
                  data-course-state="completed"
                >
                  ✓
                </span>
              </span>
              <div className="sc-course-numbered-list__item-content">Complete publication</div>
            </div>
          </div>
        </div>
        <div
          role="list"
          aria-label="Numbered list items"
          aria-owns="numbered-list-test-item-1 numbered-list-test-item-2 numbered-list-test-item-3 numbered-list-test-item-4"
          className="sc-course-numbered-list__semantic-list"
        />
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
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for Numbered List state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
