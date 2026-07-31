import { afterEach, describe, expect, it } from "vite-plus/test";

import "./header-footer-slots.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Surface header and footer slot geometry", () => {
  it("allows adapter-layer overrides without losing the three slot positions", () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        [data-slot="surface-header"] {
          column-gap: 1px;
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const header = document.createElement("header");
    header.dataset.slot = "surface-header";

    const left = slot("left");
    const center = slot("center");
    const right = slot("right");
    header.append(left, center, right);
    document.body.append(header);

    const style = getComputedStyle(header);
    expect(style.display).toBe("grid");
    expect(style.gridTemplateColumns.split(" ")).toHaveLength(3);
    expect(getComputedStyle(left).gridColumnStart).toBe("1");
    expect(getComputedStyle(center).gridColumnStart).toBe("2");
    expect(getComputedStyle(right).gridColumnStart).toBe("3");
    expect(style.columnGap).toBe("1px");
  });
});

function slot(position: "left" | "center" | "right"): HTMLElement {
  const element = document.createElement("div");
  element.dataset.headerFooterSlot = "";
  element.dataset.headerFooterSlotPosition = position;
  return element;
}
