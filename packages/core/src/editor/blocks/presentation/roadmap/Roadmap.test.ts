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
import { applyKeyboardContainedMovementIntent } from "@/editor/drag/prosemirror/commands";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
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
import { RoadmapRuntimeExtension } from "./roadmap-runtime-extension";

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

function roadmapFixture({
  frame,
  milestoneCount = 3,
  useIconMarkers = false,
}: {
  frame?: Record<string, unknown>;
  milestoneCount?: number;
  useIconMarkers?: boolean;
} = {}): JSONContent {
  const milestones = [
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
  ].slice(0, milestoneCount);

  return {
    type: "doc",
    content: [
      {
        type: ROADMAP_NODE,
        attrs: {
          id: "roadmap-delete-fixture",
          data: emptyRoadmapData({ useIconMarkers }),
          ...(frame ? { frame } : {}),
        },
        content: milestones,
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
  { runtime = false }: { runtime?: boolean } = {},
) {
  const fixture = createDisposableEditor({
    editable: !runtime,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([ROADMAP_NODE]),
      runtime ? RoadmapRuntimeExtension : RoadmapAuthoringExtension,
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

  it("renders a labelled ordered list with separate Course content and App controls", async () => {
    const fixture = renderRoadmapEditor();

    const region = await screen.findByRole("region", { name: "Roadmap" });
    const list = screen.getByRole("list", { name: "Roadmap milestones" });
    const items = screen.getAllByRole("listitem");

    expect(region.contains(list)).toBe(true);
    expect(items).toHaveLength(3);
    expect(items.every((item) => item.tagName === "LI")).toBe(true);
    expect(items[0]?.classList.contains("sc-course-roadmap__milestone")).toBe(true);
    expect(document.querySelectorAll(".sc-app-roadmap-movement")).toHaveLength(3);
    expect(document.querySelectorAll(".sc-app-roadmap-delete")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Add milestone" }).closest("ol")).toBeNull();
    expect(
      document.querySelector('[class^="sc-roadmap"], [class*=" sc-roadmap"]'),
    ).toBeNull();

    fixture.destroy();
  });

  it("opens the shared marker icon picker from every milestone marker", async () => {
    const user = userEvent.setup();
    const fixture = renderRoadmapEditor(roadmapFixture({ useIconMarkers: true }));

    const iconTriggers = await screen.findAllByRole("button", {
      name: /Choose icon for milestone/,
    });
    expect(iconTriggers).toHaveLength(3);
    expect(iconTriggers.map((trigger) => trigger.getAttribute("aria-label"))).toEqual([
      "Choose icon for milestone 1",
      "Choose icon for milestone 2",
      "Choose icon for milestone 3",
    ]);
    expect(document.querySelector(".sc-app-roadmap-icon-control")).toBeNull();

    await user.click(iconTriggers[1]!);
    expect(await screen.findByRole("searchbox", { name: "Search icons" })).not.toBeNull();

    fixture.destroy();
  });

  it("exposes semantic milestone status in runtime without App controls", async () => {
    const fixture = renderRoadmapEditor(roadmapFixture(), { runtime: true });

    await screen.findByRole("list", { name: "Roadmap milestones" });
    const items = screen.getAllByRole("listitem");
    expect(items[1]?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByText("Milestone 1 status: available")).not.toBeNull();
    expect(screen.getByText("Milestone 2 status: current")).not.toBeNull();
    expect(screen.getByText("Milestone 3 status: completed")).not.toBeNull();
    expect(document.querySelector('[class*="sc-app-roadmap-"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /milestone/i })).toBeNull();

    fixture.destroy();
  });

  it("keeps the final delete action focusable with its invariant explanation", async () => {
    const user = userEvent.setup();
    const fixture = renderRoadmapEditor(roadmapFixture({ milestoneCount: 1 }));
    const deleteButton = await screen.findByRole("button", { name: "Delete milestone 1" });

    expect(deleteButton.getAttribute("aria-disabled")).toBe("true");
    expect(deleteButton.hasAttribute("disabled")).toBe(false);
    expect(screen.getByText("A Roadmap requires at least one milestone.")).not.toBeNull();

    await user.click(deleteButton);
    expect(fixture.json().content?.[0]?.content).toHaveLength(1);

    fixture.destroy();
  });

  it("serializes a labelled Roadmap section and ordered milestone list", () => {
    const fixture = renderRoadmapEditor();
    const serialized = document.createElement("div");
    serialized.innerHTML = fixture.editor.getHTML();

    const section = serialized.querySelector('section[data-node="roadmap"]');
    expect(section?.getAttribute("aria-label")).toBe("Roadmap");
    const list = section?.querySelector('ol[aria-label="Roadmap milestones"]');
    expect(list?.querySelectorAll(':scope > li[data-node="roadmap-milestone"]')).toHaveLength(3);
    expect(section?.querySelector('div[data-node="roadmap-milestone"]')).toBeNull();

    fixture.destroy();
  });

  it("projects block-toolbar alignment into the Roadmap frame and presentation", async () => {
    const fixture = renderRoadmapEditor(
      roadmapFixture({
        frame: { align: "start", widthMode: "percent", widthPercent: 60 },
      }),
    );
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
      expect(document.querySelector<HTMLElement>(".sc-course-roadmap")?.dataset["blockAlign"]).toBe(
        "right",
      );
    });

    fixture.destroy();
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

  it("reorders milestones through the contained keyboard movement command", () => {
    const fixture = renderRoadmapEditor();
    const roadmap = fixture.editor.state.doc.nodeAt(0);
    const firstMilestone = roadmap?.child(0);
    if (!roadmap || !firstMilestone) throw new Error("Roadmap fixture is missing milestones.");
    const secondMilestonePos = 1 + firstMilestone.nodeSize;

    const result = applyKeyboardContainedMovementIntent(
      fixture.editor,
      secondMilestonePos,
      "backward",
    );

    expect(result.moved).toBe(true);
    expect(fixture.json().content?.[0]?.content?.map((node) => node.attrs?.["id"])).toEqual([
      "milestone-two",
      "milestone-one",
      "milestone-three",
    ]);

    fixture.destroy();
  });
});
