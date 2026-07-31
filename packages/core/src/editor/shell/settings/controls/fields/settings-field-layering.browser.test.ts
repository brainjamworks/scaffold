import { afterEach, describe, expect, it } from "vite-plus/test";

import "../../forms/settings-form.css";
import "./data-grid/data-grid-field.css";
import "./settings-field.css";
import "@/ui/components/Input/Input.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Settings field cascade layering", () => {
  it.each([
    [".sc-settings-multi-select", "display", "block"],
    [".sc-settings-segmented", "display", "block"],
    [".sc-settings-card-select", "display", "block"],
    [".sc-settings-color-field__trigger", "display", "inline-flex"],
    [".sc-settings-field-status", "display", "block"],
    [".sc-settings-form__section-actions", "display", "block"],
    [".sc-settings-data-grid", "display", "flex"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = document.createElement("div");
    element.className = selector.slice(1);
    document.body.append(element);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });

  it("provides shared Scaffold styling for segmented settings controls", () => {
    const group = document.createElement("div");
    group.className = "sc-settings-segmented";
    const selected = document.createElement("button");
    selected.className = "sc-settings-segmented__item";
    selected.dataset.state = "on";
    group.append(selected);
    document.body.append(group);

    expect(getComputedStyle(group).display).toBe("inline-flex");
    expect(getComputedStyle(selected).flexGrow).toBe("1");
    expect(getComputedStyle(selected).cursor).toBe("pointer");
  });

  it("provides shared Scaffold styling for card settings controls", () => {
    const group = document.createElement("div");
    group.className = "sc-settings-card-select";
    const selected = document.createElement("button");
    selected.className = "sc-settings-card-select__item";
    selected.dataset.state = "on";
    group.append(selected);
    document.body.append(group);

    expect(getComputedStyle(group).display).toBe("grid");
    expect(getComputedStyle(selected).display).toBe("grid");
    expect(getComputedStyle(selected).cursor).toBe("pointer");
  });

  it("keeps colour status metadata centred with its field label", () => {
    const heading = document.createElement("span");
    heading.className = "sc-settings-color-field__heading";
    const label = document.createElement("span");
    label.className = "sc-field-label sc-settings-color-field__label";
    label.textContent = "Primary";
    const status = document.createElement("span");
    status.className = "sc-pill sc-settings-field-status";
    status.textContent = "Automatic";
    heading.append(label, status);
    document.body.append(heading);

    expect(verticalCenter(status)).toBeCloseTo(verticalCenter(label), 0);
  });
});

function verticalCenter(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
