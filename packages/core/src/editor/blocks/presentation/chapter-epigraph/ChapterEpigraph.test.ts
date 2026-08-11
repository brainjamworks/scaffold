// @vitest-environment happy-dom

import { cleanup, render, waitFor } from "@testing-library/react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { emptyChapterEpigraphData } from "./content";
import { chapterEpigraphBlockDefinition } from "./chapter-epigraph-definition";
import { ChapterEpigraphAuthoringExtension } from "./chapter-epigraph-authoring-extension";
import { ChapterEpigraphRuntimeExtension } from "./chapter-epigraph-runtime-extension";

it("constructs serialized defaults in the Chapter Epigraph feature", () => {
  expect(emptyChapterEpigraphData()).toEqual({
    type: "chapter_epigraph",
    align: "center",
  });
  expect(emptyChapterEpigraphData({ align: "left" })).toEqual({
    type: "chapter_epigraph",
    align: "left",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "chapter_epigraph",
  actionId: "chapter-epigraph",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function chapterEpigraphFixture(align: "center" | "left" = "center"): JSONContent {
  const insertContent = chapterEpigraphBlockDefinition.insert?.content() as JSONContent | undefined;

  if (!insertContent) {
    throw new Error("Expected Chapter epigraph insert content to be registered.");
  }

  return {
    type: "doc",
    content: [
      {
        ...insertContent,
        attrs: {
          ...insertContent.attrs,
          data: { type: "chapter_epigraph", align },
        },
      },
    ],
  };
}

function renderChapterEpigraphEditor({
  editable,
  content = chapterEpigraphFixture(),
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
      createRuntimeBlockFrameAttributesExtension(["chapter_epigraph"]),
      editable ? ChapterEpigraphAuthoringExtension : ChapterEpigraphRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

describe("chapter epigraph presentation", () => {
  it("keeps its data contract without duplicating alignment in a settings sheet", () => {
    expect(chapterEpigraphBlockDefinition.configuration?.controls).toEqual([]);
    expect(chapterEpigraphBlockDefinition.settingsSheet).toBeUndefined();
  });

  it("uses Course-owned classes on the native centred authoring blockquote", async () => {
    const fixture = renderChapterEpigraphEditor({ editable: true });

    const quote = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        "blockquote.sc-course-chapter-epigraph",
      );
      expect(element).not.toBeNull();
      return element;
    });

    expect(quote?.dataset["align"]).toBe("center");
    expect(document.body.querySelector(".sc-course-chapter-epigraph-node")).not.toBeNull();
    expect(quote?.querySelector(".sc-course-chapter-epigraph__body")).not.toBeNull();
    expect(quote?.querySelector(".sc-course-chapter-epigraph__attribution")).not.toBeNull();
    expect(document.body.querySelector(".sc-chapter-epigraph")).toBeNull();

    fixture.destroy();
  });

  it("keeps left alignment and hides an empty attribution in learner runtime", async () => {
    const fixture = renderChapterEpigraphEditor({
      editable: false,
      content: chapterEpigraphFixture("left"),
    });

    const quote = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        "blockquote.sc-course-chapter-epigraph",
      );
      expect(element).not.toBeNull();
      return element;
    });
    const hiddenAttribution = quote?.querySelector<HTMLElement>(
      ".sc-course-chapter-epigraph__attribution--hidden",
    );

    expect(quote?.dataset["align"]).toBe("left");
    expect(document.body.querySelector(".sc-course-chapter-epigraph-node")).not.toBeNull();
    expect(hiddenAttribution).not.toBeNull();
    expect(hiddenAttribution?.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.querySelector(".sc-chapter-epigraph__attribution--hidden")).toBeNull();

    fixture.destroy();
  });

  it("uses the block toolbar alignment for both frame placement and epigraph content", async () => {
    const fixture = renderChapterEpigraphEditor({ editable: true });
    const id = String(fixture.editor.state.doc.nodeAt(0)?.attrs["id"] ?? "");
    const target = { id, kind: InteractionTargetKind.Block } as const;
    const descriptor = resolveBlockChromeTargetDescriptor(
      fixture.editor.state,
      target,
      builtInBlockRegistry,
    );
    const alignmentTargetPort = createAlignmentTargetPort({
      blockDefinitions: builtInBlockRegistry,
      layoutDefinitions: builtInLayoutRegistry,
      surfaceVariants: builtInSurfaceVariantRegistry,
    });

    expect(descriptor).not.toBeNull();
    expect(alignmentTargetPort.setHorizontal(fixture.editor, target, "right")).toBe(true);
    expect(fixture.editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({ align: "end" });

    await waitFor(() => {
      expect(
        document.body.querySelector<HTMLElement>(".sc-course-chapter-epigraph")?.dataset["align"],
      ).toBe("right");
    });

    fixture.destroy();
  });
});
