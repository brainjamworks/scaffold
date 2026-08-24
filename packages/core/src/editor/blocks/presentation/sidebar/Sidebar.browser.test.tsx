import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "@/theme/course/designs/scaffold-flow/v1/sidebar.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "./SidebarAuthoringControls.css";
import "./Sidebar.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => root.unmount());
  document.body.replaceChildren();
});

describe("Sidebar responsive ownership", () => {
  it("keeps essential Sidebar geometry usable without a Course recipe", async () => {
    const host = mount(
      <AppThemeProvider appearance="light">
        <main>
          <SidebarSpecimen id="core" mode="authoring" />
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector('[data-specimen="core"]'));

    const sidebar = requiredElement<HTMLElement>(host, '[data-specimen="core"]');
    const layout = requiredElement<HTMLElement>(sidebar, ".sc-course-sidebar__layout");
    const label = requiredElement<HTMLElement>(sidebar, ".sc-course-sidebar__label");
    const title = requiredElement<HTMLElement>(sidebar, ".sc-course-sidebar__title");
    const trigger = requiredElement<HTMLElement>(sidebar, ".sc-app-sidebar-icon-trigger");

    expect(getComputedStyle(layout).display).toBe("grid");
    expect(getComputedStyle(layout).gridTemplateColumns).not.toBe("none");
    expect(getComputedStyle(label).gridColumnStart).toBe("2");
    expect(getComputedStyle(title).gridColumnStart).toBe("1");
    expect(getComputedStyle(title).gridColumnEnd).toBe("-1");
    expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it("supplies a complete Pocket Atlas recipe without reskinning App controls", async () => {
    await page.viewport(1000, 900);
    const host = mount(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={pocketAtlasTheme()} appearance="light">
            <SidebarSpecimen id="pocket-authoring" mode="authoring" />
            <SidebarSpecimen id="pocket-runtime" mode="runtime" />
            <SidebarSpecimen id="pocket-narrow" mode="runtime" width={320} />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-course-sidebar").length === 3);

    const authoring = requiredElement<HTMLElement>(host, '[data-specimen="pocket-authoring"]');
    const runtime = requiredElement<HTMLElement>(host, '[data-specimen="pocket-runtime"]');
    const narrow = requiredElement<HTMLElement>(host, '[data-specimen="pocket-narrow"]');
    const layout = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__layout");
    const icon = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__icon-chip");
    const label = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__label");
    const title = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__title");
    const body = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__body-content");
    const trigger = requiredElement<HTMLElement>(authoring, ".sc-app-sidebar-icon-trigger");
    const surface = requiredElement<HTMLElement>(runtime, ".sc-course-sidebar__surface");

    expect(getComputedStyle(layout).display).toBe("grid");
    expect(icon.getBoundingClientRect().width).toBeCloseTo(44, 0);
    expect(icon.getBoundingClientRect().height).toBeCloseTo(44, 0);
    expect(getComputedStyle(label).fontFamily).toContain("Silkscreen");
    expect(getComputedStyle(label).color).toBe("rgb(81, 72, 121)");
    expect(getComputedStyle(title).fontFamily).toContain("Silkscreen");
    expect(Number.parseFloat(getComputedStyle(title).fontSize)).toBeGreaterThan(
      Number.parseFloat(getComputedStyle(label).fontSize),
    );
    expect(getComputedStyle(body).fontFamily).toContain("Atkinson Hyperlegible");
    expect(getComputedStyle(surface).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(trigger.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(trigger).backgroundColor).toBe("rgb(255, 255, 255)");
    expect(trigger.classList.contains("sc-course-sidebar__icon-chip")).toBe(false);
    expect(runtime.querySelector('[class*="sc-app-sidebar"]')).toBeNull();
    expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("reserves App target width without consuming the Course recipe gap", async () => {
    const host = mount(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <SidebarSpecimen id="flow-authoring" mode="authoring" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector('[data-specimen="flow-authoring"]'));

    const sidebar = requiredElement<HTMLElement>(host, '[data-specimen="flow-authoring"]');
    const trigger = requiredElement<HTMLElement>(sidebar, ".sc-app-sidebar-icon-trigger");
    const label = requiredElement<HTMLElement>(sidebar, ".sc-course-sidebar__label");
    const separation = label.getBoundingClientRect().left - trigger.getBoundingClientRect().right;

    expect(separation).toBeGreaterThanOrEqual(8);
  });
});

function SidebarSpecimen({
  id,
  mode,
  width = 720,
}: {
  id: string;
  mode: "authoring" | "runtime";
  width?: number;
}) {
  return (
    <section data-specimen={id} className="sc-course-sidebar" style={{ width }}>
      <aside className="sc-course-sidebar__surface">
        <div className="sc-course-sidebar__layout">
          <div className="sc-course-sidebar__icon-slot">
            {mode === "authoring" ? (
              <button type="button" aria-label="Choose sidebar icon" className="sc-app-sidebar-icon-trigger">
                <span className="sc-app-sidebar-icon-trigger__glyph">i</span>
              </button>
            ) : (
              <span aria-hidden className="sc-course-sidebar__icon-chip">
                <span className="sc-course-sidebar__icon-glyph">i</span>
              </span>
            )}
          </div>
          <div className="sc-course-sidebar__slots">
            <div className="sc-course-sidebar__label">
              <p>Field note</p>
            </div>
            <div role="heading" aria-level={3} className="sc-course-sidebar__title">
              <p>Read the landscape</p>
            </div>
            <div className="sc-course-sidebar__body">
              <div className="sc-course-sidebar__body-content">
                <p>Use the map as evidence, not decoration.</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </section>
  );
}

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(node);
  return host;
}

function pocketAtlasTheme() {
  return {
    schemaVersion: 1 as const,
    design: { id: "pocket-atlas", revision: "1" },
    colourSystem: { id: "pocket-atlas", revision: "1" },
    overrides: {},
  };
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Sidebar state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
