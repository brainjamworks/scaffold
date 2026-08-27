import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/arrangements/layout/shared/view/layout.css";
import "@/editor/suggestions/insert/ghost-add.css";
import "@/editor/arrangements/layout/paginated/paginated.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas paginated layout", () => {
  it.each(["light", "dark"] as const)(
    "distinguishes learner pagination states in %s mode",
    async (appearance) => {
      const host = mountPaginated(appearance);
      await waitForCondition(() => host.querySelector('[data-testid="active-page"]') !== null);

      const activePage = requiredElement<HTMLButtonElement>(host, '[data-testid="active-page"]');
      const inactivePage = requiredElement<HTMLButtonElement>(
        host,
        '[data-testid="inactive-page"]',
      );
      const previous = requiredElement<HTMLButtonElement>(host, '[data-testid="previous"]');
      const next = requiredElement<HTMLButtonElement>(host, '[data-testid="next"]');
      const activeStyle = getComputedStyle(activePage);
      const inactiveStyle = getComputedStyle(inactivePage);
      const previousStyle = getComputedStyle(previous);
      const nextStyle = getComputedStyle(next);

      expect(activeStyle.borderTopWidth).toBe("2px");
      expect(inactiveStyle.borderTopWidth).toBe("2px");
      expect(activeStyle.fontFamily).toContain("Silkscreen");
      expect(activeStyle.backgroundColor).not.toBe(inactiveStyle.backgroundColor);
      expect(previousStyle.backgroundColor).not.toBe(nextStyle.backgroundColor);
      expect(previousStyle.boxShadow).toBe("none");
      expect(previousStyle.cursor).toBe("default");
    },
  );

  it("gives enabled learner pagination a deliberate hover state", async () => {
    const host = mountPaginated("light");
    await waitForCondition(() => host.querySelector('[data-testid="inactive-page"]') !== null);
    const inactivePage = requiredElement<HTMLButtonElement>(host, '[data-testid="inactive-page"]');
    const restingBackground = getComputedStyle(inactivePage).backgroundColor;

    await userEvent.hover(inactivePage);
    await waitForCondition(
      () => getComputedStyle(inactivePage).backgroundColor !== restingBackground,
    );

    expect(getComputedStyle(inactivePage).backgroundColor).not.toBe(restingBackground);
  });

  it("keeps the keyboard focus treatment inside the clipped navigation lane", async () => {
    const host = mountPaginated("light");
    await waitForCondition(() => host.querySelector('[data-testid="active-page"]') !== null);

    await userEvent.tab();

    const activePage = requiredElement<HTMLButtonElement>(host, '[data-testid="active-page"]');
    const style = getComputedStyle(activePage);
    expect(document.activeElement).toBe(activePage);
    expect(style.outlineStyle).toBe("solid");
    expect(Number.parseFloat(style.outlineOffset)).toBeLessThan(0);
  });

  it("spaces the App-owned Add page control evenly with the learner page controls", async () => {
    const host = mountPaginated("light");
    await waitForCondition(() => host.querySelector('[data-testid="add-page"]') !== null);

    const activePage = requiredElement<HTMLButtonElement>(host, '[data-testid="active-page"]');
    const inactivePage = requiredElement<HTMLButtonElement>(host, '[data-testid="inactive-page"]');
    const addPage = requiredElement<HTMLButtonElement>(host, '[data-testid="add-page"]');
    const pageGap =
      inactivePage.getBoundingClientRect().left - activePage.getBoundingClientRect().right;
    const addGap =
      addPage.getBoundingClientRect().left - inactivePage.getBoundingClientRect().right;

    expect(addGap).toBeCloseTo(pageGap);
  });

  it("keeps the App-owned Section options control out of the page content flow", async () => {
    const host = mountPaginated("light");
    await waitForCondition(() => host.querySelector('[data-testid="section-options"]') !== null);

    const sectionOptions = requiredElement<HTMLButtonElement>(
      host,
      '[data-testid="section-options"]',
    );
    const actionStyle = getComputedStyle(sectionOptions);

    expect(actionStyle.position).toBe("absolute");
    expect(actionStyle.top).toBe("12px");
    expect(actionStyle.insetInlineEnd).toBe("8px");
  });
});

function mountPaginated(appearance: "light" | "dark") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <AppThemeProvider appearance={appearance}>
      <CourseThemeProvider
        appearance={appearance}
        theme={{
          schemaVersion: 1,
          design: { id: "pocket-atlas", revision: "1" },
          colourSystem: { id: "pocket-atlas", revision: "1" },
          overrides: {},
        }}
      >
        <div className="ProseMirror">
          <div className="sc-course-paginated">
            <nav aria-label="Pages" className="sc-course-paginated__nav">
              <button
                aria-label="Previous page"
                className="sc-course-paginated__step sc-course-paginated__step--previous"
                data-testid="previous"
                disabled
                type="button"
              >
                Previous
              </button>
              <div className="sc-course-paginated__lane">
                <ol className="sc-course-paginated__pages">
                  <li className="sc-course-paginated__page-item">
                    <button
                      aria-current="page"
                      className="sc-course-paginated__page"
                      data-state="active"
                      data-testid="active-page"
                      type="button"
                    >
                      1
                    </button>
                  </li>
                  <li className="sc-course-paginated__page-item">
                    <button
                      className="sc-course-paginated__page"
                      data-state="inactive"
                      data-testid="inactive-page"
                      type="button"
                    >
                      2
                    </button>
                  </li>
                </ol>
                <button
                  aria-label="Add page"
                  className="sc-app-block-add sc-app-paginated-add"
                  data-testid="add-page"
                  type="button"
                >
                  +
                </button>
              </div>
              <button
                aria-label="Next page"
                className="sc-course-paginated__step sc-course-paginated__step--next"
                data-testid="next"
                type="button"
              >
                Next
              </button>
              <span className="sc-course-paginated__count">1/2</span>
            </nav>
            <div className="sc-course-paginated__panel">
              <button
                aria-label="Section options"
                className="sc-layout-section-action-trigger sc-app-paginated-action"
                data-testid="section-options"
                type="button"
              >
                Options
              </button>
              <div className="sc-course-paginated__page-content">Page content</div>
            </div>
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
    if (Date.now() >= timeoutAt) throw new Error("Timed out waiting for Paginated fixture");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
