import { afterEach, describe, expect, it } from "vite-plus/test";

import "./grid/view/grid.css";
import "./grid/authoring/grid-authoring.css";
import "./layout/accordion/accordion.css";
import "./layout/paginated/paginated.css";
import "./layout/shared/view/layout.css";
import "./layout/tabs/tabs.css";
import "../../theme/course/designs/scaffold-flow/v1/accordion.css";
import "../../theme/course/designs/scaffold-flow/v1/paginated.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Arrangement cascade layering", () => {
  it.each([
    "sc-app-grid-authoring",
    "sc-layout-frame",
    "sc-course-accordion",
    "sc-course-paginated",
    "sc-course-tabs",
  ])("allows adapter positioning overrides on %s", (className) => {
    mountAdapterStyles(`.${className} { position: absolute; }`);

    const arrangement = document.createElement("div");
    arrangement.className = className;
    document.body.append(arrangement);

    expect(getComputedStyle(arrangement).position).toBe("absolute");
  });

  it("centers Accordion authoring chrome on the title line without crowding the title", () => {
    const course = document.createElement("div");
    course.className = "sc-course sc-course-theme-scaffold-flow-v1";
    course.style.setProperty("--space-3", "12px");
    course.style.setProperty("--space-4", "16px");
    course.style.setProperty("--space-5", "24px");
    course.style.setProperty("--space-7", "40px");

    const accordion = document.createElement("div");
    accordion.className = "sc-course-accordion sc-course-accordion--authoring";
    const frame = document.createElement("div");
    frame.className = "sc-course-accordion__section-frame";
    const move = document.createElement("button");
    move.className = "sc-app-accordion-handle";
    const row = document.createElement("div");
    row.className = "sc-course-accordion__title-row";
    row.dataset.editable = "true";
    const title = document.createElement("p");
    title.textContent = "Section 1";
    const content = document.createElement("div");
    content.className = "sc-course-accordion__title-content";
    content.append(title);
    row.append(content);
    frame.append(move, row);
    accordion.append(frame);
    course.append(accordion);
    document.body.append(course);

    expect(getComputedStyle(move).top).toBe("34px");
    expect(getComputedStyle(title).alignSelf).toBe("center");
    expect(getComputedStyle(row).paddingInlineStart).toBe("64px");
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
