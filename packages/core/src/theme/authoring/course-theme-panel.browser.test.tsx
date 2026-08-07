import type { PersistedCourseTheme } from "@scaffold/contracts";
import type { Editor, JSONContent } from "@tiptap/core";
import type { ReactNode } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createScaffoldDocumentContent } from "@/format/artifact";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import type { ArtifactSaveBundle } from "@/host/ports";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import "@/styles/globals.css";

vi.mock("@/document/authoring/CourseDocumentEditor", () => ({
  CourseDocumentEditor: () => null,
}));

vi.mock("@/editor/shell/authoring/ContentAuthorHost", async () => {
  const { Editor, Node } = await import("@tiptap/core");
  const StarterKit = (await import("@tiptap/starter-kit")).default;
  const { createElement, useEffect, useState } = await import("react");
  const { EditorContent } = await import("@tiptap/react");
  const { CourseDocumentNode, createCourseSectionNode, DocumentNode } =
    await import("@/document/model/nodes");
  const { SurfaceNode } = await import("@/editor/surfaces/model/nodes/surface-node");
  const TestArrangementNode = Node.create({
    name: "testArrangement",
    group: "arrangement",
    content: "block+",
  });
  const TestRegionNode = Node.create({
    name: "testRegion",
    group: "region",
    content: "block+",
  });

  return {
    ContentAuthorHost: ({
      content,
      leftRail,
      onChange,
      onEditorReady,
    }: {
      content: JSONContent;
      leftRail?: (editor: Editor) => ReactNode;
      onChange?: (editor: Editor) => void;
      onEditorReady?: (editor: Editor) => void;
    }) => {
      const [editor] = useState(
        () =>
          new Editor({
            extensions: [
              DocumentNode,
              StarterKit.configure({ document: false }),
              CourseDocumentNode,
              createCourseSectionNode(),
              SurfaceNode,
              TestArrangementNode,
              TestRegionNode,
            ],
            content,
            onUpdate: ({ editor: updatedEditor }) => onChange?.(updatedEditor),
          }),
      );

      useEffect(() => {
        onEditorReady?.(editor);
        return () => editor.destroy();
      }, [editor, onEditorReady]);

      return createElement(
        "section",
        { "data-testid": "browser-content-author-host" },
        leftRail?.(editor),
        createElement(EditorContent, { editor }),
      );
    },
  };
});

const unavailableTheme: PersistedCourseTheme = {
  schemaVersion: 1,
  design: { id: "unavailable-design", revision: "7" },
  colourSystem: { id: "unavailable-colours", revision: "3" },
  overrides: {},
};

describe("course theme panel browser workflow", () => {
  it("selects, resets, undoes, autosaves, and stays independent from dark App chrome", async () => {
    const { ScaffoldAuthoringApp } = await import("@/editor/shell/authoring/ScaffoldAuthoringApp");
    await page.viewport(480, 650);
    let editor: Editor | null = null;
    const savedBundles: ArtifactSaveBundle[] = [];
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "themepage001",
    });
    content.content![0]!.attrs!["theme"] = unavailableTheme;
    content.content![0]!.content![0]!.content = [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Theme heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "Theme body copy" }] },
    ];
    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "theme-browser-artifact",
          title: "Theme browser",
          mode: "page",
          content,
        }}
        services={{
          artifactPersistence: {
            saveArtifact: async (bundle) => {
              savedBundles.push(bundle);
              return {};
            },
          },
          media: null,
        }}
        onEditorReady={(nextEditor) => {
          editor = nextEditor;
        }}
      />,
    );

    try {
      await waitForCondition(() => editor !== null);
      const openTheme = await waitForElement<HTMLButtonElement>(
        document,
        'button[aria-label="Open course theme"]',
      );
      openTheme.click();
      let panel = await waitForElement<HTMLElement>(
        document,
        '[role="dialog"].sc-course-theme-panel',
      );

      expect(panel.getBoundingClientRect().width).toBeLessThanOrEqual(480);
      expect(panel.textContent).toContain("Saved design unavailable-design@7 is unavailable.");
      expect(panel.textContent).toContain(
        "Saved colour system unavailable-colours@3 is unavailable.",
      );
      expect(panel.querySelectorAll('.sc-settings-card-select[role="radiogroup"]')).toHaveLength(2);
      expect(panel.querySelectorAll('[role="radio"][data-state="on"]')).toHaveLength(0);
      expect(panel.querySelectorAll(".sc-settings-color-field__trigger")).toHaveLength(0);

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Reset complete theme"]').click();
      await waitForCondition(() => themesEqual(readEditorTheme(editor), defaultTheme()));
      await waitForCondition(() => savedBundles.length > 0, 1_500);
      expect(readBundleTheme(savedBundles.at(-1))).toEqual(defaultTheme());

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Close course theme"]').click();
      const undo = await waitForElement<HTMLButtonElement>(
        document,
        'button[aria-label="Undo"]:not(:disabled)',
      );
      undo.click();
      await waitForCondition(() => themesEqual(readEditorTheme(editor), unavailableTheme));

      openTheme.click();
      panel = await waitForElement<HTMLElement>(document, '[role="dialog"].sc-course-theme-panel');
      requireElement<HTMLButtonElement>(
        panel,
        'button[aria-label="Use Scaffold Flow design"]',
      ).click();
      await waitForCondition(() => themesEqual(readEditorTheme(editor), defaultTheme()));
      await waitForCondition(
        () =>
          panel
            .querySelector('[role="radio"][aria-label="Use Scaffold Flow design"]')
            ?.getAttribute("data-state") === "on",
      );

      const bodyFont = requireElement<HTMLButtonElement>(
        panel,
        '[role="combobox"][id$="-defaultFontId"]',
      );
      bodyFont.click();
      const poppins = await waitForElement<HTMLElement>(document, '[role="option"]');
      const poppinsOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent?.includes("Poppins"),
      );
      expect(poppins.textContent).not.toBe("");
      if (!poppinsOption) throw new Error("Expected Poppins font option");
      poppinsOption.click();
      await waitForCondition(
        () => readEditorTheme(editor)?.overrides.typography?.defaultFontId === "scaffold-poppins",
      );
      await waitForCondition(
        () =>
          readBundleTheme(savedBundles.at(-1)) !== undefined &&
          JSON.stringify(readBundleTheme(savedBundles.at(-1))) ===
            JSON.stringify(readEditorTheme(editor)),
        1_500,
      );
      expect(panel.textContent).toContain("Custom");
      expect(panel.querySelector('button[aria-label="Apply"]')).toBeNull();
      expect(panel.querySelector('button[aria-label="Save"]')).toBeNull();

      requireElement<HTMLButtonElement>(
        panel,
        'button[aria-label="Use inherited body font"]',
      ).click();
      await waitForCondition(
        () => readEditorTheme(editor)?.overrides.typography?.defaultFontId === undefined,
      );
      expect(bodyFont.textContent).toContain("Satoshi");

      const courseTextSize = requireElement<HTMLButtonElement>(
        panel,
        '[role="combobox"][id$="-courseTextSize"]',
      );
      courseTextSize.click();
      await waitForElement<HTMLElement>(document, '[role="option"]');
      const largerOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent?.includes("Larger"),
      );
      if (!largerOption) throw new Error("Expected Larger Course text size option");
      largerOption.click();
      const uppercaseHeadings = requireElement<HTMLElement>(panel, '[role="checkbox"]');
      uppercaseHeadings.click();
      await waitForCondition(
        () =>
          readEditorTheme(editor)?.overrides.typography?.courseTextSize === "larger" &&
          readEditorTheme(editor)?.overrides.typography?.uppercaseHeadings === true,
      );
      await waitForCondition(
        () =>
          JSON.stringify(readBundleTheme(savedBundles.at(-1))) ===
          JSON.stringify(readEditorTheme(editor)),
        1_500,
      );
      expect(requireElement(document, "h1").textContent).toBe("Theme heading");

      const resetTypography = requireElement<HTMLButtonElement>(
        panel,
        'button[aria-label="Reset all typography overrides"]',
      );
      expect(resetTypography.closest(".sc-settings-form__section-actions")).not.toBeNull();
      expect(resetTypography.closest(".sc-app-sheet-footer")).toBeNull();
      resetTypography.click();
      await waitForCondition(() => readEditorTheme(editor)?.overrides.typography === undefined);
      await waitForCondition(
        () =>
          JSON.stringify(readBundleTheme(savedBundles.at(-1))) ===
          JSON.stringify(readEditorTheme(editor)),
        1_500,
      );
      expect(courseTextSize.textContent).toContain("Standard");
      expect(uppercaseHeadings.getAttribute("data-state")).toBe("unchecked");

      courseTextSize.click();
      await waitForElement<HTMLElement>(document, '[role="option"]');
      const retainedLargerOption = [
        ...document.querySelectorAll<HTMLElement>('[role="option"]'),
      ].find((option) => option.textContent?.includes("Larger"));
      if (!retainedLargerOption) throw new Error("Expected retained Larger option");
      retainedLargerOption.click();

      const roundness = requireElement<HTMLButtonElement>(
        panel,
        '[role="combobox"][id$="-roundness"]',
      );
      roundness.click();
      await waitForElement<HTMLElement>(document, '[role="option"]');
      const squareOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent?.includes("Square"),
      );
      if (!squareOption) throw new Error("Expected Square roundness option");
      squareOption.click();
      const density = requireElement<HTMLButtonElement>(panel, '[role="combobox"][id$="-density"]');
      density.click();
      await waitForElement<HTMLElement>(document, '[role="option"]');
      const spaciousOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (option) => option.textContent?.includes("Spacious"),
      );
      if (!spaciousOption) throw new Error("Expected Spacious density option");
      spaciousOption.click();
      await waitForCondition(
        () =>
          readEditorTheme(editor)?.overrides.design?.roundness === "square" &&
          readEditorTheme(editor)?.overrides.design?.density === "spacious",
      );

      requireElement<HTMLButtonElement>(
        panel,
        'button[aria-label="Use inherited roundness"]',
      ).click();
      await waitForCondition(
        () => readEditorTheme(editor)?.overrides.design?.roundness === undefined,
      );
      expect(roundness.textContent).toContain("Rounded");

      const resetDesign = requireElement<HTMLButtonElement>(
        panel,
        'button[aria-label="Reset all Design overrides"]',
      );
      expect(resetDesign.textContent).toContain("Reset Design overrides");
      expect(resetDesign.closest(".sc-settings-form__section-actions")).not.toBeNull();
      expect(resetDesign.closest(".sc-app-sheet-footer")).toBeNull();
      resetDesign.click();
      await waitForCondition(
        () =>
          readEditorTheme(editor)?.overrides.design === undefined &&
          readEditorTheme(editor)?.overrides.typography?.courseTextSize === "larger",
      );
      await waitForCondition(
        () =>
          JSON.stringify(readBundleTheme(savedBundles.at(-1))) ===
          JSON.stringify(readEditorTheme(editor)),
        1_500,
      );
      expect(density.textContent).toContain("Comfortable");

      requireElement<HTMLButtonElement>(panel, 'button[aria-label="Close course theme"]').click();
      const themeBeforeAppearanceChange = readEditorTheme(editor);
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
      expect(readEditorTheme(editor)).toEqual(themeBeforeAppearanceChange);

      openTheme.click();
      const darkPanel = await waitForElement<HTMLElement>(
        document,
        '[role="dialog"].sc-course-theme-panel',
      );
      expect(getComputedStyle(darkPanel).colorScheme).toBe("dark");
      expect(requireElement(document, "h1").textContent).toBe("Theme heading");
      expect(requireElement(document, "p").textContent).toBe("Theme body copy");
    } finally {
      await rendered.unmount();
    }
  });
});

function defaultTheme(): PersistedCourseTheme {
  return structuredClone(createDefaultPersistedCourseTheme());
}

function readEditorTheme(editor: Editor | null): PersistedCourseTheme | null {
  if (!editor) return null;
  return structuredClone(editor.state.doc.firstChild?.attrs["theme"] ?? null);
}

function readBundleTheme(bundle: ArtifactSaveBundle | undefined): unknown {
  return bundle?.artifact.content.content?.[0]?.attrs?.["theme"];
}

function themesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireElement<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
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
