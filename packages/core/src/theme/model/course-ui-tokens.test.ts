import { describe, expect, it } from "vite-plus/test";

import { resolveCourseThemePreset } from "./course-theme-preset";
import { projectCourseThemeCss } from "./project-course-theme-css";
import { SCAFFOLD_FLOW_V1 } from "./presets/scaffold-flow/v1";

describe("Course UI tokens", () => {
  it.each([
    ["light", "#FFFFFF", "#303A8F", "#E6F6F0"],
    ["dark", "#111113", "#AEB5FF", "#12352D"],
  ] as const)("resolves the complete Scaffold Flow %s graph", (mode, page, primary, correct) => {
    const resolved = resolveCourseThemePreset(SCAFFOLD_FLOW_V1, mode);

    expect(resolved.preset).toEqual({ id: "scaffold-flow", revision: "1" });
    expect(resolved.mode).toBe(mode);
    expect(resolved.functional.color.background.page).toBe(page);
    expect(resolved.functional.color.action.primary.background.rest).toBe(primary);
    expect(resolved.functional.color.feedback.correct.background).toBe(correct);
    expect(resolved.functional.type.body.fontFamily).toBe('"Satoshi", sans-serif');
    expect(resolved.functional.type.code.fontFamily).toBe('"JetBrains Mono Variable", monospace');
    expect(resolved.component.button.primary.background.rest).toBe(primary);
    expect(resolved.component.choice.correct.background).toBe(correct);
    expect(resolved.component.progress.track.background).toBe(
      resolved.functional.color.background.surfaceMuted,
    );
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.functional.color)).toBe(true);
  });

  it("projects deterministic canonical Course properties without reference tokens", () => {
    const resolved = resolveCourseThemePreset(SCAFFOLD_FLOW_V1, "light");
    const first = projectCourseThemeCss(resolved.courseTokens);
    const second = projectCourseThemeCss(resolved.courseTokens);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      "--sc-course-color-background-page": "#FFFFFF",
      "--sc-course-type-heading-large-font-size": "clamp(1.75rem, 1.625rem + 0.5vw, 2.25rem)",
      "--sc-course-space-section-gap": "clamp(3.5rem, 2.5rem + 3vw, 5rem)",
      "--sc-course-radius-surface": "20px",
      "--sc-course-motion-duration-standard": "180ms",
      "--sc-course-button-primary-background-rest": "#303A8F",
      "--sc-course-navigation-position-current": "#303A8F",
    });
    expect(Object.keys(first).length).toBeGreaterThan(100);
    expect(Object.keys(first).every((name) => name.startsWith("--sc-course-"))).toBe(true);
    expect(Object.keys(first).some((name) => name.includes("reference"))).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
  });
});
