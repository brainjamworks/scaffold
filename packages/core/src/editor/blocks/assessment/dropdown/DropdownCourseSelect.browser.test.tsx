import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";

import { DropdownCourseSelect } from "./DropdownCourseSelect";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("Dropdown Course surface geometry", () => {
  it("keeps variable-height surfaces bounded and wrapped under full roundness", async () => {
    await page.viewport(760, 640);
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "position: fixed",
      "inset: 24px auto auto 24px",
      "width: 360px",
      "height: 560px",
      "--default-font-family: sans-serif",
      "--gray-1: rgb(255 255 255)",
      "--gray-2: rgb(248 248 248)",
      "--gray-10: rgb(90 90 90)",
      "--gray-11: rgb(60 60 60)",
      "--gray-12: rgb(20 20 20)",
      "--gray-a5: rgb(210 210 210)",
      "--gray-a7: rgb(170 170 170)",
      "--accent-9: rgb(79 70 229)",
      "--accent-12: rgb(30 27 75)",
      "--accent-a3: rgb(238 237 255)",
      "--radius-2: 6px",
      "--radius-3: 9px",
      "--radius-full: 9999px",
      "--sc-course-author-stroke-width: 1px",
      "--sc-course-state-correct-border: rgb(22 163 74)",
      "--shadow-4: 0 8px 24px rgb(0 0 0 / 0.18)",
    ].join(";");
    const mount = document.createElement("div");
    host.append(mount);
    document.body.append(host);

    root = createRoot(mount);
    root.render(
      <OverlayBoundary container={host} collisionBoundary={host} kind="contained">
        <div className="sc-assessment-node-view" data-bounded-placement="fill">
          <div className="sc-course-dropdown" data-editable="false">
            <div data-slot="dropdown-choices-group">
              <DropdownCourseSelect
                correctAnswer={{ content: "Ask the learner to explain the next step clearly." }}
                disabled={false}
                label="Response"
                onValueChange={() => undefined}
                options={[
                  {
                    id: "option-a",
                    text: "Explain the next step",
                    content: (
                      <span className="sc-course-dropdown-select__option-content">
                        Ask the learner to explain the next step in their own words and what they
                        would do if the situation changed.
                      </span>
                    ),
                  },
                  {
                    id: "option-b",
                    text: "Repeat the explanation",
                    content: (
                      <span className="sc-course-dropdown-select__option-content">
                        Repeat the same explanation more slowly without checking for understanding.
                      </span>
                    ),
                  },
                ]}
                placeholder="Choose the strongest response…"
                state={null}
                value=""
              />
            </div>
          </div>
        </div>
      </OverlayBoundary>,
    );

    await waitForCondition(() => host?.querySelector('[role="combobox"]'));
    const trigger = requireElement<HTMLElement>(host, '[role="combobox"]');
    await userEvent.click(trigger);
    await waitForCondition(() => host?.querySelector('[role="listbox"]'));

    const content = requireElement<HTMLElement>(host, ".sc-course-dropdown-select__content");
    const item = requireElement<HTMLElement>(content, ".sc-course-dropdown-select__item");
    const correctAnswer = requireElement<HTMLElement>(
      host,
      ".sc-course-dropdown-select__correct-answer",
    );
    const group = requireElement<HTMLElement>(host, '[data-slot="dropdown-choices-group"]');

    expect(getComputedStyle(trigger).borderRadius).toBe("9px");
    expect(getComputedStyle(content).borderRadius).toBe("9px");
    expect(getComputedStyle(item).borderRadius).toBe("6px");
    expect(getComputedStyle(correctAnswer).borderRadius).toBe("6px");
    expect(getComputedStyle(group).borderRadius).toBe("9px");
    expect(item.getBoundingClientRect().height).toBeGreaterThan(44);
    expect(item.scrollWidth).toBeLessThanOrEqual(item.clientWidth + 1);
    expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth + 1);
  });

  it("gives Pocket Atlas dropdowns complete interactive geometry", async () => {
    await page.viewport(760, 640);
    host = document.createElement("section");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes dark";
    host.style.cssText = [
      "position: fixed",
      "inset: 24px auto auto 24px",
      "width: 300px",
      "height: 560px",
      "--default-font-family: sans-serif",
      "--heading-font-family: sans-serif",
      "--sc-course-state-correct-border: rgb(82 230 188)",
      "--sc-course-state-correct-background: rgb(23 61 57)",
      "--sc-course-state-correct-text: rgb(246 243 255)",
      "--sc-course-state-incorrect-border: rgb(255 130 148)",
      "--sc-course-state-incorrect-background: rgb(75 31 58)",
      "--sc-course-state-incorrect-text: rgb(246 243 255)",
    ].join(";");
    const mount = document.createElement("div");
    host.append(mount);
    document.body.append(host);

    root = createRoot(mount);
    root.render(
      <OverlayBoundary container={host} collisionBoundary={host} kind="contained">
        <DropdownCourseSelect
          correctAnswer={{ content: "Ask the learner to explain the next step clearly." }}
          disabled={false}
          label="Response"
          onValueChange={() => undefined}
          options={[
            {
              id: "option-a",
              text: "Explain the next step",
              content: "Explain the next step in their own words.",
            },
            {
              id: "option-b",
              text: "Repeat the explanation",
              content: "Repeat the explanation without checking understanding.",
            },
          ]}
          placeholder="Choose the strongest response…"
          state="incorrect"
          value=""
        />
      </OverlayBoundary>,
    );

    await waitForCondition(() => host?.querySelector('[role="combobox"]'));
    const trigger = requireElement<HTMLElement>(host, '[role="combobox"]');
    await userEvent.click(trigger);
    await waitForCondition(() => host?.querySelector('[role="listbox"]'));

    const content = requireElement<HTMLElement>(host, ".sc-course-dropdown-select__content");
    const item = requireElement<HTMLElement>(content, ".sc-course-dropdown-select__item");
    const highlighted = requireElement<HTMLElement>(content, "[data-highlighted]");
    const sideIcon = requireElement<HTMLElement>(host, ".sc-course-dropdown-select__side-icon");
    const correctAnswer = requireElement<HTMLElement>(
      host,
      ".sc-course-dropdown-select__correct-answer",
    );

    expect(trigger.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(getComputedStyle(trigger).paddingInlineStart)).toBeGreaterThan(0);
    expect(getComputedStyle(content).borderStyle).toBe("solid");
    expect(item.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(getComputedStyle(highlighted).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(sideIcon.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(correctAnswer.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    expect(Number.parseFloat(getComputedStyle(correctAnswer).gap)).toBeGreaterThan(0);
    expect(getComputedStyle(correctAnswer).flexWrap).toBe("wrap");
  });
});

function requireElement<T extends Element>(rootElement: ParentNode, selector: string): T {
  const element = rootElement.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Dropdown geometry");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
