import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/ui/components/course/AssessmentShell/AssessmentShell.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import "../shared/chrome/assessment-node-view.css";
import "./ImageHotspot.css";

let host: HTMLElement | null = null;

afterEach(() => {
  host?.remove();
  host = null;
});

describe("bounded image hotspot layout", () => {
  it("centres the slideshow image in a single theme-owned frame", async () => {
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
      "--gray-a2: rgba(28, 32, 36, 0.05)",
      "--gray-a6: rgba(84, 90, 99, 0.28)",
      "--radius-4: 8px",
      "--sc-course-author-stroke-width: 1px",
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
    const canvas = requireElement<HTMLElement>(host, ".sc-course-image-hotspot-canvas");
    const actions = requireElement<HTMLElement>(host, '[data-slot="assessment-actions-group"]');
    const bodyRect = body.getBoundingClientRect();

    expect(bodyRect.height).toBeGreaterThanOrEqual(200);
    expect(actions.getBoundingClientRect().top - bodyRect.bottom).toBeGreaterThanOrEqual(16);
    expect(getComputedStyle(stage).justifyItems).toBe("center");
    expect(getComputedStyle(stage).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(getComputedStyle(stage).borderTopWidth)).toBeGreaterThan(0);
    expect(getComputedStyle(canvas).borderTopWidth).toBe("0px");
    expect(getComputedStyle(canvas).boxShadow).toBe("none");
  });

  it("keeps authoring controls App-owned while runtime markers remain Course-themed", async () => {
    host = document.createElement("div");
    host.className = "sc-app";
    host.innerHTML = `
      <div class="sc-course sc-course-theme-scaffold-flow-v1 radix-themes light">
        <button class="sc-icon-button sc-app-image-hotspot__icon-action" data-size="lg" data-variant="ghost">
          Edit
        </button>
        <button class="sc-app-image-hotspot-author-marker" style="left: 50%; top: 50%">
          <span class="sc-app-image-hotspot-author-marker__number">1</span>
        </button>
        <button class="sc-course-image-hotspot-marker">?</button>
      </div>
      <div class="sc-course sc-course-theme-pocket-atlas-v1 radix-themes light">
        <button class="sc-icon-button sc-app-image-hotspot__icon-action" data-size="lg" data-variant="ghost">
          Edit
        </button>
        <button class="sc-app-image-hotspot-author-marker" style="left: 50%; top: 50%">
          <span class="sc-app-image-hotspot-author-marker__number">1</span>
        </button>
        <button class="sc-course-image-hotspot-marker">?</button>
      </div>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const actions = Array.from(
      host.querySelectorAll<HTMLElement>(".sc-app-image-hotspot__icon-action"),
    );
    const authorMarkers = Array.from(
      host.querySelectorAll<HTMLElement>(".sc-app-image-hotspot-author-marker"),
    );
    const runtimeMarkers = Array.from(
      host.querySelectorAll<HTMLElement>(".sc-course-image-hotspot-marker"),
    );

    expect(actions).toHaveLength(2);
    expect(authorMarkers).toHaveLength(2);
    expect(runtimeMarkers).toHaveLength(2);
    expect(actions.map((action) => getComputedStyle(action).width)).toEqual(["44px", "44px"]);
    expect(authorMarkers.map((marker) => getComputedStyle(marker).width)).toEqual(["44px", "44px"]);
    expect(
      authorMarkers.map((marker) => getComputedStyle(marker, "::before").borderTopColor),
    ).toEqual([
      getComputedStyle(authorMarkers[0]!, "::before").borderTopColor,
      getComputedStyle(authorMarkers[0]!, "::before").borderTopColor,
    ]);
    expect(getComputedStyle(runtimeMarkers[0]!).borderRadius).not.toBe(
      getComputedStyle(runtimeMarkers[1]!).borderRadius,
    );
  });

  it("uses the authored region as the single visible boundary for its centre marker", async () => {
    host = document.createElement("div");
    host.className = "sc-app";
    host.innerHTML = `
      <div class="sc-course-image-hotspot-canvas">
        <svg class="sc-course-image-hotspot-overlay" viewBox="0 0 320 180">
          <g class="sc-app-image-hotspot__author-region" data-hotspot-state="selected">
            <circle class="sc-app-image-hotspot__author-region-shape" cx="160" cy="90" r="24"></circle>
          </g>
        </svg>
        <span
          class="sc-app-image-hotspot__author-resize-handle"
          data-hotspot-resize-handle-id="hotspot-1"
        ></span>
        <button class="sc-app-image-hotspot-author-marker" data-hotspot-selected="true">
          <span class="sc-app-image-hotspot-author-marker__number">1</span>
        </button>
      </div>
    `;
    document.body.append(host);

    const marker = requireElement<HTMLButtonElement>(host, ".sc-app-image-hotspot-author-marker");
    const region = requireElement<SVGCircleElement>(
      host,
      ".sc-app-image-hotspot__author-region-shape",
    );
    const number = requireElement<HTMLElement>(host, ".sc-app-image-hotspot-author-marker__number");
    const resizeHandle = requireElement<HTMLElement>(
      host,
      ".sc-app-image-hotspot__author-resize-handle",
    );
    marker.focus();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    expect(getComputedStyle(marker, "::before").content).toBe("none");
    expect(getComputedStyle(marker).outlineStyle).toBe("none");
    expect(getComputedStyle(region).strokeWidth).toBe("4px");
    expect(getComputedStyle(number).outlineStyle).toBe("solid");
    expect(getComputedStyle(number).outlineWidth).toBe("2px");
    expect(getComputedStyle(number).width).toBe("24px");
    expect(getComputedStyle(number).height).toBe("24px");
    expect(getComputedStyle(number).borderRadius).toBe("50%");
    expect(getComputedStyle(resizeHandle).width).toBe("44px");
    expect(getComputedStyle(resizeHandle).height).toBe("44px");
    expect(getComputedStyle(resizeHandle).cursor).toBe("ew-resize");
    expect(getComputedStyle(resizeHandle, "::before").width).toBe("10px");
    expect(getComputedStyle(resizeHandle, "::before").borderRadius).toBe("0px");
  });

  it("gives Pocket Atlas runtime states visible markers and a non-filling revealed region", async () => {
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
    host.innerHTML = `
      <div class="sc-course-image-hotspot-canvas" style="width: 320px; height: 180px">
        <button class="sc-course-image-hotspot-marker" data-hotspot-state="pending">?</button>
        <button class="sc-course-image-hotspot-marker" data-hotspot-state="submitted">●</button>
        <button class="sc-course-image-hotspot-marker" data-course-state="correct">✓</button>
        <button class="sc-course-image-hotspot-marker" data-course-state="incorrect">×</button>
        <button class="sc-course-image-hotspot-marker" data-hotspot-state="miss">×</button>
        <svg class="sc-course-image-hotspot-overlay" viewBox="0 0 320 180">
          <circle class="sc-course-image-hotspot__revealed-region" cx="160" cy="90" r="24"></circle>
        </svg>
      </div>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const pending = requireElement<HTMLElement>(host, '[data-hotspot-state="pending"]');
    const submitted = requireElement<HTMLElement>(host, '[data-hotspot-state="submitted"]');
    const correct = requireElement<HTMLElement>(host, '[data-course-state="correct"]');
    const miss = requireElement<HTMLElement>(host, '[data-hotspot-state="miss"]');
    const revealed = requireElement<SVGCircleElement>(
      host,
      ".sc-course-image-hotspot__revealed-region",
    );

    expect(getComputedStyle(pending).backgroundColor).not.toBe(
      getComputedStyle(correct).backgroundColor,
    );
    expect(getComputedStyle(submitted).backgroundColor).not.toBe(
      getComputedStyle(pending).backgroundColor,
    );
    expect(getComputedStyle(miss).backgroundColor).not.toBe(
      getComputedStyle(correct).backgroundColor,
    );
    expect(getComputedStyle(revealed).fill).toBe("none");
    expect(getComputedStyle(revealed).stroke).not.toBe("none");
  });

  it("gives the Pocket Atlas learner workspace a complete panel and 44px actions", async () => {
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
    host.innerHTML = `
      <div class="sc-course-image-hotspot-workspace__overlay"></div>
      <section class="sc-course-image-hotspot-workspace">
        <header class="sc-course-image-hotspot-workspace__header">
          <div class="sc-course-image-hotspot-workspace__heading">
            <h2 class="sc-course-image-hotspot-workspace__title">Answer image hotspot</h2>
            <p class="sc-course-image-hotspot-workspace__description">Select every correct region.</p>
          </div>
          <button class="sc-course-image-hotspot__icon-action" data-intent="close">Close</button>
        </header>
        <div class="sc-course-image-hotspot-runtime-workspace__body">Canvas</div>
      </section>
      <button class="sc-course-image-hotspot__icon-action" data-intent="edit">Expand</button>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const overlay = requireElement<HTMLElement>(
      host,
      ".sc-course-image-hotspot-workspace__overlay",
    );
    const workspace = requireElement<HTMLElement>(host, ".sc-course-image-hotspot-workspace");
    const header = requireElement<HTMLElement>(host, ".sc-course-image-hotspot-workspace__header");
    const body = requireElement<HTMLElement>(
      host,
      ".sc-course-image-hotspot-runtime-workspace__body",
    );
    const actions = Array.from(
      host.querySelectorAll<HTMLElement>(".sc-course-image-hotspot__icon-action"),
    );

    expect(actions.map((action) => getComputedStyle(action).width)).toEqual(["44px", "44px"]);
    expect(actions.map((action) => getComputedStyle(action).height)).toEqual(["44px", "44px"]);
    expect(getComputedStyle(overlay).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(workspace).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(getComputedStyle(workspace).borderTopWidth)).toBeGreaterThan(0);
    expect(Number.parseFloat(getComputedStyle(header).paddingTop)).toBeGreaterThan(0);
    expect(Number.parseFloat(getComputedStyle(body).paddingTop)).toBeGreaterThan(0);
  });

  it("caps a compact image hotspot stage for tall media", async () => {
    await page.viewport(1200, 800);
    host = document.createElement("div");
    host.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
    host.style.width = "700px";
    host.innerHTML = `
      <div
        class="sc-course-image-hotspot-fit-stage"
        data-image-hotspot-presentation="compact"
      ></div>
    `;
    document.body.append(host);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const stage = requireElement<HTMLElement>(host, ".sc-course-image-hotspot-fit-stage");
    expect(stage.getBoundingClientRect().height).toBe(512);
  });
});

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}`);
  return element;
}
