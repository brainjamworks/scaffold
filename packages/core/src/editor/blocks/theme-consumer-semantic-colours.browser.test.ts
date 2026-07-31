import { afterEach, describe, expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser/context";

import "@/styles/globals.css";

import "./assessment/matching/Matching.css";
import "./assessment/sequencing/Sequencing.css";
import "./assessment/categorise/Categorise.css";
import "./assessment/dropdown/Dropdown.css";
import "./assessment/image-hotspot/ImageHotspot.css";
import "./assessment/quiz/Quiz.css";
import "./presentation/flashcard/flashcard.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("course consumer semantic colours", () => {
  it("uses success and error tokens for matching result states", () => {
    const fixture = createFixture();
    const correctTarget = appendElement(fixture, "div", "sc-matching-runtime-target--correct");
    const correctIcon = appendElement(fixture, "span", "sc-matching-runtime-status-icon--correct");
    const incorrectIcon = appendElement(
      fixture,
      "span",
      "sc-matching-runtime-status-icon--incorrect",
    );

    expect(getComputedStyle(correctTarget).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(correctIcon).color).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(incorrectIcon).color).toBe("rgb(220, 38, 38)");
  });

  it("uses success and error tokens for sequencing result states", () => {
    const fixture = createFixture();
    const answerKey = appendElement(fixture, "div", "sc-sequencing-item--answer-key");
    const correctDot = appendElement(fixture, "span", "sc-sequencing-position-dot--correct");
    const incorrectDot = appendElement(fixture, "span", "sc-sequencing-position-dot--incorrect");

    expect(getComputedStyle(answerKey).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(answerKey).color).toBe("rgb(20, 83, 45)");
    expect(getComputedStyle(correctDot).backgroundColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(incorrectDot).backgroundColor).toBe("rgb(220, 38, 38)");
  });

  it("uses the success family for flashcard mastery", async () => {
    const fixture = createFixture();
    const badge = appendElement(fixture, "span", "sc-flashcard-card__mastery-badge--got-it");
    const activeButton = appendElement(
      fixture,
      "button",
      "sc-flashcard-rating-button--got-it-active",
    );
    const idleButton = appendElement(fixture, "button", "sc-flashcard-rating-button--got-it-idle");
    idleButton.textContent = "Got it";
    const masteredIcon = appendElement(fixture, "span", "sc-flashcard-mastered__icon");

    await userEvent.hover(idleButton);

    expect(getComputedStyle(badge).backgroundColor).toBe("rgb(220, 252, 231)");
    expect(getComputedStyle(activeButton).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(activeButton).backgroundColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(activeButton).color).toBe("rgb(240, 253, 244)");
    expect(getComputedStyle(idleButton).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(masteredIcon).color).toBe("rgb(22, 163, 74)");
  });

  it("derives neutral learner interaction washes from course text colours", async () => {
    const fixture = createFixture();
    const missedHotspot = appendElement(fixture, "span", "sc-image-hotspot-marker--miss");

    expect(getComputedStyle(missedHotspot).backgroundColor).toBe(
      "color(srgb 0.419608 0.447059 0.501961 / 0.7)",
    );
    expect(cssRuleText(".sc-categorise-runtime-remove:hover")).toContain("var(--color-ink)");
    expect(cssRuleText(".sc-dropdown-runtime__trigger:focus")).toContain(
      "var(--color-focus-outline)",
    );
    expect(cssRuleText(".sc-quiz__completion-mark")).toContain("var(--color-success)");
  });
});

function createFixture(): HTMLDivElement {
  const fixture = document.createElement("div");
  fixture.style.setProperty("--color-accent", "rgb(124 58 237)");
  fixture.style.setProperty("--color-accent-foreground", "rgb(255 255 255)");
  fixture.style.setProperty("--color-secondary", "rgb(8 145 178)");
  fixture.style.setProperty("--color-success", "rgb(22 163 74)");
  fixture.style.setProperty("--color-success-foreground", "rgb(240 253 244)");
  fixture.style.setProperty("--color-success-bg", "rgb(220 252 231)");
  fixture.style.setProperty("--color-success-text", "rgb(20 83 45)");
  fixture.style.setProperty("--color-error", "rgb(220 38 38)");
  fixture.style.setProperty("--color-error-bg", "rgb(254 226 226)");
  fixture.style.setProperty("--color-error-text", "rgb(127 29 29)");
  fixture.style.setProperty("--color-background", "rgb(255 255 255)");
  fixture.style.setProperty("--color-border", "rgb(209 213 219)");
  fixture.style.setProperty("--color-text-muted", "rgb(107 114 128)");
  fixture.style.setProperty("--color-ink", "rgb(17 24 39)");
  document.body.append(fixture);
  return fixture;
}

function appendElement<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tagName: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  element.className = className;
  parent.append(element);
  return element;
}

function cssRuleText(selector: string): string {
  const visit = (rules: CSSRuleList): string => {
    for (const rule of rules) {
      if (rule instanceof CSSStyleRule && rule.selectorText === selector) return rule.cssText;
      if ("cssRules" in rule) {
        const nested = visit((rule as CSSGroupingRule).cssRules);
        if (nested) return nested;
      }
    }
    return "";
  };

  for (const sheet of document.styleSheets) {
    const match = visit(sheet.cssRules);
    if (match) return match;
  }
  return "";
}
