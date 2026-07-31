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

  it("allows adapter border overrides on authoring Region chrome", () => {
    mountAdapterStyles(`
      .sc-region-authoring::before {
        border: 2px solid transparent;
      }
    `);

    const region = document.createElement("div");
    region.className = "sc-region-authoring";
    document.body.append(region);

    expect(getComputedStyle(region, "::before").content).not.toBe("none");
    expect(getComputedStyle(region, "::before").borderTopStyle).toBe("solid");
    expect(getComputedStyle(region, "::before").borderTopWidth).toBe("2px");
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
