import { afterEach, describe, expect, it } from "vite-plus/test";

import "./AuthoringSlideDividers.css";
import "./nodes/region-authoring.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Authoring surface chrome cascade layering", () => {
  it("allows adapter sizing overrides on slide-divider buttons", () => {
    mountAdapterStyles(`
      .scaffold-authoring-surface-view .sc-authoring-slide-divider__button {
        width: 2rem;
      }
    `);

    const frame = document.createElement("div");
    frame.className = "scaffold-authoring-surface-view";
    const button = document.createElement("button");
    button.className = "sc-authoring-slide-divider__button";
    frame.append(button);
    document.body.append(frame);

    expect(getComputedStyle(button).display).toBe("inline-flex");
    expect(getComputedStyle(button).width).toBe("32px");
  });

  it("keeps slide-divider chrome on application tokens inside a course theme scope", () => {
    const application = document.createElement("div");
    application.style.setProperty("--sc-app-color-background", "rgb(10, 20, 30)");
    application.style.setProperty("--sc-app-color-border", "rgb(40, 50, 60)");
    application.style.setProperty("--sc-app-color-text-secondary", "rgb(70, 80, 90)");
    const course = document.createElement("div");
    course.className = "scaffold-authoring-surface-view";
    course.style.setProperty("--color-background", "rgb(200, 210, 220)");
    course.style.setProperty("--color-border", "rgb(180, 190, 200)");
    const divider = document.createElement("div");
    divider.className = "sc-authoring-slide-divider";
    const rule = document.createElement("span");
    rule.className = "sc-authoring-slide-divider__rule";
    const button = document.createElement("button");
    button.className = "sc-authoring-slide-divider__button";
    divider.append(rule, button);
    course.append(divider);
    application.append(course);
    document.body.append(application);

    expect(getComputedStyle(button).backgroundColor).toBe("rgb(10, 20, 30)");
    expect(getComputedStyle(button).borderTopColor).toBe("rgb(40, 50, 60)");
    expect(getComputedStyle(button).color).toBe("rgb(70, 80, 90)");
    expect(getComputedStyle(rule).borderTopColor).toBe("rgb(40, 50, 60)");
  });

  it("keeps authoring Region chrome on App tokens across Course themes", () => {
    const resting = mountAuthoringRegion({
      appBorder: "rgb(40, 50, 60)",
      appPrimary: "rgb(10, 20, 30)",
      appTextSecondary: "rgb(70, 80, 90)",
      courseBorder: "rgb(140, 150, 160)",
      coursePrimary: "rgb(110, 120, 130)",
    });
    const active = mountAuthoringRegion({
      active: true,
      appBorder: "rgb(40, 50, 60)",
      appPrimary: "rgb(10, 20, 30)",
      appTextSecondary: "rgb(70, 80, 90)",
      courseBorder: "rgb(240, 230, 220)",
      coursePrimary: "rgb(210, 200, 190)",
    });
    const appDark = mountAuthoringRegion({
      appBorder: "rgb(200, 210, 220)",
      appPrimary: "rgb(170, 180, 190)",
      appTextSecondary: "rgb(230, 240, 250)",
      courseBorder: "rgb(140, 150, 160)",
      coursePrimary: "rgb(110, 120, 130)",
    });

    const restingOutline = getComputedStyle(resting, "::before");
    const activeOutline = getComputedStyle(active, "::before");
    const appDarkOutline = getComputedStyle(appDark, "::before");

    expect(restingOutline.borderTopStyle).toBe("dotted");
    expect(restingOutline.borderTopColor).toBe(activeOutline.borderTopColor);
    expect(restingOutline.borderTopColor).not.toBe(appDarkOutline.borderTopColor);
    expect(getComputedStyle(resting, "::after").content).toBe("none");
    expect(getComputedStyle(appDark, "::after").content).toBe("none");
  });

  it("allows adapter border overrides on authoring Region chrome", () => {
    mountAdapterStyles(`
      .sc-app-region-authoring::before {
        border: 2px solid transparent;
      }
    `);

    const region = document.createElement("div");
    region.className = "sc-app-region-authoring";
    document.body.append(region);

    expect(getComputedStyle(region, "::before").content).not.toBe("none");
    expect(getComputedStyle(region, "::before").borderTopStyle).toBe("solid");
    expect(getComputedStyle(region, "::before").borderTopWidth).toBe("2px");
  });
});

function mountAuthoringRegion({
  active = false,
  appBorder,
  appPrimary,
  appTextSecondary,
  courseBorder,
  coursePrimary,
}: {
  active?: boolean;
  appBorder: string;
  appPrimary: string;
  appTextSecondary: string;
  courseBorder: string;
  coursePrimary: string;
}): HTMLElement {
  const application = document.createElement("div");
  application.style.setProperty("--sc-app-color-border", appBorder);
  application.style.setProperty("--sc-app-color-primary", appPrimary);
  application.style.setProperty("--sc-app-color-text-secondary", appTextSecondary);

  const course = document.createElement("div");
  course.className = "sc-slide-layout-surface-view sc-slide-layout-surface-authoring-view";
  course.dataset.slideLayoutVariant = "slide-content";
  course.dataset.slideLayoutComposition = "content";
  course.style.setProperty("--color-border", courseBorder);
  course.style.setProperty("--color-primary", coursePrimary);
  course.style.setProperty("--color-text-secondary", courseBorder);

  const region = document.createElement("div");
  region.className = "sc-app-region-authoring";
  region.dataset.empty = "true";
  if (active) region.dataset.authoringChromeActive = "";

  course.append(region);
  application.append(course);
  document.body.append(application);
  return region;
}

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
