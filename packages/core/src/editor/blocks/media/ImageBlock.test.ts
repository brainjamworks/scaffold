// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent } from "@tiptap/react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { describeBlockContract } from "@/editor/testing";
import { AppThemeProvider } from "@/theme/app/AppThemeProvider";

import { ImageBlockAuthoringExtension } from "./image-block-authoring-extension";
import "./image-block-definition";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  cleanup();
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "image_block",
  actionId: "image",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

describe("ImageBlock file picker focus", () => {
  it.each([
    { data: null, label: "Add image" },
    {
      data: {
        mode: "external" as const,
        src: "https://example.com/image.png",
        alt: "Example image",
      },
      label: "Replace image",
    },
  ])("returns focus to the $label trigger when its picker closes", async ({ data, label }) => {
    const user = userEvent.setup();
    editor = createImageBlockTestEditor();
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "image_block", attrs: { id: "image-1", data } }],
    });

    render(
      createElement(AppThemeProvider, {
        appearance: "light",
        children: createElement(EditorContent, { editor }),
      }),
    );

    const trigger = await screen.findByRole("button", { name: label });
    editor.view.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: label });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: label })).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});

function createImageBlockTestEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createRuntimeBlockFrameAttributesExtension(["image_block"]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      ImageBlockAuthoringExtension,
    ],
  });
}
