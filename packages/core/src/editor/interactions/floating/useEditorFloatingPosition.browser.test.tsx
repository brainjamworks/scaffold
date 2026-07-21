import type { Editor } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import * as Y from "yjs";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createInteractionOwnerCommandPorts } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-command-ports";
import { createScaffoldDocumentContent } from "@/format/artifact";
import "@/styles/globals.css";

describe("structural floating visibility at the authoring boundary", () => {
  it.each([
    { label: "Page", mode: "page" as const, surfaceId: "first-page-surface" },
    {
      label: "Slideshow",
      mode: "slideshow" as const,
      surfaceId: "first-slide-surface",
    },
  ])("keeps the first $label surface-options trigger visible at the boundary top", async (test) => {
    const ydoc = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(
      ydoc,
      createScaffoldDocumentContent({ mode: test.mode, surfaceId: test.surfaceId }),
    );
    const host = document.createElement("div");
    host.style.cssText = "height: 1200px; inset: 0 auto auto 0; position: absolute; width: 960px;";
    document.body.append(host);
    const reactRoot = createRoot(host);
    const editorRef: { current: Editor | null } = { current: null };

    try {
      reactRoot.render(
        <CourseDocumentEditor
          document={ydoc}
          onReady={(nextEditor) => {
            editorRef.current = nextEditor;
          }}
        />,
      );

      await waitForCondition(() => editorRef.current !== null);
      const authoringEditor = editorRef.current;
      if (!authoringEditor) throw new Error("Expected the authoring editor.");
      const boundary = await waitForElement<HTMLElement>(host, ".sc-authoring-chrome-root");
      const surface = await waitForElement<HTMLElement>(
        host,
        `[data-authoring-frame="surface"][data-id="${test.surfaceId}"]`,
      );
      await nextLayoutFrames(2);
      authoringEditor.view.dom.focus({ preventScroll: true });
      const ports = createInteractionOwnerCommandPorts(authoringEditor.view, builtInBlockRegistry);
      expect(
        ports.activateStructuralTarget({
          id: test.surfaceId,
          kind: InteractionTargetKind.Surface,
          pos: nodePosById(authoringEditor, test.surfaceId),
        }),
      ).toBe(true);

      const trigger = await waitForElement<HTMLButtonElement>(
        host,
        '[data-surface-menu-trigger][aria-label="Surface options"]',
      );
      const floatingContent = trigger.closest<HTMLElement>(".sc-editor-floating-content");
      if (!floatingContent) throw new Error("Expected the surface floating-content wrapper.");
      await waitForCondition(() => floatingContent.dataset.scaffoldOverlayPlaced === "true");
      const boundaryRect = boundary.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();

      expect(Math.abs(surfaceRect.top - boundaryRect.top)).toBeLessThanOrEqual(1);
      expect(floatingContent.dataset.scaffoldOverlayHidden).toBe("false");
      expect(getComputedStyle(floatingContent).visibility).toBe("visible");
      expect(getComputedStyle(floatingContent).pointerEvents).toBe("auto");
      expect(trigger.getBoundingClientRect().height).toBeGreaterThan(0);
    } finally {
      reactRoot.unmount();
      editorRef.current?.destroy();
      ydoc.destroy();
      host.remove();
    }
  });
});

function nodePosById(editor: Editor, id: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    result = pos;
    return false;
  });
  if (result < 0) throw new Error(`Expected node ${id}.`);
  return result;
}

async function waitForElement<T extends Element = Element>(
  root: ParentNode,
  selector: string,
): Promise<T> {
  await waitForCondition(() => root.querySelector(selector) !== null);
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for structural floating browser state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function nextLayoutFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
