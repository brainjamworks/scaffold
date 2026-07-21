// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { RoadmapDataSchema as ContractRoadmapDataSchema } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ROADMAP_MILESTONE_NODE,
  ROADMAP_NODE,
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "./content";
import "./roadmap-definition";
import { RoadmapAuthoringExtension } from "./roadmap-authoring-extension";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "roadmap",
  catalogId: "roadmap",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function roadmapFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: ROADMAP_NODE,
        attrs: {
          id: "roadmap-delete-fixture",
          data: emptyRoadmapData(),
        },
        content: [
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone-one", status: "upcoming" },
            content: roadmapMilestoneContent("Foundations", "Start here"),
          },
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone-two", status: "current" },
            content: roadmapMilestoneContent("Practice", "Apply the work"),
          },
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone-three", status: "done" },
            content: roadmapMilestoneContent("Reflect", "Close the loop"),
          },
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after roadmap" }],
      },
    ],
  };
}

function renderRoadmapEditor(content: JSONContent = roadmapFixture()) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([ROADMAP_NODE]),
      RoadmapAuthoringExtension,
    ],
    content,
  });

  render(createElement(EditorContent, { editor: fixture.editor }));

  return fixture;
}

describe("roadmap node", () => {
  it("constructs serialized defaults in the Roadmap feature", () => {
    expect(ContractRoadmapDataSchema.parse(emptyRoadmapData())).toEqual({
      type: "roadmap",
      orientation: "vertical",
      useIconMarkers: false,
      icon: null,
    });
    expect(emptyRoadmapData({ orientation: "horizontal", useIconMarkers: true })).toEqual({
      type: "roadmap",
      orientation: "horizontal",
      useIconMarkers: true,
      icon: null,
    });
  });

  it("seeds catalog content with marker mode defaults and stable ids", () => {
    const insertContent = builtInInsertCatalog.getById("roadmap")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe("roadmap");
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toMatchObject({
      type: "roadmap",
      orientation: "vertical",
      useIconMarkers: false,
      icon: null,
    });
    expect(insertContent?.content?.map((child) => child.type)).toEqual([
      "roadmap_milestone",
      "roadmap_milestone",
      "roadmap_milestone",
    ]);
    expect(insertContent?.content?.[0]?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.content?.[0]?.attrs?.["status"]).toBe("upcoming");
  });

  it("deletes the requested roadmap milestone from a disposable editor fixture", async () => {
    const user = userEvent.setup();
    const fixture = renderRoadmapEditor();

    await user.click(await screen.findByRole("button", { name: "Delete milestone 2" }));

    await waitFor(() => {
      expect(screen.queryByText("Practice")).toBeNull();
    });

    const roadmap = fixture.json().content?.[0];
    const milestoneIds = roadmap?.content?.map((child) => child.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["roadmap", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after roadmap");
    expect(fixture.editor.state.doc.textContent).toContain("Foundations");
    expect(fixture.editor.state.doc.textContent).toContain("Reflect");
    expect(milestoneIds).toEqual(["milestone-one", "milestone-three"]);

    fixture.destroy();
  });
});
