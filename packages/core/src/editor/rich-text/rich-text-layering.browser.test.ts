import { afterEach, describe, expect, it } from "vite-plus/test";

import "./authoring/nested-overlay/RichTextArea.css";
import "./authoring/nested-overlay/nested-rich-text-editor-field.css";
import "./inline-icon/view/inline-icon.css";
import "./math/authoring/math-inline.css";
import "./runtime/render-rich-text.css";
import "./view/field-content.css";
import "./view/text-alignment.css";
import "./vocabulary-term/view/vocabulary-term.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Rich-text cascade layering", () => {
  it.each([
    [".sc-nested-rich-text-editor-field__editor.sc-rich-text-area", "min-height", "0px"],
    [".sc-nested-rich-text-editor-field__editor", "max-width", "10px"],
    [".sc-inline-icon", "display", "block"],
    [".sc-inline-math", "display", "block"],
    [".sc-runtime-rich-text-heading", "font-weight", "400"],
    [".sc-field-content", "word-break", "break-all"],
    ['[data-text-align="center"]', "margin-left", "10px"],
    [".sc-vocabulary-term", "position", "static"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = mountMatchingElement(selector);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });

  it("allows adapter sizing overrides on vocabulary popover content", () => {
    mountAdapterStyles(".sc-vocabulary-term__content { max-width: none; }");

    const content = document.createElement("div");
    content.className = "sc-vocabulary-term__content";
    document.body.append(content);

    expect(getComputedStyle(content).maxWidth).toBe("none");
  });

  it("centers a small inline icon within its surrounding text line", () => {
    const line = document.createElement("p");
    line.style.fontSize = "16px";
    line.style.lineHeight = "24px";
    line.textContent = "Before ";

    const icon = document.createElement("span");
    icon.className = "sc-inline-icon";
    icon.dataset.iconSize = "sm";
    line.append(icon, " after");
    document.body.append(line);

    const lineRect = line.getBoundingClientRect();
    const iconRect = icon.getBoundingClientRect();
    const lineCenter = lineRect.top + lineRect.height / 2;
    const iconCenter = iconRect.top + iconRect.height / 2;

    expect(Math.abs(iconCenter - lineCenter)).toBeLessThan(1.1);
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}

function mountMatchingElement(selector: string): HTMLElement {
  const element = document.createElement("div");
  if (selector.startsWith(".")) {
    element.className = selector.split(".").filter(Boolean).join(" ");
  } else {
    element.dataset.textAlign = "center";
  }
  document.body.append(element);
  return element;
}
