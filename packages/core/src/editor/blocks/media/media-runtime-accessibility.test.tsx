// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import type { MediaPort } from "@/host/ports/media";

import { AudioBlockRuntimeExtension } from "./audio-block-runtime-extension";
import { ImageBlockRuntimeExtension } from "./image-block-runtime-extension";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
});

describe("media runtime accessibility", () => {
  it("renders image metadata as actual image alt text", async () => {
    renderRuntimeMedia({
      type: "image_block",
      attrs: {
        id: "image-with-alt",
        data: {
          mode: "external",
          src: "https://example.com/course-map.jpg",
          alt: "Course map",
        },
      },
    });

    const image = await screen.findByRole("img", { name: "Course map" });
    expect(image).toHaveClass("sc-course-image-block__media");
    expect(image.parentElement).toHaveClass("sc-course-image-block__stage");
    expect(image.parentElement).not.toHaveClass("sc-app-media-replace-host");
    expect(image.closest('[data-node="image_block"]')).toHaveClass("sc-course-image-block");
  });

  it("renders audio metadata as the player label", async () => {
    renderRuntimeMedia({
      type: "audio_block",
      attrs: {
        id: "audio-with-title",
        data: {
          mode: "external",
          src: "https://example.com/lecture.mp3",
          title: "Lecture clip",
        },
      },
    });

    const controls = await screen.findByRole("group", { name: "Lecture clip controls" });
    expect(controls).toHaveClass("sc-course-audio-player__bar");
    expect(controls.closest(".sc-course-audio-block__stage")).not.toBeNull();
  });

  it("keeps image missing, loading, and error states semantic", async () => {
    renderRuntimeMedia({
      type: "image_block",
      attrs: { id: "empty-image", data: null },
    });

    expect((await screen.findByRole("status")).textContent).toBe("No image");

    cleanupEditor();

    renderRuntimeMedia(
      {
        type: "image_block",
        attrs: {
          id: "loading-image",
          data: { mode: "managed", mediaId: "image-loading" },
        },
      },
      mediaPort(() => new Promise<string>(() => {})),
    );

    expect((await screen.findByRole("status")).textContent).toBe("Loading image...");

    cleanupEditor();

    renderRuntimeMedia(
      {
        type: "image_block",
        attrs: {
          id: "missing-image",
          data: { mode: "managed", mediaId: "image-missing" },
        },
      },
      mediaPort(async () => {
        throw new Error("Image unavailable");
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Image unavailable");
    });
  });

  it("keeps audio missing, loading, and error states semantic", async () => {
    renderRuntimeMedia({
      type: "audio_block",
      attrs: { id: "empty-audio", data: null },
    });

    expect((await screen.findByRole("status")).textContent).toBe("No audio");

    cleanupEditor();

    renderRuntimeMedia(
      {
        type: "audio_block",
        attrs: {
          id: "loading-audio",
          data: { mode: "managed", mediaId: "audio-loading" },
        },
      },
      mediaPort(() => new Promise<string>(() => {})),
    );

    expect((await screen.findByRole("status")).textContent).toBe("Loading audio...");

    cleanupEditor();

    renderRuntimeMedia(
      {
        type: "audio_block",
        attrs: {
          id: "missing-audio",
          data: { mode: "managed", mediaId: "audio-missing" },
        },
      },
      mediaPort(async () => {
        throw new Error("Audio unavailable");
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Audio unavailable");
    });
  });
});

function renderRuntimeMedia(block: JSONContent, media: MediaPort | null = null) {
  editor = new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ImageBlockRuntimeExtension,
      AudioBlockRuntimeExtension,
    ],
    content: {
      type: "doc",
      content: [block],
    },
  });

  render(
    <ScaffoldServicesProvider ports={{ media }}>
      <EditorContent editor={editor} />
    </ScaffoldServicesProvider>,
  );
}

function cleanupEditor() {
  editor?.destroy();
  editor = null;
  cleanup();
}

function mediaPort(resolve: MediaPort["resolve"]): MediaPort {
  return {
    resolve,
    upload: async () => {
      throw new Error("Upload is not used in runtime tests.");
    },
  };
}
