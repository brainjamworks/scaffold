import { afterEach, describe, expect, it } from "vite-plus/test";

import "./grid/view/grid.css";
import "./layout/accordion/accordion.css";
import "./layout/paginated/paginated.css";
import "./layout/process-flow/process-flow.css";
import "./layout/shared/view/layout.css";
import "./layout/tabs/tabs.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Arrangement cascade layering", () => {
  it.each([
    "sc-grid-authoring",
    "sc-layout-frame",
    "sc-accordion-layout",
    "sc-paginated-layout",
    "sc-process-flow",
    "sc-tabs",
  ])("allows adapter positioning overrides on %s", (className) => {
    mountAdapterStyles(`.${className} { position: absolute; }`);

    const arrangement = document.createElement("div");
    arrangement.className = className;
    document.body.append(arrangement);

    expect(getComputedStyle(arrangement).position).toBe("absolute");
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
