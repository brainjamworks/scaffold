import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { EditorState, NodeSelection, type Transaction } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vite-plus/test";

import { SemanticDocumentController } from "@/document/authoring/semantic-document/semantic-document-controller";
import type {
  SemanticNavigationEditor,
  SemanticNavigationEnvironment,
} from "@/document/authoring/semantic-document/semantic-navigation";
import {
  projectCourseStructure,
  type ProjectedCourseStructure,
} from "@/document/model/course-structure/course-structure-projection";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
} from "@/document/model/semantic-document";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE } from "./content";
import { roadmapBlockDefinition } from "./roadmap-definition";

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
    [ROADMAP_NODE]: {
      group: "block",
      content: `${ROADMAP_MILESTONE_NODE}+`,
      attrs: {
        id: { default: null },
        data: { default: null },
        frame: { default: null },
      },
    },
    [ROADMAP_MILESTONE_NODE]: {
      content: "paragraph paragraph",
      attrs: { id: { default: null }, status: { default: "upcoming" } },
      selectable: false,
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Roadmap document semantics", () => {
  it("publishes milestones while keeping prose, status and presentation settings private", () => {
    const roadmapId = makeId("rm", 1);
    const firstMilestoneId = makeId("ms", 1);
    const secondMilestoneId = makeId("ms", 2);
    const firstHeadingId = makeId("pa", 1);
    const firstBodyId = makeId("pa", 2);
    const secondHeadingId = makeId("pa", 3);
    const secondBodyId = makeId("pa", 4);
    const firstHeading = "Private foundations heading";
    const firstBody = "Private foundations body";
    const secondHeading = "Private mastery heading";
    const secondBody = "Private mastery body";
    const roadmap = roadmapNode(
      roadmapId,
      [
        roadmapMilestone(
          firstMilestoneId,
          "current",
          firstHeadingId,
          firstHeading,
          firstBodyId,
          firstBody,
        ),
        roadmapMilestone(
          secondMilestoneId,
          "done",
          secondHeadingId,
          secondHeading,
          secondBodyId,
          secondBody,
        ),
      ],
      {
        data: { orientation: "horizontal", useIconMarkers: true, icon: "private-map-icon" },
        frame: { align: "end" },
      },
    );
    const doc = documentNode(roadmap);
    const snapshot = project(doc, 4);

    expect(roadmapBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(roadmapId)).toMatchObject({
      kind: "block",
      label: "Roadmap",
      children: [{ id: firstMilestoneId }, { id: secondMilestoneId }],
    });
    for (const [index, milestoneId] of [firstMilestoneId, secondMilestoneId].entries()) {
      expect(snapshot.itemById.get(milestoneId)).toMatchObject({
        id: milestoneId,
        kind: "published-child",
        nodeType: ROADMAP_MILESTONE_NODE,
        label: `Roadmap milestone ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(milestoneId)).toBe(roadmapId);
      const current = requireNodeById(doc, milestoneId);
      expect(snapshot.locationById.get(milestoneId)).toMatchObject({
        id: milestoneId,
        nodeType: ROADMAP_MILESTONE_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: roadmapId,
        activationPath: [],
      });
    }

    for (const privateId of [
      firstHeadingId,
      firstBodyId,
      secondHeadingId,
      secondBodyId,
    ]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publishedChildDescriptions = [firstMilestoneId, secondMilestoneId].flatMap(
      (milestoneId) => {
        const milestone = snapshot.itemById.get(milestoneId);
        if (!milestone) throw new Error(`Expected published Roadmap milestone ${milestoneId}.`);
        return milestone.summary === null
          ? [milestone.label]
          : [milestone.label, milestone.summary];
      },
    );
    const publicBoundary = JSON.stringify({
      descriptions: publishedChildDescriptions,
      nodeTypes: [...snapshot.itemById.values()].map(({ nodeType }) => nodeType),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      firstHeadingId,
      firstBodyId,
      secondHeadingId,
      secondBodyId,
      firstHeading,
      firstBody,
      secondHeading,
      secondBody,
      "paragraph",
      "current",
      "done",
      "horizontal",
      "useIconMarkers",
      "private-map-icon",
      "end",
      "Milestone 1 status: current",
      "Milestone 2 status: completed",
      "Add milestone",
      "Delete milestone",
      "Choose icon for milestone",
      "roadmap milestone",
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted milestone identity", () => {
    const roadmapId = makeId("rm", 2);
    const first = simpleMilestone(makeId("ms", 3), 5, "upcoming");
    const second = simpleMilestone(makeId("ms", 4), 6, "current");
    const third = simpleMilestone(makeId("ms", 5), 7, "done");

    const initial = projectMilestones(roadmapId, [first, second], 5);
    const added = projectMilestones(roadmapId, [first, second, third], 6);
    const changed = projectMilestones(roadmapId, [third, first], 7);

    expect(childIds(initial.snapshot, roadmapId)).toEqual([makeId("ms", 3), makeId("ms", 4)]);
    expect(childIds(added.snapshot, roadmapId)).toEqual([
      makeId("ms", 3),
      makeId("ms", 4),
      makeId("ms", 5),
    ]);
    expect(childIds(changed.snapshot, roadmapId)).toEqual([makeId("ms", 5), makeId("ms", 3)]);
    expect(changed.snapshot.itemById.has(makeId("ms", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ms", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ms", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ms", 5))?.label).toBe(
      "Roadmap milestone 1",
    );
    expect(changed.snapshot.itemById.get(makeId("ms", 3))?.label).toBe(
      "Roadmap milestone 2",
    );
    for (const milestoneId of [makeId("ms", 5), makeId("ms", 3)]) {
      expect(changed.snapshot.itemById.get(milestoneId)?.id).toBe(milestoneId);
      expect(changed.snapshot.parentById.get(milestoneId)).toBe(roadmapId);
      expect(changed.snapshot.locationById.get(milestoneId)?.from).toBe(
        requireNodeById(changed.doc, milestoneId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("selects the Roadmap owner without changing status, focus, order or controls", async () => {
    const roadmapId = makeId("rm", 3);
    const firstMilestoneId = makeId("ms", 6);
    const secondMilestoneId = makeId("ms", 7);
    const doc = documentNode(
      roadmapNode(
        roadmapId,
        [
          simpleMilestone(firstMilestoneId, 8, "current"),
          simpleMilestone(secondMilestoneId, 9, "done"),
        ],
        {
          data: { orientation: "horizontal", useIconMarkers: true, icon: "private-map-icon" },
          frame: { align: "end" },
        },
      ),
    );
    const originalDocument = doc.toJSON();
    const authoringState = {
      milestoneIds: [firstMilestoneId, secondMilestoneId],
      focusedMilestoneId: null,
    };
    const originalAuthoringState = structuredClone(authoringState);
    const cycleStatus = vi.fn();
    const chooseIcon = vi.fn();
    const addMilestone = vi.fn();
    const deleteMilestone = vi.fn();
    const moveMilestone = vi.fn();
    const focusEditor = vi.fn();
    let state = EditorState.create({ doc });
    let controller: SemanticDocumentController;
    const navigationEditor: SemanticNavigationEditor = {
      dispatch: (transaction: Transaction) => {
        state = state.apply(transaction);
        controller.applyTransaction(transaction, state);
      },
      focus: focusEditor,
    };
    const presentSurface = vi.fn(async () => undefined);
    const bringIntoView = vi.fn(async () => undefined);
    const createActivationTransaction = vi.fn((location) => {
      const tr = state.tr;
      if (location.selectionTarget.kind !== "node") return null;
      tr.setSelection(NodeSelection.create(tr.doc, location.selectionTarget.pos));
      return tr;
    });
    const environment: SemanticNavigationEnvironment = {
      createActivationTransaction,
      presentSurface,
      bringIntoView,
    };
    controller = new SemanticDocumentController({
      state,
      definitions: definitions(),
      navigationEditor,
    });
    controller.setNavigationEnvironment(environment);
    const roadmapLocation = controller.getSnapshot().semantics.locationById.get(roadmapId)!;
    const adapterLookup = vi.spyOn(controller.containerAdapters, "get");

    await expect(controller.select(secondMilestoneId, { origin: "document-outline" })).resolves.toEqual(
      { kind: "reached", id: secondMilestoneId },
    );

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(roadmapId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondMilestoneId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(roadmapLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === roadmapId),
    ).toBe(true);
    expect(adapterLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(cycleStatus).not.toHaveBeenCalled();
    expect(chooseIcon).not.toHaveBeenCalled();
    expect(addMilestone).not.toHaveBeenCalled();
    expect(deleteMilestone).not.toHaveBeenCalled();
    expect(moveMilestone).not.toHaveBeenCalled();
    expect(authoringState).toEqual(originalAuthoringState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

type MilestoneStatus = "upcoming" | "current" | "done";

function simpleMilestone(
  milestoneId: EmbeddedNodeId,
  ordinal: number,
  status: MilestoneStatus,
): ProseMirrorNode {
  return roadmapMilestone(
    milestoneId,
    status,
    makeId("pa", ordinal * 2),
    `Private milestone heading ${ordinal}`,
    makeId("pa", ordinal * 2 + 1),
    `Private milestone body ${ordinal}`,
  );
}

function roadmapMilestone(
  id: EmbeddedNodeId,
  status: MilestoneStatus,
  headingId: EmbeddedNodeId,
  heading: string,
  bodyId: EmbeddedNodeId,
  body: string,
): ProseMirrorNode {
  return schema.node(ROADMAP_MILESTONE_NODE, { id, status }, [
    schema.node("paragraph", { id: headingId }, heading ? [schema.text(heading)] : []),
    schema.node("paragraph", { id: bodyId }, body ? [schema.text(body)] : []),
  ]);
}

function roadmapNode(
  id: EmbeddedNodeId,
  milestones: readonly ProseMirrorNode[],
  settings: Readonly<{
    data: Readonly<{
      orientation: "horizontal" | "vertical";
      useIconMarkers: boolean;
      icon: string;
    }>;
    frame: Readonly<{ align: "start" | "center" | "end" }>;
  }> = {
    data: { orientation: "vertical", useIconMarkers: false, icon: "private-map-icon" },
    frame: { align: "start" },
  },
): ProseMirrorNode {
  return schema.node(ROADMAP_NODE, { id, data: settings.data, frame: settings.frame }, milestones);
}

function documentNode(roadmap: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [roadmap]),
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

function projectMilestones(
  roadmapId: EmbeddedNodeId,
  milestones: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(roadmapNode(roadmapId, milestones));
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
        nodeType === ROADMAP_NODE
          ? {
              nodeType,
              title: roadmapBlockDefinition.title,
              isAssessment: false,
              ...(roadmapBlockDefinition.documentSemantics
                ? { documentSemantics: roadmapBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Roadmap semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
