// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { SCAFFOLD_EDITORIAL_PRESET } from "@/theme/model/built-in-presets";
import { createThemeCatalogue } from "@/theme/model/theme-catalogue";
import { resolveCourseTheme } from "@/theme/model/resolve-course-theme";

import { CourseThemeScope } from "./CourseThemeScope";

afterEach(cleanup);

describe("CourseThemeScope", () => {
  it("applies every bounded token and the effective rendering attributes", () => {
    const resolvedTheme = resolveCourseTheme({
      theme: structuredClone({
        schemaVersion: 1,
        preset: {
          id: SCAFFOLD_EDITORIAL_PRESET.id,
          revision: SCAFFOLD_EDITORIAL_PRESET.revision,
        },
        values: SCAFFOLD_EDITORIAL_PRESET.values,
      }),
      catalogue: createThemeCatalogue(),
      mode: "dark",
    });

    render(
      <CourseThemeScope resolvedTheme={resolvedTheme}>
        <section data-testid="persisted-root" data-course-theme="scaffold-editorial" />
      </CourseThemeScope>,
    );

    const scope = screen.getByTestId("course-theme-scope");
    expect(scope).toHaveClass("sc-course-theme-scope");
    expect(scope).toHaveAttribute("data-course-color-mode", "dark");
    expect(scope).toHaveAttribute("data-course-theme-available", "true");
    expect(scope).toHaveAttribute("data-effective-course-theme", "scaffold-editorial");
    for (const [property, value] of Object.entries(resolvedTheme.cssTokens)) {
      expect(scope.style.getPropertyValue(property)).toBe(value);
    }
    expect(scope.style.colorScheme).toBe("dark");
    expect(scope.style.length).toBe(Object.keys(resolvedTheme.cssTokens).length + 1);
    expect(screen.getByTestId("persisted-root")).toHaveAttribute(
      "data-course-theme",
      "scaffold-editorial",
    );
  });

  it("shows fallback availability without replacing the persisted requested identity", () => {
    const resolvedTheme = resolveCourseTheme({
      theme: {
        schemaVersion: 1,
        preset: { id: "uk.ac.example.unavailable", revision: "1" },
        values: structuredClone(SCAFFOLD_EDITORIAL_PRESET.values),
      },
      catalogue: createThemeCatalogue(),
      mode: "light",
    });

    render(
      <CourseThemeScope resolvedTheme={resolvedTheme}>
        <section data-testid="persisted-root" data-course-theme="uk.ac.example.unavailable" />
      </CourseThemeScope>,
    );

    const scope = screen.getByTestId("course-theme-scope");
    expect(scope).toHaveAttribute("data-course-theme-available", "false");
    expect(scope).toHaveAttribute("data-effective-course-theme", "scaffold-default");
    expect(screen.getByTestId("persisted-root")).toHaveAttribute(
      "data-course-theme",
      "uk.ac.example.unavailable",
    );
  });
});
