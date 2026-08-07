import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";
import "@/theme/app/AppThemeProvider.css";
import "@/document/authoring/CourseDocumentEditor.css";
import "./DocumentCreationGate.css";
import "./ScaffoldAuthoringApp.css";
import "./cursors.css";

const mountedStyles: HTMLStyleElement[] = [];

afterEach(() => {
  for (const style of mountedStyles.splice(0)) style.remove();
  document.body.replaceChildren();
});

describe("Authoring document shell cascade layering", () => {
  it.each([
    [".sc-course-document-editor", "position", "static"],
    [".sc-scaffold-authoring-app", "display", "grid"],
    [".sc-document-creation-gate", "display", "block"],
  ] as const)("allows adapter overrides on %s", (selector, property, value) => {
    mountAdapterStyles(`${selector} { ${property}: ${value}; }`);

    const element = document.createElement("div");
    element.className = selector.slice(1);
    document.body.append(element);

    expect(getComputedStyle(element).getPropertyValue(property)).toBe(value);
  });

  it("allows adapter cursor overrides on the authoring document", () => {
    mountAdapterStyles("html { cursor: crosshair; }");

    expect(getComputedStyle(document.documentElement).cursor).toBe("crosshair");
  });

  it("maps course typography and design without recolouring authoring chrome", () => {
    mountComponentStyles(`
      .sc-theme-probe {
        border: var(--sc-course-author-stroke-width) solid;
        box-shadow: var(--sc-course-author-shadow);
        padding: calc(2rem * var(--sc-course-author-density));
      }
    `);
    const application = document.createElement("div");
    application.className = "radix-themes light sc-app sc-scaffold-authoring-app";
    const scope = document.createElement("div");
    scope.className = "sc-course sc-course-theme-scaffold-flow-v1";
    scope.style.setProperty("--heading-font-family", '"Source Serif 4", serif');
    scope.style.setProperty("--default-font-family", '"Inter", sans-serif');
    scope.style.setProperty("--code-font-family", '"JetBrains Mono Variable", monospace');
    scope.style.setProperty("--sc-course-author-heading-weight", "800");
    scope.style.setProperty("--sc-course-author-body-weight", "500");
    scope.style.setProperty("--sc-course-author-text-scale", "1.125");
    scope.style.setProperty("--sc-course-author-body-line-height", "1.7");
    scope.style.setProperty("--sc-course-author-heading-line-height", "1.1");
    scope.style.setProperty("--sc-course-author-heading-letter-spacing", "0.03em");
    scope.style.setProperty("--sc-course-author-heading-text-transform", "uppercase");
    scope.style.setProperty("--sc-course-author-stroke-width", "2px");
    scope.style.setProperty("--sc-course-author-shadow", "0 2px 4px #00000033");
    scope.style.setProperty("--sc-course-author-density", "1.125");
    const editor = document.createElement("div");
    editor.className = "ProseMirror";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Scoped body";
    const heading = document.createElement("h1");
    heading.textContent = "Scoped heading";
    const probe = document.createElement("div");
    probe.className = "sc-theme-probe";
    editor.append(paragraph, heading, probe);
    scope.append(editor);
    application.append(scope);
    document.body.append(application);

    const headingStyle = getComputedStyle(heading);
    const probeStyle = getComputedStyle(probe);
    expect(getComputedStyle(application).getPropertyValue("--font-ui")).toContain("Satoshi");
    expect(getComputedStyle(application).fontFamily).toContain("Satoshi");
    expect(getComputedStyle(scope).getPropertyValue("--default-font-family")).toContain("Inter");
    expect(headingStyle.fontFamily).toContain("Source Serif 4");
    expect(headingStyle.fontWeight).toBe("800");
    expect(getComputedStyle(paragraph).fontSize).toBe("18px");
    expect(getComputedStyle(paragraph).fontWeight).toBe("500");
    expect(getComputedStyle(paragraph).lineHeight).toBe("30.6px");
    expect(headingStyle.lineHeight).toBe("35.2px");
    expect(headingStyle.letterSpacing).toBe("0.96px");
    expect(headingStyle.textTransform).toBe("uppercase");
    expect(probeStyle.borderTopWidth).toBe("2px");
    expect(probeStyle.paddingTop).toBe("36px");
    expect(probeStyle.boxShadow).not.toBe("none");
  });

  it.each([
    {
      applicationMode: "light",
      courseMode: "light",
      applicationBackground: "rgb(255, 255, 255)",
      applicationText: "rgb(24, 24, 27)",
      courseBackground: "#ffffff",
      courseText: "#18181b",
    },
    {
      applicationMode: "light",
      courseMode: "dark",
      applicationBackground: "rgb(255, 255, 255)",
      applicationText: "rgb(24, 24, 27)",
      courseBackground: "#101820",
      courseText: "#f4f7fa",
    },
    {
      applicationMode: "dark",
      courseMode: "light",
      applicationBackground: "rgb(24, 24, 27)",
      applicationText: "rgb(250, 250, 250)",
      courseBackground: "#ffffff",
      courseText: "#18181b",
    },
    {
      applicationMode: "dark",
      courseMode: "dark",
      applicationBackground: "rgb(24, 24, 27)",
      applicationText: "rgb(250, 250, 250)",
      courseBackground: "#101820",
      courseText: "#f4f7fa",
    },
  ] as const)(
    "keeps $courseMode course preview independent inside $applicationMode application chrome",
    ({
      applicationMode,
      courseMode,
      applicationBackground,
      applicationText,
      courseBackground,
      courseText,
    }) => {
      const application = document.createElement("div");
      application.className = `radix-themes ${applicationMode} sc-app sc-scaffold-authoring-app`;
      application.dataset.scaffoldColorMode = applicationMode;
      application.style.colorScheme = applicationMode;

      const action = document.createElement("button");
      action.className = "sc-scaffold-authoring-action";
      action.textContent = "Application action";

      const courseScope = document.createElement("div");
      courseScope.className = "sc-course";
      courseScope.dataset.courseColorMode = courseMode;
      courseScope.style.colorScheme = courseMode;
      courseScope.style.setProperty("--color-background", courseBackground);
      courseScope.style.setProperty(
        "--color-canvas",
        courseMode === "light" ? "#fafafa" : "#0b1118",
      );
      courseScope.style.setProperty("--color-text-primary", courseText);
      courseScope.style.setProperty("--color-text-secondary", "#52525b");
      const courseContent = document.createElement("div");
      courseContent.dataset.courseDocument = "";
      courseScope.append(courseContent);
      application.append(action, courseScope);
      document.body.append(application);

      const applicationStyle = getComputedStyle(action);
      const courseStyle = getComputedStyle(courseContent);
      expect(applicationStyle.backgroundColor).toBe(applicationBackground);
      expect(applicationStyle.color).toBe(applicationText);
      expect(courseStyle.getPropertyValue("--color-background").trim()).toBe(courseBackground);
      expect(courseStyle.getPropertyValue("--color-text-primary").trim()).toBe(courseText);
      expect(getComputedStyle(application).colorScheme).toBe(applicationMode);
      expect(getComputedStyle(courseScope).colorScheme).toBe(courseMode);

      action.focus();
      expect(action.matches(":focus-visible")).toBe(true);
      expect(applicationStyle.outlineStyle).not.toBe("none");
    },
  );

  it("allows adapters to override stable course tokens on the persisted document", () => {
    mountAdapterStyles(`
      [data-course-document] {
        --color-background: #abcdef;
      }
    `);
    const scope = document.createElement("div");
    scope.className = "sc-course";
    scope.style.setProperty("--color-background", "#123456");
    const courseDocument = document.createElement("section");
    courseDocument.dataset.courseDocument = "";
    scope.append(courseDocument);
    document.body.append(scope);

    expect(getComputedStyle(courseDocument).getPropertyValue("--color-background").trim()).toBe(
      "#abcdef",
    );
  });
});

function mountAdapterStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-adapters { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}

function mountComponentStyles(rules: string): void {
  const style = document.createElement("style");
  style.textContent = `@layer sc-components { ${rules} }`;
  document.head.append(style);
  mountedStyles.push(style);
}
