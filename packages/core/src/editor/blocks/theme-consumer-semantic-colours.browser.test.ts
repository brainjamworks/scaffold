import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./assessment/matching/Matching.css";
import "@/theme/course/designs/scaffold-flow/v1/assessment-matching.css";
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
    const course = appendElement(fixture, "div", "sc-course sc-course-theme-scaffold-flow-v1");
    const correctTarget = appendElement(course, "div", "sc-course-matching__target");
    correctTarget.dataset["courseState"] = "correct";
    const correctIcon = appendElement(correctTarget, "span", "sc-course-matching__state-cue");
    const incorrectTarget = appendElement(course, "div", "sc-course-matching__target");
    incorrectTarget.dataset["courseState"] = "incorrect";
    const incorrectIcon = appendElement(incorrectTarget, "span", "sc-course-matching__state-cue");

    expect(getComputedStyle(correctTarget).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(correctIcon).color).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(incorrectIcon).color).toBe("rgb(220, 38, 38)");
  });

  it("uses success and error tokens for sequencing result states", () => {
    const fixture = createFixture();
    const course = appendElement(fixture, "div", "sc-course sc-course-theme-scaffold-flow-v1");
    const correctItem = appendElement(course, "div", "sc-course-sequencing__item");
    correctItem.dataset["courseState"] = "correct";
    const correctCue = appendElement(correctItem, "span", "sc-course-sequencing__state-cue");
    const incorrectItem = appendElement(course, "div", "sc-course-sequencing__item");
    incorrectItem.dataset["courseState"] = "incorrect";

    expect(getComputedStyle(correctItem).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(correctItem).color).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(correctCue).color).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(incorrectItem).borderColor).toBe("rgb(220, 38, 38)");
  });

  it("uses the success family for flashcard mastery", () => {
    const fixture = createFixture();
    const course = appendElement(fixture, "div", "sc-course sc-course-theme-scaffold-flow-v1");
    const badge = appendElement(course, "span", "sc-course-flashcard-card__mastery-badge");
    badge.dataset["courseState"] = "completed";
    const activeButton = appendElement(course, "button", "sc-course-flashcard-rating-button");
    activeButton.dataset["courseState"] = "completed";
    const mastered = appendElement(course, "div", "sc-course-flashcard-mastered");
    const masteredIcon = appendElement(mastered, "span", "sc-course-flashcard-mastered__icon");

    expect(getComputedStyle(badge).backgroundColor).toBe("rgb(220, 252, 231)");
    expect(getComputedStyle(activeButton).borderColor).toBe("rgb(22, 163, 74)");
    expect(getComputedStyle(activeButton).backgroundColor).toBe("rgb(220, 252, 231)");
    expect(getComputedStyle(activeButton).color).toBe("rgb(20, 83, 45)");
    expect(getComputedStyle(masteredIcon).color).toBe("rgb(20, 83, 45)");
  });

  it("keeps current Flow learner interaction selectors on Course-owned tokens", () => {
    const fixture = createFixture();
    const course = appendElement(fixture, "div", "sc-course sc-course-theme-scaffold-flow-v1");
    const missedHotspot = appendElement(course, "span", "sc-course-image-hotspot-marker");
    missedHotspot.dataset["hotspotState"] = "miss";

    expect(getComputedStyle(missedHotspot, "::before").backgroundColor).toBe("rgb(254, 226, 226)");
    expect(
      cssRuleText(
        ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-categorise__remove-action:hover",
      ),
    ).toContain("var(--accent-11)");
    expect(
      cssRuleText(
        ".sc-course.sc-course-theme-scaffold-flow-v1 .sc-course-dropdown-select__trigger:focus-visible",
      ),
    ).toContain("var(--accent-9)");
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
  fixture.style.setProperty("--sc-course-author-density", "1");
  fixture.style.setProperty("--sc-course-author-stroke-width", "1px");
  fixture.style.setProperty("--sc-course-author-text-scale", "1");
  fixture.style.setProperty("--sc-course-state-correct-border", "rgb(22 163 74)");
  fixture.style.setProperty("--sc-course-state-correct-background", "rgb(220 252 231)");
  fixture.style.setProperty("--sc-course-state-correct-text", "rgb(22 163 74)");
  fixture.style.setProperty("--sc-course-state-incorrect-border", "rgb(220 38 38)");
  fixture.style.setProperty("--sc-course-state-incorrect-background", "rgb(254 226 226)");
  fixture.style.setProperty("--sc-course-state-incorrect-text", "rgb(220 38 38)");
  fixture.style.setProperty("--sc-course-state-incorrect-indicator", "rgb(220 38 38)");
  fixture.style.setProperty("--sc-course-state-completed-border", "rgb(22 163 74)");
  fixture.style.setProperty("--sc-course-state-completed-background", "rgb(220 252 231)");
  fixture.style.setProperty("--sc-course-state-completed-text", "rgb(20 83 45)");
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
      if (
        rule instanceof CSSStyleRule &&
        rule.selectorText.split(",").some((candidate) => candidate.trim() === selector)
      ) {
        return rule.cssText;
      }
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
