import type { JSONContent } from "@tiptap/core";
import { EmbeddedDataIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { cloneJsonWithNewStableIds } from "@/document/model/identity/clone-with-new-ids";

import { rewriteDragDropCopiedContent } from "./drag-drop-copy-identity";

describe("Drag and Drop copy identity", () => {
  it.each(["drag_drop", "surface_drag_drop_question"] as const)(
    "regenerates marker owners and every private reference for %s without mutating the source",
    (nodeType) => {
      const source = question(nodeType);
      const snapshot = structuredClone(source);
      const nextIds = ["markernew001", "markernew002"];

      const copied = rewriteDragDropCopiedContent({
        content: source,
        nodeIdChanges: new Map(),
        generators: {
          createDataId: () => EmbeddedDataIdSchema.parse(nextIds.shift()),
        },
      });

      expect(markerIds(copied)).toEqual(["markernew001", "markernew002"]);
      expect(copied.attrs?.["assessment"]).toMatchObject({
        correctPlacements: [{ markerId: "markernew001" }, { markerId: "markernew002" }],
        feedbackByMarkerId: { markernew002: expect.anything() },
      });
      expect(source).toEqual(snapshot);
      expect(new Set([...markerIds(source), ...markerIds(copied)]).size).toBe(4);
    },
  );

  it("repairs Block, standalone Surface, and Surface Quiz copies exactly once per owner", () => {
    const rewrites = createScaffoldApplication().capabilities.contentIdentity.rewrites;
    const sources = [
      question("drag_drop"),
      surface(question("surface_drag_drop_question")),
      quiz(question("surface_drag_drop_question")),
    ];
    const snapshots = structuredClone(sources);

    expect(rewrites.hasNodeType("drag_drop")).toBe(true);
    expect(rewrites.hasNodeType("surface_drag_drop_question")).toBe(true);

    const copies = sources.map((source, ownerIndex) => {
      const nextIds = [
        EmbeddedDataIdSchema.parse(`copynew00${ownerIndex}01`),
        EmbeddedDataIdSchema.parse(`copynew00${ownerIndex}02`),
      ];
      const createDataId = vi.fn(() => nextIds.shift()!);
      const copy = cloneJsonWithNewStableIds(source, { identityRewrites: rewrites, createDataId });
      expect(createDataId).toHaveBeenCalledTimes(2);
      return copy;
    });

    expect(sources).toEqual(snapshots);
    for (const [index, copy] of copies.entries()) {
      const owner = dragDropOwner(copy);
      const copiedMarkerIds = markerIds(owner);
      expect(copiedMarkerIds).toEqual([`copynew00${index}01`, `copynew00${index}02`]);
      expect(owner.attrs?.["assessment"]).toMatchObject({
        correctPlacements: [{ markerId: copiedMarkerIds[0] }, { markerId: copiedMarkerIds[1] }],
        feedbackByMarkerId: { [copiedMarkerIds[1]!]: expect.anything() },
      });
      expect(stableIds(copy).some((id) => stableIds(sources[index]!).includes(id))).toBe(false);
    }
    expect(new Set(copies.flatMap((copy) => markerIds(dragDropOwner(copy)))).size).toBe(6);
  });

  it("throws on duplicate generated identities and leaves the source unchanged", () => {
    const source = question();
    const snapshot = structuredClone(source);

    expect(() =>
      rewriteDragDropCopiedContent({
        content: source,
        nodeIdChanges: new Map(),
        generators: { createDataId: () => EmbeddedDataIdSchema.parse("markernew001") },
      }),
    ).toThrow("Duplicate generated Drag and Drop marker identity");
    expect(source).toEqual(snapshot);
  });

  it("throws on a malformed private graph instead of returning a partial copy", () => {
    const source = question();
    const assessment = source.attrs?.["assessment"];
    if (!assessment || typeof assessment !== "object") {
      throw new Error("Expected private Drag and Drop assessment attrs.");
    }
    (assessment as { correctPlacements: unknown[] }).correctPlacements = [];
    const snapshot = structuredClone(source);

    expect(() =>
      rewriteDragDropCopiedContent({
        content: source,
        nodeIdChanges: new Map(),
        generators: { createDataId: () => EmbeddedDataIdSchema.parse("markernew001") },
      }),
    ).toThrow();
    expect(source).toEqual(snapshot);
  });
});

function question(type: "drag_drop" | "surface_drag_drop_question" = "drag_drop"): JSONContent {
  return {
    type,
    attrs: {
      id: "dragdrop0001",
      assessment: {
        correctPlacements: [
          {
            markerId: "markerold001",
            geometry: { kind: "circle", centerX: 20, centerY: 30, radius: 5 },
          },
          {
            markerId: "markerold002",
            geometry: { kind: "circle", centerX: 70, centerY: 60, radius: 6 },
          },
        ],
        feedbackByMarkerId: { markerold002: richFeedback("Private feedback") },
        summaryFeedback: null,
      },
    },
    content: [
      { type: "assessment_title" },
      { type: "assessment_instructions" },
      { type: "assessment_prompt" },
      {
        type: "drag_drop_canvas",
        attrs: {
          id: "canvas000001",
          data: {
            image: { mode: "managed", mediaId: "media0000001", alt: "Map" },
            imageAspectRatio: 2,
            defaultMarkerVisual: { kind: "preset", preset: "dot" },
            markers: [
              { id: "markerold001", label: "London", visualOverride: null },
              { id: "markerold002", label: "Paris", visualOverride: null },
            ],
          },
        },
      },
      { type: "assessment_actions_group" },
    ],
  };
}

function surface(owner: JSONContent): JSONContent {
  return {
    type: "surface",
    attrs: { id: "surface00001", variant: "slide-drag-drop-question" },
    content: [owner],
  };
}

function quiz(owner: JSONContent): JSONContent {
  return {
    type: "surface_quiz",
    attrs: { id: "quiz00000001" },
    content: [owner],
  };
}

function dragDropOwner(root: JSONContent): JSONContent {
  if (root.type === "drag_drop" || root.type === "surface_drag_drop_question") return root;
  for (const child of root.content ?? []) {
    try {
      return dragDropOwner(child);
    } catch {
      // Keep looking through the portable clone tree.
    }
  }
  throw new Error("Expected a Drag and Drop identity owner.");
}

function stableIds(root: JSONContent): string[] {
  const ids: string[] = [];
  const visit = (node: JSONContent) => {
    const id = node.attrs?.["id"];
    if (typeof id === "string") ids.push(id);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return ids;
}

function markerIds(node: JSONContent): string[] {
  const data = node.content?.find((child) => child.type === "drag_drop_canvas")?.attrs?.["data"] as
    | { markers: Array<{ id: string }> }
    | undefined;
  if (!data) throw new Error("Expected Drag and Drop canvas data");
  return data.markers.map(({ id }) => id);
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}
