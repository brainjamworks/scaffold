// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { emptyPullQuoteData } from "./content";
import { pullQuoteBlockDefinition } from "./pull-quote-definition";
import { PullQuoteAuthoringExtension } from "./pull-quote-authoring-extension";
import { PullQuoteRuntimeExtension } from "./pull-quote-runtime-extension";

it("constructs serialized defaults in the Pull Quote feature", () => {
  expect(emptyPullQuoteData()).toEqual({
    type: "pull_quote",
    align: "left",
  });
  expect(emptyPullQuoteData({ align: "center" })).toEqual({
    type: "pull_quote",
    align: "center",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "pull_quote",
  catalogId: "pull-quote",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function pullQuoteFixture(align: "center" | "left" = "center"): JSONContent {
  const insertContent = builtInInsertCatalog.getById("pull-quote")?.content() as
    | JSONContent
    | undefined;

  if (!insertContent) {
    throw new Error("Expected Pull quote insert content to be registered.");
  }

  return {
    type: "doc",
    content: [
      {
        ...insertContent,
        attrs: {
          ...insertContent.attrs,
          data: { type: "pull_quote", align },
        },
      },
    ],
  };
}

function renderPullQuoteEditor({
  editable,
  content = pullQuoteFixture(),
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
      createRuntimeBlockFrameAttributesExtension(["pull_quote"]),
      editable ? PullQuoteAuthoringExtension : PullQuoteRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

describe("pull quote presentation", () => {
  it("keeps its data contract without duplicating alignment in a settings sheet", () => {
    expect(pullQuoteBlockDefinition.configuration?.controls).toEqual([]);
    expect(pullQuoteBlockDefinition.settingsSheet).toBeUndefined();
  });

  it("uses Course-owned classes on the native authoring blockquote", async () => {
    const fixture = renderPullQuoteEditor({ editable: true });

    const quote = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("blockquote.sc-course-pull-quote");
      expect(element).not.toBeNull();
      return element;
    });

    expect(quote?.dataset["align"]).toBe("center");
    expect(document.body.querySelector(".sc-course-pull-quote-node")).not.toBeNull();
    expect(quote?.querySelector(".sc-course-pull-quote__body")).not.toBeNull();
    expect(quote?.querySelector(".sc-course-pull-quote__attribution")).not.toBeNull();
    expect(document.body.querySelector(".sc-pull-quote")).toBeNull();

    fixture.destroy();
  });

  it("hides an empty attribution in learner runtime", async () => {
    const fixture = renderPullQuoteEditor({
      editable: false,
      content: pullQuoteFixture("left"),
    });

    const quote = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("blockquote.sc-course-pull-quote");
      expect(element).not.toBeNull();
      return element;
    });
    const hiddenAttribution = quote?.querySelector<HTMLElement>(
      ".sc-course-pull-quote__attribution--hidden",
    );

    expect(quote?.dataset["align"]).toBe("left");
    expect(document.body.querySelector(".sc-course-pull-quote-node")).not.toBeNull();
    expect(hiddenAttribution).not.toBeNull();
    expect(hiddenAttribution?.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.querySelector(".sc-pull-quote__attribution--hidden")).toBeNull();

    fixture.destroy();
  });

  it("uses the block toolbar alignment for both frame placement and quote content", async () => {
    const fixture = renderPullQuoteEditor({ editable: true });
    const id = String(fixture.editor.state.doc.nodeAt(0)?.attrs["id"] ?? "");
    const target = { id, kind: InteractionTargetKind.Block } as const;
    const descriptor = resolveBlockChromeTargetDescriptor(
      fixture.editor.state,
      target,
      builtInBlockRegistry,
    );
    const alignmentTargetPort = createAlignmentTargetPort({
      blockDefinitions: builtInBlockRegistry,
      surfaceVariants: builtInSurfaceVariantRegistry,
    });

    expect(descriptor).not.toBeNull();
    expect(alignmentTargetPort.setHorizontal(fixture.editor, target, "right")).toBe(true);
    expect(fixture.editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({ align: "end" });

    await waitFor(() => {
      expect(
        document.body.querySelector<HTMLElement>(".sc-course-pull-quote")?.dataset["align"],
      ).toBe("right");
    });

    fixture.destroy();
  });
});
