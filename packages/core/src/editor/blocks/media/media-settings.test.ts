// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";

import { AudioBlockNode } from "./audio-block-node";
import { ImageBlockNode } from "./image-block-node";
import { applyAudioAccessibilitySettings, applyImageAccessibilitySettings } from "./media-settings";
import { AudioBlockAttrsSchema, ImageBlockAttrsSchema } from "@scaffold/contracts";

const editors: Editor[] = [];

afterEach(() => {
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

function makeEditor(content: JSONContent) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ImageBlockNode,
      AudioBlockNode,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function firstNodeData(editor: Editor): unknown {
  return editor.getJSON().content?.[0]?.attrs?.["data"];
}

describe("media settings apply hooks", () => {
  it("writes image alt text into the existing media payload", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "image_block",
          attrs: {
            id: "image-1",
            data: { mode: "managed", mediaId: "asset-1", alt: "Old" },
          },
        },
      ],
    });

    const result = applyImageAccessibilitySettings({
      tr: editor.state.tr,
      target: resolveTarget(editor, "image-1", "image_block"),
      attr: "data",
      schema: ImageBlockAttrsSchema.nullable(),
      value: { alt: "New alt text" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstNodeData(editor)).toEqual({ mode: "managed", mediaId: "asset-1", alt: "Old" });
    editor.view.dispatch(result.tr);
    expect(firstNodeData(editor)).toEqual({
      mode: "managed",
      mediaId: "asset-1",
      alt: "New alt text",
    });
  });

  it("rejects image alt updates before an image has been added", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "image_block",
          attrs: { id: "image-1", data: null },
        },
      ],
    });

    const tr = editor.state.tr;
    const result = applyImageAccessibilitySettings({
      tr,
      target: resolveTarget(editor, "image-1", "image_block"),
      attr: "data",
      schema: ImageBlockAttrsSchema.nullable(),
      value: { alt: "New alt text" },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ message: "Add an image before editing alt text." }),
    });
    expect(tr.steps).toHaveLength(0);
    expect(firstNodeData(editor)).toBeNull();
  });

  it("writes audio title into the existing media payload", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "audio_block",
          attrs: {
            id: "audio-1",
            data: {
              mode: "external",
              src: "https://example.com/audio.mp3",
              title: "Old",
            },
          },
        },
      ],
    });

    const result = applyAudioAccessibilitySettings({
      tr: editor.state.tr,
      target: resolveTarget(editor, "audio-1", "audio_block"),
      attr: "data",
      schema: AudioBlockAttrsSchema.nullable(),
      value: { title: "New audio title" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(firstNodeData(editor)).toMatchObject({ title: "Old" });
    editor.view.dispatch(result.tr);
    expect(firstNodeData(editor)).toEqual({
      mode: "external",
      src: "https://example.com/audio.mp3",
      title: "New audio title",
    });
  });

  it("rejects audio title updates before audio has been added", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "audio_block",
          attrs: { id: "audio-1", data: null },
        },
      ],
    });

    const tr = editor.state.tr;
    const result = applyAudioAccessibilitySettings({
      tr,
      target: resolveTarget(editor, "audio-1", "audio_block"),
      attr: "data",
      schema: AudioBlockAttrsSchema.nullable(),
      value: { title: "New audio title" },
    });

    expect(result).toEqual({
      ok: false,
      issue: expect.objectContaining({ message: "Add audio before editing the title." }),
    });
    expect(tr.steps).toHaveLength(0);
    expect(firstNodeData(editor)).toBeNull();
  });
});

function resolveTarget(editor: Editor, id: string, nodeType: string) {
  const target = createAuthoringNodeTarget(editor, { id, nodeType }).read();
  if (!target) throw new Error(`Expected ${nodeType} target ${id}`);
  return target;
}
