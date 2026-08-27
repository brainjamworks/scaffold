import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/arrangements/layout/shared/view/layout.css";
import "@/editor/arrangements/layout/accordion/accordion.css";
import "@/editor/movement/view/movement-handles.css";
import "@/editor/suggestions/insert/ghost-add.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Accordion layout", () => {
  it("themes the open learner header as one surface instead of colouring only the caret target", async () => {
    const host = mountAccordion();
    await waitForCondition(() => host.querySelector('[data-testid="title-row"]') !== null);

    const row = requiredElement<HTMLElement>(host, '[data-testid="title-row"]');
    const title = requiredElement<HTMLElement>(host, '[data-testid="title"]');
    const trigger = requiredElement<HTMLButtonElement>(host, '[data-testid="trigger"]');
    const caret = requiredElement<SVGElement>(host, '[data-testid="caret"]');

    expect(getComputedStyle(row).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(title).display).toBe("block");
    expect(title.getBoundingClientRect().width).toBeGreaterThan(500);
    expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
    expect(getComputedStyle(trigger).paddingTop).toBe("0px");
    expect(getComputedStyle(caret).borderTopWidth).toBe("0px");
  });

  it("places the App-owned Section options target beside the learner disclosure target", async () => {
    const host = mountAccordion();
    await waitForCondition(() => host.querySelector('[data-testid="section-options"]') !== null);

    const trigger = requiredElement<HTMLButtonElement>(host, '[data-testid="trigger"]');
    const sectionOptions = requiredElement<HTMLButtonElement>(
      host,
      '[data-testid="section-options"]',
    );
    const triggerRect = trigger.getBoundingClientRect();
    const actionRect = sectionOptions.getBoundingClientRect();

    expect(getComputedStyle(sectionOptions).position).toBe("absolute");
    expect(actionRect.right).toBeLessThanOrEqual(triggerRect.left - 8);
    expect(
      Math.abs(actionRect.top + actionRect.height / 2 - (triggerRect.top + triggerRect.height / 2)),
    ).toBeLessThan(0.5);
  });

  it("keeps the authored default and borderless variants visually distinct", async () => {
    const defaultHost = mountAccordion("default");
    const borderlessHost = mountAccordion("borderless");
    await waitForCondition(
      () =>
        defaultHost.querySelector('[data-testid="section"]') !== null &&
        borderlessHost.querySelector('[data-testid="section"]') !== null,
    );

    const defaultRoot = requiredElement<HTMLElement>(defaultHost, ".sc-course-accordion__root");
    const borderlessRoot = requiredElement<HTMLElement>(
      borderlessHost,
      ".sc-course-accordion__root",
    );
    const defaultSection = requiredElement<HTMLElement>(defaultHost, '[data-testid="section"]');
    const borderlessSection = requiredElement<HTMLElement>(
      borderlessHost,
      '[data-testid="section"]',
    );

    expect(getComputedStyle(defaultRoot).gap).not.toBe("0px");
    expect(getComputedStyle(defaultSection).boxShadow).not.toBe("none");
    expect(getComputedStyle(borderlessRoot).gap).toBe("0px");
    expect(getComputedStyle(borderlessRoot).borderTopWidth).toBe("2px");
    expect(getComputedStyle(borderlessSection).borderLeftWidth).toBe("0px");
    expect(getComputedStyle(borderlessSection).boxShadow).toBe("none");
  });

  it("gives the learner header a deliberate hover state", async () => {
    const host = mountAccordion("default", false);
    await waitForCondition(() => host.querySelector('[data-testid="title-row"]') !== null);
    const row = requiredElement<HTMLElement>(host, '[data-testid="title-row"]');
    const restingBackground = getComputedStyle(row).backgroundColor;

    await userEvent.hover(row);
    await waitForCondition(() => getComputedStyle(row).backgroundColor !== restingBackground);

    expect(getComputedStyle(row).backgroundColor).not.toBe(restingBackground);
  });
});

function mountAccordion(variant: "default" | "borderless" = "default", editable = true) {
  const host = document.createElement("div");
  host.style.width = "720px";
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
        <div className={`sc-course-accordion${editable ? " sc-course-accordion--authoring" : ""}`}>
          <div className="sc-course-accordion__root" data-variant={variant}>
            <div className="sc-course-accordion__content">
              <div
                className="sc-layout-section sc-layout-section-authoring sc-course-accordion__section"
                data-authoring-frame="section"
                data-testid="section"
              >
                <div className="sc-course-accordion__section-frame" data-state="open">
                  {editable ? (
                    <button
                      aria-label="Move section"
                      className="sc-app-structure-movement-handle sc-app-structure-movement-handle--bare sc-app-compact-movement-handle sc-app-accordion-handle"
                      type="button"
                    >
                      <span className="sc-app-structure-movement-handle__visual sc-app-compact-movement-handle__visual" />
                    </button>
                  ) : null}
                  <div className="sc-course-accordion__section-content">
                    <div className="sc-course-accordion__title" data-state="open">
                      <div className="sc-course-accordion__title-row-shell">
                        <div
                          className="sc-course-accordion__title-row"
                          data-editable={editable ? "true" : undefined}
                          data-state="open"
                          data-testid="title-row"
                        >
                          <div
                            className="sc-course-accordion__title-content"
                            data-node-view-content=""
                            data-testid="title"
                          >
                            <div data-node-view-content-react="">Field notes</div>
                          </div>
                          <button
                            aria-expanded="true"
                            className="sc-course-accordion__trigger"
                            data-state="open"
                            data-testid="trigger"
                            type="button"
                          >
                            <svg
                              aria-hidden="true"
                              className="sc-course-accordion__caret"
                              data-testid="caret"
                              viewBox="0 0 24 24"
                            >
                              <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="sc-course-accordion__panel" data-state="open">
                      <div className="sc-layout-section__content sc-course-accordion__panel-content">
                        Section content
                      </div>
                    </div>
                  </div>
                  {editable ? (
                    <button
                      aria-label="Section options"
                      className="sc-layout-section-action-trigger sc-app-accordion-action"
                      data-testid="section-options"
                      type="button"
                    >
                      Options
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            {editable ? (
              <button
                className="sc-app-block-add sc-layout-add-ghost sc-layout-add-ghost--full-width sc-app-accordion-add"
                type="button"
              >
                Add section
              </button>
            ) : null}
          </div>
        </div>
      </CourseThemeProvider>
    </AppThemeProvider>,
  );
  return host;
}

function requiredElement<T extends Element>(host: ParentNode, selector: string): T {
  const element = host.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const timeoutAt = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for Accordion fixture");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
