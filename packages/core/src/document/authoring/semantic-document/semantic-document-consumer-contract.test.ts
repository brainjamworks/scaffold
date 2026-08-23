// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Editor, type JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";

import {
  getSemanticDocumentControllerForEditor,
  SemanticHierarchyViewController,
  type SemanticHierarchyViewport,
} from "./index";

const SURFACE_ID = id("seamsurface1");
const PARAGRAPH_ID = id("seampara0001");
const composition = createCoreScaffoldAuthoringComposition();
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

    outline.setExpanded(SURFACE_ID, false);
    timeline.setExpanded(SURFACE_ID, false);
    outlineViewport.clear();
    timelineViewport.clear();
    outline.setExpanded(SURFACE_ID, true);

    expect(outline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(true);
    expect(timeline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(false);

    controller.reportComponentSelection(SURFACE_ID);
    outlineViewport.clear();
    timelineViewport.clear();
    controller.reportComponentSelection(PARAGRAPH_ID);
    expect(outline.getSnapshot().selectedId).toBe(PARAGRAPH_ID);
    expect(timeline.getSnapshot().selectedId).toBe(PARAGRAPH_ID);
    expect(controller.getSnapshot().semantics).toBe(semanticSnapshot);
    expect(outline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(true);
    expect(timeline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(true);
    await Promise.resolve();
    expect(outlineViewport.revealed).toContain(PARAGRAPH_ID);
    expect(timelineViewport.revealed).toContain(PARAGRAPH_ID);

    outline.setExpanded(SURFACE_ID, false);
    expect(outline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(false);
    expect(timeline.getSnapshot().expandedIds.has(SURFACE_ID)).toBe(true);

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
    extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
    content: documentContent(),
  });
  editors.push(editor);
  return editor;
}

function documentContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: id("seamcourse01"), mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: SURFACE_ID, variant: "page-default" },
            content: [
              {
                type: "paragraph",
                attrs: { id: PARAGRAPH_ID },
                content: [{ type: "text", text: "Shared semantic content" }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
