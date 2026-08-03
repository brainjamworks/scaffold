// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { emptyMarginaliaData } from "./content";
import "./marginalia-definition";
import { MarginaliaAuthoringExtension } from "./marginalia-authoring-extension";
import { MarginaliaRuntimeExtension } from "./marginalia-runtime-extension";

it("constructs serialized defaults in the Marginalia feature", () => {
  expect(emptyMarginaliaData()).toEqual({
    type: "marginalia",
    position: "right",
  });
  expect(emptyMarginaliaData({ position: "left" })).toEqual({
    type: "marginalia",
    position: "left",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "marginalia",
  catalogId: "marginalia",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function marginaliaFixture(position: "left" | "right" = "right"): JSONContent {
  const insertContent = builtInInsertCatalog.getById("marginalia")?.content() as
    | JSONContent
    | undefined;

  if (!insertContent) {
    throw new Error("Expected Marginalia insert content to be registered.");
  }

  return {
    type: "doc",
    content: [
      {
        ...insertContent,
        attrs: {
          ...insertContent.attrs,
          data: { type: "marginalia", position },
        },
        content: [
          {
            type: "marginalia_gutter",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Margin note" }] },
            ],
          },
          {
            type: "marginalia_main",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Main content" }] },
            ],
          },
        ],
      },
    ],
  };
}

function renderMarginaliaEditor({
  editable,
  content = marginaliaFixture(),
}: {
  editable: boolean;
  content?: JSONContent;
}) {
  const fixture = createDisposableEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension(["marginalia"]),
      editable ? MarginaliaAuthoringExtension : MarginaliaRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

describe("marginalia presentation", () => {
  it("uses Course-owned classes and a native aside in authoring", async () => {
    const fixture = renderMarginaliaEditor({ editable: true });

    const marginalia = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(".sc-course-marginalia");
      expect(element).not.toBeNull();
      return element;
    });

    expect(marginalia?.dataset["position"]).toBe("right");
    expect(marginalia?.querySelector("aside.sc-course-marginalia__gutter")).not.toBeNull();
    expect(marginalia?.querySelector(".sc-course-marginalia__gutter-content")).not.toBeNull();
    expect(marginalia?.querySelector(".sc-course-marginalia__main-content")).not.toBeNull();
    expect(document.body.querySelector(".sc-marginalia")).toBeNull();

    fixture.destroy();
  });

  it("preserves left position without exposing the technical label at runtime", async () => {
    const fixture = renderMarginaliaEditor({
      editable: false,
      content: marginaliaFixture("left"),
    });

    const marginalia = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(".sc-course-marginalia");
      expect(element).not.toBeNull();
      return element;
    });

    expect(marginalia?.dataset["position"]).toBe("left");
    expect(marginalia?.querySelector("aside.sc-course-marginalia__gutter")).not.toBeNull();
    expect(marginalia?.textContent).toContain("Margin note");
    expect(marginalia?.textContent).toContain("Main content");
    expect(marginalia?.textContent).not.toContain("Gutter");

    fixture.destroy();
  });
});
