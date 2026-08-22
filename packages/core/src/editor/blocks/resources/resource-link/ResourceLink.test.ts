// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import "./resource-link-definition";
import { ResourceLinkAuthoringExtension } from "./resource-link-authoring-extension";
import { ResourceLinkRuntimeExtension } from "./resource-link-runtime-extension";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "resource_link",
  actionId: "resource-link",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function resourceLinkDoc({
  description = "Resource description",
  showDescription = true,
  url = "https://example.com/resource",
}: {
  description?: string;
  showDescription?: boolean;
  url?: string;
} = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "resource_link",
        attrs: {
          id: "resource-link-1",
          data: { url, kind: "link", showDescription },
        },
        content: [
          {
            type: "resource_link_title",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Resource title" }],
              },
            ],
          },
          {
            type: "resource_link_description",
            content: [
              {
                type: "paragraph",
                content: description ? [{ type: "text", text: description }] : [],
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderRuntimeResourceLink(
  url: string,
  options: { description?: string; showDescription?: boolean } = {},
) {
  const editor = new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ResourceLinkRuntimeExtension,
    ],
    content: resourceLinkDoc({ url, ...options }),
  });

  render(createElement(EditorContent, { editor }));
  return editor;
}

function renderAuthoringResourceLink() {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension(["resource_link"]),
      ResourceLinkAuthoringExtension,
    ],
    content: resourceLinkDoc(),
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

it("renders safe resource URLs as external links at runtime", async () => {
  const editor = renderRuntimeResourceLink("https://example.com/resource");

  await waitFor(() => {
    const link = screen.getByRole("link", {
      name: /Resource title.*Opens in new tab/i,
    });
    expect(link.getAttribute("href")).toBe("https://example.com/resource");
  });

  editor.destroy();
});

it("does not render unsafe resource URLs as links at runtime", async () => {
  const editor = renderRuntimeResourceLink("javascript:alert(1)");

  await waitFor(() => {
    expect(screen.getByText("Resource title")).toBeInTheDocument();
  });
  expect(screen.queryByRole("link")).toBeNull();
  expect(document.querySelector(".sc-course-resource-link__open-icon")).toBeNull();

  editor.destroy();
});

it("suppresses the description without deleting its document content", async () => {
  const editor = renderRuntimeResourceLink("https://example.com/resource", {
    description: "Preserve this learner context",
    showDescription: false,
  });

  const description = await waitFor(() => {
    const element = document.querySelector<HTMLElement>('[data-slot="resource-link-description"]');
    if (!element) throw new Error("Expected the Resource Link description slot.");
    return element;
  });
  const surface = description.closest<HTMLElement>(".sc-course-resource-link");

  expect(surface?.dataset["showDescription"]).toBe("false");
  expect(description).toHaveTextContent("Preserve this learner context");
  expect(description).toHaveClass("sc-course-resource-link__description");
  expect(editor.getJSON()).toMatchObject({
    content: [
      {
        content: [{}, { content: [{ content: [{ text: "Preserve this learner context" }] }] }],
      },
    ],
  });

  editor.destroy();
});

it("keeps the App-owned URL field and kind picker wired to the Course resource document", async () => {
  const user = userEvent.setup();
  const fixture = renderAuthoringResourceLink();
  const group = await screen.findByRole("radiogroup", { name: "Resource kind" });
  const urlInput = screen.getByRole("textbox", { name: "Resource URL" });
  const controls = urlInput.parentElement;
  const radios = within(group).getAllByRole("radio");
  const selected = within(group).getByRole("radio", { name: "Link" });

  expect(controls).toHaveClass("sc-app-resource-link__controls");
  expect(controls).not.toHaveClass("sc-course-resource-link__controls");
  expect(urlInput).toHaveClass("sc-input", "sc-app-resource-link__url-input");
  expect(urlInput).not.toHaveClass("sc-course-resource-link__url-input");
  expect(group.tabIndex).toBe(0);
  expect(radios.every((radio) => radio.tabIndex === -1)).toBe(true);
  expect(selected).toHaveAttribute("aria-checked", "true");
  expect(group).toHaveClass("sc-app-resource-link__kind-picker");
  expect(group).not.toHaveClass("sc-course-resource-link__kind-picker");
  expect(radios.every((radio) => radio.classList.contains("sc-app-resource-link__kind-option"))).toBe(
    true,
  );
  expect(
    radios.every((radio) => !radio.classList.contains("sc-course-resource-link__kind-option")),
  ).toBe(true);
  expect(document.querySelector(".sc-course-resource-link")).not.toBeNull();
  expect(
    document.querySelector('[class^="sc-resource-link"], [class*=" sc-resource-link"]'),
  ).toBeNull();

  await user.clear(urlInput);
  await user.type(urlInput, "https://docs.example.com/course");

  await waitFor(() => {
    expect(fixture.json().content?.[0]?.attrs?.["data"]).toMatchObject({
      url: "https://docs.example.com/course",
    });
  });

  await user.click(within(group).getByRole("radio", { name: "Article" }));

  await waitFor(() => {
    expect(within(group).getByRole("radio", { name: "Article" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(fixture.json().content?.[0]?.attrs?.["data"]).toMatchObject({ kind: "article" });
  });

  fixture.destroy();
});

it("reports activation of a safe runtime resource without changing navigation", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(
    createElement(ResourceLinkSurface, {
      data: {
        type: "resource_link",
        url: "https://example.com/private?token=SECRET",
        kind: "article",
        showDescription: true,
      },
      editable: false,
      onOpen,
      children: "Resource title",
    }),
  );

  const link = screen.getByRole("link", { name: /Resource title.*Opens in new tab/i });
  await user.click(link);

  expect(onOpen).toHaveBeenCalledOnce();
  expect(link.getAttribute("href")).toBe("https://example.com/private?token=SECRET");
});
