import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
} from "@/document/model/semantic-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import { timelineBlockDefinition } from "./timeline-definition";

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    region: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, role: { default: "main" } },
    },
    [TIMELINE_NODE]: {
      group: "block",
      content: `${TIMELINE_ITEM_NODE}+`,
      attrs: { id: { default: null }, data: { default: null }, frame: { default: null } },
    },
    [TIMELINE_ITEM_NODE]: {
      content: "paragraph paragraph paragraph",
      attrs: { id: { default: null } },
      selectable: false,
    },
    paragraph: { content: "inline*", attrs: { id: { default: null } } },
  },
});

describe("Timeline document semantics", () => {
  it("publishes direct entries with activation while keeping prose and settings private", () => {
    const timelineId = makeId("tl", 1);
    const firstEntryId = makeId("te", 1);
    const secondEntryId = makeId("te", 2);
    const privateIds = [
      makeId("pa", 1),
      makeId("pa", 2),
      makeId("pa", 3),
      makeId("pa", 4),
      makeId("pa", 5),
      makeId("pa", 6),
    ];
    const privateProse = [
      "Private first date",
      "Private first title",
      "Private first body",
      "Private second date",
      "Private second title",
      "Private second body",
    ];
    const timeline = timelineNode(
      timelineId,
      [
        timelineItem(firstEntryId, privateIds.slice(0, 3), privateProse.slice(0, 3)),
        timelineItem(secondEntryId, privateIds.slice(3, 6), privateProse.slice(3, 6)),
      ],
      {
        data: { presentation: "carousel", alignment: "right", showAxis: false },
        frame: { align: "end" },
      },
    );
    const doc = documentNode(timeline);
    const snapshot = project(doc, 13);

    expect(timelineBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(timelineId)).toMatchObject({
      kind: "block",
      label: "Timeline",
      children: [{ id: firstEntryId }, { id: secondEntryId }],
    });

    for (const [index, entryId] of [firstEntryId, secondEntryId].entries()) {
      expect(snapshot.itemById.get(entryId)).toMatchObject({
        id: entryId,
        kind: "published-child",
        nodeType: TIMELINE_ITEM_NODE,
        label: `Timeline entry ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(entryId)).toBe(timelineId);
      const current = requireNodeById(doc, entryId);
      expect(snapshot.locationById.get(entryId)).toMatchObject({
        id: entryId,
        nodeType: TIMELINE_ITEM_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: timelineId,
        activationPath: [{ ownerId: timelineId, childId: entryId, ownerKind: "block" }],
      });
    }

    for (const privateId of privateIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publicBoundary = JSON.stringify({
      descriptions: [firstEntryId, secondEntryId].map((id) => snapshot.itemById.get(id)?.label),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      ...privateIds,
      ...privateProse,
      "paragraph",
      "carousel",
      "right",
      "showAxis",
      "false",
      "end",
      "Previous event",
      "Next event",
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted entry identity", () => {
    const timelineId = makeId("tl", 2);
    const first = simpleItem(makeId("te", 3), 3);
    const second = simpleItem(makeId("te", 4), 4);
    const third = simpleItem(makeId("te", 5), 5);

    const initial = projectEntries(timelineId, [first, second], 14);
    const added = projectEntries(timelineId, [first, second, third], 15);
    const changed = projectEntries(timelineId, [third, first], 16);

    expect(childIds(initial.snapshot, timelineId)).toEqual([makeId("te", 3), makeId("te", 4)]);
    expect(childIds(added.snapshot, timelineId)).toEqual([
      makeId("te", 3),
      makeId("te", 4),
      makeId("te", 5),
    ]);
    expect(childIds(changed.snapshot, timelineId)).toEqual([makeId("te", 5), makeId("te", 3)]);
    expect(changed.snapshot.itemById.has(makeId("te", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("te", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("te", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("te", 5))?.label).toBe("Timeline entry 1");
    expect(changed.snapshot.itemById.get(makeId("te", 3))?.label).toBe("Timeline entry 2");

    for (const entryId of [makeId("te", 5), makeId("te", 3)]) {
      expect(changed.snapshot.itemById.get(entryId)?.id).toBe(entryId);
      expect(changed.snapshot.parentById.get(entryId)).toBe(timelineId);
      expect(changed.snapshot.locationById.get(entryId)).toMatchObject({
        from: requireNodeById(changed.doc, entryId).pos,
        authoringAnchorId: timelineId,
        activationPath: [{ ownerId: timelineId, childId: entryId, ownerKind: "block" }],
      });
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });
});

function simpleItem(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return timelineItem(
    id,
    [makeId("pa", ordinal * 3), makeId("pa", ordinal * 3 + 1), makeId("pa", ordinal * 3 + 2)],
    [`Private date ${ordinal}`, `Private title ${ordinal}`, `Private body ${ordinal}`],
  );
}

function timelineItem(
  id: EmbeddedNodeId,
  paragraphIds: readonly EmbeddedNodeId[],
  prose: readonly string[],
): ProseMirrorNode {
  return schema.node(
    TIMELINE_ITEM_NODE,
    { id },
    paragraphIds.map((paragraphId, index) =>
      schema.node("paragraph", { id: paragraphId }, prose[index] ? [schema.text(prose[index]!)] : []),
    ),
  );
}

function timelineNode(
  id: EmbeddedNodeId,
  entries: readonly ProseMirrorNode[],
  settings: Readonly<{
    data: Readonly<{ presentation: "vertical" | "carousel"; alignment: string; showAxis: boolean }>;
    frame: Readonly<{ align: string }>;
  }> = {
    data: { presentation: "vertical", alignment: "alternate", showAxis: true },
    frame: { align: "start" },
  },
): ProseMirrorNode {
  return schema.node(TIMELINE_NODE, { id, data: settings.data, frame: settings.frame }, entries);
}

function documentNode(timeline: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [timeline]),
      ]),
    ]),
  ]);
}

function project(doc: ProseMirrorNode, revision: number) {
  return projectSemanticDocument({
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: definitions(),
    revision,
  });
}

function projectEntries(
  timelineId: EmbeddedNodeId,
  entries: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(timelineNode(timelineId, entries));
  return { doc, snapshot: project(doc, revision) };
}

function childIds(
  snapshot: ReturnType<typeof projectSemanticDocument>,
  ownerId: EmbeddedNodeId,
): readonly EmbeddedNodeId[] {
  return snapshot.itemById.get(ownerId)?.children.map(({ id }) => id) ?? [];
}

function requireNodeById(
  doc: ProseMirrorNode,
  id: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Expected node ${id}.`);
  return found;
}

function definitions(): SemanticDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) =>
        nodeType === TIMELINE_NODE
          ? {
              nodeType,
              title: timelineBlockDefinition.title,
              isAssessment: false,
              ...(timelineBlockDefinition.documentSemantics
                ? { documentSemantics: timelineBlockDefinition.documentSemantics }
                : {}),
            }
          : undefined,
    }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string) => {
        const definition = builtInSurfaceVariantRegistry.get(variant);
        return definition
          ? {
              id: definition.id,
              title: definition.title,
              ...(definition.documentSemantics
                ? { documentSemantics: definition.documentSemantics }
                : {}),
            }
          : undefined;
      },
    }),
  });
}

function requireCourseStructure(doc: ProseMirrorNode): ProjectedCourseStructure {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid Timeline semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
