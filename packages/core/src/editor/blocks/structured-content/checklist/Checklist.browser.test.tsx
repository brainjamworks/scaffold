import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "./Checklist.css";
import "./ChecklistAuthoringControls.css";

import "@/styles/globals.css";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseButton } from "@/ui/components/course/CourseActions/CourseActions";
import { CourseCompletionCheckbox } from "@/ui/components/course/CourseInputs/CourseInputs";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Checklist presentation", () => {
  it("keeps a 44px completion target while Pocket Atlas draws a compact checkbox glyph", async () => {
    const host = document.createElement("div");
    host.style.width = "240px";
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
          <ChecklistSpecimen owner="runtime" surface="page" />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-checklist__checkbox") !== null);

    const checklist = requiredElement<HTMLElement>(host, ".sc-course-checklist");
    const checkbox = requiredElement<HTMLButtonElement>(
      checklist,
      ".sc-course-checklist__checkbox",
    );
    const checkboxRect = checkbox.getBoundingClientRect();
    const checkboxVisualStyle = getComputedStyle(checkbox, "::before");

    expect(checkboxRect.width).toBe(44);
    expect(checkboxRect.height).toBe(44);
    expect(getComputedStyle(checkbox).borderTopWidth).toBe("0px");
    expect(checkboxVisualStyle.width).toBe("20px");
    expect(checkboxVisualStyle.height).toBe("20px");
    expect(checkboxVisualStyle.borderTopWidth).toBe("2px");
    expect(checkboxVisualStyle.boxShadow).not.toBe("none");
    expect(checklist.scrollWidth).toBeLessThanOrEqual(checklist.clientWidth);

    checkbox.focus();
    await waitForCondition(
      () => getComputedStyle(checkbox, "::before").outlineStyle === "solid",
    );
    expect(getComputedStyle(checkbox, "::before").outlineWidth).toBe("3px");
    expect(document.activeElement).toBe(checkbox);
  });

  it("separates Pocket Atlas checklist metadata and row controls", async () => {
    const host = document.createElement("div");
    host.style.width = "640px";
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
          <ChecklistSpecimen owner="runtime" surface="page" />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-checklist__progress") !== null);

    const progress = requiredElement<HTMLElement>(host, ".sc-course-checklist__progress");
    const progressLabel = requiredElement<HTMLElement>(
      progress,
      ".sc-course-checklist__progress-label",
    );
    const itemShell = requiredElement<HTMLElement>(host, ".sc-course-checklist__item-shell");
    const checkbox = requiredElement<HTMLElement>(itemShell, ".sc-course-checklist__checkbox");
    const itemText = requiredElement<HTMLElement>(itemShell, ".sc-course-checklist__item-text");

    expect(getComputedStyle(progress).gap).toBe("4px");
    expect(getComputedStyle(progressLabel).marginLeft).toBe("4px");
    expect(getComputedStyle(itemShell).gap).toBe("8px");
    expect(itemText.getBoundingClientRect().left - checkbox.getBoundingClientRect().right).toBe(8);
  });

  it("uses the legible Pocket Atlas foreground on the dark checklist header", async () => {
    const host = document.createElement("div");
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="dark">
        <CourseThemeProvider
          appearance="dark"
          theme={{
            schemaVersion: 1,
            design: { id: "pocket-atlas", revision: "1" },
            colourSystem: { id: "pocket-atlas", revision: "1" },
            overrides: {},
          }}
        >
          <ChecklistSpecimen owner="runtime" surface="page" />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-checklist__header") !== null);

    const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
    const header = requiredElement<HTMLElement>(host, ".sc-course-checklist__header");
    const progress = requiredElement<HTMLElement>(header, ".sc-course-checklist__progress");
    const courseStyle = getComputedStyle(courseRoot);
    const expectedForeground = computedColor(
      courseStyle.getPropertyValue("--pa-violet-foreground"),
    );

    expect(getComputedStyle(header).color).toBe(expectedForeground);
    expect(getComputedStyle(progress).color).toBe(expectedForeground);
  });

  it("makes completed Pocket Atlas checklist items visibly complete", async () => {
    const host = document.createElement("div");
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
          <ChecklistSpecimen owner="runtime" surface="page" />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelector('.sc-course-checklist__item[data-checked="true"]') !== null,
    );

    const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
    const checkbox = requiredElement<HTMLElement>(host, ".sc-course-checklist__checkbox");
    const indicator = requiredElement<HTMLElement>(checkbox, ".rt-BaseCheckboxIndicator");
    const itemText = requiredElement<HTMLElement>(host, ".sc-course-checklist__item-text");
    const courseStyle = getComputedStyle(courseRoot);

    expect(getComputedStyle(checkbox, "::before").backgroundColor).toBe(
      computedColor(courseStyle.getPropertyValue("--pa-mint"), "background"),
    );
    expect(getComputedStyle(indicator).color).toBe("rgb(32, 22, 79)");
    expect(getComputedStyle(itemText).color).toBe(
      computedColor(courseStyle.getPropertyValue("--pa-ink-soft")),
    );
    expect(getComputedStyle(itemText).textDecorationLine).toContain("line-through");
  });

  it("gives the Pocket Atlas reset action a tactile hover state", async () => {
    const host = document.createElement("div");
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
          <ChecklistSpecimen owner="runtime" surface="page" />
        </CourseThemeProvider>
      </AppThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-checklist__reset") !== null);

    const courseRoot = requiredElement<HTMLElement>(host, ".sc-course");
    const reset = requiredElement<HTMLButtonElement>(host, ".sc-course-checklist__reset");
    const courseStyle = getComputedStyle(courseRoot);

    await userEvent.hover(reset);
    await waitForCondition(
      () =>
        getComputedStyle(reset).backgroundColor ===
        computedColor(courseStyle.getPropertyValue("--pa-mango"), "background"),
    );

    expect(getComputedStyle(reset).color).toBe("rgb(32, 22, 79)");
    expect(getComputedStyle(reset).transform).not.toBe("none");
    expect(getComputedStyle(reset).boxShadow).not.toBe("none");
  });

  it("preserves Pocket Atlas reset and checkbox accessibility states", () => {
    const activeReset = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-checklist__reset:active:not(:disabled)",
    );
    const reducedMotionReset = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-checklist__reset",
      "(prefers-reduced-motion: reduce)",
    );
    const forcedColourCheckbox = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-checklist__checkbox::before",
      "(forced-colors: active)",
    );
    const forcedColourReset = requiredStyleRule(
      ".sc-course.sc-course-theme-pocket-atlas-v1 .sc-course-checklist__reset",
      "(forced-colors: active)",
    );

    expect(activeReset.style.transform).toBe("translate(2px, 2px)");
    expect(activeReset.style.boxShadow).not.toBe("");
    expect(reducedMotionReset.style.transition).toBe("none");
    expect(forcedColourCheckbox.style.borderColor).toBe("canvastext");
    expect(forcedColourReset.style.boxShadow).toBe("none");
  });

  it("keeps learner geometry while the author-only delete action uses App presentation", async () => {
    const host = document.createElement("div");
    host.style.width = "640px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
            <RuntimeSurfaceView
              settings={{ mode: "page", overflowMode: "grow", surfaceSize: "fluid" }}
            >
              <section data-surface>
                <ChecklistSpecimen owner="runtime" surface="page" />
              </section>
            </RuntimeSurfaceView>
            <AuthoringSurfaceView
              settings={{ mode: "page", overflowMode: "grow", surfaceSize: "fluid" }}
            >
              <section data-surface>
                <ChecklistSpecimen owner="authoring" surface="page" />
              </section>
            </AuthoringSurfaceView>
          </CourseThemeProvider>
          <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="dark">
            <RuntimeSurfaceView
              settings={{ mode: "slideshow", overflowMode: "fit", surfaceSize: "16x9" }}
            >
              <section data-surface>
                <ChecklistSpecimen owner="runtime" surface="slideshow" />
              </section>
            </RuntimeSurfaceView>
            <AuthoringSurfaceView
              settings={{ mode: "slideshow", overflowMode: "clip", surfaceSize: "16x9" }}
            >
              <section data-surface>
                <ChecklistSpecimen owner="authoring" surface="slideshow" />
              </section>
            </AuthoringSurfaceView>
          </CourseThemeProvider>
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () => host.querySelectorAll(".sc-course-checklist__item-shell").length === 4,
    );
    const appStyle = getComputedStyle(requiredElement<HTMLElement>(host, ".sc-app"));
    const mutedColour = computedColor(appStyle.getPropertyValue("--sc-app-color-text-muted"));
    const errorColour = computedColor(appStyle.getPropertyValue("--sc-app-color-error"));
    const errorBackground = computedColor(
      appStyle.getPropertyValue("--sc-app-color-error-background"),
      "background",
    );
    const controlRadius = computedLength(appStyle.getPropertyValue("--sc-app-radius-control"));

    for (const surface of ["page", "slideshow"] as const) {
      const runtime = requiredElement<HTMLElement>(
        host,
        `[data-checklist-owner="runtime"][data-checklist-surface="${surface}"]`,
      );
      const authoring = requiredElement<HTMLElement>(
        host,
        `[data-checklist-owner="authoring"][data-checklist-surface="${surface}"]`,
      );
      const runtimeShell = requiredElement<HTMLElement>(
        runtime,
        ".sc-course-checklist__item-shell",
      );
      const authoringShell = requiredElement<HTMLElement>(
        authoring,
        ".sc-course-checklist__item-shell",
      );
      const runtimeCheckbox = requiredElement<HTMLButtonElement>(
        runtime,
        ".sc-course-checklist__checkbox",
      );
      const runtimeText = requiredElement<HTMLElement>(runtime, ".sc-course-checklist__item-text");
      const deleteButton = requiredElement<HTMLButtonElement>(
        authoring,
        ".sc-app-checklist-item-delete",
      );
      const actionSlot = requiredElement<HTMLElement>(
        authoring,
        ".sc-app-checklist-item-action-slot",
      );

      expect(getComputedStyle(runtimeShell).gridTemplateColumns.split(" ")).toHaveLength(2);
      expect(getComputedStyle(authoringShell).gridTemplateColumns.split(" ")).toHaveLength(4);
      expect(runtimeText.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        runtimeCheckbox.getBoundingClientRect().right,
      );
      expect(verticalCenter(runtimeCheckbox)).toBeCloseTo(firstLineCenter(runtimeText), 1);
      expect(deleteButton).not.toHaveClass("sc-course-checklist__delete");
      expect(getComputedStyle(deleteButton).width).toBe("28px");
      expect(getComputedStyle(deleteButton).height).toBe("28px");
      expect(Number.parseFloat(getComputedStyle(deleteButton).borderTopLeftRadius)).toBeCloseTo(
        controlRadius,
        1,
      );
      expect(getComputedStyle(deleteButton).opacity).toBe("1");
      expect(getComputedStyle(deleteButton).color).toBe(mutedColour);
      expect(getComputedStyle(actionSlot).display).toBe("grid");
      expect(getComputedStyle(actionSlot).minHeight).toBe("44px");
    }

    const pageCheckbox = requiredElement<HTMLElement>(
      host,
      '[data-checklist-owner="runtime"][data-checklist-surface="page"] .sc-course-checklist__checkbox',
    );
    const slideCheckbox = requiredElement<HTMLElement>(
      host,
      '[data-checklist-owner="runtime"][data-checklist-surface="slideshow"] .sc-course-checklist__checkbox',
    );
    const pageText = requiredElement<HTMLElement>(
      host,
      '[data-checklist-owner="runtime"][data-checklist-surface="page"] .sc-course-checklist__item-text',
    );
    const slideText = requiredElement<HTMLElement>(
      host,
      '[data-checklist-owner="runtime"][data-checklist-surface="slideshow"] .sc-course-checklist__item-text',
    );
    const pageDelete = requiredElement<HTMLButtonElement>(
      host,
      '[data-checklist-owner="authoring"][data-checklist-surface="page"] .sc-app-checklist-item-delete',
    );
    const slideDelete = requiredElement<HTMLButtonElement>(
      host,
      '[data-checklist-owner="authoring"][data-checklist-surface="slideshow"] .sc-app-checklist-item-delete',
    );

    expect(pageCheckbox.dataset["state"]).toBe("checked");
    expect(slideCheckbox.dataset["state"]).toBe("checked");
    expect(getComputedStyle(pageText).textDecorationLine).toContain("line-through");
    expect(getComputedStyle(slideText).textDecorationLine).toContain("line-through");
    expect(getComputedStyle(pageText).color).not.toBe(getComputedStyle(slideText).color);
    expect(getComputedStyle(pageDelete).color).toBe(getComputedStyle(slideDelete).color);

    await userEvent.hover(pageDelete);
    await waitForCondition(() => getComputedStyle(pageDelete).color === errorColour);
    expect(getComputedStyle(pageDelete).backgroundColor).toBe(errorBackground);

    await userEvent.unhover(pageDelete);
    pageDelete.focus();
    await waitForCondition(() => getComputedStyle(pageDelete).color === errorColour);

    pageDelete.setAttribute("aria-disabled", "true");
    await waitForCondition(
      () =>
        getComputedStyle(pageDelete).opacity === "0.45" &&
        getComputedStyle(pageDelete).color === mutedColour,
    );
    expect(document.activeElement).toBe(pageDelete);
    expect(getComputedStyle(pageDelete).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(pageDelete).cursor).toBe("not-allowed");
    expect(getComputedStyle(pageDelete).outlineStyle).toBe("solid");
  });
});

function ChecklistSpecimen({
  owner,
  surface,
}: {
  owner: "authoring" | "runtime";
  surface: "page" | "slideshow";
}) {
  const authoring = owner === "authoring";

  return (
    <div
      className="sc-course-checklist"
      data-checklist-owner={owner}
      data-checklist-surface={surface}
    >
      <section className="sc-course-checklist__section" aria-label="Checklist">
        <header className="sc-course-checklist__header">
          <span className="sc-course-checklist__progress">
            <span className="sc-course-checklist__progress-count">1</span>
            <span className="sc-course-checklist__progress-divider">/</span>
            <span className="sc-course-checklist__progress-total">1</span>
            <span className="sc-course-checklist__progress-label">complete</span>
          </span>
          <CourseButton
            type="button"
            size="compact"
            emphasis="quiet"
            className="sc-course-checklist__reset"
          >
            Reset
          </CourseButton>
        </header>
        <ul role="list" className="sc-course-checklist__list">
          <li
            role="listitem"
            className="sc-course-checklist__item"
            data-checked={authoring ? "false" : "true"}
          >
            <div
              className={`sc-course-checklist__item-shell${
                authoring ? " sc-app-checklist-item-shell" : ""
              }`}
            >
              {authoring ? (
                <button type="button" className="sc-app-checklist-item-drag" aria-label="Move item">
                  Move
                </button>
              ) : null}
              <span className="sc-course-checklist__control-slot">
                <CourseCompletionCheckbox
                  checked={!authoring}
                  disabled={authoring}
                  state={!authoring ? "completed" : undefined}
                  className="sc-course-checklist__checkbox"
                  aria-label={authoring ? "Completion preview" : "Mark item as not complete"}
                />
              </span>
              <div className="sc-course-checklist__item-text">Review the course</div>
              {authoring ? (
                <span className="sc-app-checklist-item-action-slot">
                  <button
                    type="button"
                    className="sc-app-checklist-item-delete"
                    aria-label="Delete checklist item 1"
                  >
                    Delete
                  </button>
                </span>
              ) : null}
            </div>
          </li>
        </ul>
      </section>
    </div>
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

function verticalCenter(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function firstLineCenter(element: Element): number {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.top + Number.parseFloat(style.paddingTop) + Number.parseFloat(style.lineHeight) / 2;
}

function computedColor(value: string, property: "color" | "background" = "color"): string {
  const probe = document.createElement("span");
  probe.style[property] = value;
  document.body.append(probe);
  const resolved = getComputedStyle(probe)[property === "background" ? "backgroundColor" : "color"];
  probe.remove();
  return resolved;
}

function computedLength(value: string): number {
  const probe = document.createElement("span");
  probe.style.borderRadius = value;
  document.body.append(probe);
  const resolved = Number.parseFloat(getComputedStyle(probe).borderTopLeftRadius);
  probe.remove();
  return resolved;
}

function requiredStyleRule(selector: string, mediaCondition?: string): CSSStyleRule {
  for (const sheet of Array.from(document.styleSheets)) {
    const rule = findStyleRule(sheet.cssRules, selector, mediaCondition);
    if (rule) return rule;
  }
  throw new Error(
    `Expected a CSS rule for ${selector}${mediaCondition ? ` in ${mediaCondition}` : ""}.`,
  );
}

function findStyleRule(
  rules: CSSRuleList,
  selector: string,
  mediaCondition?: string,
): CSSStyleRule | undefined {
  for (const rule of Array.from(rules)) {
    if (rule instanceof CSSStyleRule) {
      if (
        mediaCondition === undefined &&
        rule.selectorText
          .split(",")
          .map((entry) => entry.trim())
          .includes(selector)
      ) {
        return rule;
      }
      continue;
    }

    if (rule instanceof CSSMediaRule) {
      if (mediaCondition === undefined || rule.conditionText === mediaCondition) {
        const nestedRule = findStyleRule(
          rule.cssRules,
          selector,
          mediaCondition === rule.conditionText ? undefined : mediaCondition,
        );
        if (nestedRule) return nestedRule;
      }
    }
  }
  return undefined;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Checklist state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
