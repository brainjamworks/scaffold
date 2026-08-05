import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import type { CSSProperties } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { PersistedCourseTheme } from "@scaffold/contracts";

import "@/styles/globals.css";
import "@/editor/surfaces/view/region.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

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

  it("recreates identical non-default Course scope without leaking into an App sibling", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { courseRoot, portalRoot, sibling } = await mountCourse(
      "dark",
      true,
      themeWithAuthorOverrides(),
    );

    expect(portalRoot.className).toBe(courseRoot.className);
    expect(portalRoot.getAttribute("data-accent-color")).toBe(
      courseRoot.getAttribute("data-accent-color"),
    );
    expect(portalRoot.getAttribute("data-gray-color")).toBe(
      courseRoot.getAttribute("data-gray-color"),
    );
    expect(courseRoot).toHaveAttribute("data-radius", "full");
    expect(portalRoot).toHaveAttribute("data-radius", "full");
    expect(getComputedStyle(portalRoot).fontFamily).toBe(getComputedStyle(courseRoot).fontFamily);
    expect(getComputedStyle(courseRoot).fontFamily).toContain("Poppins");
    const courseStyle = getComputedStyle(courseRoot);
    const portalStyle = getComputedStyle(portalRoot);
    for (const property of [
      "--heading-font-family",
      "--sc-course-author-heading-weight",
      "--sc-course-author-heading-text-transform",
      "--sc-course-author-density",
    ]) {
      expect(portalStyle.getPropertyValue(property).trim()).toBe(
        courseStyle.getPropertyValue(property).trim(),
      );
    }
    expect(courseStyle.getPropertyValue("--heading-font-family")).toContain("Source Serif 4");
    expect(courseStyle.getPropertyValue("--sc-course-author-heading-weight").trim()).toBe("800");
    expect(courseStyle.getPropertyValue("--sc-course-author-heading-text-transform").trim()).toBe(
      "uppercase",
    );
    expect(courseStyle.getPropertyValue("--sc-course-author-density").trim()).toBe("1.125");
    expect(portalRoot).toHaveAttribute("data-has-background", "false");
    expect(portalStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(portalStyle.getPropertyValue("--sc-course-state-warning-background").trim()).toBe(
      portalStyle.getPropertyValue("--amber-3").trim(),
    );
    expect(sibling).not.toHaveClass("radix-themes", "sc-course", "dark");
    expect(sibling).not.toHaveAttribute("data-radius");
    expect(sibling).not.toHaveAttribute("data-accent-color");
    const siblingStyle = getComputedStyle(sibling);
    expect(siblingStyle.getPropertyValue("--default-font-family").trim()).toBe(
      "AppSiblingSentinel",
    );
    expect(siblingStyle.getPropertyValue("--heading-font-family")).toBe("");
    expect(siblingStyle.getPropertyValue("--sc-course-author-density")).toBe("");
    expect(
      siblingStyle.getPropertyValue("--sc-course-author-heading-text-transform"),
    ).toBe("");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth + 1,
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("applies approved typography and density only to semantic Course roles", async () => {
    const { courseRoot, sibling } = await mountCourse(
      "light",
      false,
      themeWithAuthorOverrides(),
    );
    const body = requiredElement<HTMLElement>(courseRoot, '[data-testid="body-reading"]');
    const strong = requiredElement<HTMLElement>(courseRoot, '[data-testid="strong-reading"]');
    const explicitSize = requiredElement<HTMLElement>(
      courseRoot,
      '[data-testid="explicit-size"]',
    );
    const heading = requiredElement<HTMLElement>(courseRoot, '[data-testid="course-heading"]');
    const runtimeHeading = requiredElement<HTMLElement>(
      courseRoot,
      '[data-testid="runtime-heading"]',
    );
    const region = requiredElement<HTMLElement>(courseRoot, '[data-testid="course-region"]');

    const bodyStyle = getComputedStyle(body);
    expect(bodyStyle.fontSize).toBe("17.6px");
    expect(bodyStyle.fontWeight).toBe("600");
    expect(Number.parseFloat(bodyStyle.lineHeight)).toBeCloseTo(29.92, 2);
    expect(Number.parseInt(getComputedStyle(strong).fontWeight, 10)).toBeGreaterThan(600);
    expect(getComputedStyle(explicitSize).fontSize).toBe("24px");

    for (const semanticHeading of [heading, runtimeHeading]) {
      const headingStyle = getComputedStyle(semanticHeading);
      expect(headingStyle.fontWeight).toBe("800");
      expect(Number.parseFloat(headingStyle.lineHeight)).toBeCloseTo(
        Number.parseFloat(headingStyle.fontSize) * 1.35,
        2,
      );
      expect(Number.parseFloat(headingStyle.letterSpacing)).toBeCloseTo(
        Number.parseFloat(headingStyle.fontSize) * 0.04,
        2,
      );
      expect(headingStyle.textTransform).toBe("uppercase");
      expect(semanticHeading).toHaveTextContent("Stored heading text");
    }

    expect(getComputedStyle(region).gap).toBe("13.5px");
    expect(getComputedStyle(sibling).fontSize).toBe("16px");
    expect(getComputedStyle(sibling).textTransform).toBe("none");
  });
});

async function mountCourse(
  appearance: "light" | "dark",
  withPortal = false,
  theme: PersistedCourseTheme = createDefaultPersistedCourseTheme(),
) {
  const host = document.createElement("div");
  const portalHost = document.createElement("div");
  host.style.width = "320px";
  document.body.append(host, portalHost);

  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <div style={{ "--default-font-family": "AppSiblingSentinel" } as CSSProperties}>
      <div data-testid="app-sibling">App sibling</div>
      <CourseThemeProvider theme={theme} appearance={appearance}>
        <div data-testid="course-content">
          <div className="ProseMirror">
            <div data-surface-content="">
              <div data-node-view-content-react="">
                <p data-testid="body-reading">
                  Course body <strong data-testid="strong-reading">strong text</strong>{" "}
                  <span data-testid="explicit-size" style={{ fontSize: "24px" }}>
                    explicit size
                  </span>
                </p>
                <h2 data-testid="course-heading">Stored heading text</h2>
                <p className="sc-runtime-rich-text-heading" data-testid="runtime-heading">
                  Stored heading text
                </p>
              </div>
            </div>
          </div>
          <div className="sc-region" data-testid="course-region">
            <span>First item</span>
            <span>Second item</span>
          </div>
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
  const portalRoot = portalContent;
  if (withPortal && !portalRoot) throw new Error("Expected a custom portal Course theme root");

  return { courseRoot, portalRoot: portalRoot as HTMLElement, sibling, state };
}

function themeWithAuthorOverrides(): PersistedCourseTheme {
  const theme = createDefaultPersistedCourseTheme();
  return {
    ...theme,
    overrides: {
      typography: {
        defaultFontId: "scaffold-poppins",
        headingFontId: "scaffold-source-serif-4",
        bodyWeight: 600,
        headingWeight: 800,
        courseTextSize: "larger",
        bodyLineSpacing: "relaxed",
        headingLineSpacing: "relaxed",
        headingLetterSpacing: "wide",
        uppercaseHeadings: true,
      },
      design: { roundness: "full", density: "spacious" },
    },
  };
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
