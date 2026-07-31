import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./players/page/PagePlayer.css";
import "./renderer/CourseDocumentRuntimeRenderer.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Runtime document shell cascade layering", () => {
  it("inherits the current shared light tokens into runtime content", () => {
    const runtime = document.createElement("div");
    runtime.className = "sc-course-document-runtime-renderer__content";
    document.body.append(runtime);
    const style = getComputedStyle(runtime);

    expect(style.getPropertyValue("--color-background").trim()).toBe("#ffffff");
    expect(style.getPropertyValue("--color-canvas").trim()).toBe("#fafafa");
    expect(style.getPropertyValue("--color-text-primary").trim()).toBe("#18181b");
    expect(style.getPropertyValue("--color-text-secondary").trim()).toBe("#52525b");
  });

  it("rebinds course colours inside the scope without changing application tokens", () => {
    const scope = document.createElement("div");
    scope.className = "sc-course-theme-scope";
    scope.style.setProperty("--sc-course-color-background", "#123456");
    scope.style.setProperty("--sc-course-color-canvas", "#234567");
    scope.style.setProperty("--sc-course-color-text", "#345678");
    scope.style.setProperty("--sc-course-color-text-secondary", "#456789");
    const runtime = document.createElement("div");
    runtime.className = "sc-course-document-runtime-renderer__content";
    scope.append(runtime);
    document.body.append(scope);

    const courseStyle = getComputedStyle(runtime);
    const applicationStyle = getComputedStyle(document.documentElement);
    expect(courseStyle.getPropertyValue("--color-background").trim()).toBe("#123456");
    expect(courseStyle.getPropertyValue("--color-canvas").trim()).toBe("#234567");
    expect(courseStyle.getPropertyValue("--color-text-primary").trim()).toBe("#345678");
    expect(courseStyle.getPropertyValue("--color-text-secondary").trim()).toBe("#456789");
    expect(applicationStyle.getPropertyValue("--color-background").trim()).toBe("#ffffff");
  });

  it("lets learner player chrome and course content share the resolved learner palette", () => {
    const runtime = document.createElement("div");
    runtime.className = "sc-course-theme-scope";
    runtime.dataset.scaffoldColorMode = "dark";
    runtime.style.setProperty("--sc-course-color-background", "#101820");
    runtime.style.setProperty("--sc-course-color-text", "#f4f7fa");

    const chrome = document.createElement("div");
    chrome.className = "sc-slideshow-player__chrome";
    const course = document.createElement("div");
    course.className = "sc-course-document-runtime-renderer__content";
    runtime.append(chrome, course);
    document.body.append(runtime);

    expect(getComputedStyle(chrome).getPropertyValue("--color-background").trim()).toBe("#101820");
    expect(getComputedStyle(chrome).getPropertyValue("--color-text-primary").trim()).toBe(
      "#f4f7fa",
    );
    expect(getComputedStyle(course).getPropertyValue("--color-background").trim()).toBe("#101820");
    expect(getComputedStyle(course).getPropertyValue("--color-text-primary").trim()).toBe(
      "#f4f7fa",
    );
  });

  it.each([
    [".sc-page-player", "padding", "0px"],
    [".sc-course-document-runtime-renderer__content", "max-width", "10px"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = document.createElement("div");
    element.className = selector.slice(1);
    document.body.append(element);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
