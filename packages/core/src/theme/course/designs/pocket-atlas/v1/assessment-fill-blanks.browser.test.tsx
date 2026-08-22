import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/bounded-containers/view/bounded-container.css";
import "@/editor/blocks/assessment/fill-blanks/FillBlanks.css";
import "@/editor/blocks/assessment/shared/chrome/assessment-feedback-popover.css";

import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";

import "./theme.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Pocket Atlas Fill-in-the-blanks runtime recipe", () => {
  it.each(["light", "dark"] as const)(
    "uses semantic correctness colours in %s mode",
    async (appearance) => {
      const { correctInput, courseRoot, incorrectInput, neutralInput } =
        await mountRuntimeFill(appearance);
      const correctProbe = appendColourProbe(
        courseRoot,
        "var(--sc-course-state-correct-background)",
      );
      const incorrectProbe = appendColourProbe(
        courseRoot,
        "var(--sc-course-state-incorrect-background)",
      );

      expect(getComputedStyle(correctInput).backgroundColor).toBe(
        getComputedStyle(correctProbe).backgroundColor,
      );
      expect(getComputedStyle(incorrectInput).backgroundColor).toBe(
        getComputedStyle(incorrectProbe).backgroundColor,
      );
      expect(getComputedStyle(correctInput).backgroundColor).not.toBe(
        getComputedStyle(neutralInput).backgroundColor,
      );
      expect(getComputedStyle(incorrectInput).backgroundColor).not.toBe(
        getComputedStyle(neutralInput).backgroundColor,
      );
    },
  );

  it("keeps the feedback target clear of answer text", async () => {
    const { feedbackAction, incorrectInput } = await mountRuntimeFill("light");
    const paddingInlineEnd = Number.parseFloat(
      getComputedStyle(incorrectInput).paddingInlineEnd,
    );

    expect(feedbackAction.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(feedbackAction.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(paddingInlineEnd).toBeGreaterThanOrEqual(
      feedbackAction.getBoundingClientRect().width + 12,
    );
  });

  it("presents submitted fields as readonly", async () => {
    const { incorrectInput } = await mountRuntimeFill("light");

    expect(incorrectInput).toHaveAttribute("readonly");
    expect(getComputedStyle(incorrectInput).cursor).toBe("default");
    expect(getComputedStyle(incorrectInput).opacity).toBe("1");
  });

  it("keeps the offset input shadow inside the Fill scroll lane", async () => {
    const { incorrectInput, scrollLane } = await mountRuntimeFill("light");
    const inputRect = incorrectInput.getBoundingClientRect();
    const scrollRect = scrollLane.getBoundingClientRect();
    const shadow = shadowOffset(getComputedStyle(incorrectInput).boxShadow);

    expect(scrollRect.right - inputRect.right).toBeGreaterThanOrEqual(shadow.inlineEnd);
    expect(scrollRect.bottom - inputRect.bottom).toBeGreaterThanOrEqual(shadow.blockEnd);
  });

  it("gives the feedback action visible Pocket Atlas hover and keyboard focus", async () => {
    const { feedbackAction } = await mountRuntimeFill("light");
    const restingBackground = getComputedStyle(feedbackAction).backgroundColor;

    await userEvent.hover(feedbackAction);
    await waitForCondition(
      () => getComputedStyle(feedbackAction).backgroundColor !== restingBackground,
    );
    expect(getComputedStyle(feedbackAction).backgroundColor).not.toBe(restingBackground);

    await userEvent.unhover(feedbackAction);
    feedbackAction.focus();
    expect(document.activeElement).toBe(feedbackAction);
    expect(getComputedStyle(feedbackAction).outlineStyle).toBe("solid");
    expect(getComputedStyle(feedbackAction).outlineWidth).toBe("3px");
  });
});

async function mountRuntimeFill(appearance: "light" | "dark") {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mountedRoots.push(root);
  root.render(
    <CourseThemeProvider
      appearance={appearance}
      theme={{
        schemaVersion: 1,
        design: { id: "pocket-atlas", revision: "1" },
        colourSystem: { id: "pocket-atlas", revision: "1" },
        overrides: {},
      }}
    >
      <section className="sc-course-assessment-shell sc-course-fill-blanks">
        <div
          className="sc-course-fill-blanks__body"
          data-bounded-scroll-frame=""
          data-course-mode="runtime"
        >
          <div data-bounded-scroll="" className="sc-course-fill-blanks__scroll">
            <div className="sc-course-fill-blanks__content">
              <span className="sc-course-fill-blank" data-course-mode="runtime">
                <input
                  aria-label="Neutral blank"
                  className="sc-course-fill-blank__input"
                  data-course-state="neutral"
                  style={{ width: "16ch" }}
                />
              </span>
              <span className="sc-course-fill-blank" data-course-mode="runtime">
                <input
                  aria-label="Correct blank"
                  className="sc-course-fill-blank__input"
                  data-course-state="correct"
                  readOnly
                  value="Paris"
                  style={{ width: "16ch" }}
                />
              </span>
              <span
                className="sc-course-fill-blank"
                data-course-mode="runtime"
                data-has-feedback="true"
              >
                <input
                  aria-label="Incorrect blank"
                  className="sc-course-fill-blank__input"
                  data-course-state="incorrect"
                  readOnly
                  value="A deliberately long wrong answer"
                  style={{ width: "24ch" }}
                />
                <span className="sc-course-fill-blank__feedback-anchor">
                  <button
                    aria-label="Show feedback for incorrect blank"
                    className="sc-course-assessment-feedback-action"
                    type="button"
                  >
                    i
                  </button>
                </span>
              </span>
            </div>
          </div>
          <div data-bounded-scroll-hint="" aria-hidden="true">
            Scroll for more ↓
          </div>
        </div>
      </section>
    </CourseThemeProvider>,
  );

  await waitForCondition(() => host.querySelector(".sc-course-fill-blank__input") !== null);
  const courseRoot = requireElement<HTMLElement>(host, ".sc-course");
  const neutralInput = requireElement<HTMLInputElement>(host, '[aria-label="Neutral blank"]');
  const correctInput = requireElement<HTMLInputElement>(host, '[aria-label="Correct blank"]');
  const incorrectInput = requireElement<HTMLInputElement>(host, '[aria-label="Incorrect blank"]');
  const feedbackAction = requireElement<HTMLButtonElement>(
    host,
    ".sc-course-assessment-feedback-action",
  );
  const scrollLane = requireElement<HTMLElement>(host, ".sc-course-fill-blanks__scroll");
  return { correctInput, courseRoot, feedbackAction, incorrectInput, neutralInput, scrollLane };
}

function shadowOffset(boxShadow: string): { blockEnd: number; inlineEnd: number } {
  const match = boxShadow.match(/(-?[\d.]+)px\s+(-?[\d.]+)px/);
  if (!match) throw new Error(`Expected a pixel offset shadow, received: ${boxShadow}`);
  return {
    inlineEnd: Math.max(0, Number(match[1])),
    blockEnd: Math.max(0, Number(match[2])),
  };
}

function appendColourProbe(courseRoot: HTMLElement, background: string): HTMLElement {
  const probe = document.createElement("span");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.background = background;
  courseRoot.append(probe);
  return probe;
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
