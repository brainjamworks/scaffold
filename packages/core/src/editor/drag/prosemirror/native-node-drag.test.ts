// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

const SCAFFOLD_MOVEMENT_NODE_TYPES = [
  "surface",
  "layout",
  "section",
  "callout",
  "mcq",
  "multiselect",
  "dropdown",
  "fill_blanks",
  "matching",
  "sequencing",
  "categorise",
  "image_hotspot",
  "image_block",
  "audio_block",
  "chart_block",
] as const;

describe("native node drag configuration", () => {
  it("does not rely on ProseMirror draggable true for Scaffold movement sources", () => {
    const editor = new Editor({
      extensions: [...createCourseDocumentAuthoringExtensions({ editable: true })],
    });

    for (const nodeType of SCAFFOLD_MOVEMENT_NODE_TYPES) {
      expect(editor.schema.nodes[nodeType]?.spec.draggable).not.toBe(true);
    }

    editor.destroy();
  });
});
