// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import UniqueID from "@tiptap/extension-unique-id";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { createInsertCatalog } from "@/editor/insertion/insert-catalog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { describeBlockContract } from "@/editor/testing";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import {
  TIMELINE_ITEM_NODE,
  TIMELINE_NODE,
  createTimelineItem,
  emptyTimelineData,
} from "./content";
import { TimelineAuthoringExtension } from "./timeline-authoring-extension";
import { timelineBlockDefinition } from "./timeline-definition";
import { TimelineRuntimeExtension } from "./timeline-runtime-extension";

const blockInsertCatalog = createInsertCatalog(createBlockInsertActions([timelineBlockDefinition]));

const BoundedRegionTestNode = TiptapNode.create({
  name: "region",
  group: "block",
  content: "block+",
  selectable: false,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-node="region"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-node": "region" }, 0];
  },
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: TIMELINE_NODE,
  actionId: "timeline",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function timelineFixture(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: TIMELINE_NODE,
        attrs: {
          id: "timeline-delete-fixture",
          data: {
            type: "timeline",
            showAxis: true,
            alignment: "alternate",
            presentation: "vertical",
          },
        },
        content: [
          createTimelineItem(0, {
            date: "1969",
            title: "Landing",
            body: "First event",
          }),
          createTimelineItem(1, {
            date: "1989",
            title: "Web",
            body: "Second event",
          }),
          createTimelineItem(2, {
            date: "2010",
            title: "Genome",
            body: "Third event",
          }),
        ],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Keep after timeline" }],
      },
    ],
  };
}

function boundedTimelineFixture(): JSONContent {
  const timeline = timelineFixture().content?.[0];
  if (!timeline) throw new Error("Timeline fixture is missing its timeline node.");

  return {
    type: "doc",
    content: [
      {
        type: "region",
        attrs: { id: "timeline-bounded-region" },
        content: [timeline],
      },
    ],
  };
}

function renderTimelineEditor(
  content: JSONContent = timelineFixture(),
  options: { editable?: boolean } = {},
) {
  const editable = options.editable !== false;
  const fixture = createDisposableEditor({
    editable,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        paragraph: false,
      }),
      ExtendedParagraph,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      BoundedRegionTestNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([TIMELINE_NODE]),
      editable ? TimelineAuthoringExtension : TimelineRuntimeExtension,
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

describe("timeline block", () => {
  it("constructs serialized defaults in the Timeline feature", () => {
    expect(emptyTimelineData()).toEqual({
      type: "timeline",
      showAxis: true,
      alignment: "alternate",
      presentation: "vertical",
    });
    expect(emptyTimelineData({ showAxis: false, alignment: "right" })).toEqual({
      type: "timeline",
      showAxis: false,
      alignment: "right",
      presentation: "vertical",
    });
  });

  it("declares bounded fill placement", () => {
    expect(timelineBlockDefinition.boundedPlacement).toBe("fill");
  });

  it.each([
    { editable: true, frameSelector: '[data-authoring-frame="block"]', mode: "authoring" },
    { editable: false, frameSelector: '[data-runtime-frame="block"]', mode: "runtime" },
  ])("activates bounded fill in $mode", async ({ editable, frameSelector }) => {
    const fixture = renderTimelineEditor(boundedTimelineFixture(), { editable });

    await waitFor(() => {
      const frame = document.body.querySelector<HTMLElement>(
        `${frameSelector}[data-node="${TIMELINE_NODE}"]`,
      );
      expect(frame).not.toBeNull();
      expect(frame?.getAttribute("data-bounded-placement")).toBe("fill");
    });

    fixture.destroy();
  });

  it("seeds catalog content as a timeline block with item-backed events", () => {
    const insertContent = blockInsertCatalog.getById("timeline")?.content() as
      | JSONContent
      | undefined;

    expect(insertContent?.type).toBe(TIMELINE_NODE);
    expect(insertContent?.attrs?.["id"]).toMatch(/^[0-9A-Z_a-z-]{12}$/);
    expect(insertContent?.attrs?.["data"]).toMatchObject({
      type: "timeline",
      showAxis: true,
      alignment: "alternate",
      presentation: "vertical",
    });
    expect(insertContent?.content?.map((child) => child.type)).toEqual([
      TIMELINE_ITEM_NODE,
      TIMELINE_ITEM_NODE,
      TIMELINE_ITEM_NODE,
    ]);
    expect(insertContent?.attrs?.["variant"]).toBeUndefined();
  });

  it("renders timeline event chrome without layout-specific targets", async () => {
    const fixture = renderTimelineEditor();

    await waitFor(() => {
      expect(document.body.querySelector("[data-timeline-event]")).not.toBeNull();
    });
    expect(document.body.querySelector("[data-contained-movement-target]")).not.toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).not.toBeNull();
    expect(document.body.querySelector("[data-contained-movement-target]")).toHaveAttribute(
      "data-movement-target-axis",
      "vertical",
    );
    expect(document.body.querySelector("[data-contained-movement-handle]")).toHaveAttribute(
      "aria-keyshortcuts",
      "Space Enter ArrowUp ArrowDown Escape",
    );
    expect(document.body.querySelector("[data-layout-kind]")).toBeNull();
    expect(document.body.querySelector("[data-layout-section-menu-trigger]")).toBeNull();
    expect(document.body.querySelector('[data-authoring-frame="layout"]')).toBeNull();
    const deleteButton = await screen.findByRole("button", {
      name: "Delete timeline event 2",
    });
    expect(deleteButton).not.toBeNull();

    fixture.destroy();
  });

  it("owns horizontal target geometry and the activated Left/Right keyboard contract", async () => {
    const content = timelineFixture();
    const timeline = content.content?.[0];
    if (!timeline?.attrs?.["data"] || typeof timeline.attrs["data"] !== "object") {
      throw new Error("Expected timeline fixture data");
    }
    timeline.attrs["data"] = { ...timeline.attrs["data"], presentation: "carousel" };
    const initialIds = timeline.content?.map((item) => item.attrs?.["id"]);
    const fixture = renderTimelineEditor(content);

    const handles = await screen.findAllByRole("button", {
      name: "Move timeline event within its group",
    });
    expect(handles[0]).toHaveAttribute(
      "aria-keyshortcuts",
      "Space Enter ArrowLeft ArrowRight Escape",
    );
    expect(handles[0]).toHaveAccessibleDescription(
      "Press Space or Enter to pick up this timeline event. Use Arrow Left or Arrow Right to choose a destination within its group. Press Space or Enter to drop, or Escape to cancel.",
    );
    expect(document.body.querySelector("[data-contained-movement-target]")).toHaveAttribute(
      "data-movement-target-axis",
      "horizontal",
    );

    fireEvent.keyDown(handles[0]!, { key: "ArrowDown" });
    expect(fixture.json().content?.[0]?.content?.map((item) => item.attrs?.["id"])).toEqual(
      initialIds,
    );

    fireEvent.keyDown(handles[0]!, { key: "ArrowRight" });
    expect(fixture.json().content?.[0]?.content?.map((item) => item.attrs?.["id"])).toEqual(
      initialIds,
    );

    fixture.destroy();
  });

  it("uses the complete timeline event as its movement presentation source", async () => {
    vi.spyOn(document.body, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 800, width: 1000, x: 0, y: 0 }),
    );
    const fixture = renderTimelineEditor();
    await waitFor(() => {
      expect(document.body.querySelector("[data-timeline-event]")).not.toBeNull();
    });
    const event = document.body.querySelector<HTMLElement>("[data-timeline-event]");
    if (!event) throw new Error("Expected timeline event");
    const handle = event.querySelector<HTMLButtonElement>("[data-contained-movement-handle]");
    if (!handle) throw new Error("Expected timeline movement handle");
    vi.spyOn(event, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 160, width: 360, x: 80, y: 60 }),
    );
    vi.spyOn(handle, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ height: 44, width: 44, x: 88, y: 68 }),
    );

    fireEvent.pointerDown(handle, {
      button: 0,
      clientX: 100,
      clientY: 80,
      isPrimary: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(handle.ownerDocument, {
      clientX: 110,
      clientY: 90,
      pointerId: 1,
    });

    await waitFor(() => {
      expect(event).toHaveAttribute("data-authoring-movement-silhouette");
    });
    const snapshot = document.body.querySelector<HTMLElement>("[data-authoring-movement-snapshot]");
    expect(snapshot?.textContent).toContain("Landing");
    expect(snapshot?.querySelector("[data-contained-movement-handle]")).toBeNull();
    expect(snapshot?.querySelector('[aria-label^="Delete timeline event"]')).toBeNull();

    fireEvent.pointerUp(handle.ownerDocument, {
      clientX: 110,
      clientY: 90,
      pointerId: 1,
    });
    await waitFor(() => {
      expect(event).not.toHaveAttribute("data-authoring-movement-silhouette");
    });
    fixture.destroy();
  });

  it("deletes the requested timeline event from a disposable editor fixture", async () => {
    const user = userEvent.setup();
    const fixture = renderTimelineEditor();

    await user.click(
      await screen.findByRole("button", {
        name: "Delete timeline event 2",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Web")).toBeNull();
    });

    const timeline = fixture.json().content?.[0];
    const itemIds = timeline?.content?.map((child) => child.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["timeline", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after timeline");
    expect(fixture.editor.state.doc.textContent).toContain("Landing");
    expect(fixture.editor.state.doc.textContent).toContain("Genome");
    expect(itemIds).toHaveLength(2);

    fixture.destroy();
  });

  it("adds a new blank event through the timeline ghost affordance", async () => {
    const user = userEvent.setup();
    const fixture = renderTimelineEditor();

    await user.click(await screen.findByRole("button", { name: "Add event" }));

    await waitFor(() => {
      expect(fixture.json().content?.[0]?.content).toHaveLength(4);
    });

    const timeline = fixture.json().content?.[0];
    expect(timeline?.content?.[3]?.type).toBe(TIMELINE_ITEM_NODE);
    expect(timeline?.content?.[3]?.content).toHaveLength(3);

    fixture.destroy();
  });
});
