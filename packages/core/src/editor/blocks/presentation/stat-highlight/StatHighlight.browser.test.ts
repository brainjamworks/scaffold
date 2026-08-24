import { afterEach, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "@/theme/course/designs/pocket-atlas/v1/theme.css";
import "@/theme/course/designs/scaffold-flow/v1/stat-highlight.css";
import "./StatHighlight.css";

afterEach(() => {
  document.body.replaceChildren();
});

it("leaves numeric presentation to the Course theme", () => {
  const unthemed = statHighlightFixture();
  const flow = courseRoot("sc-course-theme-scaffold-flow-v1", "light");
  const themed = statHighlightFixture();
  flow.append(themed);
  document.body.append(unthemed, flow);

  const unthemedValue = requiredElement<HTMLElement>(unthemed, ".sc-course-stat-highlight__value");
  const themedValue = requiredElement<HTMLElement>(themed, ".sc-course-stat-highlight__value");

  expect(getComputedStyle(unthemedValue).fontVariantNumeric).toBe("normal");
  expect(getComputedStyle(themedValue).fontVariantNumeric).toContain("tabular-nums");
});

it("gives Pocket Atlas a deliberate statistic hierarchy", () => {
  const course = pocketAtlasCourse("light");
  const stat = statHighlightFixture();
  course.append(stat);
  document.body.append(course);

  const surface = requiredElement<HTMLElement>(stat, ".sc-course-stat-highlight");
  const content = requiredElement<HTMLElement>(
    stat,
    ".sc-course-stat-highlight__content > [data-node-view-content-react]",
  );
  const value = requiredElement<HTMLElement>(stat, ".sc-course-stat-highlight__value");
  const label = requiredElement<HTMLElement>(stat, ".sc-course-stat-highlight__label");
  const context = requiredElement<HTMLElement>(stat, ".sc-course-stat-highlight__context");
  const valueStyle = getComputedStyle(value);
  const labelStyle = getComputedStyle(label);

  expect(getComputedStyle(surface).backgroundColor).toBe("rgb(35, 207, 161)");
  expect(getComputedStyle(content).gap).toBe("4px");
  expect(Number.parseFloat(valueStyle.fontSize)).toBeGreaterThanOrEqual(48);
  expect(Number.parseFloat(valueStyle.fontSize)).toBeGreaterThan(
    Number.parseFloat(labelStyle.fontSize) * 3,
  );
  expect(valueStyle.fontFamily).toContain("Silkscreen");
  expect(valueStyle.fontVariantNumeric).toContain("tabular-nums");
  expect(labelStyle.fontFamily).toContain("Silkscreen");
  expect(labelStyle.fontWeight).toBe("700");
  expect(labelStyle.textTransform).toBe("uppercase");
  expect(getComputedStyle(context).fontFamily).toContain("Atkinson Hyperlegible");
  expect(getComputedStyle(context).marginTop).toBe("8px");
});

it("scales the Pocket Atlas statistic inside a narrow block frame", () => {
  const course = pocketAtlasCourse("light");
  const wide = statHighlightFixture(720);
  const narrow = statHighlightFixture(240);
  course.append(wide, narrow);
  document.body.append(course);

  const wideSurface = requiredElement<HTMLElement>(wide, ".sc-course-stat-highlight");
  const narrowSurface = requiredElement<HTMLElement>(narrow, ".sc-course-stat-highlight");
  const wideValue = requiredElement<HTMLElement>(wide, ".sc-course-stat-highlight__value");
  const narrowValue = requiredElement<HTMLElement>(narrow, ".sc-course-stat-highlight__value");

  expect(Number.parseFloat(getComputedStyle(narrowValue).fontSize)).toBeLessThan(
    Number.parseFloat(getComputedStyle(wideValue).fontSize),
  );
  expect(Number.parseFloat(getComputedStyle(narrowSurface).paddingInlineStart)).toBeLessThan(
    Number.parseFloat(getComputedStyle(wideSurface).paddingInlineStart),
  );
  expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.clientWidth);
});

it("keeps Pocket Atlas statistic content readable in dark mode", () => {
  const course = pocketAtlasCourse("dark");
  const stat = statHighlightFixture();
  course.append(stat);
  document.body.append(course);

  const surface = requiredElement<HTMLElement>(stat, ".sc-course-stat-highlight");
  const style = getComputedStyle(surface);

  expect(style.backgroundColor).toBe("rgb(82, 230, 188)");
  expect(style.color).toBe("rgb(32, 22, 79)");
  expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
});

function statHighlightFixture(width = 720): HTMLElement {
  const node = document.createElement("section");
  node.className = "sc-course-stat-highlight-node";
  node.style.width = `${width}px`;
  node.innerHTML = `
    <div class="sc-course-stat-highlight" data-align="left">
      <div class="sc-course-stat-highlight__content">
        <div data-node-view-content-react>
          <div class="sc-course-stat-highlight__value"><p>73%</p></div>
          <div class="sc-course-stat-highlight__label"><p>Learners completed</p></div>
          <div class="sc-course-stat-highlight__context"><p>Completion rose after the field guide launched.</p></div>
        </div>
      </div>
    </div>
  `;
  return node;
}

function pocketAtlasCourse(appearance: "dark" | "light"): HTMLElement {
  return courseRoot("sc-course-theme-pocket-atlas-v1", appearance);
}

function courseRoot(themeClass: string, appearance: "dark" | "light"): HTMLElement {
  const course = document.createElement("div");
  course.className = `sc-course ${themeClass} radix-themes ${appearance}`;
  course.style.setProperty("--default-font-family", '"Atkinson Hyperlegible", sans-serif');
  course.style.setProperty("--heading-font-family", "Silkscreen, sans-serif");
  course.style.setProperty("--sc-course-author-density", "1");
  course.style.setProperty("--sc-course-author-text-scale", "1");
  return course;
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (colour: string) => {
    const channels = colour
      .match(/\d+(?:\.\d+)?/g)
      ?.slice(0, 3)
      .map(Number);
    if (!channels || channels.length !== 3)
      throw new Error(`Expected an RGB colour, received ${colour}.`);
    const linearChannels = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const red = linearChannels[0];
    const green = linearChannels[1];
    const blue = linearChannels[2];
    if (red === undefined || green === undefined || blue === undefined) {
      throw new Error(`Expected three RGB channels, received ${colour}.`);
    }
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function requiredElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}
