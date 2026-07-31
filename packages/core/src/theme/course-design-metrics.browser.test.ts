import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/ui/components/Button/Button.css";
import "@/ui/components/Accordion/Accordion.css";
import "@/ui/components/Card/Card.css";
import "@/ui/components/Checkbox/Checkbox.css";
import "@/ui/components/Combobox/Combobox.css";
import "@/ui/components/Input/Input.css";
import "@/ui/components/Radio/Radio.css";
import "@/ui/components/Select/Select.css";
import "@/ui/components/Switch/Switch.css";
import "@/editor/blocks/assessment/shared/chrome/assessment-problem-shell.css";
import "@/editor/blocks/assessment/matching/Matching.css";
import "@/editor/blocks/code/code-block/CodeBlock.css";
import "@/editor/blocks/figure-composition/gallery/Gallery.css";
import "@/editor/blocks/media/ImageBlock.css";
import "@/editor/blocks/media/chart/chart.css";
import "@/editor/blocks/presentation/callout/Callout.css";
import "@/editor/blocks/presentation/comparison/Comparison.css";
import "@/editor/blocks/resources/resource-link/ResourceLink.css";
import "@/editor/blocks/structured-content/checklist/Checklist.css";

afterEach(() => {
  document.body.replaceChildren();
  document.head.querySelector("[data-course-metric-test-styles]")?.remove();
});

describe("course design metric ownership", () => {
  it("projects course metrics through semantic aliases without changing application metrics", () => {
    installProbeStyles();
    const applicationProbe = createMetricProbe();
    document.body.append(applicationProbe);
    const applicationMetrics = readMetrics(applicationProbe);

    const scope = document.createElement("div");
    scope.className = "sc-course-theme-scope";
    setCourseMetrics(scope);

    const courseProbe = createMetricProbe();
    scope.append(courseProbe);
    document.body.append(scope);

    const courseMetrics = readMetrics(courseProbe);
    expect(courseMetrics).toEqual({
      fontWeight: "350",
      lineHeight: "18.75px",
      fontSize: "12.5px",
      borderWidth: "3px",
      borderTopWidth: "6px",
      borderRadius: "12px",
      boxShadow: "rgb(1, 2, 3) 0px 4px 12px 0px",
      paddingLeft: "20px",
    });
    expect(readMetrics(applicationProbe)).toEqual(applicationMetrics);
    expect(courseMetrics).not.toEqual(applicationMetrics);
  });

  it("projects heading typography independently from body typography", () => {
    installProbeStyles();
    const scope = document.createElement("div");
    scope.className = "sc-course-theme-scope";
    setCourseMetrics(scope);

    const heading = document.createElement("h2");
    heading.className = "course-heading-metric-probe";
    heading.textContent = "Heading";
    scope.append(heading);
    document.body.append(scope);

    const style = getComputedStyle(heading);
    expect(style.fontWeight).toBe("780");
    expect(style.lineHeight).toBe("22px");
    expect(style.letterSpacing).toBe("2px");
    expect(style.textTransform).toBe("uppercase");
  });

  it("applies course geometry to standard shared primitives but preserves pill controls", () => {
    const application = createSharedPrimitiveFixture();
    const course = createSharedPrimitiveFixture();
    course.classList.add("sc-course-theme-scope");
    setCourseMetrics(course);
    document.body.append(application, course);

    expect(readSharedPrimitiveMetrics(application)).toEqual({
      cardBorder: "1px",
      cardRadius: "12px",
      cardPadding: "20px",
      inputBorder: "1px",
      inputRadius: "8px",
      selectBorder: "1px",
      comboboxBorder: "1px",
      buttonBorder: "1px",
      buttonRadius: "9999px",
      buttonHeight: "36px",
      accordionBorder: "1px",
      checkboxBorder: "1px",
      radioBorder: "1px",
      switchBorder: "1px",
    });
    expect(readSharedPrimitiveMetrics(course)).toEqual({
      cardBorder: "3px",
      cardRadius: "18px",
      cardPadding: "25px",
      inputBorder: "3px",
      inputRadius: "12px",
      selectBorder: "3px",
      comboboxBorder: "3px",
      buttonBorder: "3px",
      buttonRadius: "9999px",
      buttonHeight: "36px",
      accordionBorder: "3px",
      checkboxBorder: "4px",
      radioBorder: "4px",
      switchBorder: "3px",
    });
  });

  it("applies course stroke and roundness to representative block families", () => {
    const application = createBlockMetricFixture();
    const course = createBlockMetricFixture();
    course.classList.add("sc-course-theme-scope");
    setCourseMetrics(course);
    document.body.append(application, course);

    expect(readBlockMetrics(application)).toEqual({
      assessmentBorder: "1px",
      assessmentPadding: "24px",
      assessmentStrongBorder: "1px",
      assessmentRadius: "12px",
      codeBorder: "1px",
      codeHeaderPadding: "8px",
      calloutBorder: "1px",
      calloutPillBorder: "1px",
      figureBorder: "1px",
      mediaEmphasisBorder: "2px",
      mediaBorder: "1px",
      presentationBorder: "1px",
      presentationCellPadding: "16px",
      resourceBorder: "1px",
      resourcePadding: "16px",
      structuredBorder: "1px",
      structuredPadding: "14px",
    });
    expect(readBlockMetrics(course)).toEqual({
      assessmentBorder: "3px",
      assessmentPadding: "30px",
      assessmentStrongBorder: "4px",
      assessmentRadius: "18px",
      codeBorder: "3px",
      codeHeaderPadding: "10px",
      calloutBorder: "3px",
      calloutPillBorder: "1px",
      figureBorder: "3px",
      mediaEmphasisBorder: "6px",
      mediaBorder: "3px",
      presentationBorder: "3px",
      presentationCellPadding: "20px",
      resourceBorder: "3px",
      resourcePadding: "20px",
      structuredBorder: "3px",
      structuredPadding: "17.5px",
    });
  });
});

function createBlockMetricFixture(): HTMLElement {
  const fixture = document.createElement("section");
  const classNames = [
    "sc-assessment-shell",
    "sc-matching-field",
    "sc-code-block__shell",
    "sc-code-block__header",
    "sc-gallery__stage-button",
    "sc-image-block__fallback",
    "sc-chart-block__fallback",
    "sc-callout",
    "sc-callout__icon-chip",
    "sc-comparison__table",
    "sc-comparison__cell-content",
    "sc-resource-link",
    "sc-checklist__section",
  ];
  for (const className of classNames) {
    const element = document.createElement("div");
    element.className = className;
    fixture.append(element);
  }
  return fixture;
}

function readBlockMetrics(fixture: HTMLElement) {
  return {
    assessmentBorder: getComputedStyle(requiredElement(fixture, ".sc-assessment-shell"))
      .borderTopWidth,
    assessmentPadding: getComputedStyle(requiredElement(fixture, ".sc-assessment-shell"))
      .paddingTop,
    assessmentStrongBorder: getComputedStyle(requiredElement(fixture, ".sc-matching-field"))
      .borderTopWidth,
    assessmentRadius: getComputedStyle(requiredElement(fixture, ".sc-assessment-shell"))
      .borderRadius,
    codeBorder: getComputedStyle(requiredElement(fixture, ".sc-code-block__shell")).borderTopWidth,
    codeHeaderPadding: getComputedStyle(requiredElement(fixture, ".sc-code-block__header"))
      .paddingTop,
    calloutBorder: getComputedStyle(requiredElement(fixture, ".sc-callout")).borderTopWidth,
    calloutPillBorder: getComputedStyle(requiredElement(fixture, ".sc-callout__icon-chip"))
      .borderTopWidth,
    figureBorder: getComputedStyle(requiredElement(fixture, ".sc-gallery__stage-button"))
      .borderTopWidth,
    mediaEmphasisBorder: getComputedStyle(requiredElement(fixture, ".sc-image-block__fallback"))
      .borderTopWidth,
    mediaBorder: getComputedStyle(requiredElement(fixture, ".sc-chart-block__fallback"))
      .borderTopWidth,
    presentationBorder: getComputedStyle(requiredElement(fixture, ".sc-comparison__table"))
      .borderTopWidth,
    presentationCellPadding: getComputedStyle(
      requiredElement(fixture, ".sc-comparison__cell-content"),
    ).paddingTop,
    resourceBorder: getComputedStyle(requiredElement(fixture, ".sc-resource-link")).borderTopWidth,
    resourcePadding: getComputedStyle(requiredElement(fixture, ".sc-resource-link")).paddingTop,
    structuredBorder: getComputedStyle(requiredElement(fixture, ".sc-checklist__section"))
      .borderTopWidth,
    structuredPadding: getComputedStyle(requiredElement(fixture, ".sc-checklist__section"))
      .paddingTop,
  };
}

function createSharedPrimitiveFixture(): HTMLElement {
  const fixture = document.createElement("section");
  const definitions = [
    ["div", "sc-card", { padding: "md" }],
    ["input", "sc-input"],
    ["button", "sc-select-trigger"],
    ["button", "sc-combobox-trigger"],
    ["button", "sc-button", { size: "md" }],
    ["div", "sc-accordion-item"],
    ["button", "sc-checkbox"],
    ["button", "sc-radio-item"],
    ["button", "sc-switch"],
  ] as const;

  for (const [tagName, className, dataset] of definitions) {
    const element = document.createElement(tagName);
    element.className = className;
    if (dataset) Object.assign(element.dataset, dataset);
    fixture.append(element);
  }
  return fixture;
}

function readSharedPrimitiveMetrics(fixture: HTMLElement) {
  const card = getComputedStyle(requiredElement(fixture, ".sc-card"));
  const input = getComputedStyle(requiredElement(fixture, ".sc-input"));
  const select = getComputedStyle(requiredElement(fixture, ".sc-select-trigger"));
  const combobox = getComputedStyle(requiredElement(fixture, ".sc-combobox-trigger"));
  const button = getComputedStyle(requiredElement(fixture, ".sc-button"));
  const accordion = getComputedStyle(requiredElement(fixture, ".sc-accordion-item"));
  const checkbox = getComputedStyle(requiredElement(fixture, ".sc-checkbox"));
  const radio = getComputedStyle(requiredElement(fixture, ".sc-radio-item"));
  const switchControl = getComputedStyle(requiredElement(fixture, ".sc-switch"));
  return {
    cardBorder: card.borderTopWidth,
    cardRadius: card.borderRadius,
    cardPadding: card.paddingTop,
    inputBorder: input.borderTopWidth,
    inputRadius: input.borderRadius,
    selectBorder: select.borderTopWidth,
    comboboxBorder: combobox.borderTopWidth,
    buttonBorder: button.borderTopWidth,
    buttonRadius: button.borderRadius,
    buttonHeight: button.height,
    accordionBorder: accordion.borderTopWidth,
    checkboxBorder: checkbox.borderTopWidth,
    radioBorder: radio.borderTopWidth,
    switchBorder: switchControl.borderTopWidth,
  };
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function installProbeStyles(): void {
  const styles = document.createElement("style");
  styles.dataset.courseMetricTestStyles = "";
  styles.textContent = `
    .course-design-metric-probe {
      box-sizing: border-box;
      width: 100px;
      border-style: solid;
      border-width: var(--sc-border-width);
      border-top-width: var(--sc-border-width-emphasis);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-overlay);
      padding-left: var(--sc-block-inset);
      font-size: calc(10px * var(--sc-course-type-scale));
      font-weight: var(--font-weight-normal);
      line-height: var(--leading-body);
    }

    .course-heading-metric-probe {
      font-size: 20px;
      font-weight: var(--font-weight-bold);
      line-height: var(--leading-snug);
      letter-spacing: var(--sc-course-letter-spacing-heading);
      text-transform: var(--sc-course-text-transform-heading);
    }
  `;
  document.head.append(styles);
}

function createMetricProbe(): HTMLElement {
  const probe = document.createElement("div");
  probe.className = "course-design-metric-probe";
  probe.textContent = "Metric probe";
  return probe;
}

function setCourseMetrics(scope: HTMLElement): void {
  scope.style.setProperty("--sc-course-color-border", "rgb(10 20 30)");
  scope.style.setProperty("--sc-course-color-text", "rgb(40 50 60)");
  scope.style.setProperty("--sc-course-font-body-weight", "350");
  scope.style.setProperty("--sc-course-font-heading-weight", "780");
  scope.style.setProperty("--sc-course-type-scale", "1.25");
  scope.style.setProperty("--sc-course-line-height-body", "1.5");
  scope.style.setProperty("--sc-course-line-height-heading", "1.1");
  scope.style.setProperty("--sc-course-letter-spacing-heading", "0.1em");
  scope.style.setProperty("--sc-course-text-transform-heading", "uppercase");
  scope.style.setProperty("--sc-course-roundness", "1");
  scope.style.setProperty("--sc-course-stroke", "3px");
  scope.style.setProperty("--sc-course-shadow", "0 4px 12px rgb(1 2 3)");
  scope.style.setProperty("--sc-course-density", "1.25");
}

function readMetrics(element: HTMLElement) {
  const style = getComputedStyle(element);
  return {
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    fontSize: style.fontSize,
    borderWidth: style.borderRightWidth,
    borderTopWidth: style.borderTopWidth,
    borderRadius: style.borderRadius,
    boxShadow: style.boxShadow,
    paddingLeft: style.paddingLeft,
  };
}
