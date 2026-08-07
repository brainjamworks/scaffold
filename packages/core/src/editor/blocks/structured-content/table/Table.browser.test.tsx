import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { CellSelection, columnResizingPluginKey } from "@tiptap/pm/tables";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import "@/styles/globals.css";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

const mountedEditors: TiptapEditor[] = [];
const mountedRoots: Root[] = [];
const coreAuthoringComposition = createScaffoldApplication().authoring;

afterEach(() => {
  for (const root of mountedRoots.splice(0)) root.unmount();
  for (const editor of mountedEditors.splice(0)) editor.destroy();
  document.body.replaceChildren();
});

describe("Table presentation", () => {
  it("uses the real TableView wrapper with Course recipe and App authoring states", async () => {
    const host = document.createElement("div");
    host.style.cssText = "position: absolute; inset: 0 auto auto 0; width: 560px;";
    document.body.append(host);

    const root = createRoot(host);
    mountedRoots.push(root);
    const editorRef: { current: TiptapEditor | null } = { current: null };
    root.render(
      <AppThemeProvider appearance="light">
        <main>
          <CourseDocumentEditor
            composition={coreAuthoringComposition}
            source={{ mode: "document", content: tableDocument() }}
            editable
            onReady={(readyEditor) => {
              editorRef.current = readyEditor;
              mountedEditors.push(readyEditor);
            }}
          />
        </main>
      </AppThemeProvider>,
    );

    await waitForCondition(
      () =>
        editorRef.current !== null && host.querySelector(".tableWrapper.sc-course-table > table"),
    );
    const editor = editorRef.current;
    if (!editor) throw new Error("Expected the Table authoring editor.");

    const application = requiredElement<HTMLElement>(host, ".sc-app");
    const course = requiredElement<HTMLElement>(host, ".sc-course");
    application.style.setProperty("--sc-app-color-focus-ring", "rgb(220 38 38 / 0.28)");
    application.style.setProperty("--sc-app-color-focus-outline", "rgb(220 38 38)");
    course.style.setProperty("--gray-1", "rgb(250 250 250)");
    course.style.setProperty("--gray-a6", "rgb(82 82 91 / 0.4)");
    course.style.setProperty("--accent-a3", "rgb(224 231 255)");
    course.style.setProperty("--accent-11", "rgb(55 48 163)");

    const wrapper = requiredElement<HTMLElement>(host, ".tableWrapper.sc-course-table");
    const table = requiredElement<HTMLTableElement>(wrapper, ":scope > table");
    const header = requiredElement<HTMLTableCellElement>(table, "th");

    expect(getComputedStyle(wrapper).overflowX).toBe("auto");
    expect(wrapper.scrollWidth).toBeGreaterThan(wrapper.clientWidth);
    expect(table.style.minWidth).toBe("640px");
    expect(getComputedStyle(table).tableLayout).toBe("fixed");
    expect(getComputedStyle(table).borderCollapse).toBe("separate");
    expect(getComputedStyle(table).borderTopColor).toBe("rgba(82, 82, 91, 0.4)");
    expect(getComputedStyle(header).backgroundColor).toBe("rgb(224, 231, 255)");
    expect(getComputedStyle(header).color).toBe("rgb(55, 48, 163)");
    expect(Number.parseFloat(getComputedStyle(header).fontSize)).toBeGreaterThanOrEqual(14);

    const bodyCellPos = firstNodePos(editor, "tableCell");
    const headerCellPos = firstNodePos(editor, "tableHeader");
    editor.view.dispatch(
      editor.state.tr.setSelection(CellSelection.create(editor.state.doc, bodyCellPos)),
    );
    editor.view.dispatch(
      editor.state.tr.setMeta(columnResizingPluginKey, { setHandle: headerCellPos }),
    );
    await waitForCondition(
      () =>
        host.querySelector(".selectedCell") !== null &&
        host.querySelector(".column-resize-handle") !== null,
    );

    const selectedCell = requiredElement<HTMLTableCellElement>(table, ".selectedCell");
    const resizeHandle = requiredElement<HTMLElement>(table, ".column-resize-handle");
    const selectedOverlay = getComputedStyle(selectedCell, "::after");
    const resizeDecoration = getComputedStyle(resizeHandle, "::after");

    expect(getComputedStyle(selectedCell).backgroundColor).toBe("rgb(250, 250, 250)");
    expect(selectedOverlay.backgroundColor).toBe("rgba(220, 38, 38, 0.28)");
    expect(selectedOverlay.pointerEvents).toBe("none");
    expect(resizeHandle.getBoundingClientRect().width).toBeCloseTo(4, 0);
    expect(getComputedStyle(resizeHandle).pointerEvents).toBe("none");
    expect(resizeDecoration.width).toBe("2px");
    expect(resizeDecoration.opacity).toBe("1");
    expect(resizeDecoration.backgroundColor).toBe("rgb(220, 38, 38)");
    expect(Number.parseInt(getComputedStyle(resizeHandle).zIndex, 10)).toBeGreaterThan(
      Number.parseInt(selectedOverlay.zIndex, 10),
    );
    expect(getComputedStyle(editor.view.dom).cursor).toBe("col-resize");
  });
});

function tableDocument(): JSONContent {
  const content = createScaffoldDocumentContent({ mode: "page", surfaceId: "tablesurf001" });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.[0];
  if (!surface) throw new Error("Expected a Page surface.");

  const columns = Array.from({ length: 8 }, (_, index) => index + 1);
  surface.content = [
    {
      type: "table",
      attrs: { id: "tablebrowser" },
      content: [
        {
          type: "tableRow",
          content: columns.map((column) => ({
            type: "tableHeader",
            content: [paragraph(`Column ${column}`)],
          })),
        },
        {
          type: "tableRow",
          content: columns.map((column) => ({
            type: "tableCell",
            content: [paragraph(`Value ${column}`)],
          })),
        },
      ],
    },
  ];
  return content;
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function firstNodePos(editor: TiptapEditor, nodeType: "tableCell" | "tableHeader"): number {
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    found = pos;
    return false;
  });
  if (found === null) throw new Error(`Expected a ${nodeType} node.`);
  return found;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected an element for ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Table state.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
