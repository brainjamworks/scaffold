import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import "./shell/agent/scaffold-agent-dock.css";
import "./suggestions/insert/ghost-add.css";
import "../ui/icons/icon-renderer.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Standalone editor style cascade layering", () => {
  it("keeps the default application token baseline light", () => {
    const style = getComputedStyle(document.documentElement);

    expect(style.getPropertyValue("--color-background").trim()).toBe("#ffffff");
    expect(style.getPropertyValue("--color-canvas").trim()).toBe("#fafafa");
    expect(style.getPropertyValue("--color-foreground").trim()).toBe("#18181b");
    expect(style.getPropertyValue("--color-border").trim()).toBe("#e4e4e7");
    expect(style.getPropertyValue("--font-sans")).toContain("Poppins");
    expect(style.getPropertyValue("--font-mono")).toContain("JetBrains Mono");
  });

  it.each([
    [".sc-authoring-agent-dock", "display", "grid"],
    [".sc-ghost-add", "display", "block"],
    [".sc-icon-renderer", "line-height", "3px"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = document.createElement("div");
    element.className = selector.slice(1);
    document.body.append(element);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });

  it("allows adapter-layer application token overrides after defaults", () => {
    mountAdapterStyles(":root { --color-background: rgb(1 2 3); }");

    expect(
      getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim(),
    ).toBe("rgb(1 2 3)");
  });

  it("keeps an explicit element style above an adapter-layer declaration", () => {
    mountAdapterStyles(".sc-explicit-presentation { background-color: rgb(1 2 3); }");

    const element = document.createElement("div");
    element.className = "sc-explicit-presentation";
    element.style.backgroundColor = "rgb(4 5 6)";
    document.body.append(element);

    expect(getComputedStyle(element).backgroundColor).toBe("rgb(4, 5, 6)");
  });

  it("keeps an explicit authored background above course theme tokens", () => {
    mountLayerStyles(
      "sc-components",
      ".sc-themed-presentation { background-color: var(--sc-course-color-background); }",
    );

    const courseScope = document.createElement("div");
    courseScope.className = "sc-course-theme-scope";
    courseScope.style.setProperty("--sc-course-color-background", "rgb(1 2 3)");
    const element = document.createElement("div");
    element.className = "sc-themed-presentation";
    element.style.backgroundColor = "rgb(4 5 6)";
    courseScope.append(element);
    document.body.append(courseScope);

    expect(getComputedStyle(element).backgroundColor).toBe("rgb(4, 5, 6)");
  });

  it("keeps application chrome independent from a runtime-authored course palette", () => {
    mountLayerStyles(
      "sc-components",
      [
        ".sc-themed-presentation { background: var(--sc-course-color-background); color: var(--sc-course-color-text); }",
        ".sc-application-presentation { background: var(--color-background); color: var(--color-foreground); }",
      ].join(""),
    );

    const application = document.createElement("div");
    application.style.setProperty("--color-background", "rgb(24 24 27)");
    application.style.setProperty("--color-foreground", "rgb(250 250 250)");

    const courseScope = document.createElement("div");
    courseScope.className = "sc-course-theme-scope";
    courseScope.style.setProperty("--sc-course-color-background", "rgb(220 38 38)");
    courseScope.style.setProperty("--sc-course-color-text", "rgb(255 255 255)");

    const courseContent = document.createElement("div");
    courseContent.className = "sc-themed-presentation";
    courseScope.append(courseContent);

    const applicationChrome = document.createElement("button");
    applicationChrome.className = "sc-application-presentation";
    application.append(courseScope, applicationChrome);
    document.body.append(application);

    expect(getComputedStyle(courseContent).backgroundColor).toBe("rgb(220, 38, 38)");
    expect(getComputedStyle(applicationChrome).backgroundColor).toBe("rgb(24, 24, 27)");
    expect(getComputedStyle(applicationChrome).color).toBe("rgb(250, 250, 250)");
  });
});

function mountAdapterStyles(rules: string): void {
  mountLayerStyles("sc-adapters", rules);
}

function mountLayerStyles(layer: string, rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer ${layer} { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
