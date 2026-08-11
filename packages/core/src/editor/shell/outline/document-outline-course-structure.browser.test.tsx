import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor, JSONContent } from "@tiptap/core";
import { useState } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import "@/editor/shell/authoring/ScaffoldAuthoringApp.css";
import { DocumentOutlineHost } from "@/editor/shell/outline/DocumentOutlineHost";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import "@/styles/globals.css";

const composition = createCoreScaffoldAuthoringComposition();
const FIRST_SURFACE_ID = "surface00001" as EmbeddedNodeId;
const SECOND_SURFACE_ID = "surface00002" as EmbeddedNodeId;
const THIRD_SURFACE_ID = "surface00003" as EmbeddedNodeId;

describe("mounted Course Outline Course Structure authoring", () => {
  it("uses a 16:9 card rhythm with compact progressive Surface drag handles", async () => {
    const rendered = await renderBrowserReact(
      <OutlineHarness
        source={slideshowDocument()}
        onDocumentError={vi.fn()}
        onReady={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );

    try {
      await expect
        .poll(() => document.querySelectorAll('button[aria-label^="Select Surface "]').length)
        .toBe(3);
      await expect.element(page.getByRole("heading", { name: "Course overview" })).toBeVisible();
      const outlineDock = requireElement<HTMLElement>('[data-testid="authoring-outline-dock"]');
      const expandedDockWidth = outlineDock.getBoundingClientRect().width;
      expect(Number.parseFloat(getComputedStyle(outlineDock).maxWidth)).toBeCloseTo(
        expandedDockWidth,
        1,
      );
      expect(
        getComputedStyle(requireElement<HTMLElement>(".sc-authoring-outline-dock-scroll"))
          .scrollbarGutter,
      ).toBe("stable");

      const sectionDisclosure = page.getByRole("button", {
        name: "Introduction",
        exact: true,
      });
      await userEvent.click(sectionDisclosure);
      await expect.element(sectionDisclosure).toHaveAttribute("aria-expanded", "false");
      expect(outlineDock.getBoundingClientRect().width).toBeCloseTo(expandedDockWidth, 1);
      await userEvent.click(sectionDisclosure);
      await expect.element(sectionDisclosure).toHaveAttribute("aria-expanded", "true");
      expect(outlineDock.getBoundingClientRect().width).toBeCloseTo(expandedDockWidth, 1);

      const preview = requireElement<HTMLElement>(".sc-course-surface-placeholder");
      const previewRect = preview.getBoundingClientRect();
      expect(previewRect.width / previewRect.height).toBeCloseTo(16 / 9, 1);

      const dragHandle = requireElement<HTMLElement>(".sc-document-outline-drag-handle");
      const card = dragHandle.closest<HTMLElement>(".sc-course-surface-card");
      if (!card) throw new Error("Expected Surface card drag geometry");
      expect(dragHandle.getBoundingClientRect().right).toBeLessThanOrEqual(
        card.getBoundingClientRect().right,
      );

      await userEvent.click(page.getByRole("button", { name: "Show structure for Cover 1" }));
      await expect
        .element(page.getByRole("button", { name: "Back to Course overview" }))
        .toBeVisible();
      expect(document.querySelector(".sc-surface-structure-back")).toBeNull();
      await userEvent.click(page.getByRole("button", { name: "Back to Course overview" }));
      await expect.element(page.getByRole("heading", { name: "Course overview" })).toBeVisible();
    } finally {
      await rendered.unmount();
    }
  });

  it("owns the complete Section lifecycle as atomic flat-document history actions", async () => {
    const onReady = vi.fn<(editor: Editor) => void>();
    const onUpdate = vi.fn<(json: JSONContent) => void>();
    const onDocumentError = vi.fn();
    const rendered = await renderBrowserReact(
      <OutlineHarness
        source={slideshowDocument()}
        onDocumentError={onDocumentError}
        onReady={onReady}
        onUpdate={onUpdate}
      />,
    );

    try {
      await expect.poll(() => onReady.mock.calls.length).toBe(1);
      const editor = onReady.mock.calls[0]?.[0];
      if (!editor) throw new Error("Expected mounted authoring editor");
      await expect.element(page.getByRole("heading", { name: "Introduction" })).toBeVisible();
      const addSection = requireButton("Add Course Section");
      const overviewActions = addSection.closest<HTMLElement>(
        '[role="group"][aria-label="Course overview actions"]',
      );
      expect(overviewActions).not.toBeNull();
      expect(overviewActions?.textContent).toContain("Sections");
      await expect.poll(() => rootOutlineLabels()).toEqual(["Introduction"]);
      expect(readSurfaceIds(editor)).toEqual([
        FIRST_SURFACE_ID,
        SECOND_SURFACE_ID,
        THIRD_SURFACE_ID,
      ]);
      const initial = structuredClone(editor.getJSON());
      onUpdate.mockClear();

      await userEvent.click(requireButton("Add Course Section"));
      await assertSectionDialogUsesApplicationBoundary();
      await typeInto("Course Section title", "Practice");
      await userEvent.click(requireButton("Add Course Section"));
      await expect.poll(() => readSectionTitles(editor)).toEqual(["Introduction", "Practice"]);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);
      const withEmptySection = structuredClone(editor.getJSON());

      expect(editor.commands.undo()).toBe(true);
      await expect.poll(() => editor.getJSON()).toEqual(initial);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);
      expect(editor.commands.redo()).toBe(true);
      await expect.poll(() => editor.getJSON()).toEqual(withEmptySection);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      await chooseRowAction("Practice", "Edit Course Section title");
      await assertSectionDialogUsesApplicationBoundary();
      const titleInput = requireInput("Course Section title");
      await userEvent.clear(titleInput);
      await userEvent.type(titleInput, "Workshop");
      await userEvent.click(requireButton("Save Course Section title"));
      await expect.poll(() => readSectionTitles(editor)).toEqual(["Introduction", "Workshop"]);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      await chooseRowAction("Workshop", "Duplicate Course Section");
      await expect
        .poll(() => readSectionTitles(editor))
        .toEqual(["Introduction", "Workshop", "Workshop"]);
      expect(readSurfaceIds(editor)).toHaveLength(3);
      expect(new Set(allNodeIds(editor.getJSON())).size).toBe(allNodeIds(editor.getJSON()).length);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      await chooseRowAction("Workshop 1", "Delete Course Section");
      await expect.poll(() => readSectionTitles(editor)).toEqual(["Introduction", "Workshop"]);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      await chooseRowAction("Introduction", "Duplicate Course Section");
      await expect
        .poll(() => readSectionTitles(editor))
        .toEqual(["Introduction", "Introduction", "Workshop"]);
      expect(readSurfaceIds(editor)).toHaveLength(6);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      await chooseRowAction("Introduction 1", "Delete Course Section");
      await assertSectionDialogUsesApplicationBoundary("alertdialog");
      await expect.element(page.getByRole("list", { name: "Related Surfaces" })).toBeVisible();
      await userEvent.click(requireButton("Cancel"));
      await expect
        .poll(() => document.activeElement?.getAttribute("aria-label"))
        .toBe("More actions for Introduction 1");
      expect(onUpdate).not.toHaveBeenCalled();
      await chooseRowAction("Introduction 1", "Delete Course Section");
      await userEvent.click(requireButton("Delete Course Section"));
      await expect.poll(() => readSectionTitles(editor)).toEqual(["Introduction", "Workshop"]);
      expect(readSurfaceIds(editor)).toHaveLength(3);
      await expectSingleUpdate(onUpdate, editor, onDocumentError);

      expect(document.querySelectorAll("div[data-course-section]").length).toBe(2);
      expect(
        directCourseChildren(editor.getJSON()).every(
          (child) => child.type !== "courseSection" || !child.content,
        ),
      ).toBe(true);
    } finally {
      await rendered.unmount();
    }
  });
});

function OutlineHarness({
  source,
  onDocumentError,
  onReady,
  onUpdate,
}: {
  readonly source: JSONContent;
  readonly onDocumentError: (error: unknown) => void;
  readonly onReady: (editor: Editor) => void;
  readonly onUpdate: (json: JSONContent) => void;
}) {
  const [editor, setEditor] = useState<Editor | null>(null);
  const [applicationHost, setApplicationHost] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setApplicationHost} className="sc-outline-test-application">
      <OverlayBoundary container={applicationHost} kind="viewport">
        <CourseDocumentEditor
          composition={composition}
          source={{ mode: "document", content: source, onUpdate }}
          onDocumentError={onDocumentError}
          onReady={(mountedEditor) => {
            setEditor(mountedEditor);
            onReady(mountedEditor);
          }}
        />
        {editor ? <DocumentOutlineHost editor={editor} onClose={() => undefined} /> : null}
      </OverlayBoundary>
    </div>
  );
}

async function chooseRowAction(label: string, action: string, occurrence = 0): Promise<void> {
  await expect.poll(() => actionTriggers(label).length).toBeGreaterThan(occurrence);
  await userEvent.click(actionTriggers(label)[occurrence]!);
  await expect.poll(() => findMenuItem(action) !== null).toBe(true);
  const menuItem = findMenuItem(action)!;
  const localHost = menuItem.closest<HTMLElement>("[data-scaffold-overlay-host]");
  const outlineDock = requireElement<HTMLElement>('[data-testid="authoring-outline-dock"]');
  expect(localHost).not.toBeNull();
  expect(outlineDock.contains(localHost)).toBe(true);
  await userEvent.click(menuItem);
}

async function assertSectionDialogUsesApplicationBoundary(
  role: "dialog" | "alertdialog" = "dialog",
): Promise<void> {
  await expect.element(page.getByRole(role)).toBeVisible();
  const dialog = requireElement<HTMLElement>(".sc-app-dialog-content");
  const overlayHost = dialog.closest<HTMLElement>("[data-scaffold-overlay-host]");
  const outlineDock = requireElement<HTMLElement>('[data-testid="authoring-outline-dock"]');
  expect(overlayHost).not.toBeNull();
  expect(outlineDock.contains(overlayHost)).toBe(false);
  expect(overlayHost?.parentElement).toHaveClass("sc-outline-test-application");

  const interactive = dialog.querySelector<HTMLElement>("input, button");
  if (!interactive) throw new Error("Expected an interactive Section dialog control");
  const rect = interactive.getBoundingClientRect();
  const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  expect(topmost === interactive || interactive.contains(topmost)).toBe(true);
}

function actionTriggers(label: string): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`button[aria-label="More actions for ${label}"]`),
  );
}

function findMenuItem(label: string): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (item) => item.textContent?.trim() === label,
    ) ?? null
  );
}

async function typeInto(label: string, value: string): Promise<void> {
  const input = requireInput(label);
  await userEvent.type(input, value);
}

function requireInput(label: string): HTMLInputElement {
  const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find(
    (candidate) => candidate.labels?.[0]?.textContent?.trim() === label,
  );
  if (!input) throw new Error(`Expected input ${label}`);
  return input;
}

function requireButton(label: string): HTMLButtonElement {
  const matches = (root: ParentNode) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) =>
        (candidate.getAttribute("aria-label") ?? candidate.textContent?.trim()) === label,
    );
  const button =
    matches(document.querySelector('[role="dialog"]') ?? document) ?? matches(document);
  if (!button) throw new Error(`Expected button ${label}`);
  return button;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function rootOutlineLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(".sc-course-section-title")).map(
    (heading) => heading.textContent?.trim() ?? "",
  );
}

async function expectSingleUpdate(
  onUpdate: ReturnType<typeof vi.fn<(json: JSONContent) => void>>,
  editor: Editor,
  onDocumentError: ReturnType<typeof vi.fn>,
): Promise<void> {
  await expect
    .poll(() =>
      onDocumentError.mock.lastCall?.[0]
        ? { error: onDocumentError.mock.lastCall[0], json: editor.getJSON() }
        : onUpdate.mock.calls.length,
    )
    .toBe(1);
  expect(onUpdate.mock.lastCall?.[0]).toEqual(editor.getJSON());
  onUpdate.mockClear();
}

function slideshowDocument(): JSONContent {
  return addMissingNodeIds({
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: {
          id: createEmbeddedNodeId(),
          schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION,
          requiresScaffoldPlus: false,
          mode: "slideshow",
          surfaceSize: "16x9",
          overflowMode: "clip",
          theme: createDefaultPersistedCourseTheme(),
        },
        content: [
          {
            type: "courseSection",
            attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
          },
          ...[FIRST_SURFACE_ID, SECOND_SURFACE_ID, THIRD_SURFACE_ID].map((surfaceId) =>
            slideCoverSurfaceDefinition.createSurface({ surfaceId }),
          ),
        ],
      },
    ],
  });
}

function addMissingNodeIds(node: JSONContent): JSONContent {
  if (node.type === "text") return node;
  return {
    ...node,
    attrs: { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() },
    ...(node.content ? { content: node.content.map(addMissingNodeIds) } : {}),
  };
}

function directCourseChildren(json: JSONContent): JSONContent[] {
  return json.content?.[0]?.content ?? [];
}

function readSectionTitles(editor: Editor): unknown[] {
  return directCourseChildren(editor.getJSON())
    .filter((child) => child.type === "courseSection")
    .map((child) => child.attrs?.["title"]);
}

function readSurfaceIds(editor: Editor): string[] {
  return directCourseChildren(editor.getJSON())
    .filter((child) => child.type === "surface")
    .flatMap((child) => (typeof child.attrs?.["id"] === "string" ? [child.attrs["id"]] : []));
}

function allNodeIds(json: JSONContent): string[] {
  const ids: string[] = [];
  const visit = (node: JSONContent) => {
    if (typeof node.attrs?.["id"] === "string") ids.push(node.attrs["id"]);
    node.content?.forEach(visit);
  };
  visit(json);
  return ids;
}
