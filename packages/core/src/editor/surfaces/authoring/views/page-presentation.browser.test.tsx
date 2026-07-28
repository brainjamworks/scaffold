import type { Editor as TiptapEditor } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import { createScaffoldDocumentContent } from "@/format/artifact";
import "@/styles/globals.css";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("Page authoring presentation", () => {
  it("frames the editable Page as a sheet on the authoring canvas", async () => {
    const document = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(
      document,
      createScaffoldDocumentContent({
        mode: "page",
        surfaceId: "surface-page-presentation",
      }),
    );
    const host = globalThis.document.createElement("div");
    host.style.width = "1200px";
    globalThis.document.body.append(host);
    const root = createRoot(host);
    let editor: TiptapEditor | null = null;

    root.render(
      <CourseDocumentEditor
        document={document}
        editable
        onReady={(nextEditor) => {
          editor = nextEditor;
        }}
      />,
    );
    dispose = () => {
      root.unmount();
      editor?.destroy();
      document.destroy();
      host.remove();
    };

    await waitForCondition(
      () =>
        editor !== null && host.querySelector(".sc-page-default-surface-authoring-view") !== null,
    );

    const canvas = requiredElement(
      host,
      '.scaffold-authoring-surface-view[data-course-mode="page"]',
    );
    const surface = requiredElement(canvas, ".sc-page-default-surface-authoring-view");
    const canvasStyle = getComputedStyle(canvas);
    const surfaceStyle = getComputedStyle(surface);

    expect(canvasStyle.backgroundColor).toBe("rgb(250, 250, 250)");
    expect(Number.parseFloat(canvasStyle.paddingTop)).toBeGreaterThan(0);
    expect(surfaceStyle.maxWidth).toBe("1152px");
    expect(surfaceStyle.borderRadius).toBe("12px");
    expect(surfaceStyle.paddingTop).toBe("20px");
  });
});

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing browser-test element: ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for Page authoring.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
