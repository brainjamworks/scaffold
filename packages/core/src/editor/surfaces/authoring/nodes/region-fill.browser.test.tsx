import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { CourseDocumentEditor } from "@/document/authoring/CourseDocumentEditor.test-harness";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createLayerWithContent } from "@/document/model/layers/layer-construction";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createScaffoldDocumentContent } from "@/format/artifact";
import "@/styles/globals.css";

const coreAuthoringComposition = createCoreScaffoldAuthoringComposition();

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("bounded Region authoring geometry", () => {
  it("allocates its finite row through the complete Tiptap wrapper path", async () => {
    const content = tabsDocument();
    const host = globalThis.document.createElement("div");
    host.style.position = "absolute";
    host.style.inset = "0 auto auto 0";
    host.style.width = "1024px";
    globalThis.document.body.append(host);
    const root = createRoot(host);
    let editor: TiptapEditor | null = null;

    root.render(
      <CourseDocumentEditor
        composition={coreAuthoringComposition}
        source={{ mode: "document", content }}
        editable
        onReady={(nextEditor) => {
          editor = nextEditor;
        }}
      />,
    );
    dispose = () => {
      root.unmount();
      editor?.destroy();
      host.remove();
    };

    await waitForCondition(
      () => editor !== null && host.querySelector('[role="tablist"]') !== null,
    );
    await nextLayoutFrame();

    const region = requiredElement(host, '[data-node="region"]');
    const regionViewport = requiredElement(
      region,
      ":scope > [data-bounded-scroll-frame] > [data-bounded-scroll]",
    );
    const regionHint = requiredElement(
      region,
      ":scope > [data-bounded-scroll-frame] > [data-bounded-scroll-hint]",
    );
    const frame = requiredElement(
      region,
      '[data-authoring-frame="layout"][data-definition="tabs"]',
    );
    const tabs = requiredElement(frame, ":scope > .sc-course-tabs");
    const tab = requiredElement(tabs, '[role="tab"]');
    const regionBounds = region.getBoundingClientRect();
    const regionStyle = getComputedStyle(region);
    const expectedContentHeight =
      regionBounds.height -
      Number.parseFloat(regionStyle.paddingTop) -
      Number.parseFloat(regionStyle.paddingBottom);

    expect(regionStyle.alignContent).toBe("stretch");
    expect(regionViewport).not.toBeNull();
    expect(regionHint.textContent).toBe("Scroll for more ↓");
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
  const surface = definition.createSurface({ surfaceId: createEmbeddedNodeId() });
  if (!surface.content) throw new Error("Slide-content surface has no Region content.");
  const populatedSurface: JSONContent = {
    ...surface,
    content: surface.content.map((child) =>
      child.type === "region"
        ? {
            ...child,
            content: (child.content ?? []).map((layer) => ({
              ...layer,
              content: [
                {
                  type: "layout",
                  attrs: {
                    id: createEmbeddedNodeId(),
                    variant: "tabs",
                    options: { label: "Lesson sections", variant: "default" },
                  },
                  content: [tabSection("Overview"), tabSection("Practice"), tabSection("Review")],
                },
              ],
            })),
          }
        : child,
    ),
  };
  const content = createScaffoldDocumentContent({
    mode: "slideshow",
    surfaceId: "surface-tabs",
    initialCourseSectionTitle: "Bounded Region geometry",
  });
  const courseDocument = content.content?.[0];
  if (courseDocument?.type !== "courseDocument") {
    throw new Error("Could not create bounded Region browser fixture.");
  }
  const courseSection = courseDocument.content?.find((node) => node.type === "courseSection");
  if (!courseSection) throw new Error("Could not create the browser fixture Course Section.");
  assignMissingIds(populatedSurface);
  courseDocument.content = [courseSection, populatedSurface];
  return content;
}

function tabSection(label: string): JSONContent {
  return {
    type: "section",
    attrs: { id: createEmbeddedNodeId(), role: "tab-panel", options: { label } },
    content: [createLayerWithContent([{ type: "paragraph" }])],
  };
}

function assignMissingIds(root: JSONContent): void {
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) throw new Error("Bounded Region ID traversal lost its node.");
    if (node.type !== "text") {
      node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
    }
    for (const child of node.content ?? []) stack.push(child);
  }
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
