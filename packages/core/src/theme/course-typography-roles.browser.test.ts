import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/editor/blocks/assessment/shared/nodes/assessment-shared-chrome.css";
import "@/editor/blocks/assessment/shared/chrome/assessment-controls.css";
import "@/editor/blocks/assessment/categorise/Categorise.css";
import "@/editor/blocks/assessment/quiz/Quiz.css";
import "@/editor/blocks/code/code-block/CodeBlock.css";
import "@/editor/blocks/media/AudioPlayer.css";
import "@/editor/blocks/presentation/callout/Callout.css";
import "@/editor/blocks/presentation/comparison/Comparison.css";
import "@/editor/blocks/presentation/pull-quote/PullQuote.css";
import "@/editor/blocks/presentation/roadmap/Roadmap.css";
import "@/editor/blocks/presentation/sidebar/Sidebar.css";
import "@/editor/blocks/presentation/stat-highlight/StatHighlight.css";
import "@/editor/blocks/presentation/timeline/timeline.css";
import "@/editor/blocks/resources/resource-link/ResourceLink.css";
import "@/editor/blocks/structured-content/checklist/Checklist.css";
import "@/editor/blocks/structured-content/glossary/Glossary.css";
import "@/editor/blocks/structured-content/numbered-list/NumberedList.css";
import "@/editor/blocks/structured-content/table/Table.css";
import "@/ui/components/Button/Button.css";
import "@/ui/components/Input/Input.css";
import "@/ui/components/Lightbox/Lightbox.css";

afterEach(() => {
  document.body.replaceChildren();
});

describe("course typography roles", () => {
  it.each([
    ["callout title", "div", "sc-callout__title"],
    ["sidebar title", "div", "sc-sidebar__title"],
    ["pull quote", "div", "sc-pull-quote__body"],
    ["stat value", "div", "sc-stat-highlight__value"],
    ["numbered-list title", "div", "sc-numbered-list__title"],
    ["glossary term", "div", "sc-glossary__term"],
    ["audio title", "div", "sc-audio-player__title"],
    ["resource title", "div", "sc-resource-link__title"],
    ["assessment prompt", "div", "sc-assessment-prompt"],
    ["categorise title", "div", "sc-categorise-runtime-category__title"],
    ["quiz title", "div", "sc-quiz__runtime-title"],
    ["roadmap title", "h3", "sc-roadmap__content-title"],
    ["timeline title", "p", "sc-timeline__content-title"],
  ] as const)("uses the heading role for %s", (_label, tagName, className) => {
    const element = mountCourseElement(tagName, className);
    prepareSelectorContext(element);

    expect(getComputedStyle(element).fontFamily).toContain("Heading Test");
  });

  it.each([
    ["callout title", "div", "sc-callout__title"],
    ["sidebar title", "div", "sc-sidebar__title"],
    ["numbered-list title", "div", "sc-numbered-list__title"],
    ["glossary term", "div", "sc-glossary__term"],
    ["audio title", "div", "sc-audio-player__title"],
    ["resource title", "div", "sc-resource-link__title"],
    ["assessment prompt", "div", "sc-assessment-prompt"],
    ["categorise title", "div", "sc-categorise-runtime-category__title"],
    ["quiz title", "div", "sc-quiz__runtime-title"],
    ["roadmap title", "h3", "sc-roadmap__content-title"],
    ["timeline title", "p", "sc-timeline__content-title"],
  ] as const)("uses the complete heading treatment for %s", (_label, tagName, className) => {
    const element = mountCourseElement(tagName, className);
    prepareSelectorContext(element);
    const style = getComputedStyle(element);

    expect(style.fontWeight).toBe("780");
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * 1.1,
    );
    expect(Number.parseFloat(style.letterSpacing)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * 0.1,
    );
    expect(style.textTransform).toBe("uppercase");
  });

  it.each([
    ["callout prompt", "div", "sc-callout__prompt"],
    ["sidebar body", "div", "sc-sidebar__body-content"],
    ["numbered-list item", "div", "sc-numbered-list__item-content"],
    ["glossary definition", "div", "sc-glossary__definition"],
    ["resource description", "div", "sc-resource-link__description"],
    ["roadmap body", "p", "sc-roadmap__content-body"],
    ["timeline body", "p", "sc-timeline__content-body"],
  ] as const)("uses the authored body treatment for %s", (_label, tagName, className) => {
    const element = mountCourseElement(tagName, className);
    prepareSelectorContext(element);
    const style = getComputedStyle(element);

    expect(style.fontWeight).toBe("350");
    expect(Number.parseFloat(style.lineHeight)).toBeCloseTo(
      Number.parseFloat(style.fontSize) * 1.7,
    );
  });

  it("applies type scale to semantic block text without scaling control microcopy", () => {
    const title = mountCourseElement("div", "sc-callout__title");
    const scope = title.closest(".sc-course-theme-scope");
    const control = document.createElement("button");
    control.className = "sc-button";
    control.dataset.size = "md";
    control.textContent = "Control";
    scope?.append(control);

    expect(getComputedStyle(title).fontSize).toBe("17.5px");
    expect(getComputedStyle(control).fontSize).toBe("14px");
  });

  it("preserves type scale in the compact horizontal roadmap treatment", () => {
    const scope = document.createElement("div");
    scope.className = "sc-course-theme-scope sc-roadmap";
    scope.dataset.orientation = "horizontal";
    setCourseTypography(scope);

    const content = document.createElement("div");
    content.className = "sc-roadmap__content";
    const title = document.createElement("p");
    title.textContent = "Milestone";
    const body = document.createElement("p");
    body.textContent = "Description";
    content.append(title, body);
    scope.append(content);
    document.body.append(scope);

    expect(getComputedStyle(title).fontSize).toBe("18.75px");
    expect(getComputedStyle(body).fontSize).toBe("17.5px");
  });

  it.each([
    ["assessment attempts", "div", "sc-assessment-attempt-counter"],
    ["audio time", "div", "sc-audio-player__time"],
    ["checklist progress", "div", "sc-checklist__progress"],
    ["comparison label", "span", "sc-comparison__header-cell"],
    ["table heading", "th", ""],
    ["timeline date", "p", ""],
  ] as const)("uses the body role for %s", (label, tagName, className) => {
    const element = mountCourseElement(tagName, className, label);
    if (label === "table heading")
      element.closest(".sc-course-theme-scope")?.classList.add("sc-table");
    if (label === "timeline date") {
      const content = element.closest(".sc-course-theme-scope");
      content?.classList.add("sc-timeline__content");
      const nodeContent = document.createElement("div");
      nodeContent.dataset.nodeViewContentReact = "";
      nodeContent.append(element);
      content?.append(nodeContent);
    }

    expect(getComputedStyle(element).fontFamily).toContain("Body Test");
  });

  it("reserves the code role for literal code", () => {
    const code = mountCourseElement("code", "");
    const scope = code.closest(".sc-course-theme-scope");
    const pre = document.createElement("pre");
    pre.className = "sc-code-block__pre";
    pre.append(code);
    scope?.append(pre);

    expect(getComputedStyle(code).fontFamily).toContain("Code Test");
  });

  it.each([
    ["learner button", "button", "sc-button"],
    ["learner input", "input", "sc-input"],
    ["lightbox status", "div", "sc-lightbox-status"],
  ] as const)("uses the body role for %s", (_label, tagName, className) => {
    const element = mountCourseElement(tagName, className);

    expect(getComputedStyle(element).fontFamily).toContain("Body Test");
  });

  it("uses the body role for learner input placeholders", () => {
    const input = mountCourseElement("input", "sc-input") as HTMLInputElement;
    input.placeholder = "Answer";

    expect(getComputedStyle(input, "::placeholder").fontFamily).toContain("Body Test");
  });
});

function prepareSelectorContext(element: HTMLElement): void {
  if (element.classList.contains("sc-roadmap__content-title")) {
    element.classList.remove("sc-roadmap__content-title");
    const content = document.createElement("div");
    content.className = "sc-roadmap__content";
    element.parentNode?.insertBefore(content, element);
    content.append(element);
  }

  if (element.classList.contains("sc-roadmap__content-body")) {
    element.classList.remove("sc-roadmap__content-body");
    const content = document.createElement("div");
    content.className = "sc-roadmap__content";
    content.append(document.createElement("p"));
    element.parentNode?.insertBefore(content, element);
    content.append(element);
  }

  if (
    element.classList.contains("sc-timeline__content-title") ||
    element.classList.contains("sc-timeline__content-body")
  ) {
    const isBody = element.classList.contains("sc-timeline__content-body");
    const scope = element.parentNode;
    element.className = "";
    const content = document.createElement("div");
    content.className = "sc-timeline__content";
    const nodeContent = document.createElement("div");
    nodeContent.dataset.nodeViewContentReact = "";
    nodeContent.append(
      document.createElement("p"),
      ...(isBody ? [document.createElement("p")] : []),
    );
    nodeContent.append(element);
    content.append(nodeContent);
    scope?.append(content);
  }
}

function mountCourseElement(
  tagName: string,
  className: string,
  text = "Typography role probe",
): HTMLElement {
  const scope = document.createElement("div");
  scope.className = "sc-course-theme-scope";
  setCourseTypography(scope);

  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  scope.append(element);
  document.body.append(scope);
  return element;
}

function setCourseTypography(scope: HTMLElement): void {
  scope.style.setProperty("--sc-course-font-heading", '"Heading Test", serif');
  scope.style.setProperty("--sc-course-font-body", '"Body Test", sans-serif');
  scope.style.setProperty("--sc-course-font-code", '"Code Test", monospace');
  scope.style.setProperty("--sc-course-font-heading-weight", "780");
  scope.style.setProperty("--sc-course-font-body-weight", "350");
  scope.style.setProperty("--sc-course-type-scale", "1.25");
  scope.style.setProperty("--sc-course-line-height-body", "1.7");
  scope.style.setProperty("--sc-course-line-height-heading", "1.1");
  scope.style.setProperty("--sc-course-letter-spacing-heading", "0.1em");
  scope.style.setProperty("--sc-course-text-transform-heading", "uppercase");
}
