import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/ui/components/course/AssessmentShell/AssessmentShell.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import "../shared/chrome/assessment-node-view.css";
import "./ImageHotspot.css";

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

describe("bounded image hotspot layout", () => {
  it("gives the slideshow image a larger left-aligned stage without changing the shell", async () => {
    await page.viewport(1200, 800);
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-scaffold-flow-v1 radix-themes light";
    host.style.cssText = [
      "width: 952px",
      "height: 442px",
      "--sc-course-author-density: 1",
      "--space-3: 12px",
      "--space-4: 16px",
      "--space-5: 24px",
    ].join(";");
    host.innerHTML = `
      <div class="sc-assessment-node-view" data-bounded-placement="fill">
        <section class="sc-course-assessment-shell sc-course-image-hotspot">
          <div data-slot="assessment-title" style="height: 24px">Image hotspot</div>
          <div data-slot="assessment-instructions" style="height: 24px">Choose a region</div>
          <div data-slot="assessment-prompt" style="height: 24px">Prompt</div>
          <div data-node="image-hotspot-canvas">
            <div class="sc-course-image-hotspot-shell">
              <div class="sc-course-image-hotspot-fit-stage">
                <div class="sc-course-image-hotspot-canvas" style="width: 307px; height: 100%"></div>
              </div>
            </div>
          </div>
          <div data-node-view-content-react style="display: contents">
            <div data-slot="assessment-actions-group" style="height: 112px">Actions</div>
          </div>
        </section>
      </div>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const body = requireElement<HTMLElement>(host, '[data-node="image-hotspot-canvas"]');
    const stage = requireElement<HTMLElement>(host, ".sc-course-image-hotspot-fit-stage");
    const actions = requireElement<HTMLElement>(host, '[data-slot="assessment-actions-group"]');
    const bodyRect = body.getBoundingClientRect();

    expect(bodyRect.height).toBeGreaterThanOrEqual(200);
    expect(actions.getBoundingClientRect().top - bodyRect.bottom).toBeGreaterThanOrEqual(16);
    expect(getComputedStyle(stage).justifyItems).toBe("start");
  });
});

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}
