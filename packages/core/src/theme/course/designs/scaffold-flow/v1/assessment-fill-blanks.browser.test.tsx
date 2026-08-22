import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import "@/styles/globals.css";
import "@/editor/blocks/assessment/fill-blanks/FillBlanks.css";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";
import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Scaffold Flow Fill-in-the-blanks runtime recipe", () => {
  it.each(["light", "dark"] as const)(
    "uses the %s Course background as clean runtime paper",
    async (appearance) => {
      const { courseRoot, shell } = await mountRuntimeFill(appearance);

      expect(getComputedStyle(shell).backgroundColor).toBe(
        getComputedStyle(courseRoot).backgroundColor,
      );
    },
  );

  it("gives a neutral gap its own quiet surface and Course accent edge", async () => {
    const { input, shell } = await mountRuntimeFill("light");
    const inputStyle = getComputedStyle(input);

    expect(inputStyle.backgroundColor).not.toBe(getComputedStyle(shell).backgroundColor);
    expect(inputStyle.boxShadow).toContain("-2px");
  });

  it("tightens runtime prose without changing the stable field height", async () => {
    const { body, input } = await mountRuntimeFill("light");

    expect(getComputedStyle(body).lineHeight).toBe("32px");
    expect(input.getBoundingClientRect().height).toBe(36);
  });

  it("contains the focus indicator inside consecutive inline fields", async () => {
    const { shell } = await mountRuntimeFill("light");
    const inputs = [...shell.querySelectorAll<HTMLInputElement>(".sc-course-fill-blank__input")];
    const first = inputs[0];
    const second = inputs[1];
    if (!first || !second) throw new Error("Expected two runtime Fill inputs");

    first.focus();
    const focusedStyle = getComputedStyle(first);
    expect(focusedStyle.outlineWidth).toBe("2px");
    expect(focusedStyle.outlineOffset).toBe("-2px");
    expect(second.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      first.getBoundingClientRect().bottom,
    );
  });

  it("keeps its compact feedback target clear of answer text", async () => {
    const { feedbackAction, feedbackInput } = await mountRuntimeFill("light");
    const actionWidth = feedbackAction.getBoundingClientRect().width;
    const paddingInlineEnd = Number.parseFloat(getComputedStyle(feedbackInput).paddingInlineEnd);

    expect(actionWidth).toBe(28);
    expect(feedbackAction.getBoundingClientRect().height).toBe(28);
    expect(paddingInlineEnd).toBeGreaterThanOrEqual(actionWidth + 12);
  });
});

describe("Fill-in-the-blanks authoring control ownership", () => {
  it("themes the accepted-answer trigger from the App scope across Course appearances", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <AuthorTriggerSpecimen appearance="light" />
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <AuthorTriggerSpecimen appearance="dark" />
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelectorAll(".sc-app-fill-blank__author-trigger").length === 2);
    const light = requireElement<HTMLButtonElement>(
      host,
      '[data-author-trigger-appearance="light"]',
    );
    const dark = requireElement<HTMLButtonElement>(
      host,
      '[data-author-trigger-appearance="dark"]',
    );
    const lightProbe = appendAppTokenProbe(light);
    const darkProbe = appendAppTokenProbe(dark);
    const lightStyle = getComputedStyle(light);
    const darkStyle = getComputedStyle(dark);
    const lightProbeStyle = getComputedStyle(lightProbe);
    const darkProbeStyle = getComputedStyle(darkProbe);

    expect(light).not.toHaveClass("sc-course-fill-blank__author-trigger");
    expect(lightStyle.backgroundColor).toBe(lightProbeStyle.backgroundColor);
    expect(lightStyle.backgroundColor).toBe(darkStyle.backgroundColor);
    expect(lightStyle.borderColor).toBe(lightProbeStyle.borderColor);
    expect(lightStyle.color).toBe(lightProbeStyle.color);
    expect(lightStyle.fontFamily).toBe(lightProbeStyle.fontFamily);
    expect(lightStyle.borderRadius).toBe(lightProbeStyle.borderRadius);
    expect(lightStyle.outlineColor).toBe(lightProbeStyle.outlineColor);
    expect(lightStyle.outlineWidth).toBe("2px");
    expect(darkStyle.backgroundColor).toBe(darkProbeStyle.backgroundColor);
    expect(darkStyle.borderColor).toBe(darkProbeStyle.borderColor);
    expect(light.getBoundingClientRect().height).toBeCloseTo(28, 0);
    expect(light.scrollWidth - light.clientWidth).toBeLessThanOrEqual(1);
  });
});

function appendAppTokenProbe(control: HTMLElement): HTMLElement {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.backgroundColor = "var(--sc-app-color-primary-muted)";
  probe.style.border = "1px solid var(--sc-app-color-primary)";
  probe.style.borderRadius = "var(--sc-app-radius-control)";
  probe.style.color = "var(--sc-app-color-primary)";
  probe.style.fontFamily = "var(--sc-app-font-family)";
  probe.style.outline = "2px solid var(--sc-app-color-focus-outline)";
  control.after(probe);
  return probe;
}

function AuthorTriggerSpecimen({ appearance }: { appearance: "light" | "dark" }) {
  return (
    <p className="sc-course-fill-blanks__body" data-course-mode="authoring">
      The capital of France is
      <span className="sc-course-fill-blank" data-course-mode="authoring">
        <button
          type="button"
          className="sc-app-fill-blank__author-trigger"
          data-author-trigger-appearance={appearance}
          data-selected="true"
        >
          <span aria-hidden>{"{}"}</span>
          <span className="sc-app-fill-blank__label">A deliberately long accepted answer</span>
          <span className="sc-app-fill-blank__count">+1</span>
        </button>
      </span>
    </p>
  );
}

async function mountRuntimeFill(appearance: "light" | "dark") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance={appearance}>
      <section
        className="sc-course-assessment-shell sc-course-fill-blanks"
        data-assessment-shell=""
        data-editable="false"
      >
        <div className="sc-course-fill-blanks__body" data-course-mode="runtime">
          <p>
            Pure water freezes at{" "}
            <span className="sc-course-fill-blank" data-course-mode="runtime">
              <input
                aria-label="Blank 1 of 1, temperature"
                className="sc-course-fill-blank__input"
                data-course-state="neutral"
                style={{ width: "16ch" }}
              />
            </span>
            .<br />
            The gas is{" "}
            <span className="sc-course-fill-blank" data-course-mode="runtime">
              <input
                aria-label="Blank 2 of 2, gas"
                className="sc-course-fill-blank__input"
                data-course-state="neutral"
                style={{ width: "16ch" }}
              />
            </span>
            .
            <br />
            The capital is{" "}
            <span
              className="sc-course-fill-blank"
              data-course-mode="runtime"
              data-has-feedback="true"
            >
              <input
                aria-label="Blank with feedback"
                className="sc-course-fill-blank__input"
                data-course-state="incorrect"
                readOnly
                value="London"
                style={{ width: "16ch" }}
              />
              <span className="sc-course-fill-blank__feedback-anchor">
                <button
                  aria-label="Show feedback"
                  className="sc-course-assessment-feedback-action"
                  type="button"
                >
                  i
                </button>
              </span>
            </span>
            .
          </p>
        </div>
      </section>
    </CourseThemeProvider>,
  );

  await waitForCondition(() => host.querySelector(".sc-course-fill-blank__input") !== null);
  const input = requireElement<HTMLInputElement>(host, ".sc-course-fill-blank__input");
  const body = requireElement<HTMLElement>(host, ".sc-course-fill-blanks__body");
  const shell = requireElement<HTMLElement>(host, ".sc-course-fill-blanks");
  const feedbackInput = requireElement<HTMLInputElement>(host, '[aria-label="Blank with feedback"]');
  const feedbackAction = requireElement<HTMLButtonElement>(
    host,
    ".sc-course-assessment-feedback-action",
  );
  const courseRoot = shell.parentElement;
  if (!courseRoot) throw new Error("Expected a Course theme root");
  return { body, courseRoot, feedbackAction, feedbackInput, input, shell };
}

function requireElement<T extends Element>(container: ParentNode, selector: string): T {
  const element = container.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (condition()) return;
    await new Promise(requestAnimationFrame);
  }
  throw new Error("Timed out waiting for browser render");
}
