import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "@/runtime/players/slideshow/SlideshowPlayer.css";
import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

import "../authoring/views/AuthoringSurfaceView.css";
import "../runtime/views/RuntimeSurfaceView.css";
import "../variants/slide-image-band/styles.css";
import "../variants/slide-image-cover/styles.css";
import "../view/variants/slide-layout.css";
import "../variants/slide-module-cover/styles.css";
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
    courseFrame.classList.add("sc-course");
    courseFrame.style.setProperty("--color-border", "rgb(10 20 30)");
    courseFrame.style.setProperty("--sc-border-width", "3px");
    document.body.append(applicationFrame, courseFrame);

    expect(getComputedStyle(applicationFrame.querySelector("[data-surface]")!).borderTopWidth).toBe(
      "1px",
    );
    expect(getComputedStyle(courseFrame.querySelector("[data-surface]")!).borderTopWidth).toBe(
      "3px",
    );
  });

  it("keeps slide separator and empty-media presentation out of the neutral layer", () => {
    const application = createSlideMetricFixture();
    const course = createSlideMetricFixture();
    course.classList.add("sc-course");
    course.style.setProperty("--color-border", "rgb(10 20 30)");
    course.style.setProperty("--sc-border-width", "3px");
    document.body.append(application, course);

    expect(readSlideMetricBorders(application)).toEqual(["0px", "0px", "0px", "0px"]);
    expect(readSlideMetricBorders(course)).toEqual(["0px", "0px", "0px", "0px"]);
  });

  it.each([
    ["sc-course-theme-scaffold-flow-v1", "1px"],
    ["sc-course-theme-pocket-atlas-v1", "2px"],
  ])("lets %s own the surface image-slot placeholder", (themeClass, expectedBorder) => {
    const course = document.createElement("section");
    course.className = `sc-course ${themeClass}`;
    course.style.setProperty("--gray-a2", "rgb(245 245 245)");
    course.style.setProperty("--gray-a6", "rgb(150 150 150)");
    course.style.setProperty("--sc-course-author-stroke-width", "1px");
    course.innerHTML = `
      <div class="sc-slide-layout-surface-view" data-slide-layout-variant="slide-diptych">
        <div class="sc-surface-owned-image-slot">
          <div class="sc-surface-owned-image-slot__missing"></div>
        </div>
      </div>
    `;
    document.body.append(course);

    const slot = course.querySelector<HTMLElement>(".sc-surface-owned-image-slot")!;
    const missing = course.querySelector<HTMLElement>(".sc-surface-owned-image-slot__missing")!;
    expect(getComputedStyle(slot).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(missing).borderTopWidth).toBe(expectedBorder);
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

  it("uses a square application boundary around the authoring slide canvas", () => {
    const frame = document.createElement("div");
    frame.className = "scaffold-authoring-surface-view";
    frame.dataset.courseMode = "slideshow";
    frame.style.setProperty("--sc-app-color-border", "rgb(10 20 30)");
    frame.style.setProperty("--sc-app-radius-surface", "8px");

    const stage = document.createElement("div");
    stage.className = "sc-slideshow-authoring-surface-stage";
    frame.append(stage);
    document.body.append(frame);

    expect(getComputedStyle(stage).borderRadius).toBe("0px");
    expect(getComputedStyle(stage, "::after").borderRadius).toBe("0px");
    expect(getComputedStyle(stage, "::after").borderTopWidth).toBe("1px");
  });

  it("uses a square neutral boundary around the runtime slide canvas", () => {
    const stage = document.createElement("div");
    stage.className = "sc-slideshow-player__stage";
    stage.style.setProperty("--color-border", "rgb(10 20 30)");
    document.body.append(stage);

    const boundary = getComputedStyle(stage, "::after");
    expect(getComputedStyle(stage).borderRadius).toBe("0px");
    expect(boundary.borderRadius).toBe("0px");
    expect(boundary.borderTopWidth).toBe("1px");
    expect(boundary.borderTopColor).toBe("rgb(10, 20, 30)");
    expect(boundary.pointerEvents).toBe("none");
  });
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
