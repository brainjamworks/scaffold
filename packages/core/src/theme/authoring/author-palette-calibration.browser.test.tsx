import { useMemo, useState, type CSSProperties } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { ChoiceAnswerItem } from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import "@/editor/blocks/assessment/shared/chrome/assessment-problem-shell.css";
import "@/styles/globals.css";
import { createThemeCatalogue } from "@/theme/model/theme-catalogue";
import {
  resolveCourseTheme,
  type ResolvedCourseTheme,
  type ScaffoldColorMode,
} from "@/theme/model/resolve-course-theme";
import { CourseThemeScope } from "@/theme/presentation/CourseThemeScope";
import { PopoverSurface } from "@/ui/components/PopoverSurface/PopoverSurface";

type CandidateSlot =
  | "background"
  | "surface"
  | "bodyText"
  | "headingText"
  | "primary"
  | "secondary"
  | "accent1"
  | "accent2"
  | "accent3"
  | "accent4"
  | "link";

type CandidatePalette = Record<CandidateSlot, string>;

const CANDIDATE_LABELS: Readonly<Record<CandidateSlot, string>> = {
  background: "Course background",
  surface: "Content surface",
  bodyText: "Body text",
  headingText: "Heading text",
  primary: "Primary action",
  secondary: "Secondary",
  accent1: "Accent 1",
  accent2: "Accent 2",
  accent3: "Accent 3",
  accent4: "Accent 4",
  link: "Link",
};

const AWKWARD_PALETTES = {
  "Pale yellow": {
    primary: "#fff2a3",
    secondary: "#ead45f",
    accent1: "#bda93f",
    accent2: "#887925",
    accent3: "#5c531e",
    accent4: "#393517",
    link: "#655900",
  },
  "Saturated red": {
    primary: "#ff0000",
    secondary: "#b50000",
    accent1: "#ff6257",
    accent2: "#7f1d1d",
    accent3: "#ff8a00",
    accent4: "#7c3aed",
    link: "#c00000",
  },
  "Deep navy": {
    primary: "#071a52",
    secondary: "#18377f",
    accent1: "#3158a6",
    accent2: "#5575bd",
    accent3: "#7c96d0",
    accent4: "#a6b8df",
    link: "#244aa0",
  },
  Beige: {
    primary: "#c9b79c",
    secondary: "#a18d70",
    accent1: "#77634c",
    accent2: "#8c7660",
    accent3: "#dbcdb9",
    accent4: "#5e5143",
    link: "#6f5636",
  },
} as const;

describe("author palette calibration matrix", () => {
  it("renders candidate publication roles against every preset and mode", async () => {
    await page.viewport(1_440, 1_000);
    const rendered = await renderBrowserReact(<AuthorPaletteCalibration />);

    try {
      await waitForCondition(
        () => document.querySelectorAll("[data-calibration-preview]").length === 6,
      );

      expect(document.querySelectorAll('input[type="color"]')).toHaveLength(11);
      expect(document.querySelectorAll("[data-calibration-preview]")).toHaveLength(6);
      expect(document.querySelectorAll('[data-tone="hint"]')).toHaveLength(6);
      expect(document.querySelectorAll('[data-tone="feedback"]')).toHaveLength(6);
      expect(document.querySelectorAll(".sc-choice-answer--correct")).toHaveLength(6);
      expect(document.querySelectorAll(".sc-choice-answer--incorrect")).toHaveLength(6);
      expect(document.querySelectorAll("[data-chart-series]")).toHaveLength(48);
    } finally {
      await rendered.unmount();
    }
  });

  it("keeps an entered creative anchor exact without changing preset-owned statuses", async () => {
    await page.viewport(1_440, 1_000);
    const rendered = await renderBrowserReact(<AuthorPaletteCalibration />);

    try {
      const firstPreview = await waitForElement<HTMLElement>(
        document,
        "[data-calibration-preview]",
      );
      const firstScope = firstPreview.closest<HTMLElement>(".sc-course-theme-scope");
      if (!firstScope) throw new Error("Expected calibration preview inside a course theme scope");
      const successBefore = firstScope.style.getPropertyValue(
        "--sc-course-color-success",
      );
      const errorBefore = firstScope.style.getPropertyValue("--sc-course-color-error");

      requireElement<HTMLButtonElement>(
        document,
        'button[aria-label="Apply Pale yellow calibration palette"]',
      ).click();

      await waitForCondition(
        () =>
          firstScope.style.getPropertyValue("--sc-course-color-primary") === "#fff2a3",
      );

      expect(firstScope.style.getPropertyValue("--sc-course-color-primary")).toBe(
        "#fff2a3",
      );
      expect(firstScope.style.getPropertyValue("--sc-course-color-success")).toBe(
        successBefore,
      );
      expect(firstScope.style.getPropertyValue("--sc-course-color-error")).toBe(
        errorBefore,
      );
    } finally {
      await rendered.unmount();
    }
  });
});

function AuthorPaletteCalibration() {
  const catalogue = useMemo(() => createThemeCatalogue(), []);
  const [overrides, setOverrides] = useState<Partial<CandidatePalette>>({});
  const baseline = candidatePaletteFromResolved(
    resolveCourseTheme({
      theme: {
        schemaVersion: 1,
        preset: {
          id: catalogue.defaultPreset.id,
          revision: catalogue.defaultPreset.revision,
        },
        values: structuredClone(catalogue.defaultPreset.values),
      },
      catalogue,
      mode: "light",
    }),
  );
  const palette = { ...baseline, ...overrides };

  return (
    <main
      aria-label="Author palette calibration"
      style={{
        minHeight: "100vh",
        padding: 24,
        background: "#e4e4e7",
        color: "#18181b",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ display: "grid", gap: 16, marginBottom: 24 }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>Phase 11 calibration fixture</p>
          <h1 style={{ margin: "4px 0 0" }}>Author publication palette</h1>
        </div>

        <div
          aria-label="Candidate author palette controls"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(140px, 1fr))",
            gap: 10,
          }}
        >
          {(Object.keys(CANDIDATE_LABELS) as CandidateSlot[]).map((slot) => (
            <label
              key={slot}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr",
                alignItems: "center",
                gap: 8,
                padding: 8,
                borderRadius: 8,
                background: "#ffffff",
              }}
            >
              <input
                type="color"
                aria-label={CANDIDATE_LABELS[slot]}
                value={palette[slot]}
                onChange={(event) =>
                  setOverrides((current) => ({
                    ...current,
                    [slot]: event.currentTarget.value,
                  }))
                }
                style={{ width: 32, height: 32, padding: 0, border: 0 }}
              />
              <span style={{ fontSize: 12 }}>
                {CANDIDATE_LABELS[slot]}
                <br />
                <code>{palette[slot]}</code>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {Object.entries(AWKWARD_PALETTES).map(([label, values]) => (
            <button
              key={label}
              type="button"
              aria-label={`Apply ${label} calibration palette`}
              onClick={() => setOverrides(values)}
            >
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setOverrides({})}>
            Reset
          </button>
        </div>
      </header>

      <section
        aria-label="Preset and mode matrix"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 20,
        }}
      >
        {catalogue.presets.flatMap((preset) =>
          (["light", "dark"] as const).map((mode) => {
            const resolved = resolveCourseTheme({
              theme: {
                schemaVersion: 1,
                preset: { id: preset.id, revision: preset.revision },
                values: structuredClone(preset.values),
              },
              catalogue,
              mode,
            });
            return (
              <CalibrationPreview
                key={`${preset.id}-${mode}`}
                label={preset.label}
                mode={mode}
                resolved={resolved}
                palette={palette}
              />
            );
          }),
        )}
      </section>
    </main>
  );
}

function CalibrationPreview({
  label,
  mode,
  resolved,
  palette,
}: {
  label: string;
  mode: ScaffoldColorMode;
  resolved: ResolvedCourseTheme;
  palette: CandidatePalette;
}) {
  const cssTokens = {
    ...resolved.cssTokens,
    "--sc-course-color-background": palette.background,
    "--sc-course-color-canvas": palette.background,
    "--sc-course-color-surface": palette.surface,
    "--sc-course-color-text": palette.bodyText,
    "--sc-course-color-primary": palette.primary,
    "--sc-course-color-secondary": palette.secondary,
    "--sc-course-color-accent": palette.accent1,
    "--sc-course-data-series-1": palette.primary,
    "--sc-course-data-series-2": palette.secondary,
    "--sc-course-data-series-3": palette.accent1,
    "--sc-course-data-series-4": palette.accent2,
    "--sc-course-data-series-5": palette.accent3,
    "--sc-course-data-series-6": palette.accent4,
  } satisfies ResolvedCourseTheme["cssTokens"];
  const previewTheme = { ...resolved, cssTokens };
  const customStyle = {
    "--calibration-heading": palette.headingText,
    "--calibration-link": palette.link,
  } as CSSProperties;

  return (
    <CourseThemeScope resolvedTheme={previewTheme}>
      <article
        data-calibration-preview={`${resolved.effectivePresetId}-${mode}`}
        style={{
          ...customStyle,
          minHeight: 760,
          padding: 20,
          background: "var(--color-background)",
          color: "var(--color-text-primary)",
          borderRadius: 12,
          boxShadow: "0 8px 24px #0000001f",
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
            {label} · {mode}
          </p>
          <h2 style={{ margin: "4px 0", color: "var(--calibration-heading)" }}>
            A considered course heading
          </h2>
          <p style={{ margin: 0 }}>
            Body copy should remain comfortable across the foundation.{" "}
            <a href="#calibration" style={{ color: "var(--calibration-link)" }}>
              This link is independently observable.
            </a>
          </p>
        </header>

        <section
          style={{
            display: "grid",
            gap: 12,
            padding: 16,
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            background: "var(--color-surface)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              style={{
                padding: "8px 14px",
                color: "var(--color-primary-foreground)",
                background: "var(--color-primary)",
                border: 0,
                borderRadius: 999,
              }}
            >
              Primary action
            </button>
            <button
              type="button"
              style={{
                padding: "8px 14px",
                color: "var(--color-secondary-foreground)",
                background: "var(--color-secondary)",
                border: 0,
                borderRadius: 999,
              }}
            >
              Secondary
            </button>
          </div>

          <div
            aria-label="Candidate creative accents"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
          >
            {(["accent1", "accent2", "accent3", "accent4"] as const).map((slot) => (
              <div
                key={slot}
                style={{
                  minHeight: 52,
                  padding: 8,
                  borderRadius: 8,
                  background: palette[slot],
                }}
              >
                {CANDIDATE_LABELS[slot]}
              </div>
            ))}
          </div>

          <div
            aria-label="Semantic status families"
            style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}
          >
            {(["info", "success", "warning", "error"] as const).map((state) => (
              <div
                key={state}
                data-status-family={state}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  color: `var(--color-${state}-text)`,
                  background: `var(--color-${state}-bg)`,
                  border: `1px solid var(--color-${state})`,
                }}
              >
                {state}
              </div>
            ))}
          </div>

          <div className="sc-assessment-shell" style={{ display: "grid", gap: 8 }}>
            <ChoiceAnswerItem
              id={`${label}-${mode}-correct`}
              inputType="radio"
              isCorrect
              isEditable={false}
              state="correct"
              checked
              submitted
              disabled
              onSelect={() => {}}
              onToggleCorrect={() => {}}
              onDelete={() => {}}
            >
              Correct assessment state
            </ChoiceAnswerItem>
            <ChoiceAnswerItem
              id={`${label}-${mode}-incorrect`}
              inputType="radio"
              isCorrect={false}
              isEditable={false}
              state="incorrect"
              checked
              submitted
              disabled
              onSelect={() => {}}
              onToggleCorrect={() => {}}
              onDelete={() => {}}
            >
              Incorrect assessment state
            </ChoiceAnswerItem>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <PopoverSurface title="Hint" tone="hint">
              Hint presentation remains in the warning family.
            </PopoverSurface>
            <PopoverSurface title="Feedback" tone="feedback">
              Feedback currently demonstrates its mapped semantic family.
            </PopoverSurface>
          </div>

          <div
            aria-label="Resolved chart palette"
            style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}
          >
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                data-chart-series={index + 1}
                title={`Series ${index + 1}`}
                style={{
                  height: 44,
                  borderRadius: 4,
                  background: `var(--sc-course-data-series-${index + 1})`,
                }}
              />
            ))}
          </div>

          <pre style={{ margin: 0 }}>
            <code>const theme = "course-owned";</code>
          </pre>
        </section>
      </article>
    </CourseThemeScope>
  );
}

function candidatePaletteFromResolved(resolved: ResolvedCourseTheme): CandidatePalette {
  return {
    background: toHexInput(resolved.palette.background, "#ffffff"),
    surface: toHexInput(resolved.palette.surface, "#ffffff"),
    bodyText: toHexInput(resolved.palette.text, "#18181b"),
    headingText: toHexInput(resolved.palette.text, "#18181b"),
    primary: toHexInput(resolved.palette.dataSeries[0], "#161d77"),
    secondary: toHexInput(resolved.palette.dataSeries[1], "#f43a57"),
    accent1: toHexInput(resolved.palette.dataSeries[2], "#00ba92"),
    accent2: toHexInput(resolved.palette.dataSeries[3], "#5b6790"),
    accent3: toHexInput(resolved.palette.dataSeries[4], "#f47398"),
    accent4: toHexInput(resolved.palette.dataSeries[5], "#33bda5"),
    link: toHexInput(resolved.palette.dataSeries[0], "#161d77"),
  };
}

function toHexInput(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForElement<T extends Element>(
  root: ParentNode,
  selector: string,
  timeout = 2_000,
): Promise<T> {
  let element = root.querySelector<T>(selector);
  const started = performance.now();
  while (!element && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    element = root.querySelector<T>(selector);
  }
  if (!element) throw new Error(`Timed out waiting for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean, timeout = 2_000): Promise<void> {
  const started = performance.now();
  while (!condition() && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  expect(condition()).toBe(true);
}
