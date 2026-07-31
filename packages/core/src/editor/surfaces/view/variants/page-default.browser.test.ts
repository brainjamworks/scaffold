import { afterEach, describe, expect, it } from "vite-plus/test";

import "./page-default.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Page-default surface geometry", () => {
  it("allows adapter-layer flow overrides without losing page sizing", () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-page-default-surface-view {
          --sc-surface-flow-gap: 1px;
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const page = document.createElement("article");
    page.className = "sc-page-default-surface-view";

    const header = document.createElement("header");
    header.dataset.slot = "surface-header";
    page.append(header);
    document.body.append(page);

    expect(page.getBoundingClientRect().width).toBeCloseTo(document.body.clientWidth, 0);
    expect(getComputedStyle(page).boxSizing).toBe("border-box");
    expect(getComputedStyle(header).marginBlockEnd).toBe("1px");
  });
});
