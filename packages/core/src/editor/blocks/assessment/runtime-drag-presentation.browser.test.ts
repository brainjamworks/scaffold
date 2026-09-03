import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/editor/assessment/categorise/Categorise.css";
import "@/editor/assessment/matching/Matching.css";
import "@/editor/assessment/sequencing/Sequencing.css";
import "@/theme/course/designs/scaffold-flow/v1/theme.css";

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove();
});

describe("runtime assessment drag presentation", () => {
  it.each([
    ["categorise", "sc-course-categorise__source-item"],
    ["matching", "sc-course-matching__item"],
  ] as const)("leaves an inert empty %s source placeholder", (_feature, className) => {
    const source = mountElement(className, "<span>Authored content</span>");
    source.setAttribute("data-interaction-drag-placeholder", "");

    expect(getComputedStyle(source).pointerEvents).toBe("none");
    expect(getComputedStyle(source, "::after").content).toBe("none");
    expect(getComputedStyle(source.firstElementChild!).visibility).toBe("hidden");
    expect(getComputedStyle(source).borderStyle).toBe("dashed");
  });

  it("preserves the sequencing handle inside its otherwise empty source placeholder", () => {
    const source = mountElement(
      "sc-course-sequencing__item",
      '<span class="sc-course-sequencing__runtime-handle">Handle</span><span>Authored content</span>',
    );
    source.setAttribute("data-interaction-drag-placeholder", "");

    expect(getComputedStyle(source).pointerEvents).toBe("none");
    expect(getComputedStyle(source).borderStyle).toBe("dashed");
    expect(getComputedStyle(source.children[0]!).visibility).toBe("visible");
    expect(getComputedStyle(source.children[1]!).visibility).toBe("hidden");
  });

  it.each([
    ["categorise", "sc-course-categorise__drag-preview"],
    ["sequencing", "sc-course-sequencing__drag-preview"],
  ] as const)("does not reserve absent handle tracks in the %s preview", (_feature, className) => {
    const preview = mountElement(className, "<div>Authored content</div>");

    expect(getComputedStyle(preview).display).not.toBe("grid");
  });
});

function mountElement(className: string, html: string): HTMLElement {
  const course = document.createElement("div");
  course.className = "sc-course sc-course-theme-scaffold-flow-v1";
  course.style.setProperty("--sc-course-author-stroke-width", "1px");
  course.style.setProperty("--gray-a6", "rgb(0 0 0 / 0.2)");
  const element = document.createElement("div");
  element.className = className;
  element.innerHTML = html;
  course.append(element);
  document.body.append(course);
  mounted.push(course);
  return element;
}
