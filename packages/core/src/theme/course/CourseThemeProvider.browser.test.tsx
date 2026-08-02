import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { CSSProperties } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import "@/styles/globals.css";

import { createDefaultPersistedCourseTheme } from "./default-course-theme";
import { CourseThemePortalBoundary, CourseThemeProvider } from "./CourseThemeProvider";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("CourseThemeProvider browser scope", () => {
  it.each(["light", "dark"] as const)(
    "applies the %s Course appearance without leaking into an App sibling",
    async (appearance) => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const { courseRoot, sibling, state } = await mountCourse(appearance);

      expect(courseRoot).toHaveClass("radix-themes", appearance, "sc-course");
      expect(getComputedStyle(courseRoot).fontFamily).toContain("Satoshi");
      expect(getComputedStyle(courseRoot).getPropertyValue("--heading-font-family")).toContain(
        "Satoshi",
      );
      const courseStyle = getComputedStyle(courseRoot);
      expect(courseStyle.getPropertyValue("--sc-course-state-correct-indicator").trim()).toBe(
        courseStyle.getPropertyValue("--green-9").trim(),
      );
      expect(getComputedStyle(state).backgroundColor).toBe(
        computedColor(courseStyle.getPropertyValue("--sc-course-state-correct-background")),
      );
      const indicator = requiredElement<HTMLElement>(state, ".sc-course-state__indicator");
      expect(getComputedStyle(indicator).color).toBe(
        computedColor(courseStyle.getPropertyValue("--sc-course-state-correct-indicator")),
      );

      expect(sibling).not.toHaveClass("radix-themes", "sc-course", appearance);
      expect(getComputedStyle(sibling).getPropertyValue("--default-font-family").trim()).toBe(
        "AppSiblingSentinel",
      );
      expect(getComputedStyle(sibling).getPropertyValue("--heading-font-family")).toBe("");
      expect(getComputedStyle(sibling).getPropertyValue("--code-font-family")).toBe("");
      expect(
        getComputedStyle(sibling).getPropertyValue("--sc-course-state-correct-indicator"),
      ).toBe("");
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        document.documentElement.clientWidth + 1,
      );
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("recreates identical computed Course scope for custom portal content", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { courseRoot, portalRoot } = await mountCourse("dark", true);

    expect(portalRoot.className).toBe(courseRoot.className);
    expect(portalRoot.getAttribute("data-accent-color")).toBe(
      courseRoot.getAttribute("data-accent-color"),
    );
    expect(portalRoot.getAttribute("data-gray-color")).toBe(
      courseRoot.getAttribute("data-gray-color"),
    );
    expect(getComputedStyle(portalRoot).fontFamily).toBe(getComputedStyle(courseRoot).fontFamily);
    const portalStyle = getComputedStyle(portalRoot);
    expect(portalStyle.getPropertyValue("--sc-course-state-warning-background").trim()).toBe(
      portalStyle.getPropertyValue("--amber-3").trim(),
    );
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    );
    expect(consoleError).not.toHaveBeenCalled();
  });
});

async function mountCourse(appearance: "light" | "dark", withPortal = false) {
  const host = document.createElement("div");
  const portalHost = document.createElement("div");
  host.style.width = "320px";
  document.body.append(host, portalHost);

  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <div style={{ "--default-font-family": "AppSiblingSentinel" } as CSSProperties}>
      <div data-testid="app-sibling">App sibling</div>
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance={appearance}>
        <div data-testid="course-content">
          <div data-course-state="correct">
            <span className="sc-course-state__indicator">Correct</span>
          </div>
        </div>
        {withPortal
          ? createPortal(
              <CourseThemePortalBoundary>
                <div data-testid="portal-content">Portal content</div>
              </CourseThemePortalBoundary>,
              portalHost,
            )
          : null}
      </CourseThemeProvider>
    </div>,
  );

  await waitForCondition(() => host.querySelector('[data-testid="course-content"]') !== null);

  const courseContent = requiredElement<HTMLElement>(host, '[data-testid="course-content"]');
  const courseRoot = courseContent.parentElement;
  if (!courseRoot) throw new Error("Expected a Course theme root");

  const sibling = requiredElement<HTMLElement>(host, '[data-testid="app-sibling"]');
  const state = requiredElement<HTMLElement>(host, '[data-course-state="correct"]');
  const portalContent = portalHost.querySelector<HTMLElement>('[data-testid="portal-content"]');
  const portalRoot = portalContent?.parentElement;
  if (withPortal && !portalRoot) throw new Error("Expected a custom portal Course theme root");

  return { courseRoot, portalRoot: portalRoot as HTMLElement, sibling, state };
}

function requiredElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

function computedColor(value: string): string {
  const sample = document.createElement("span");
  sample.style.color = value;
  document.body.append(sample);
  const color = getComputedStyle(sample).color;
  sample.remove();
  return color;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for browser render");
}
