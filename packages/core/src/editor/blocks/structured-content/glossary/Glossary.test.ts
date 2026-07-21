// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, expect, it } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  GLOSSARY_ENTRY_NODE,
  GLOSSARY_NODE,
  GlossaryAttrsSchema,
  emptyGlossaryData,
  glossaryEntryContent,
} from "./content";
import "./glossary-definition";
import { GlossaryAuthoringExtension } from "./glossary-authoring-extension";

it("constructs serialized defaults in the Glossary feature", () => {
  expect(emptyGlossaryData()).toEqual({
    type: "glossary",
  });
});

it("keeps the ProseMirror attributes wrapper in the Glossary feature", () => {
  expect(GlossaryAttrsSchema.parse({})).toEqual({
    data: {
      type: "glossary",
    },
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "glossary",
  catalogId: "glossary",
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function glossaryFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: GLOSSARY_NODE,
        attrs: {
          id: "glossary-delete-fixture",
          data: emptyGlossaryData(),
        },
        content: [
          {
            type: GLOSSARY_ENTRY_NODE,
            attrs: { id: "glossary-entry-one" },
            content: glossaryEntryContent("Alpha", "First definition"),
          },
          {
            type: GLOSSARY_ENTRY_NODE,
            attrs: { id: "glossary-entry-two" },
            content: glossaryEntryContent("Beta", "Second definition"),
          },
          {
            type: GLOSSARY_ENTRY_NODE,
            attrs: { id: "glossary-entry-three" },
            content: glossaryEntryContent("Gamma", "Third definition"),
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after glossary" }],
      },
    ],
  };
}

function renderGlossaryEditor(content: JSONContent = glossaryFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([GLOSSARY_NODE]),
      GlossaryAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

it("deletes the requested glossary term from a disposable editor fixture", async () => {
  const user = userEvent.setup();
  const fixture = renderGlossaryEditor();

  await user.click(await screen.findByRole("button", { name: "Delete term 2" }));

  await waitFor(() => {
    expect(screen.queryByText("Beta")).toBeNull();
  });

  const glossary = fixture.json().content?.[0];
  const entryIds = glossary?.content?.map((child) => child.attrs?.["id"]);

  expect(fixture.topLevelNodeTypes()).toEqual(["glossary", "paragraph"]);
  expect(fixture.editor.state.doc.textContent).toContain("Keep after glossary");
  expect(fixture.editor.state.doc.textContent).toContain("Alpha");
  expect(fixture.editor.state.doc.textContent).toContain("Gamma");
  expect(entryIds).toEqual(["glossary-entry-one", "glossary-entry-three"]);

  fixture.destroy();
});
