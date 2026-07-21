import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import { ChoiceAnswerItem, CHOICE_TRAILING_BTN } from "./ChoiceAnswerItem";
import "./assessment-problem-shell.css";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("ChoiceAnswerItem compact geometry", () => {
  it("keeps a narrow authoring row contained and truncates its placeholder on one line", async () => {
    await page.viewport(800, 600);
    host = document.createElement("section");
    host.className = "sc-assessment-node-view ProseMirror";
    host.style.cssText = "container-type: inline-size; width: 155px;";
    document.body.append(host);

    root = createRoot(host);
    root.render(
      <section className="sc-assessment-shell">
        <div data-slot="assessment-prompt">
          <p className="is-empty" data-placeholder="Ask your question" />
        </div>
        <div style={{ flex: "0 0 100%", minWidth: 0 }}>
          <ChoiceAnswerItem
            id="choice-1"
            inputType="radio"
            isCorrect
            isEditable
            state={null}
            checked
            disabled={false}
            onSelect={() => {}}
            onToggleCorrect={() => {}}
            onDelete={() => {}}
            leading={
              <button
                type="button"
                aria-label="Move choice"
                className="sc-contained-movement-handle"
                style={{ flex: "0 0 16px", width: 16 }}
              />
            }
            feedbackControl={
              <button type="button" aria-label="Add feedback" className={CHOICE_TRAILING_BTN} />
            }
          >
            <p className="is-empty" data-placeholder="Enter your choice" />
          </ChoiceAnswerItem>
        </div>
      </section>,
    );

    await waitForCondition(() => host?.querySelector(".sc-choice-answer"));

    const row = requireElement<HTMLElement>(host, ".sc-choice-answer");
    const content = requireElement<HTMLElement>(host, ".sc-choice-answer__content");
    const placeholder = requireElement<HTMLParagraphElement>(content, "p.is-empty");
    const prompt = requireElement<HTMLParagraphElement>(
      host,
      '[data-slot="assessment-prompt"] p.is-empty',
    );
    const placeholderStyle = getComputedStyle(placeholder, "::before");
    const promptPlaceholderStyle = getComputedStyle(prompt, "::before");

    expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth + 1);
    expect(content.clientWidth).toBeGreaterThanOrEqual(64);
    expect(placeholderStyle.whiteSpace).toBe("nowrap");
    expect(placeholderStyle.overflow).toBe("hidden");
    expect(placeholderStyle.textOverflow).toBe("ellipsis");
    expect(placeholderStyle.position).toBe("absolute");
    expect(Number.parseFloat(placeholderStyle.height)).toBeGreaterThan(0);
    expect(promptPlaceholderStyle.whiteSpace).toBe("nowrap");
    expect(promptPlaceholderStyle.overflow).toBe("hidden");
    expect(promptPlaceholderStyle.textOverflow).toBe("ellipsis");
    expect(promptPlaceholderStyle.position).toBe("absolute");
    expect(Number.parseFloat(promptPlaceholderStyle.height)).toBeGreaterThan(0);
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
    if (performance.now() > deadline) throw new Error("Timed out waiting for compact choice row");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
