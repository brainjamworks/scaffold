import { McqSettingsSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { StrictMode } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { ScaffoldAuthoringApp } from "@/editor/shell/authoring/ScaffoldAuthoringApp";
import type { ArtifactSavePayload } from "@/host/ports";
import type { LearnerPublicationPort } from "@/host/ports/learner-publication";
import "@/styles/globals.css";

describe("Document Outline authoring integration", () => {
  it("keeps canonical Block and Layout chrome visible while focus remains in the Outline", async () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "outlinenav01",
    });
    const surface = content.content?.[0]?.content?.[0];
    const mcq = builtInBlockRegistry.getByNodeType("mcq")?.insert;
    const paginated = builtInLayoutRegistry.getById("paginated");
    if (!surface || !mcq || !paginated) {
      throw new Error("Expected the built-in page Surface, MCQ and Paginated layout");
    }
    surface.content = [
      mountedMcq(mcq.content()),
      mountedContent(paginated.createContent({ options: { pages: 2 } })),
    ];

    const rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-navigation-artifact",
          title: "Outline navigation",
          mode: "page",
          content,
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: {
            saveArtifact: vi.fn(async () => ({ artifactRevision: "outline-test-revision" })),
          },
          learnerPublication: createTestLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    try {
      await expect
        .element(page.getByRole("button", { name: "Show Document Outline" }))
        .toBeVisible();
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect
        .element(page.getByRole("button", { name: "Back to Page overview" }))
        .toBeVisible();
      await expect.element(page.getByRole("tree", { name: "Page structure" })).toBeVisible();
      expect(document.querySelector('button[aria-label="Add Course Section"]')).toBeNull();

      const blockRow = requireElement<HTMLElement>(
        '[role="treeitem"][aria-label^="Multiple choice"]',
      );
      await userEvent.click(blockRow);

      expect(document.activeElement).toBe(blockRow);
      await expect
        .poll(() => Boolean(document.querySelector('button[aria-label="Duplicate block"]')))
        .toBe(true);
      const blockFrame = requireElement<HTMLElement>(
        '[data-authoring-frame="block"][data-node="mcq"]',
      );
      const blockFrameWrapper = blockFrame.closest<HTMLElement>("[data-authoring-frame-wrapper]");
      if (!blockFrameWrapper) throw new Error("Expected the MCQ authoring frame wrapper");
      expect(blockFrameWrapper.hasAttribute("data-authoring-frame-wrapper-active")).toBe(true);

      const layoutRow = requireElement<HTMLElement>('[role="treeitem"][aria-label="Paginated"]');
      await userEvent.click(layoutRow);

      expect(document.activeElement).toBe(layoutRow);
      await expect
        .poll(() =>
          requireElement<HTMLElement>(
            '[data-authoring-frame="layout"][data-layout-kind="paginated"]',
          ).hasAttribute("data-authoring-chrome-active"),
        )
        .toBe(true);
    } finally {
      await rendered.unmount();
    }
  });

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
          artifactPersistence: {
            saveArtifact: vi.fn(async () => ({ artifactRevision: "outline-test-revision" })),
          },
          learnerPublication: createTestLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    try {
      await expect
        .element(page.getByRole("button", { name: "Show Document Outline" }))
        .toBeVisible();
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("tree", { name: "Page structure" })).toBeVisible();
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

  it("keeps layout disclosures interactive through Strict Mode effect replay", async () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "outlinepage2",
    });
    const surface = content.content?.[0]?.content?.[0];
    const paginated = builtInLayoutRegistry.getById("paginated");
    if (!surface || !paginated) {
      throw new Error("Expected the built-in page Surface and Paginated layout");
    }
    surface.content = [mountedContent(paginated.createContent({ options: { pages: 2 } }))];

    const rendered = await renderBrowserReact(
      <StrictMode>
        <ScaffoldAuthoringApp
          application={createScaffoldApplication()}
          artifact={{
            id: "outline-strict-mode-artifact",
            title: "Outline Strict Mode",
            mode: "page",
            content,
          }}
          productAccess={{ scaffoldPlusAuthorized: false }}
          services={{
            artifactPersistence: {
              saveArtifact: vi.fn(async () => ({ artifactRevision: "outline-test-revision" })),
            },
            learnerPublication: createTestLearnerPublicationPort(),
            media: null,
          }}
        />
      </StrictMode>,
    );

    try {
      await expect
        .element(page.getByRole("button", { name: "Show Document Outline" }))
        .toBeVisible();
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("tree", { name: "Page structure" })).toBeVisible();

      requireElement<HTMLButtonElement>('button[aria-label="Collapse Paginated"]').click();
      await expect
        .element(page.getByRole("treeitem", { name: "Paginated" }))
        .toHaveAttribute("aria-expanded", "false");

      requireElement<HTMLButtonElement>('button[aria-label="Expand Paginated"]').click();

      await expect
        .element(page.getByRole("treeitem", { name: "Paginated" }))
        .toHaveAttribute("aria-expanded", "true");
      await expect.element(page.getByRole("treeitem", { name: "Page 1" })).toBeVisible();
      await expect.element(page.getByRole("treeitem", { name: "Page 2" })).toBeVisible();
    } finally {
      await rendered.unmount();
    }
  });

  it("persists a renamed Block through the ordinary save and reload path", async () => {
    const content = createScaffoldDocumentContent({
      mode: "page",
      surfaceId: "surface00009",
    });
    const surface = content.content?.[0]?.content?.[0];
    const mcq = builtInBlockRegistry.getByNodeType("mcq")?.insert;
    if (!surface || !mcq) throw new Error("Expected the built-in page Surface and MCQ insert");
    surface.content = [mountedMcq(mcq.content())];
    const saveArtifact = vi.fn(async (_payload: ArtifactSavePayload) => ({
      artifactRevision: "outline-test-revision" as const,
    }));
    let rendered = await renderBrowserReact(
      <ScaffoldAuthoringApp
        application={createScaffoldApplication()}
        artifact={{
          id: "outline-rename-artifact",
          title: "Outline rename",
          mode: "page",
          content,
        }}
        productAccess={{ scaffoldPlusAuthorized: false }}
        services={{
          artifactPersistence: { saveArtifact },
          learnerPublication: createTestLearnerPublicationPort(),
          media: null,
        }}
      />,
    );

    try {
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("tree", { name: "Page structure" })).toBeVisible();
      const blockRow = requireElement<HTMLElement>(
        '[role="treeitem"][aria-label^="Multiple choice"]',
      );
      blockRow.focus();
      await userEvent.keyboard("{F2}");
      const input = requireElement<HTMLInputElement>('input[aria-label^="Rename Multiple choice"]');
      await userEvent.clear(input);
      await userEvent.type(input, "Knowledge check");
      await userEvent.keyboard("{Enter}");

      await expect.element(page.getByRole("treeitem", { name: "Knowledge check" })).toBeVisible();
      await expect.poll(() => saveArtifact.mock.calls.length).toBeGreaterThan(0);
      const saveCall = saveArtifact.mock.lastCall;
      if (!saveCall) throw new Error("Expected the renamed artifact to be saved");
      const saved = structuredClone(saveCall[0].artifact);
      const savedMcq = findFirstNodeOfType(saved.content, "mcq");
      expect(savedMcq?.attrs?.["semanticLabel"]).toBe("Knowledge check");

      await rendered.unmount();
      rendered = await renderBrowserReact(
        <ScaffoldAuthoringApp
          application={createScaffoldApplication()}
          artifact={saved}
          productAccess={{ scaffoldPlusAuthorized: false }}
          services={{
            artifactPersistence: { saveArtifact },
            learnerPublication: createTestLearnerPublicationPort(),
            media: null,
          }}
        />,
      );
      requireElement<HTMLButtonElement>('button[aria-label="Show Document Outline"]').click();
      await expect.element(page.getByRole("treeitem", { name: "Knowledge check" })).toBeVisible();
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

function createTestLearnerPublicationPort(): LearnerPublicationPort {
  return {
    getStatus: async () => ({
      currentArtifactRevision: "outline-test-revision",
      publishedArtifactRevision: null,
      publishedAt: null,
    }),
    publish: async (payload) => ({
      currentArtifactRevision: payload.sourceArtifactRevision,
      publishedArtifactRevision: payload.sourceArtifactRevision,
      publishedAt: "2026-08-10T12:00:00.000Z",
    }),
  };
}

function requireElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element ${selector}`);
  return element;
}

function findFirstNodeOfType(root: JSONContent, type: string): JSONContent | null {
  if (root.type === type) return root;
  for (const child of root.content ?? []) {
    const found = findFirstNodeOfType(child, type);
    if (found) return found;
  }
  return null;
}

function mountedMcq(content: JSONContent): JSONContent {
  content.attrs = { ...content.attrs, settings: McqSettingsSchema.parse({}) };
  return mountedContent(content);
}

function mountedContent(content: JSONContent): JSONContent {
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
