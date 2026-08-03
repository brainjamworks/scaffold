// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
import { GlossaryRuntimeExtension } from "./glossary-runtime-extension";

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

function renderGlossaryEditor(
  content: JSONContent = glossaryFixture(),
  { runtime = false }: { runtime?: boolean } = {},
) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([GLOSSARY_NODE]),
      runtime ? GlossaryRuntimeExtension : GlossaryAuthoringExtension,
    ],
    content,
    editable: !runtime,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

it("renders the live authoring glossary as a semantic definition list", async () => {
  const fixture = renderGlossaryEditor();
  const section = await screen.findByRole("region", { name: "Glossary" });
  const list = section.querySelector(":scope > dl");
  const firstEntry = list?.querySelector('[data-node="glossary-entry"]');

  expect(list).not.toBeNull();
  expect(firstEntry?.querySelector('dt[data-slot="glossary-term"]')).not.toBeNull();
  expect(firstEntry?.querySelector('dd[data-slot="glossary-definition"]')).not.toBeNull();

  const add = within(section).getByRole("button", { name: "Add term" });
  expect(list?.contains(add)).toBe(false);
  expect(add.querySelector("svg")).toBeNull();

  fixture.destroy();
});

it("adds a glossary term without changing the existing entry identities", async () => {
  const user = userEvent.setup();
  const fixture = renderGlossaryEditor();

  await user.click(await screen.findByRole("button", { name: "Add term" }));

  await waitFor(() => {
    expect(fixture.json().content?.[0]?.content).toHaveLength(4);
  });

  const entryIds = fixture.json().content?.[0]?.content?.map((child) => child.attrs?.["id"]);
  expect(entryIds?.slice(0, 3)).toEqual([
    "glossary-entry-one",
    "glossary-entry-two",
    "glossary-entry-three",
  ]);
  expect(entryIds?.[3]).toEqual(expect.any(String));

  fixture.destroy();
});

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

it("keeps the final delete action focusable and explains why it is unavailable", async () => {
  const user = userEvent.setup();
  const content = glossaryFixture();
  content.content![0]!.content = content.content![0]!.content?.slice(0, 1) ?? [];
  const fixture = renderGlossaryEditor(content);
  const deleteButton = await screen.findByRole("button", { name: "Delete term 1" });

  expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
  expect(deleteButton.hasAttribute("disabled")).toBe(false);
  const explanationId = deleteButton.getAttribute("aria-describedby");
  expect(explanationId).not.toBeNull();
  expect(document.getElementById(explanationId!)).toHaveTextContent(
    "A glossary must contain at least one term.",
  );

  deleteButton.focus();
  expect(document.activeElement).toBe(deleteButton);
  await user.click(deleteButton);
  expect(fixture.json().content?.[0]?.content).toHaveLength(1);

  fixture.destroy();
});

it("keeps semantic learner content while suppressing empty fields and authoring controls", async () => {
  const content = glossaryFixture();
  content.content![0]!.content = [
    {
      type: GLOSSARY_ENTRY_NODE,
      attrs: { id: "glossary-entry-empty" },
      content: glossaryEntryContent(),
    },
  ];
  const fixture = renderGlossaryEditor(content, { runtime: true });
  const section = await screen.findByRole("region", { name: "Glossary" });
  const list = section.querySelector(":scope > dl");
  const term = list?.querySelector('dt[data-slot="glossary-term"]');
  const definition = list?.querySelector('dd[data-slot="glossary-definition"]');

  expect(list).not.toBeNull();
  expect(term?.getAttribute("aria-hidden")).toBe("true");
  expect(definition?.getAttribute("aria-hidden")).toBe("true");
  expect(term?.classList.contains("sc-course-glossary__suppressed")).toBe(true);
  expect(definition?.classList.contains("sc-course-glossary__suppressed")).toBe(true);
  expect(within(section).queryByRole("button")).toBeNull();

  fixture.destroy();
});
