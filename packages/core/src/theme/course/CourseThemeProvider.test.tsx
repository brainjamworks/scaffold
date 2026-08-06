// @vitest-environment happy-dom

import type { PersistedCourseTheme } from "@scaffold/contracts";
import { cleanup, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createDefaultPersistedCourseTheme } from "./default-course-theme";
import {
  CourseThemePortalBoundary,
  CourseThemeProvider,
  useCourseTheme,
} from "./CourseThemeProvider";

afterEach(cleanup);

describe("CourseThemeProvider", () => {
  it("applies the resolved Radix and Scaffold Course configuration", () => {
    render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
        <ResolvedThemeProbe />
      </CourseThemeProvider>,
    );

    const root = screen.getByTestId("course-content").parentElement;
    expect(root).toHaveClass(
      "radix-themes",
      "dark",
      "sc-course",
      "sc-course-theme-scaffold-flow-v1",
    );
    expect(root).toHaveAttribute("data-accent-color", "indigo");
    expect(root).toHaveAttribute("data-gray-color", "slate");
    expect(root).toHaveAttribute("data-radius", "large");
    expect(root).toHaveAttribute("data-scaling", "100%");
    expect(root).toHaveAttribute("data-panel-background", "solid");
    expect(root).toHaveAttribute("data-has-background", "true");
    expect(root?.style.getPropertyValue("--default-font-family")).toContain("Satoshi");
    expect(root?.style.getPropertyValue("--heading-font-family")).toContain("Satoshi");
    expect(root?.style.getPropertyValue("--code-font-family")).toContain("JetBrains Mono");
    expect(root?.style.getPropertyValue("--sc-course-state-correct-background")).toBe(
      "var(--green-3)",
    );
    expect(root?.style.getPropertyValue("--sc-course-state-locked-indicator")).toBe(
      "var(--gray-9)",
    );
    for (let series = 1; series <= 8; series += 1) {
      expect(root?.style.getPropertyValue(`--sc-course-data-series-${series}`)).not.toBe("");
    }
    expect(root?.style.length).toBe(61);

    const context = screen.getByTestId("resolved-theme");
    expect(context).toHaveTextContent("scaffold-flow@1/scaffold-indigo@1/dark");
    expect(context).toHaveAttribute("data-frozen", "true");
  });

  it.each([
    ["design", themeWithReference("design", "missing-design")],
    ["colourSystem", themeWithReference("colourSystem", "missing-colour-system")],
  ] as const)(
    "renders an explicit unavailable status for a missing %s revision",
    (missing, theme) => {
      render(
        <CourseThemeProvider theme={theme} appearance="light">
          <div data-testid="course-content" />
        </CourseThemeProvider>,
      );

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("data-course-theme-status", "unavailable");
      expect(status).toHaveAttribute("data-course-theme-missing", missing);
      expect(status).toHaveAttribute("data-course-theme-reference", `${theme[missing].id}@1`);
      expect(status).toHaveTextContent("Course theme unavailable");
      expect(screen.queryByTestId("course-content")).not.toBeInTheDocument();
      expect(document.querySelector(".sc-course")).toBeNull();
    },
  );

  it("applies the resolved scope directly to a custom portal host", () => {
    const portalContainer = document.createElement("div");
    document.body.append(portalContainer);

    render(
      <CourseThemeProvider theme={themeWithAuthorOverrides()} appearance="light">
        <div data-testid="course-content" />
        {createPortal(
          <CourseThemePortalBoundary>
            <div data-testid="portal-host">
              <span data-testid="portal-content" />
            </div>
          </CourseThemePortalBoundary>,
          portalContainer,
        )}
      </CourseThemeProvider>,
    );

    const courseRoot = screen.getByTestId("course-content").parentElement;
    const portalHost = screen.getByTestId("portal-host");
    expect(portalHost.parentElement).toBe(portalContainer);
    expect(screen.getByTestId("portal-content").parentElement).toBe(portalHost);
    expect(portalHost).toHaveClass(
      "radix-themes",
      "light",
      "sc-course",
      "sc-course-theme-scaffold-flow-v1",
    );
    expect(portalHost).toHaveAttribute("data-accent-color", "indigo");
    expect(courseRoot).toHaveAttribute("data-radius", "full");
    expect(portalHost).toHaveAttribute("data-radius", "full");
    expect(portalHost).toHaveAttribute("data-has-background", "false");
    for (const property of [
      "--default-font-family",
      "--heading-font-family",
      "--sc-course-author-heading-weight",
      "--sc-course-author-heading-text-transform",
      "--sc-course-author-density",
    ]) {
      expect(portalHost.style.getPropertyValue(property)).toBe(
        courseRoot?.style.getPropertyValue(property),
      );
    }
    expect(portalHost.style.getPropertyValue("--default-font-family")).toContain("Poppins");
    expect(portalHost.style.getPropertyValue("--heading-font-family")).toContain("Source Serif 4");
    expect(portalHost.style.getPropertyValue("--sc-course-author-heading-weight")).toBe("800");
    expect(portalHost.style.getPropertyValue("--sc-course-author-heading-text-transform")).toBe(
      "uppercase",
    );
    expect(portalHost.style.getPropertyValue("--sc-course-author-density")).toBe("1.125");
    expect(portalHost.style.getPropertyValue("--sc-course-state-warning-border")).toBe(
      "var(--amber-8)",
    );
  });

  it("fails clearly when a custom portal boundary has no Course provider", () => {
    expect(() => render(<CourseThemePortalBoundary>Portal</CourseThemePortalBoundary>)).toThrow(
      "CourseThemePortalBoundary must be used within a ready CourseThemeProvider",
    );
  });
});

function ResolvedThemeProbe() {
  const theme = useCourseTheme();

  return (
    <div data-testid="course-content">
      <span data-testid="resolved-theme" data-frozen={Object.isFrozen(theme)}>
        {theme.design.id}@{theme.design.revision}/{theme.colourSystem.id}@
        {theme.colourSystem.revision}/{theme.appearance}
      </span>
    </div>
  );
}

function themeWithReference(key: "design" | "colourSystem", id: string): PersistedCourseTheme {
  const theme = createDefaultPersistedCourseTheme();
  return {
    ...theme,
    [key]: { id, revision: "1" },
  };
}

function themeWithAuthorOverrides(): PersistedCourseTheme {
  const theme = createDefaultPersistedCourseTheme();
  return {
    ...theme,
    overrides: {
      typography: {
        defaultFontId: "scaffold-poppins",
        headingFontId: "scaffold-source-serif-4",
        headingWeight: 800,
        uppercaseHeadings: true,
      },
      design: { roundness: "full", density: "spacious" },
    },
  };
}
