// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  APPROVED_SEMANTIC_MEMBER_FAMILY_CASES,
  SEMANTIC_LIFECYCLE_AUTHORING_STATE,
  createCompleteSemanticLifecycleDocument,
} from "@/document/model/semantic-document/testing/semantic-publication-lifecycle-fixtures";

import {
  getSemanticDocumentControllerForEditor,
  SemanticHierarchyViewController,
  type SemanticHierarchyViewport,
} from "./index";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("semantic document internal consumer contract", () => {
  it("shares one editor controller and selected ID across independent hierarchy views", async () => {
    const editor = createEditor();
    const controller = getSemanticDocumentControllerForEditor(editor);
    expect(getSemanticDocumentControllerForEditor(editor)).toBe(controller);
    const semanticSnapshot = controller.getSnapshot().semantics;
    expect(Object.isFrozen(semanticSnapshot)).toBe(true);
    const surfaceId = semanticSnapshot.roots[0]?.id;
    if (!surfaceId) throw new Error("Expected complete hierarchy Surface root.");
    const outlineViewport = new RecordingViewport();
    const timelineViewport = new RecordingViewport();
    const outline = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport: outlineViewport,
    });
    const timeline = new SemanticHierarchyViewController({
      controller,
      origin: "presentation-timeline",
      viewport: timelineViewport,
    });

    outline.setExpanded(surfaceId, false);
    timeline.setExpanded(surfaceId, false);
    outlineViewport.clear();
    timelineViewport.clear();
    outline.setExpanded(surfaceId, true);

    expect(outline.getSnapshot().expandedIds.has(surfaceId)).toBe(true);
    expect(timeline.getSnapshot().expandedIds.has(surfaceId)).toBe(false);

    controller.reportComponentSelection(surfaceId);
    for (const family of APPROVED_SEMANTIC_MEMBER_FAMILY_CASES) {
      const memberId = family.memberIds.first;
      outlineViewport.clear();
      timelineViewport.clear();
      controller.reportComponentSelection(memberId);

      expect(outline.getSnapshot().selectedId).toBe(memberId);
      expect(timeline.getSnapshot().selectedId).toBe(memberId);
      expect(controller.getSnapshot().semantics).toBe(semanticSnapshot);
      for (const ancestorId of ancestorIds(semanticSnapshot.parentById, memberId)) {
        expect(outline.getSnapshot().expandedIds.has(ancestorId)).toBe(true);
        expect(timeline.getSnapshot().expandedIds.has(ancestorId)).toBe(true);
      }
      await Promise.resolve();
      expect(outlineViewport.revealed).toContain(memberId);
      expect(timelineViewport.revealed).toContain(memberId);
    }

    const independentlyCollapsedId = APPROVED_SEMANTIC_MEMBER_FAMILY_CASES[0]!.ownerId;
    outline.setExpanded(independentlyCollapsedId, false);
    expect(outline.getSnapshot().expandedIds.has(independentlyCollapsedId)).toBe(false);
    expect(timeline.getSnapshot().expandedIds.has(independentlyCollapsedId)).toBe(true);

    outline.destroy();
    timeline.destroy();
  });

  it("keeps the internal seam out of the host-facing authoring entrypoint", () => {
    const authoringEntrypoint = readFileSync(resolve("src/entrypoints/authoring.ts"), "utf8");
    const outlineSource = readFileSync(
      resolve("src/editor/shell/outline/DocumentOutline.tsx"),
      "utf8",
    );

    expect(authoringEntrypoint).not.toContain("SemanticDocumentController");
    expect(authoringEntrypoint).not.toContain("SemanticHierarchyViewController");
    expect(outlineSource).toContain("@/document/authoring/semantic-document");
    expect(outlineSource).not.toMatch(
      /@tiptap|ProseMirror|descendants\(|TableOfContents|builtIn|projectSemanticDocument|projectStandardRichText|projectStructuralChildren/,
    );
  });
});

class RecordingViewport implements SemanticHierarchyViewport {
  readonly revealed: EmbeddedNodeId[] = [];

  reveal(itemId: EmbeddedNodeId): void {
    this.revealed.push(itemId);
  }

  clear(): void {
    this.revealed.length = 0;
  }
}

function createEditor(): Editor {
  const editor = new Editor({
    editable: true,
    extensions: SEMANTIC_LIFECYCLE_AUTHORING_STATE.extensions,
    content: createCompleteSemanticLifecycleDocument().toJSON(),
  });
  editors.push(editor);
  return editor;
}

function ancestorIds(
  parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>,
  itemId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  const ancestors: EmbeddedNodeId[] = [];
  let parentId = parentById.get(itemId) ?? null;
  while (parentId) {
    ancestors.push(parentId);
    parentId = parentById.get(parentId) ?? null;
  }
  return ancestors;
}
