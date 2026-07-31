import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "./color-picker.css";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
});

describe("Colour picker disabled interactions", () => {
  it("does not apply hover styling to disabled controls", async () => {
    document.documentElement.style.setProperty("--color-primary", "rgb(255, 0, 0)");
    document.documentElement.style.setProperty("--color-ink", "rgb(0, 128, 0)");
    document.documentElement.style.setProperty("--color-muted", "rgb(0, 0, 255)");
    document.documentElement.style.setProperty("--color-text-secondary", "rgb(128, 0, 128)");
    const swatch = document.createElement("button");
    swatch.className = "sc-color-picker-swatch-button";
    swatch.disabled = true;
    const reset = document.createElement("button");
    reset.className = "sc-color-picker-inline-action";
    reset.disabled = true;
    reset.textContent = "Reset";
    const disclosure = document.createElement("button");
    disclosure.className = "sc-color-picker-disclosure";
    disclosure.disabled = true;
    disclosure.textContent = "Custom colour";
    document.body.append(swatch, reset, disclosure);

    await userEvent.hover(swatch);
    expect(getComputedStyle(swatch).transform).toBe("none");

    await userEvent.hover(reset);
    expect(getComputedStyle(reset).color).toBe("rgb(255, 0, 0)");

    await userEvent.hover(disclosure);
    expect(getComputedStyle(disclosure).backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });
});
