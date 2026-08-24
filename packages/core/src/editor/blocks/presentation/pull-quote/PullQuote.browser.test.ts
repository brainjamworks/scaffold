import { afterEach, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./PullQuote.css";

afterEach(() => {
  document.body.replaceChildren();
});

it("gives Pocket Atlas Pull Quote complete hierarchy and a compact narrow treatment", () => {
  const course = document.createElement("div");
  course.className = "sc-course sc-course-theme-pocket-atlas-v1 radix-themes light";
  course.style.position = "absolute";
  course.style.width = "700px";
  course.style.setProperty("--sc-course-author-density", "1");
  course.style.setProperty("--sc-course-author-heading-letter-spacing", "0.025em");
  course.style.setProperty("--sc-course-author-heading-weight", "700");
  course.style.setProperty("--sc-course-author-text-scale", "1");

  const node = document.createElement("div");
  node.className = "sc-course-pull-quote-node";
  node.append(pullQuoteFixture());
  course.append(node);
  document.body.append(course);

  const quote = requiredElement<HTMLElement>(course, ".sc-course-pull-quote");
  const content = requiredElement<HTMLElement>(quote, ".sc-course-pull-quote__content");
  const body = requiredElement<HTMLElement>(quote, ".sc-course-pull-quote__body");
  const attribution = requiredElement<HTMLElement>(quote, ".sc-course-pull-quote__attribution");

  expect(getComputedStyle(content).gap).toBe("12px");
  expect(getComputedStyle(body).fontWeight).toBe("700");
  expect(getComputedStyle(body).letterSpacing).toBe("0.525px");
  expect(getComputedStyle(body).maxWidth).not.toBe("none");
  expect(getComputedStyle(attribution).color).toBe("rgb(81, 72, 121)");
  expect(getComputedStyle(attribution).fontSize).toBe("14px");
  expect(getComputedStyle(attribution).fontWeight).toBe("700");
  expect(getComputedStyle(attribution).textTransform).toBe("uppercase");

  course.style.width = "420px";

  expect(getComputedStyle(quote).padding).toBe("16px");
  expect(getComputedStyle(content).gap).toBe("8px");
  expect(getComputedStyle(body).maxWidth).toBe("none");
  expect(getComputedStyle(body).fontSize).toBe("16px");
});

function pullQuoteFixture(): HTMLElement {
  const quote = document.createElement("blockquote");
  quote.className = "sc-course-pull-quote";
  quote.dataset["align"] = "left";
  quote.innerHTML = `
    <div class="sc-course-pull-quote__content">
      <div class="sc-course-pull-quote__body">
        <div data-node-view-content-react><p>A field guide should reward close attention.</p></div>
      </div>
      <div class="sc-course-pull-quote__attribution">
        <div data-node-view-content-react><p>Scaffold notes</p></div>
      </div>
    </div>
  `;
  return quote;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}
