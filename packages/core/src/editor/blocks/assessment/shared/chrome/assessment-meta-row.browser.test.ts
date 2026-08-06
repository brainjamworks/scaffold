import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/editor/rich-text/view/text-alignment.css";
import "@/ui/components/course/AssessmentShell/AssessmentShell.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import "./assessment-node-view.css";
import "../nodes/assessment-shared-chrome.css";
import { measureAssessmentMetaOverflow } from "../nodes/use-assessment-meta-overflow";

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

describe("assessment metadata", () => {
  it("keeps the shared title and instructions in one compact header row", async () => {
    await page.viewport(1000, 600);
    host = document.createElement("div");
    host.className =
      "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light sc-assessment-node-view";
    host.style.cssText = "width: 600px; --space-3: 12px;";
    host.innerHTML = `
      <section class="sc-course-assessment-shell">
        <div
          class="sc-course-assessment-meta-title"
          data-node-view-wrapper
          data-slot="assessment-title"
          style="white-space: normal"
        >
          <div
            class="sc-course-assessment-meta-content--inline"
            data-node-view-content
            style="white-space: pre-wrap"
          >
            <div data-node-view-content-react data-node-view-wrapper style="white-space: inherit">
              <p style="text-align: left">Climate checkpoint</p>
            </div>
          </div>
        </div>
        <div class="sc-course-assessment-meta-instructions" data-slot="assessment-instructions">
          <span class="sc-course-assessment-meta-default">·</span>
          <div class="sc-course-assessment-meta-content--inline">
            <div data-node-view-content-react>
              <p>Complete every blank before checking, then explain how each answer fits.</p>
            </div>
          </div>
          <span class="sc-course-assessment-meta-default">·</span>
          <span class="sc-course-assessment-meta-default">2 points</span>
        </div>
        <div data-slot="assessment-prompt">Prompt</div>
        <div data-slot="fill-blanks-body">Body</div>
        <div data-slot="assessment-actions-group">Actions</div>
      </section>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const shell = requireElement<HTMLElement>(host, ".sc-course-assessment-shell");
    const title = requireElement<HTMLElement>(host, '[data-slot="assessment-title"]');
    const instructions = requireElement<HTMLElement>(
      host,
      '[data-slot="assessment-instructions"]',
    );
    const instructionText = requireElement<HTMLParagraphElement>(
      instructions,
      ".sc-course-assessment-meta-content--inline p",
    );
    const shellStyle = getComputedStyle(shell);
    const contentRight =
      shell.getBoundingClientRect().right - Number.parseFloat(shellStyle.paddingRight);

    expect(instructions.getBoundingClientRect().top).toBeCloseTo(
      title.getBoundingClientRect().top,
      0,
    );
    expect(title.getBoundingClientRect().width).toBeGreaterThan(0);
    expect(instructions.getBoundingClientRect().right).toBeLessThanOrEqual(contentRight + 1);
    expect(instructionText.scrollWidth).toBeGreaterThan(instructionText.clientWidth);
    expect(getComputedStyle(instructionText).textOverflow).toBe("ellipsis");
    expect(getComputedStyle(instructionText).whiteSpace).toBe("nowrap");
  });

  it("keeps the points beside left-aligned instructions", async () => {
    await page.viewport(1000, 600);
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = "width: 700px; height: 360px; --space-3: 12px;";
    host.innerHTML = `
      <div class="sc-assessment-node-view" data-bounded-placement="fill" style="height: 100%">
        <section class="sc-course-assessment-shell">
          <div class="sc-course-assessment-meta-title" data-slot="assessment-title">
            <p data-text-align="left">Question title</p>
          </div>
          <div class="sc-course-assessment-meta-instructions" data-slot="assessment-instructions">
            <span class="sc-course-assessment-meta-default">·</span>
            <div class="sc-course-assessment-meta-content--inline">
              <p data-text-align="left">Click the fungal sheath</p>
            </div>
            <span class="sc-course-assessment-meta-default" data-testid="points-separator">·</span>
            <span class="sc-course-assessment-meta-default">2 points</span>
          </div>
          <div data-slot="assessment-prompt">Prompt</div>
          <div data-slot="sequencing-items-group">Items</div>
          <div data-slot="assessment-actions-group">Actions</div>
        </section>
      </div>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const title = requireElement<HTMLElement>(host, '[data-slot="assessment-title"]');
    const instructionsMeta = requireElement<HTMLElement>(
      host,
      '[data-slot="assessment-instructions"]',
    );
    const instructions = requireElement<HTMLParagraphElement>(
      host,
      '[data-slot="assessment-instructions"] p',
    );
    const separator = requireElement<HTMLElement>(host, '[data-testid="points-separator"]');
    const headerGap =
      instructionsMeta.getBoundingClientRect().left - title.getBoundingClientRect().right;
    const gap = separator.getBoundingClientRect().left - instructions.getBoundingClientRect().right;

    expect(headerGap).toBeCloseTo(12, 0);
    expect(gap).toBeCloseTo(12, 0);
  });

  it("marquees either clipped metadata field while the points remain stationary", async () => {
    await page.viewport(1000, 600);
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = "width: 480px; --space-3: 12px;";
    host.innerHTML = `
      <section class="sc-course-assessment-shell">
        <div
          class="sc-course-assessment-meta-title"
          data-course-overflow="true"
          data-slot="assessment-title"
          tabindex="0"
        >
          <div class="sc-course-assessment-meta-content--inline">
            <div data-node-view-content-react>
              <p>A deliberately long assessment title for this checkpoint</p>
            </div>
          </div>
        </div>
        <div
          class="sc-course-assessment-meta-instructions"
          data-course-overflow="true"
          data-slot="assessment-instructions"
          tabindex="0"
        >
          <span class="sc-course-assessment-meta-default">·</span>
          <div class="sc-course-assessment-meta-content--inline">
            <div data-node-view-content-react>
              <p>Complete every blank before checking, then explain each answer.</p>
            </div>
          </div>
          <span class="sc-course-assessment-meta-default">·</span>
          <span class="sc-course-assessment-meta-default" data-testid="fixed-points">2 points</span>
        </div>
      </section>
    `;
    document.body.append(host);

    const title = requireElement<HTMLElement>(host, '[data-slot="assessment-title"]');
    const titleText = requireElement<HTMLElement>(title, "p");
    const instructions = requireElement<HTMLElement>(
      host,
      '[data-slot="assessment-instructions"]',
    );
    const instructionText = requireElement<HTMLElement>(instructions, "p");
    const points = requireElement<HTMLElement>(instructions, '[data-testid="fixed-points"]');

    title.focus();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(title.matches(":focus-visible")).toBe(true);
    expect(getComputedStyle(title).outlineStyle).toBe("solid");
    expect(getComputedStyle(titleText).animationName).toBe(
      "sc-course-assessment-meta-marquee",
    );

    instructions.focus();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(getComputedStyle(instructionText).animationName).toBe(
      "sc-course-assessment-meta-marquee",
    );
    expect(getComputedStyle(points).animationName).toBe("none");
  });

  it("detects a title clipped by its responsive share of the metadata row", async () => {
    await page.viewport(1000, 600);
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = "width: 320px; --space-3: 12px;";
    host.innerHTML = `
      <section class="sc-course-assessment-shell">
        <div
          class="sc-course-assessment-meta-title"
          data-node-view-wrapper
          data-slot="assessment-title"
          style="white-space: normal"
        >
          <div
            class="sc-course-assessment-meta-content--inline"
            data-node-view-content
            style="white-space: pre-wrap"
          >
            <div data-node-view-content-react data-node-view-wrapper style="white-space: inherit">
              <p style="text-align: left">Climate checkpoint</p>
            </div>
          </div>
        </div>
        <div class="sc-course-assessment-meta-instructions" data-slot="assessment-instructions">
          <span class="sc-course-assessment-meta-default">·</span>
          <div class="sc-course-assessment-meta-content--inline">
            <div data-node-view-content-react><p>Complete every blank before checking.</p></div>
          </div>
          <span class="sc-course-assessment-meta-default">·</span>
          <span class="sc-course-assessment-meta-default">2 points</span>
        </div>
      </section>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const title = requireElement<HTMLElement>(host, '[data-slot="assessment-title"]');
    const measurement = measureAssessmentMetaOverflow(title);

    expect(measurement.hasOverflow).toBe(true);
    expect(measurement.overflowDistance).toBeGreaterThan(1);
  });
});

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}
