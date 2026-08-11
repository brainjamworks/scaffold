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
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { emptyStatHighlightData } from "./content";
import { StatHighlightAuthoringExtension } from "./stat-highlight-authoring-extension";
import { statHighlightBlockDefinition } from "./stat-highlight-definition";
import { StatHighlightRuntimeExtension } from "./stat-highlight-runtime-extension";
import "./stat-highlight-definition";

it("constructs serialized defaults in the Stat Highlight feature", () => {
  expect(emptyStatHighlightData()).toEqual({
    type: "stat_highlight",
    align: "left",
  });
  expect(emptyStatHighlightData({ align: "center" })).toEqual({
    type: "stat_highlight",
    align: "center",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "stat_highlight",
  actionId: "stat-highlight",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function statHighlightFixture(align: "center" | "left" = "center"): JSONContent {
  const insertContent = statHighlightBlockDefinition.insert?.content() as JSONContent | undefined;

  if (!insertContent) {
    throw new Error("Expected Stat highlight insert content to be registered.");
  }

  return {
    type: "doc",
    content: [
      {
        ...insertContent,
        attrs: {
          ...insertContent.attrs,
          data: { type: "stat_highlight", align },
        },
      },
    ],
  };
}

function renderStatHighlightEditor({
  editable,
  content = statHighlightFixture(),
}: {
  editable: boolean;
  content?: JSONContent;
}) {
  const fixture = createDisposableEditor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createScaffoldTextAlignExtension(["paragraph"]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension(["stat_highlight"]),
      editable ? StatHighlightAuthoringExtension : StatHighlightRuntimeExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));
  return fixture;
}

describe("stat highlight presentation", () => {
  it("keeps its data contract without duplicating alignment in a settings sheet", () => {
    expect(statHighlightBlockDefinition.configuration?.controls).toEqual([]);
    expect(statHighlightBlockDefinition.settingsSheet).toBeUndefined();
  });

  it("uses Course-owned classes in authoring", async () => {
    const fixture = renderStatHighlightEditor({ editable: true });

    const stat = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(".sc-course-stat-highlight");
      expect(element).not.toBeNull();
      return element;
    });

    expect(stat?.dataset["align"]).toBe("center");
    expect(document.body.querySelector(".sc-course-stat-highlight-node")).not.toBeNull();
    expect(stat?.querySelector(".sc-course-stat-highlight__value")).not.toBeNull();
    expect(stat?.querySelector(".sc-course-stat-highlight__label")).not.toBeNull();
    expect(stat?.querySelector(".sc-course-stat-highlight__context")).not.toBeNull();
    expect(document.body.querySelector(".sc-stat-highlight")).toBeNull();

    fixture.destroy();
  });

  it("hides an empty context in learner runtime", async () => {
    const fixture = renderStatHighlightEditor({
      editable: false,
      content: statHighlightFixture("left"),
    });

    const stat = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(".sc-course-stat-highlight");
      expect(element).not.toBeNull();
      return element;
    });
    const hiddenContext = stat?.querySelector<HTMLElement>(
      ".sc-course-stat-highlight__context--hidden",
    );

    expect(stat?.dataset["align"]).toBe("left");
    expect(hiddenContext).not.toBeNull();
    expect(hiddenContext?.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.querySelector(".sc-stat-highlight__context--hidden")).toBeNull();

    fixture.destroy();
  });

  it("keeps block placement independent from authored rich-text alignment", async () => {
    const fixture = renderStatHighlightEditor({ editable: true });
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
    expect(fixture.editor.commands.setTextSelection(3)).toBe(true);
    expect(fixture.editor.commands.setTextAlign("right")).toBe(true);
    expect(alignmentTargetPort.setHorizontal(fixture.editor, target, "center")).toBe(true);
    expect(fixture.editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({ align: "center" });
    expect(fixture.editor.state.doc.nodeAt(0)?.child(0).child(0).attrs["textAlign"]).toBe("right");

    await waitFor(() => {
      expect(
        document.body.querySelector<HTMLElement>(".sc-course-stat-highlight")?.dataset["align"],
      ).toBe("center");
    });

    fixture.destroy();
  });
});
