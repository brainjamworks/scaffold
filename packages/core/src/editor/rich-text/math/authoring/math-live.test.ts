// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { cleanMathLiveLatex, cleanupMathLiveFloatingUi } from "./math-live";

describe("cleanMathLiveLatex", () => {
  it("removes MathLive placeholders and normalizes special constants", () => {
    expect(
      cleanMathLiveLatex(" \\placeholder{} + \\exponentialE + \\imaginaryI + \\differentialD "),
    ).toBe("+ e + i + d");
  });
});

describe("cleanupMathLiveFloatingUi", () => {
  it("removes leaked MathLive variant panels and their scrim", () => {
    document.body.innerHTML = `
      <div role="presentation">
        <div class="MLK__variant-panel is-visible">x</div>
      </div>
    `;
    document.body.style.overflow = "hidden";
    document.body.style.marginRight = "12px";

    cleanupMathLiveFloatingUi();

    expect(document.querySelector(".MLK__variant-panel")).toBeNull();
    expect(document.querySelector('[role="presentation"]')).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.style.marginRight).toBe("");
  });
});
