import { afterEach, expect, it } from "vite-plus/test";

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
