// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Extensions, JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { RoadmapDataSchema as ContractRoadmapDataSchema } from "@scaffold/contracts";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import {
  createSemanticActivationBindingTestExtension,
  requireSemanticActivationBinding,
  semanticActivationRequest,
} from "@/document/authoring/semantic-document/testing/semantic-activation-binding-test-extension";
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
          id: "roadmap00001",
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

function renderRoadmapEditor(
  content: JSONContent = roadmapFixture(),
  extraExtensions: Extensions = [],
) {
  const fixture = createDisposableEditor({
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      ...extraExtensions,
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
  it("registers semantic activation and reveals the requested milestone in its track", async () => {
    const semanticHarness = createSemanticActivationBindingTestExtension();
    const content = roadmapFixture();
    content.content![0]!.attrs!["data"] = emptyRoadmapData({ orientation: "horizontal" });
    const fixture = renderRoadmapEditor(content, [semanticHarness.extension]);
    const ownerId = EmbeddedNodeIdSchema.parse("roadmap00001");
    const targetId = EmbeddedNodeIdSchema.parse("milestone003");
    const scrollOwner = await screen.findByRole("region", { name: "Roadmap" });
    const target = document.querySelector<HTMLElement>(`[data-roadmap-milestone-id="${targetId}"]`);
    expect(target).not.toBeNull();
    const scrollTo = installHorizontalRevealGeometry(scrollOwner, target!);
    const binding = await waitFor(() => {
      const resolution = semanticHarness.registry.resolve(ownerId);
      expect(resolution.kind).toBe("resolved");
      return requireSemanticActivationBinding(semanticHarness.registry, ownerId);
    });

    await expect(binding.activate(semanticActivationRequest(ownerId, targetId))).resolves.toEqual({
      kind: "revealed",
      ownerId,
      childId: targetId,
    });
    expect(scrollTo).toHaveBeenCalledOnce();

    fixture.destroy();
  });

  it("uses ARIA list semantics in live node views while preserving native serialized lists", async () => {
    const fixture = renderRoadmapEditor();

    const list = await screen.findByRole("list", { name: "Roadmap milestones" });
    const items = screen.getAllByRole("listitem");

    expect(list.tagName).toBe("DIV");
    expect(list).toHaveAttribute("role", "list");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.tagName).toBe("DIV");
      expect(item).toHaveAttribute("role", "listitem");
      expect(item).not.toHaveAttribute("as");
    }

    const serialized = new DOMParser().parseFromString(fixture.editor.getHTML(), "text/html");
    const orderedList = serialized.querySelector('section[data-node="roadmap"] > ol');
    expect(orderedList).not.toBeNull();
    expect(orderedList?.querySelectorAll(":scope > li")).toHaveLength(3);

    fixture.destroy();
  });

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

    const deleteButton = await screen.findByRole("button", { name: "Delete milestone 2" });
    expect(deleteButton.classList.contains("sc-app-roadmap-delete")).toBe(true);
    expect(deleteButton.classList.contains("sc-course-roadmap__delete")).toBe(false);

    await user.click(deleteButton);

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

  it("keeps the last milestone delete action focusable with an explanation", async () => {
    const user = userEvent.setup();
    const content = roadmapFixture();
    const roadmap = content.content?.[0];
    if (!roadmap?.content) throw new Error("Expected the Roadmap fixture to contain milestones.");
    roadmap.content = roadmap.content.slice(0, 1);
    const fixture = renderRoadmapEditor(content);

    const deleteButton = await screen.findByRole("button", { name: "Delete milestone 1" });
    expect(deleteButton).toHaveAttribute("aria-disabled", "true");
    expect(deleteButton).toHaveAccessibleDescription("A Roadmap requires at least one milestone.");
    expect(deleteButton.hasAttribute("disabled")).toBe(false);

    deleteButton.focus();
    expect(deleteButton).toHaveFocus();
    await user.click(deleteButton);
    expect(fixture.json().content?.[0]?.content).toHaveLength(1);

    fixture.destroy();
  });
});

function installHorizontalRevealGeometry(scrollOwner: HTMLElement, target: HTMLElement) {
  scrollOwner.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 100 });
  target.getBoundingClientRect = () => DOMRect.fromRect({ x: 320, y: 0, width: 80, height: 80 });
  const scrollTo = vi.fn();
  Object.defineProperty(scrollOwner, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}
