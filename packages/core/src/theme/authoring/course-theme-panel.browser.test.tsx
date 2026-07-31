import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { ScaffoldAuthoringApp } from "@/editor/shell/authoring/ScaffoldAuthoringApp";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createThemeCatalogue } from "@/theme/model";
import "@/styles/globals.css";

describe("course theme panel browser workflow", () => {
  it("customises, resets, undoes, autosaves, and remains usable in dark application chrome", async () => {
    await page.viewport(1_000, 650);
    let saveCalls = 0;
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "theme-browser-page",
    });
    const editorial = createThemeCatalogue().presets.find(({ label }) => label === "Editorial")!;
    content.content![0]!.content![0]!.content = [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Theme heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Theme body copy" }] },
      {
        type: "codeBlock",
        attrs: { language: "typescript" },
        content: [{ type: "text", text: "const themed = true" }],
      },
    ];
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        artifact={{
          id: "theme-browser-artifact",
          title: "Theme browser",
          mode: "page",
          content,
        }}
        services={{
          artifactPersistence: {
            saveArtifact: async () => {
              saveCalls += 1;
              return {};
            },
          },
          media: null,
        }}
      />,
    );

    try {
      const openTheme = await waitForElement<HTMLButtonElement>(
        document,
        'button[aria-label="Open course theme"]',
      );
      openTheme.click();
      const panel = await waitForElement<HTMLElement>(
        document,
        '[role="dialog"].sc-course-theme-panel',
      );
      const courseScope = requireElement<HTMLElement>(document, ".sc-course-theme-scope");

      expect(panel.querySelectorAll('.sc-settings-segmented[role="radiogroup"]')).toHaveLength(0);
      expect(panel.querySelectorAll(".sc-accordion-trigger")).toHaveLength(6);
      expect(panel.querySelectorAll(".sc-settings-color-field__trigger")).toHaveLength(11);
      expect(document.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(0);
      expect(
        requireElement(panel, '.sc-settings-card-select[role="radiogroup"]'),
      ).toHaveAccessibleName("Course theme preset");
      expect(panel.textContent).toContain(
        "Editing light colours for the current application mode.",
      );

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Use Editorial theme"]').click();
      await waitForCondition(() =>
        courseScope.style.getPropertyValue("--sc-course-font-heading").includes("Source Serif 4"),
      );

      await chooseThemeColour(panel, "Primary", "Secondary course primary");
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") ===
          editorial.values.colors.author.light.secondary,
      );

      changeSelect(
        requireElement<HTMLSelectElement>(panel, 'select[name="headingFontId"]'),
        "scaffold-inter",
      );
      await waitForCondition(() =>
        courseScope.style.getPropertyValue("--sc-course-font-heading").includes("Inter"),
      );

      const roundness = requireElement<HTMLInputElement>(panel, 'input[name="roundness"]');
      roundness.focus();
      roundness.value = "0.9";
      roundness.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await waitForCondition(
        () => courseScope.style.getPropertyValue("--sc-course-roundness") === "0.9",
      );

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Reset course design"]').click();
      await waitForCondition(
        () => courseScope.style.getPropertyValue("--sc-course-roundness") !== "0.9",
      );

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Close course theme"]').click();
      const undo = await waitForElement<HTMLButtonElement>(
        document,
        'button[aria-label="Undo"]:not(:disabled)',
      );
      undo.click();
      await waitForCondition(
        () => courseScope.style.getPropertyValue("--sc-course-roundness") === "0.9",
      );
      await waitForCondition(() => saveCalls > 0, 1_500);

      requireElement<HTMLButtonElement>(
        document,
        'button[aria-label="Switch authoring application to dark mode"]',
      ).click();
      await waitForCondition(
        () =>
          requireElement<HTMLElement>(document, ".sc-scaffold-authoring-app").dataset[
            "scaffoldColorMode"
          ] === "dark",
      );
      await waitForCondition(() => courseScope.dataset["courseColorMode"] === "dark");
      openTheme.click();
      const darkPanel = await waitForElement<HTMLElement>(
        document,
        '[role="dialog"].sc-course-theme-panel',
      );
      const foundationTrigger = requireElementWithText<HTMLButtonElement>(
        darkPanel,
        ".sc-accordion-trigger",
        "Foundation colours",
      );
      const panelBody = requireElement<HTMLElement>(darkPanel, ".sc-sheet-body");
      foundationTrigger.scrollIntoView();
      foundationTrigger.focus();

      expect(document.activeElement).toBe(foundationTrigger);
      expect(darkPanel.textContent).toContain(
        "Editing dark colours for the current application mode.",
      );
      expect(darkPanel.querySelectorAll(".sc-settings-color-field__trigger")).toHaveLength(11);
      expect(document.querySelectorAll(".sc-color-picker-control-stack")).toHaveLength(0);
      expect(
        [...darkPanel.querySelectorAll(".sc-pill")].filter(
          (status) => status.textContent === "Automatic",
        ),
      ).toHaveLength(11);
      expect(getComputedStyle(darkPanel).colorScheme).toBe("dark");
      expect(getComputedStyle(panelBody).overflowY).toBe("auto");
      expect(panelBody.scrollHeight).toBeGreaterThan(panelBody.clientHeight);
      expect(requireElement(document, "h1").textContent).toBe("Theme heading");
      expect(requireElement(document, "pre").textContent).toContain("const themed = true");

      const primaryPopover = await openThemeColourPicker(darkPanel, "Primary");
      const primaryOptions = [
        ...primaryPopover.querySelectorAll<HTMLButtonElement>(".sc-color-picker-swatch-button"),
      ];
      expect(primaryOptions.length).toBeGreaterThanOrEqual(2);
      await waitForCondition(() => primaryPopover.contains(document.activeElement));
      primaryOptions[0]!.focus();
      primaryOptions[0]!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "ArrowRight" }),
      );
      expect(document.activeElement).toBe(primaryOptions[1]);

      requireElement<HTMLButtonElement>(
        primaryPopover,
        'button[aria-label="Secondary course primary"]',
      ).click();
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") ===
          editorial.values.colors.author.dark.values.secondary,
      );
      requireElement<HTMLButtonElement>(
        primaryPopover,
        'button[aria-label="Use automatic primary colour"]',
      ).click();
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") !==
          editorial.values.colors.author.dark.values.secondary,
      );
      findThemeColourTrigger(darkPanel, "Primary").click();
      await waitForCondition(
        () => document.querySelector(".sc-settings-color-field__popover") === null,
      );
      await chooseThemeColour(darkPanel, "Primary", "Accent 1 course primary");
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") ===
          editorial.values.colors.author.dark.values.accent1,
      );
      requireElement<HTMLButtonElement>(
        darkPanel,
        'button[aria-label="Reset complete theme"]',
      ).click();
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") !==
          editorial.values.colors.author.dark.values.accent1,
      );
      requireElement<HTMLButtonElement>(
        darkPanel,
        'button[aria-label="Close course theme"]',
      ).click();
      const darkModeUndo = await waitForElement<HTMLButtonElement>(
        document,
        'button[aria-label="Undo"]:not(:disabled)',
      );
      darkModeUndo.click();
      await waitForCondition(
        () =>
          courseScope.style.getPropertyValue("--sc-course-color-primary") ===
          editorial.values.colors.author.dark.values.accent1,
      );
    } finally {
      await rendered.unmount();
    }
  });
});

function changeSelect(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function openThemeColourPicker(panel: HTMLElement, fieldLabel: string): Promise<HTMLElement> {
  findThemeColourTrigger(panel, fieldLabel).click();
  return waitForElement(document, ".sc-settings-color-field__popover");
}

async function chooseThemeColour(
  panel: HTMLElement,
  fieldLabel: string,
  optionLabel: string,
): Promise<void> {
  const popover = await openThemeColourPicker(panel, fieldLabel);
  requireElement<HTMLButtonElement>(popover, `button[aria-label="${optionLabel}"]`).click();
  findThemeColourTrigger(panel, fieldLabel).click();
  await waitForCondition(
    () => document.querySelector(".sc-settings-color-field__popover") === null,
  );
}

function findThemeColourTrigger(panel: HTMLElement, fieldLabel: string): HTMLButtonElement {
  const trigger = [
    ...panel.querySelectorAll<HTMLButtonElement>(".sc-settings-color-field__trigger"),
  ].find((candidate) => candidate.getAttribute("aria-label")?.startsWith(`Edit ${fieldLabel}, `));
  if (!trigger) throw new Error(`Expected Theme colour trigger ${fieldLabel}`);
  return trigger;
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

function requireElementWithText<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
  text: string,
): T {
  const element = [...root.querySelectorAll<T>(selector)].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (!element) throw new Error(`Expected element matching ${selector} with text ${text}`);
  return element;
}

async function waitForElement<T extends Element>(
  root: ParentNode,
  selector: string,
  timeout = 2_000,
): Promise<T> {
  let element = root.querySelector<T>(selector);
  const started = performance.now();
  while (!element && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    element = root.querySelector<T>(selector);
  }
  if (!element) throw new Error(`Timed out waiting for ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean, timeout = 2_000): Promise<void> {
  const started = performance.now();
  while (!condition() && performance.now() - started < timeout) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  expect(condition()).toBe(true);
}
