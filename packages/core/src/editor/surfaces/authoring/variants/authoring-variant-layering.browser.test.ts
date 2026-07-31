import { afterEach, describe, expect, it } from "vite-plus/test";

import "./page-default.css";
import "./slide-cover.css";
import "./slide-module-cover.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Authoring variant cascade layering", () => {
  it("allows adapter sizing overrides on fluid page-default surfaces", () => {
    mountAdapterStyles(`
      .scaffold-authoring-surface-view [data-surface].sc-page-default-surface-view {
        max-width: none;
      }
    `);

    const frame = document.createElement("div");
    frame.className = "scaffold-authoring-surface-view";
    frame.dataset.surfaceSize = "fluid";
    const surface = document.createElement("article");
    surface.className = "sc-page-default-surface-view";
    surface.dataset.surface = "";
    frame.append(surface);
    document.body.append(frame);

    expect(getComputedStyle(surface).maxWidth).toBe("none");
  });

  it("allows adapter placeholder overrides on slide-cover titles", () => {
    mountAdapterStyles(`
      .scaffold-authoring-surface-view
        [data-surface].sc-slide-cover-surface-view
        h1.is-empty::before {
        opacity: 1;
      }
    `);

    const title = mountEmptyTitle("sc-slide-cover-surface-view");

    expect(getComputedStyle(title, "::before").content).not.toBe("none");
    expect(getComputedStyle(title, "::before").opacity).toBe("1");
  });

  it("allows adapter placeholder overrides on module-cover subtitle fields", () => {
    mountAdapterStyles(`
      .scaffold-authoring-surface-view
        [data-surface].sc-slide-module-cover-surface-view
        [data-slot="slide-cover-subtitle"]
        p.is-empty::before {
        opacity: 1;
      }
    `);

    const frame = document.createElement("div");
    frame.className = "scaffold-authoring-surface-view";
    const surface = document.createElement("article");
    surface.className = "sc-slide-module-cover-surface-view";
    surface.dataset.surface = "";
    const field = document.createElement("div");
    field.dataset.slot = "slide-cover-subtitle";
    const paragraph = document.createElement("p");
    paragraph.className = "is-empty";
    paragraph.dataset.placeholder = "Module label";
    field.append(paragraph);
    surface.append(field);
    frame.append(surface);
    document.body.append(frame);

    expect(getComputedStyle(paragraph, "::before").content).not.toBe("none");
    expect(getComputedStyle(paragraph, "::before").opacity).toBe("1");
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}

function mountEmptyTitle(surfaceClassName: string): HTMLHeadingElement {
  const frame = document.createElement("div");
  frame.className = "scaffold-authoring-surface-view";
  const surface = document.createElement("article");
  surface.className = surfaceClassName;
  surface.dataset.surface = "";
  const title = document.createElement("h1");
  title.className = "is-empty";
  title.dataset.placeholder = "Slide title";
  surface.append(title);
  frame.append(surface);
  document.body.append(frame);
  return title;
}
