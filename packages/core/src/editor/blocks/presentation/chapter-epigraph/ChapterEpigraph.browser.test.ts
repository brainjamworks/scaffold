import { afterEach, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./ChapterEpigraph.css";

afterEach(() => {
  document.body.replaceChildren();
});

it("positions the constrained epigraph box with its block alignment", () => {
  const host = document.createElement("div");
  host.className = "ProseMirror";
  host.style.width = "600px";
  host.innerHTML = `
    <blockquote class="sc-course-chapter-epigraph" data-align="center" style="width: 300px">
      <div class="sc-course-chapter-epigraph__content"></div>
    </blockquote>
  `;
  document.body.append(host);

  const quote = host.querySelector<HTMLElement>(".sc-course-chapter-epigraph");
  const content = host.querySelector<HTMLElement>(".sc-course-chapter-epigraph__content");
  if (!quote || !content) throw new Error("Expected the Chapter epigraph fixture to render.");

  expect(quote.getBoundingClientRect().left - host.getBoundingClientRect().left).toBeCloseTo(
    150,
    0,
  );
  expect(getComputedStyle(quote).textAlign).toBe("center");
  expect(getComputedStyle(content).alignItems).toBe("center");

  quote.dataset["align"] = "right";

  expect(quote.getBoundingClientRect().left - host.getBoundingClientRect().left).toBeCloseTo(
    300,
    0,
  );
  expect(getComputedStyle(quote).textAlign).toBe("right");
  expect(getComputedStyle(content).alignItems).toBe("flex-end");
});

it("gives the Pocket Atlas epigraph distinct quote and attribution rhythm", () => {
  const course = document.createElement("div");
  course.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
  course.style.setProperty("--sc-course-author-density", "1");
  course.style.setProperty("--sc-course-author-text-scale", "1");
  course.style.setProperty("--sc-course-author-heading-weight", "700");
  course.style.setProperty("--sc-course-author-heading-letter-spacing", "0.025em");
  course.style.setProperty("--sc-course-author-heading-text-transform", "none");
  course.innerHTML = `
    <div class="sc-course-chapter-epigraph-node">
      <blockquote class="sc-course-chapter-epigraph" data-align="center">
        <div class="sc-course-chapter-epigraph__content">
          <div class="sc-course-chapter-epigraph__body"><p>An opening thought</p></div>
          <div class="sc-course-chapter-epigraph__attribution"><p>Atlas author</p></div>
        </div>
      </blockquote>
    </div>
  `;
  document.body.append(course);

  const content = course.querySelector<HTMLElement>(".sc-course-chapter-epigraph__content");
  const body = course.querySelector<HTMLElement>(".sc-course-chapter-epigraph__body");
  const attribution = course.querySelector<HTMLElement>(".sc-course-chapter-epigraph__attribution");
  if (!content || !body || !attribution) {
    throw new Error("Expected the Pocket Atlas Chapter epigraph fixture to render.");
  }

  expect(getComputedStyle(content).gap).toBe("8px");
  expect(getComputedStyle(body).fontWeight).toBe("700");
  expect(getComputedStyle(attribution).color).toBe("rgb(81, 72, 121)");
  expect(getComputedStyle(attribution).fontSize).toBe("12px");
  expect(getComputedStyle(attribution).fontWeight).toBe("700");
  expect(Number.parseFloat(getComputedStyle(attribution).letterSpacing)).toBeGreaterThan(0);
  expect(getComputedStyle(attribution).textTransform).toBe("uppercase");
});
