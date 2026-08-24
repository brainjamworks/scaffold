import { afterEach, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./Marginalia.css";

afterEach(() => {
  document.body.replaceChildren();
});

it("keeps a usable main-and-gutter ratio without a Course theme recipe", () => {
  const host = fixedWidthHost(700);
  const marginalia = marginaliaFixture();
  host.append(marginalia);
  document.body.append(host);

  const main = requiredElement<HTMLElement>(marginalia, ".sc-course-marginalia__main");
  const gutter = requiredElement<HTMLElement>(marginalia, ".sc-course-marginalia__gutter");

  expect(main.getBoundingClientRect().width).toBeGreaterThan(
    gutter.getBoundingClientRect().width * 2,
  );
  expect(gutter.getBoundingClientRect().width).toBeCloseTo(210, 0);
});

it("gives Pocket Atlas Marginalia distinct gutter hierarchy and a narrow stacked treatment", () => {
  const course = document.createElement("div");
  course.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
  course.style.position = "absolute";
  course.style.width = "700px";
  course.style.setProperty("--sc-course-author-density", "1");
  course.style.setProperty("--sc-course-author-text-scale", "1");
  const marginalia = marginaliaFixture();
  course.append(marginalia);
  document.body.append(course);

  const content = requiredElement<HTMLElement>(marginalia, ".sc-course-marginalia__content");
  const main = requiredElement<HTMLElement>(marginalia, ".sc-course-marginalia__main");
  const gutter = requiredElement<HTMLElement>(marginalia, ".sc-course-marginalia__gutter");

  expect(getComputedStyle(content).gap).toBe("20px");
  expect(main.getBoundingClientRect().width).toBeGreaterThan(gutter.getBoundingClientRect().width);
  expect(getComputedStyle(gutter).borderInlineStartWidth).toBe("2px");
  expect(getComputedStyle(gutter).paddingInlineStart).toBe("16px");
  expect(getComputedStyle(gutter).color).toBe("rgb(81, 72, 121)");
  expect(getComputedStyle(gutter).fontSize).toBe("14px");

  course.style.width = "480px";

  expect(getComputedStyle(content).gridTemplateColumns).toBe("480px");
  expect(gutter.getBoundingClientRect().top).toBeLessThan(main.getBoundingClientRect().top);
  expect(getComputedStyle(gutter).borderInlineStartWidth).toBe("0px");
  expect(getComputedStyle(gutter).borderBlockEndWidth).toBe("2px");
  expect(getComputedStyle(gutter).paddingBlockEnd).toBe("16px");
});

function marginaliaFixture(): HTMLElement {
  const marginalia = document.createElement("div");
  marginalia.className = "sc-course-marginalia";
  marginalia.dataset["position"] = "right";
  marginalia.style.width = "100%";
  marginalia.innerHTML = `
    <div class="sc-course-marginalia__content">
      <aside class="sc-course-marginalia__gutter">
        <div class="sc-course-marginalia__gutter-content"><p>Margin note</p></div>
      </aside>
      <div class="sc-course-marginalia__main">
        <div class="sc-course-marginalia__main-content"><p>Main content</p></div>
      </div>
    </div>
  `;
  return marginalia;
}

function fixedWidthHost(width: number): HTMLElement {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.width = `${width}px`;
  return host;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}
