import { Button, Checkbox } from "@radix-ui/themes";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./Checklist.css";
import "./ChecklistAuthoringControls.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Checklist presentation", () => {
  it("keeps two learner columns and four authoring columns across Page and Slideshow themes", async () => {
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

      expect(getComputedStyle(runtimeShell).gridTemplateColumns.split(" ")).toHaveLength(2);
      expect(getComputedStyle(authoringShell).gridTemplateColumns.split(" ")).toHaveLength(4);
      expect(runtimeText.getBoundingClientRect().left).toBeGreaterThanOrEqual(
        runtimeCheckbox.getBoundingClientRect().right,
      );
      expect(getComputedStyle(deleteButton).opacity).toBe("1");
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

    expect(pageCheckbox.dataset["state"]).toBe("checked");
    expect(slideCheckbox.dataset["state"]).toBe("checked");
    expect(getComputedStyle(pageText).textDecorationLine).toContain("line-through");
    expect(getComputedStyle(slideText).textDecorationLine).toContain("line-through");
    expect(getComputedStyle(pageText).color).not.toBe(getComputedStyle(slideText).color);
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
          <Button type="button" size="1" variant="ghost" className="sc-course-checklist__reset">
            Reset
          </Button>
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
              <Checkbox
                size="2"
                checked={!authoring}
                disabled={authoring}
                data-course-state={!authoring ? "completed" : undefined}
                className="sc-course-checklist__checkbox"
                aria-label={authoring ? "Completion preview" : "Mark item as not complete"}
              />
              <div className="sc-course-checklist__item-text">Review the course</div>
              {authoring ? (
                <button
                  type="button"
                  className="sc-app-checklist-item-delete"
                  aria-label="Delete checklist item 1"
                >
                  Delete
                </button>
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

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Checklist state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
