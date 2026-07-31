import { afterEach, describe, expect, it } from "vite-plus/test";

import "./Header.css";
import "./editor-rail-chrome.css";
import "./editor-rail-viewport.css";
import "./editor-shell.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Editor shell cascade layering", () => {
  it.each([
    [".sc-editor-header", "position", "static"],
    [".sc-editor-shell", "display", "grid"],
    [".sc-editor-rail-viewport", "display", "grid"],
    [".sc-editor-rail-panel", "display", "block"],
    [".sc-block-strip-popover", "width", "10px"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = document.createElement("div");
    element.className = selector.slice(1);
    document.body.append(element);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
