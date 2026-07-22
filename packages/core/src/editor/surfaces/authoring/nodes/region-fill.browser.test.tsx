import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor";
import { initializeAuthoringCourseDocumentFragment } from "@/document/authoring/initialize-authoring-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";
import "@/styles/globals.css";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("bounded Region authoring geometry", () => {
  it("allocates its finite row through the complete Tiptap wrapper path", async () => {
    const document = new Y.Doc();
    initializeAuthoringCourseDocumentFragment(document, tabsDocument());
    const host = globalThis.document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0 auto auto 0";
    host.style.width = "1024px";
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
      () => editor !== null && host.querySelector('[role="tablist"]') !== null,
    );
    await nextLayoutFrame();

    const region = requiredElement(host, '[data-node="region"]');
    const frame = requiredElement(
      region,
      '[data-authoring-frame="layout"][data-definition="tabs"]',
    );
    const tabs = requiredElement(frame, ":scope > .sc-tabs");
    const tab = requiredElement(tabs, '[role="tab"]');
    const regionBounds = region.getBoundingClientRect();
    const regionStyle = getComputedStyle(region);
    const expectedContentHeight =
      regionBounds.height -
      Number.parseFloat(regionStyle.paddingTop) -
      Number.parseFloat(regionStyle.paddingBottom);

    expect(regionStyle.alignContent).toBe("stretch");
    expect(
      Math.abs(frame.getBoundingClientRect().height - expectedContentHeight),
    ).toBeLessThanOrEqual(0.5);
    expect(
      Math.abs(tabs.getBoundingClientRect().height - expectedContentHeight),
    ).toBeLessThanOrEqual(0.5);
    expect(tab.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(getComputedStyle(tab).visibility).toBe("visible");
  });
});

function tabsDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-content");
  if (!definition) throw new Error("Missing slide-content surface definition.");
  const surface = definition.createSurface({ surfaceId: "surface-tabs" });
  if (!surface.content) throw new Error("Slide-content surface has no Region content.");
  const populatedSurface: JSONContent = {
    ...surface,
    content: surface.content.map((child) =>
      child.type === "region"
        ? {
            ...child,
            content: [
              {
                type: "layout",
                attrs: {
                  id: "layout-tabs",
                  variant: "tabs",
                  options: { label: "Lesson sections", variant: "default" },
                },
                content: [
                  tabSection("tab-a", "Overview"),
                  tabSection("tab-b", "Practice"),
                  tabSection("tab-c", "Review"),
                ],
              },
            ],
          }
        : child,
    ),
  };
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface-tabs",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Could not create bounded Region browser fixture.");
  }
  courseDocument.content = [populatedSurface];
  return content;
}

function tabSection(id: string, label: string): JSONContent {
  return {
    type: "section",
    attrs: { id, role: "tab-panel", options: { label } },
    content: [{ type: "paragraph" }],
  };
}

function requiredElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing browser-test element: ${selector}`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for bounded Region.");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function nextLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
