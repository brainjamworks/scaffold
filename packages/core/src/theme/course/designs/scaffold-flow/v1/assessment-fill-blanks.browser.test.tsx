import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import "@/styles/globals.css";
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
});

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
          </p>
        </div>
      </section>
    </CourseThemeProvider>,
  );

  await waitForCondition(() => host.querySelector(".sc-course-fill-blank__input") !== null);
  const input = requireElement<HTMLInputElement>(host, ".sc-course-fill-blank__input");
  const body = requireElement<HTMLElement>(host, ".sc-course-fill-blanks__body");
  const shell = requireElement<HTMLElement>(host, ".sc-course-fill-blanks");
  const courseRoot = shell.parentElement;
  if (!courseRoot) throw new Error("Expected a Course theme root");
  return { body, courseRoot, input, shell };
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
