import { McqSettingsSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { ScaffoldAuthoringApp } from "@/editor/shell/authoring/ScaffoldAuthoringApp";
import "@/styles/globals.css";

describe("Document Outline authoring integration", () => {
  it("updates an already-open outline when the authoring UI duplicates a block", async () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "outlinepage1",
    });
    const surface = content.content?.[0]?.content?.[0];
    const mcq = builtInBlockRegistry.getByNodeType("mcq")?.insert;
    if (!surface || !mcq) throw new Error("Expected the built-in page Surface and MCQ insert");
    surface.content = [mountedMcq(mcq.content()), mountedMcq(mcq.content())];

    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-browser-artifact",
          title: "Outline browser",
          mode: "page",
          content,
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: { saveArtifact: vi.fn(async () => ({})) },
          media: null,
        }}
      />,
    );

    try {
      await expect
        .element(page.getByRole("button", { name: "Show Document Outline" }))
        .toBeVisible();
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("tree", { name: "Document outline" })).toBeVisible();
      expect(multipleChoiceOutlineCount()).toBe(2);

      const blocks = document.querySelectorAll<HTMLElement>('[data-node="mcq"][data-id]');
      const secondBlock = blocks.item(1);
      if (!secondBlock) throw new Error("Expected the second MCQ block");
      secondBlock.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      secondBlock.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      secondBlock.click();

      await expect
        .poll(() => Boolean(document.querySelector('button[aria-label="Duplicate block"]')))
        .toBe(true);
      const duplicateButton = requireElement<HTMLButtonElement>(
        'button[aria-label="Duplicate block"]',
      );
      duplicateButton.click();

      await expect
        .poll(() => document.querySelectorAll('[data-node="mcq"][data-id]').length)
        .toBe(3);
      await expect.poll(multipleChoiceOutlineCount).toBe(3);
    } finally {
      await rendered.unmount();
    }
  });
});

function multipleChoiceOutlineCount(): number {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="treeitem"]')).filter((item) =>
    item.getAttribute("aria-label")?.startsWith("Multiple choice"),
  ).length;
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function mountedMcq(content: JSONContent): JSONContent {
  content.attrs = { ...content.attrs, settings: McqSettingsSchema.parse({}) };
  const pending = [content];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.type !== "text" && !node.attrs?.["id"]) {
      node.attrs = { ...node.attrs, id: createEmbeddedNodeId() };
    }
    pending.push(...(node.content ?? []));
  }
  return content;
}
