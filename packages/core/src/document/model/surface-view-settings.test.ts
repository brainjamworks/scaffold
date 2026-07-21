// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { ARRANGEMENT_CONTENT } from "@/document/model/content-model/content-groups";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SCAFFOLD_DOCUMENT_FORMAT_VERSION } from "@/schemas/course-document";

import {
  getSurfaceViewSettings,
  readSurfaceViewSettings,
  readSurfaceViewSettingsFromProseMirrorDoc,
} from "./surface-view-settings";

const TestSurfaceNode = Node.create({
  name: "surface",
  content: "paragraph*",
  addAttributes() {
    return {
      id: { default: null },
      variant: { default: "page-default" },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["section", HTMLAttributes, 0];
  },
});

const TestArrangementNode = Node.create({
  name: "testArrangement",
  group: ARRANGEMENT_CONTENT,
  content: "paragraph*",
});

function documentContent(attrs: Record<string, unknown>): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { schemaVersion: SCAFFOLD_DOCUMENT_FORMAT_VERSION, ...attrs },
        content: [
          {
            type: "surface",
            attrs: { id: "surface-1", variant: "page-default" },
            content: [{ type: "paragraph" }],
          },
        ],
      },
    ],
  };
}

describe("surface view settings", () => {
  it("reads surface view settings from course document attrs", () => {
    const settings = getSurfaceViewSettings(
      documentContent({
        mode: "slideshow",
        surfaceSize: "16x9",
        overflowMode: "grow",
      }),
    );

    expect(settings).toEqual({
      mode: "slideshow",
      surfaceSize: "16x9",
      overflowMode: "grow",
    });
  });

  it("returns null for invalid document JSON when using the safe reader", () => {
    expect(readSurfaceViewSettings({ type: "doc", content: [] })).toBeNull();
  });

  it("rejects removed 4x3 presentation settings", () => {
    expect(
      readSurfaceViewSettings(
        documentContent({ mode: "slideshow", surfaceSize: "4x3", overflowMode: "clip" }),
      ),
    ).toBeNull();
  });

  it("reads settings from a ProseMirror document without creating UI state", () => {
    const editor = new Editor({
      content: documentContent({
        mode: "page",
        surfaceSize: "fluid",
        overflowMode: "fit",
      }),
      extensions: [
        DocumentNode,
        StarterKit.configure({
          document: false,
          paragraph: false,
          undoRedo: false,
        }),
        ExtendedParagraph,
        CourseDocumentNode,
        TestSurfaceNode,
        TestArrangementNode,
      ],
    });

    try {
      expect(readSurfaceViewSettingsFromProseMirrorDoc(editor.state.doc)).toEqual({
        mode: "page",
        surfaceSize: "fluid",
        overflowMode: "fit",
      });
    } finally {
      editor.destroy();
    }
  });
});
