// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { RoadmapDataSchema as ContractRoadmapDataSchema } from "@scaffold/contracts";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";

import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ROADMAP_MILESTONE_NODE,
  ROADMAP_NODE,
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "./content";
import { roadmapBlockDefinition } from "./roadmap-definition";
import { RoadmapAuthoringExtension } from "./roadmap-authoring-extension";

const blockInsertCatalog = createInsertCatalog(createBlockInsertActions([roadmapBlockDefinition]));

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "roadmap",
  actionId: "roadmap",
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
          id: "roadmap000001",
          data: emptyRoadmapData(),
        },
        content: [
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone001", status: "upcoming" },
            content: roadmapMilestoneContent("Foundations", "Start here"),
          },
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone002", status: "current" },
            content: roadmapMilestoneContent("Practice", "Apply the work"),
          },
          {
            type: ROADMAP_MILESTONE_NODE,
            attrs: { id: "milestone003", status: "done" },
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
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([ROADMAP_NODE]),
      RoadmapAuthoringExtension,
    ],
    content,
  });

  render(
    createAuthoringMovementTestRoot(
      fixture.editor,
      createElement(EditorContent, { editor: fixture.editor }),
    ),
  );

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
    const insertContent = blockInsertCatalog.getById("roadmap")?.content() as
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
    expect(milestoneIds).toEqual(["milestone001", "milestone003"]);

    fixture.destroy();
  });
});
