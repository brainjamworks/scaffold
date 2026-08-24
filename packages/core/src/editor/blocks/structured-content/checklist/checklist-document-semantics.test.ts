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

import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE } from "./content";
import { checklistBlockDefinition } from "./checklist-definition";

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
    [CHECKLIST_NODE]: {
      group: "block",
      content: `${CHECKLIST_ITEM_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [CHECKLIST_ITEM_NODE]: {
      content: "paragraph+",
      attrs: { id: { default: null } },
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Checklist document semantics", () => {
  it("publishes direct items with stable locations and privacy-safe ordinal labels", () => {
    const checklistId = makeId("cl", 1);
    const firstItemId = makeId("ci", 1);
    const secondItemId = makeId("ci", 2);
    const firstParagraphId = makeId("pa", 1);
    const secondParagraphId = makeId("pa", 2);
    const privateProse = ["Private first checklist prose", "Private second checklist prose"];
    const checklist = checklistNode(checklistId, [
      checklistItem(firstItemId, firstParagraphId, privateProse[0]!),
      checklistItem(secondItemId, secondParagraphId, privateProse[1]!),
    ]);
    const doc = documentNode(checklist);
    const snapshot = project(doc, 4);

    expect(checklistBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(checklistId)).toMatchObject({
      kind: "block",
      label: "Checklist",
      children: [{ id: firstItemId }, { id: secondItemId }],
    });
    for (const [index, itemId] of [firstItemId, secondItemId].entries()) {
      const item = snapshot.itemById.get(itemId);
      expect(item).toMatchObject({
        id: itemId,
        kind: "published-child",
        nodeType: CHECKLIST_ITEM_NODE,
        label: `Checklist item ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(item).not.toHaveProperty("activity");
      expect(item).not.toHaveProperty("checked");
      expect(item).not.toHaveProperty("learningEvent");
      expect(item).not.toHaveProperty("progress");
      expect(item).not.toHaveProperty("reset");
      expect(snapshot.parentById.get(itemId)).toBe(checklistId);
      const current = requireNodeById(doc, itemId);
      expect(snapshot.locationById.get(itemId)).toMatchObject({
        id: itemId,
        nodeType: CHECKLIST_ITEM_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "node", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: checklistId,
        activationPath: [],
      });
    }

    for (const privateId of [firstParagraphId, secondParagraphId]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publicBoundary = JSON.stringify({
      descriptions: [...snapshot.itemById.values()].map(({ label, summary }) => ({
        label,
        summary,
      })),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [firstParagraphId, secondParagraphId, ...privateProse]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted item identity", () => {
    const checklistId = makeId("cl", 2);
    const first = simpleItem(makeId("ci", 3), 3);
    const second = simpleItem(makeId("ci", 4), 4);
    const third = simpleItem(makeId("ci", 5), 5);

    const initial = projectItems(checklistId, [first, second], 5);
    const added = projectItems(checklistId, [first, second, third], 6);
    const changed = projectItems(checklistId, [third, first], 7);

    expect(childIds(initial.snapshot, checklistId)).toEqual([makeId("ci", 3), makeId("ci", 4)]);
    expect(childIds(added.snapshot, checklistId)).toEqual([
      makeId("ci", 3),
      makeId("ci", 4),
      makeId("ci", 5),
    ]);
    expect(childIds(changed.snapshot, checklistId)).toEqual([makeId("ci", 5), makeId("ci", 3)]);
    expect(changed.snapshot.itemById.has(makeId("ci", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ci", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ci", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ci", 5))?.label).toBe("Checklist item 1");
    expect(changed.snapshot.itemById.get(makeId("ci", 3))?.label).toBe("Checklist item 2");
    for (const itemId of [makeId("ci", 5), makeId("ci", 3)]) {
      expect(changed.snapshot.itemById.get(itemId)?.id).toBe(itemId);
      expect(changed.snapshot.locationById.get(itemId)?.from).toBe(
        requireNodeById(changed.doc, itemId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("reaches the exact item through its Checklist anchor without changing learner activity", async () => {
    const checklistId = makeId("cl", 3);
    const firstItemId = makeId("ci", 6);
    const secondItemId = makeId("ci", 7);
    const doc = documentNode(
      checklistNode(checklistId, [simpleItem(firstItemId, 6), simpleItem(secondItemId, 7)]),
    );
    const originalDocument = doc.toJSON();
    const learnerActivity = {
      data: { checked: { [firstItemId]: true }, total: 2 },
      completed: false,
      progress: { completedCount: 1, total: 2 },
      resetEnabled: true,
    };
    const originalLearnerActivity = structuredClone(learnerActivity);
    const emitLearningEvent = vi.fn();
    const toggleCompletion = vi.fn();
    let state = EditorState.create({ doc });
    let controller: SemanticDocumentController;
    const navigationEditor: SemanticNavigationEditor = {
      dispatch: (transaction: Transaction) => {
        state = state.apply(transaction);
        controller.applyTransaction(transaction, state);
      },
      focus: vi.fn(),
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
    const checklistLocation = controller.getSnapshot().semantics.locationById.get(checklistId)!;
    const activationLookup = vi
      .spyOn(controller.semanticActivations, "resolve")
      .mockImplementation(() => {
        throw new Error("Anchor-only navigation must not resolve an activation binding");
      });

    await expect(controller.select(secondItemId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: secondItemId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(checklistId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondItemId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(checklistLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === checklistId),
    ).toBe(true);
    expect(activationLookup).not.toHaveBeenCalled();
    expect(toggleCompletion).not.toHaveBeenCalled();
    expect(emitLearningEvent).not.toHaveBeenCalled();
    expect(learnerActivity).toEqual(originalLearnerActivity);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function simpleItem(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return checklistItem(id, makeId("pa", ordinal), `Private checklist prose ${ordinal}`);
}

function checklistItem(
  id: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  prose: string,
): ProseMirrorNode {
  return schema.node(CHECKLIST_ITEM_NODE, { id }, [
    schema.node("paragraph", { id: paragraphId }, prose ? [schema.text(prose)] : []),
  ]);
}

function checklistNode(id: EmbeddedNodeId, items: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node(CHECKLIST_NODE, { id, data: { showProgress: true, showReset: true } }, items);
}

function documentNode(checklist: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [checklist]),
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

function projectItems(
  checklistId: EmbeddedNodeId,
  items: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(checklistNode(checklistId, items));
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
        nodeType === CHECKLIST_NODE
          ? {
              nodeType,
              title: checklistBlockDefinition.title,
              isAssessment: false,
              ...(checklistBlockDefinition.documentSemantics
                ? { documentSemantics: checklistBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Checklist semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
