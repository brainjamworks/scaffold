import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { emptyTextWrapImageData } from "./content";
import { TextWrapImageMediaSurface } from "./TextWrapImageSurface";
import "./TextWrapImage.css";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  document.body.replaceChildren();
});

describe("Text Wrap Image geometry", () => {
  it("preserves float, size, and shape variants", async () => {
    const host = document.createElement("div");
    host.style.width = "600px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    root.render(
      <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance="light">
        <div className="sc-course-text-wrap-image">
          <div
            className="sc-course-text-wrap-image__shell"
            data-position="left"
            data-size="sm"
            data-shape="rounded"
          >
            <TextWrapImageMediaSurface
              data={emptyTextWrapImageData({
                source: { mode: "external", src: "https://example.com/wrapped-image.png" },
                alt: "Text wrap geometry fixture",
              })}
              fileUrl={testImageUrl()}
            />
            <div className="sc-course-text-wrap-image__body-content">
              <div data-node-view-content-react>
                <p>Body copy wraps around the floated image before continuing below it.</p>
              </div>
            </div>
          </div>
        </div>
      </CourseThemeProvider>,
    );

    await waitForCondition(() => host.querySelector(".sc-course-text-wrap-image__media"));
    const shell = requiredElement<HTMLElement>(host, ".sc-course-text-wrap-image__shell");
    const media = requiredElement<HTMLElement>(shell, ".sc-course-text-wrap-image__media");
    const image = requiredElement<HTMLImageElement>(media, ".sc-course-text-wrap-image__img");

    expect(getComputedStyle(media).float).toBe("left");
    expect(media.getBoundingClientRect().width).toBeCloseTo(168, 0);
    expect(Number.parseFloat(getComputedStyle(media).marginRight)).toBeCloseTo(20, 0);
    expect(shell.getBoundingClientRect().height).toBeGreaterThanOrEqual(
      media.getBoundingClientRect().height,
    );

    shell.dataset["position"] = "right";
    shell.dataset["size"] = "lg";
    shell.dataset["shape"] = "circle";
    await waitForCondition(() => getComputedStyle(media).float === "right");

    expect(getComputedStyle(media).float).toBe("right");
    expect(media.getBoundingClientRect().width).toBeCloseTo(270, 0);
    expect(Number.parseFloat(getComputedStyle(media).marginLeft)).toBeCloseTo(20, 0);
    expect(getComputedStyle(media).shapeOutside).toBe("circle()");
    expect(getComputedStyle(image).borderRadius).toBe("9999px");
  });

  it("recolours learner text and image treatment with Course appearance", async () => {
    const host = document.createElement("div");
    host.style.width = "500px";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    const renderAppearance = (appearance: "light" | "dark") => {
      root.render(
        <CourseThemeProvider theme={createDefaultPersistedCourseTheme()} appearance={appearance}>
          <div className="sc-course-text-wrap-image">
            <div
              className="sc-course-text-wrap-image__shell"
              data-position="right"
              data-size="md"
              data-shape="rounded"
            >
              <TextWrapImageMediaSurface
                data={emptyTextWrapImageData({
                  source: { mode: "external", src: "https://example.com/wrapped-image.png" },
                  alt: "Course appearance fixture",
                })}
                fileUrl={testImageUrl()}
              />
              <div className="sc-course-text-wrap-image__body-content">
                <div data-node-view-content-react>
                  <p>Course-owned body copy.</p>
                </div>
              </div>
            </div>
          </div>
        </CourseThemeProvider>,
      );
    };

    renderAppearance("light");
    await waitForCondition(() => host.querySelector(".sc-course-text-wrap-image__img"));
    const paragraph = requiredElement<HTMLParagraphElement>(host, "p");
    const image = requiredElement<HTMLImageElement>(host, ".sc-course-text-wrap-image__img");
    const lightText = getComputedStyle(paragraph).color;
    const lightOutline = getComputedStyle(image).boxShadow;
    const paragraphStyle = getComputedStyle(paragraph);

    const expectedLineHeight = Number.parseFloat(
      paragraphStyle.getPropertyValue("--sc-course-author-body-line-height"),
    );
    expect(
      Number.parseFloat(paragraphStyle.lineHeight) / Number.parseFloat(paragraphStyle.fontSize),
    ).toBeCloseTo(expectedLineHeight, 2);

    renderAppearance("dark");
    await waitForCondition(() => getComputedStyle(paragraph).color !== lightText);

    expect(getComputedStyle(paragraph).color).not.toBe(lightText);
    expect(getComputedStyle(image).boxShadow).not.toBe(lightOutline);
  });
});

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline)
      throw new Error("Timed out waiting for Text Wrap Image state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function testImageUrl(): string {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%2300A689'/%3E%3C/svg%3E";
}
