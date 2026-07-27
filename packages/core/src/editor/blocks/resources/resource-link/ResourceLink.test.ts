// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { expect, it, vi } from "vite-plus/test";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import "./resource-link-definition";
import { ResourceLinkRuntimeExtension } from "./resource-link-runtime-extension";
import { ResourceLinkSurface } from "./ResourceLinkSurface";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "resource_link",
  catalogId: "resource-link",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

function renderRuntimeResourceLink(url: string) {
  const editor = new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ResourceLinkRuntimeExtension,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "resource_link",
          attrs: {
            id: "resource-link-1",
            data: { url, kind: "link", showDescription: true },
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
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    },
  });

  render(createElement(EditorContent, { editor }));
  return editor;
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

  editor.destroy();
});

it("reports activation of a safe runtime resource without changing navigation", async () => {
  const user = userEvent.setup();
  const onOpen = vi.fn();
  render(
    createElement(
      ResourceLinkSurface,
      {
        data: {
          type: "resource_link",
          url: "https://example.com/private?token=SECRET",
          kind: "article",
          showDescription: true,
        },
        editable: false,
        onOpen,
        children: "Resource title",
      },
    ),
  );

  const link = screen.getByRole("link", { name: /Resource title.*Opens in new tab/i });
  await user.click(link);

  expect(onOpen).toHaveBeenCalledOnce();
  expect(link.getAttribute("href")).toBe("https://example.com/private?token=SECRET");
});
