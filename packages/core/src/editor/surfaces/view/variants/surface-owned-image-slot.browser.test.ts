import { afterEach, describe, expect, it } from "vite-plus/test";

import "./surface-owned-image-slot.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Surface-owned image slot geometry", () => {
  it("allows adapter-layer media overrides without losing slot bounds", () => {
    const adapterStyles = document.createElement("style");
    adapterStyles.textContent = `
      @layer sc-adapters {
        .sc-surface-owned-image-slot__media {
          object-fit: contain;
        }
      }
    `;
    document.head.append(adapterStyles);
    mountedStyles.push(adapterStyles);

    const slot = document.createElement("div");
    slot.className = "sc-surface-owned-image-slot";
    slot.style.cssText = "width: 320px; height: 180px;";

    const media = document.createElement("img");
    media.className = "sc-surface-owned-image-slot__media";
    slot.append(media);
    document.body.append(slot);

    expect(getComputedStyle(slot).display).toBe("block");
    expect(getComputedStyle(slot).overflow).toBe("hidden");
    expect(media.getBoundingClientRect().width).toBeCloseTo(320, 0);
    expect(media.getBoundingClientRect().height).toBeCloseTo(180, 0);
    expect(getComputedStyle(media).objectFit).toBe("contain");
  });
});
