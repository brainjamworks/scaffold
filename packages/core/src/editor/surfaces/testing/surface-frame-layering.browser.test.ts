import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "../authoring/views/AuthoringSurfaceView.css";
import "../runtime/views/RuntimeSurfaceView.css";
import "../view/variants/slide-content.css";
import "../view/variants/slide-image-band.css";
import "../view/variants/slide-image-cover.css";
import "../view/variants/slide-layout.css";
import "../view/variants/slide-module-cover.css";
import "../view/variants/surface-owned-image-slot.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Surface frame cascade layering", () => {
  it("applies course stroke to authored page surfaces without changing the application default", () => {
    const applicationFrame = createPageSurfaceFrame();
    const courseFrame = createPageSurfaceFrame();
    courseFrame.classList.add("sc-course-theme-scope");
    courseFrame.style.setProperty("--sc-course-color-border", "rgb(10 20 30)");
    courseFrame.style.setProperty("--sc-course-stroke", "3px");
    document.body.append(applicationFrame, courseFrame);

    expect(getComputedStyle(applicationFrame.querySelector("[data-surface]")!).borderTopWidth).toBe(
      "1px",
    );
    expect(getComputedStyle(courseFrame.querySelector("[data-surface]")!).borderTopWidth).toBe(
      "3px",
    );
  });

  it("applies course stroke to standard slide separators and empty media frames", () => {
    const application = createSlideMetricFixture();
    const course = createSlideMetricFixture();
    course.classList.add("sc-course-theme-scope");
    course.style.setProperty("--sc-course-color-border", "rgb(10 20 30)");
    course.style.setProperty("--sc-course-stroke", "3px");
    document.body.append(application, course);

    expect(readSlideMetricBorders(application)).toEqual(["1px", "1px", "1px", "1px"]);
    expect(readSlideMetricBorders(course)).toEqual(["3px", "3px", "3px", "3px"]);
  });

  it.each(["authoring", "runtime"] as const)(
    "allows adapter padding overrides on the %s slide frame without losing layout geometry",
    (renderer) => {
      const adapterStyles = document.createElement("style");
      adapterStyles.textContent = `
        @layer sc-adapters {
          .scaffold-${renderer}-surface-view [data-surface] {
            padding: 1px;
          }
        }
      `;
      document.head.append(adapterStyles);
      mountedStyles.push(adapterStyles);

      const frame = document.createElement("div");
      frame.className = `scaffold-${renderer}-surface-view`;
      frame.dataset.courseMode = "slideshow";
      frame.dataset.surfaceSize = "16x9";

      const surface = document.createElement("article");
      surface.className = "sc-slide-layout-surface-view";
      surface.dataset.surface = "";
      frame.append(surface);
      document.body.append(frame);

      expect(getComputedStyle(surface).display).toBe("grid");
      expect(getComputedStyle(surface).boxSizing).toBe("border-box");
      expect(getComputedStyle(surface).padding).toBe("1px");
    },
  );

  it.each(["authoring", "runtime"] as const)(
    "allows adapter padding overrides on the %s slide-content frame without losing layout geometry",
    (renderer) => {
      const adapterStyles = document.createElement("style");
      adapterStyles.textContent = `
        @layer sc-adapters {
          .scaffold-${renderer}-surface-view .sc-slide-content-surface-view {
            padding: 1px;
          }
        }
      `;
      document.head.append(adapterStyles);
      mountedStyles.push(adapterStyles);

      const frame = document.createElement("div");
      frame.className = `scaffold-${renderer}-surface-view`;
      frame.dataset.courseMode = "slideshow";
      frame.dataset.surfaceSize = "16x9";

      const surface = document.createElement("article");
      surface.className = "sc-slide-content-surface-view";
      if (renderer === "authoring") {
        surface.dataset.surface = "";
        frame.append(surface);
      } else {
        const rendererSurface = document.createElement("section");
        rendererSurface.dataset.surface = "";
        rendererSurface.dataset.surfaceVariant = "slide-content";
        rendererSurface.append(surface);
        frame.append(rendererSurface);
      }
      document.body.append(frame);

      expect(getComputedStyle(surface).display).toBe("grid");
      expect(getComputedStyle(surface).boxSizing).toBe("border-box");
      expect(getComputedStyle(surface).padding).toBe("1px");
    },
  );
});

function createPageSurfaceFrame(): HTMLElement {
  const frame = document.createElement("div");
  frame.className = "scaffold-authoring-surface-view";
  frame.dataset.courseMode = "page";
  const surface = document.createElement("article");
  surface.dataset.surface = "";
  frame.append(surface);
  return frame;
}

function createSlideMetricFixture(): HTMLElement {
  const fixture = document.createElement("section");
  fixture.innerHTML = `
    <div class="sc-slide-image-cover-surface-view">
      <div data-slot="slide-image-cover-image"></div>
    </div>
    <div class="sc-slide-image-band-image__missing"></div>
    <div class="sc-slide-module-cover-surface-view">
      <div data-slot="slide-cover-subtitle"></div>
    </div>
    <div class="sc-surface-owned-image-slot__missing"></div>
  `;
  return fixture;
}

function readSlideMetricBorders(fixture: ParentNode): string[] {
  return [
    getComputedStyle(fixture.querySelector('[data-slot="slide-image-cover-image"]')!)
      .borderLeftWidth,
    getComputedStyle(fixture.querySelector(".sc-slide-image-band-image__missing")!).borderTopWidth,
    getComputedStyle(fixture.querySelector('[data-slot="slide-cover-subtitle"]')!).borderTopWidth,
    getComputedStyle(fixture.querySelector(".sc-surface-owned-image-slot__missing")!)
      .borderTopWidth,
  ];
}
