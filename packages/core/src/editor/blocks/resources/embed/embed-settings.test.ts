// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EmbedDataSchema } from "@scaffold/contracts";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";

import { emptyEmbedData, updateEmbedDataUrl } from "./embed-data";
import { applyEmbedSettings } from "./embed-settings";
import { EmbedNode } from "./node";

const editors: Editor[] = [];

afterEach(() => {
  while (editors.length > 0) editors.pop()?.destroy();
});

describe("applyEmbedSettings", () => {
  it("normalizes settings in a checked transaction without dispatching", () => {
    const current = updateEmbedDataUrl(emptyEmbedData(), "https://example.com/resource");
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), EmbedNode],
      content: {
        type: "doc",
        content: [{ type: "embed", attrs: { id: "embed-a", data: current } }],
      },
    });
    editors.push(editor);
    const target = createAuthoringNodeTarget(editor, { id: "embed-a", nodeType: "embed" }).read();
    if (!target) throw new Error("Expected the embed settings target");

    const result = applyEmbedSettings({
      tr: editor.state.tr,
      target,
      attr: "data",
      schema: EmbedDataSchema,
      value: {
        ...current,
        url: "www.youtube.com/watch?v=aKllbvCaWvo",
        caption: "Updated caption",
      },
    });

    expect(result.ok).toBe(true);
    expect(editor.state.doc.firstChild?.attrs["data"]).toEqual(current);
    if (!result.ok) return;
    expect(result.tr.doc.firstChild?.attrs["data"]).toMatchObject({
      provider: "youtube",
      aspectRatio: "16/9",
      caption: "Updated caption",
    });
    editor.view.dispatch(result.tr);
    expect(editor.state.doc.firstChild?.attrs["data"]).toMatchObject({ provider: "youtube" });
  });
});
