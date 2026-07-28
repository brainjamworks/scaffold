import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/rich-text/view/text-alignment.css";

import "./assessment-node-view.css";
import "./assessment-problem-shell.css";
import "../nodes/assessment-shared-chrome.css";

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

describe("bounded assessment metadata", () => {
  it("keeps the points beside left-aligned instructions", async () => {
    await page.viewport(1000, 600);
    host = document.createElement("div");
    host.className = "sc-assessment-node-view";
    host.dataset["boundedPlacement"] = "fill";
    host.style.cssText = "width: 700px; height: 360px;";
    host.innerHTML = `
      <section class="sc-assessment-shell">
        <div class="sc-assessment-meta-title" data-slot="assessment-title">
          <p data-text-align="left">Question title</p>
        </div>
        <div class="sc-assessment-meta-instructions" data-slot="assessment-instructions">
          <span class="sc-assessment-meta-default">·</span>
          <div class="sc-assessment-meta-content--inline">
            <p data-text-align="left">Click the fungal sheath</p>
          </div>
          <span class="sc-assessment-meta-default" data-testid="points-separator">·</span>
          <span class="sc-assessment-meta-default">2 points</span>
        </div>
        <div data-slot="assessment-prompt">Prompt</div>
        <div data-slot="sequencing-items-group">Items</div>
        <div data-slot="assessment-actions-group">Actions</div>
      </section>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const instructions = requireElement<HTMLParagraphElement>(
      host,
      '[data-slot="assessment-instructions"] p',
    );
    const separator = requireElement<HTMLElement>(host, '[data-testid="points-separator"]');
    const gap = separator.getBoundingClientRect().left - instructions.getBoundingClientRect().right;

    expect(gap).toBeCloseTo(12, 0);
  });
});

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}
