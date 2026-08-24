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

import {
  NUMBERED_LIST_ITEM_NODE,
  NUMBERED_LIST_NODE,
  NUMBERED_LIST_TITLE_NODE,
} from "./content";
import { numberedListBlockDefinition } from "./numbered-list-definition";

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
    [NUMBERED_LIST_NODE]: {
      group: "block",
      content: `${NUMBERED_LIST_TITLE_NODE} ${NUMBERED_LIST_ITEM_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [NUMBERED_LIST_TITLE_NODE]: {
      content: "paragraph",
      attrs: { id: { default: null } },
    },
    [NUMBERED_LIST_ITEM_NODE]: {
      content: "paragraph",
      attrs: { id: { default: null }, status: { default: "neutral" } },
      selectable: false,
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Numbered List document semantics", () => {
  it("publishes direct items with item-only ordinals and keeps title, prose and presentation private", () => {
    const listId = makeId("nl", 1);
    const titleId = makeId("nt", 1);
    const titleParagraphId = makeId("pa", 1);
    const firstItemId = makeId("ni", 1);
    const secondItemId = makeId("ni", 2);
    const firstParagraphId = makeId("pa", 2);
    const secondParagraphId = makeId("pa", 3);
    const privateTitle = "Private authored numbered-list title";
    const privateProse = ["Private first item prose", "Private second item prose"];
    const privateConfiguration = {
      type: "numbered_list",
      showTitle: false,
      showIcon: true,
      icon: {
        kind: "media",
        mediaId: "private-numbered-list-icon",
        alt: "Private numbered-list icon alt",
      },
    };
    const list = numberedListNode(
      listId,
      numberedListTitle(titleId, titleParagraphId, privateTitle),
      [
        numberedListItem(firstItemId, firstParagraphId, "inProgress", privateProse[0]!),
        numberedListItem(secondItemId, secondParagraphId, "complete", privateProse[1]!),
      ],
      privateConfiguration,
    );
    const doc = documentNode(list);
    const snapshot = project(doc, 4);

    expect(numberedListBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(listId)).toMatchObject({
      kind: "block",
      label: "Numbered list",
      children: [{ id: firstItemId }, { id: secondItemId }],
    });
    for (const [index, itemId] of [firstItemId, secondItemId].entries()) {
      expect(snapshot.itemById.get(itemId)).toMatchObject({
        id: itemId,
        kind: "published-child",
        nodeType: NUMBERED_LIST_ITEM_NODE,
        label: `Numbered list item ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(itemId)).toBe(listId);
      const current = requireNodeById(doc, itemId);
      expect(snapshot.locationById.get(itemId)).toMatchObject({
        id: itemId,
        nodeType: NUMBERED_LIST_ITEM_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: listId,
        activationPath: [],
      });
    }

    for (const privateId of [titleId, titleParagraphId, firstParagraphId, secondParagraphId]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    expect(
      snapshot.itemById
        .get(listId)
        ?.children.map(({ id }) => id),
    ).toEqual([firstItemId, secondItemId]);
    const publishedChildDescriptions = [firstItemId, secondItemId].flatMap((itemId) => {
      const item = snapshot.itemById.get(itemId);
      if (!item) throw new Error(`Expected published Numbered List item ${itemId}.`);
      return item.summary === null ? [item.label] : [item.label, item.summary];
    });
    expect(publishedChildDescriptions).not.toContain(
      numberedListBlockDefinition.placeholders?.[NUMBERED_LIST_TITLE_NODE],
    );
    expect(publishedChildDescriptions).not.toContain(
      numberedListBlockDefinition.placeholders?.[NUMBERED_LIST_ITEM_NODE],
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
      titleId,
      titleParagraphId,
      firstParagraphId,
      secondParagraphId,
      privateTitle,
      ...privateProse,
      NUMBERED_LIST_TITLE_NODE,
      "paragraph",
      "inProgress",
      "complete",
      "showTitle",
      "showIcon",
      privateConfiguration.icon.kind,
      privateConfiguration.icon.mediaId,
      privateConfiguration.icon.alt,
      numberedListBlockDefinition.placeholders?.[NUMBERED_LIST_ITEM_NODE],
      `sc-course-numbered-list-item-${encodeURIComponent(firstItemId)}`,
      `sc-course-numbered-list-item-${encodeURIComponent(secondItemId)}`,
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted item identity", () => {
    const listId = makeId("nl", 2);
    const title = numberedListTitle(makeId("nt", 2), makeId("pa", 4), "Private fixed title");
    const first = simpleItem(makeId("ni", 3), 5, "neutral");
    const second = simpleItem(makeId("ni", 4), 6, "inProgress");
    const third = simpleItem(makeId("ni", 5), 7, "complete");

    const initial = projectItems(listId, title, [first, second], 5);
    const added = projectItems(listId, title, [first, second, third], 6);
    const changed = projectItems(listId, title, [third, first], 7);

    expect(childIds(initial.snapshot, listId)).toEqual([makeId("ni", 3), makeId("ni", 4)]);
    expect(childIds(added.snapshot, listId)).toEqual([
      makeId("ni", 3),
      makeId("ni", 4),
      makeId("ni", 5),
    ]);
    expect(childIds(changed.snapshot, listId)).toEqual([makeId("ni", 5), makeId("ni", 3)]);
    expect(changed.snapshot.itemById.has(makeId("ni", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ni", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ni", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ni", 5))?.label).toBe("Numbered list item 1");
    expect(changed.snapshot.itemById.get(makeId("ni", 3))?.label).toBe("Numbered list item 2");
    for (const itemId of [makeId("ni", 5), makeId("ni", 3)]) {
      expect(changed.snapshot.itemById.get(itemId)?.id).toBe(itemId);
      expect(changed.snapshot.parentById.get(itemId)).toBe(listId);
      expect(changed.snapshot.locationById.get(itemId)?.from).toBe(
        requireNodeById(changed.doc, itemId).pos,
      );
    }
    expect(changed.snapshot.itemById.has(title.attrs["id"] as EmbeddedNodeId)).toBe(false);
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("selects the Numbered List owner without focusing prose, changing status or invoking controls", async () => {
    const listId = makeId("nl", 3);
    const firstItemId = makeId("ni", 6);
    const secondItemId = makeId("ni", 7);
    const focusedParagraphId = makeId("pa", 10);
    const doc = documentNode(
      numberedListNode(
        listId,
        numberedListTitle(makeId("nt", 3), makeId("pa", 8), "Private navigation title"),
        [
          simpleItem(firstItemId, 9, "inProgress"),
          simpleItem(secondItemId, 10, "complete"),
        ],
      ),
    );
    const originalDocument = doc.toJSON();
    const proseFocusState = { focusedParagraphId };
    const originalProseFocusState = structuredClone(proseFocusState);
    const addItem = vi.fn();
    const deleteItem = vi.fn();
    const cycleMarkerStatus = vi.fn();
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
    const listLocation = controller.getSnapshot().semantics.locationById.get(listId)!;
    const adapterLookup = vi.spyOn(controller.containerAdapters, "get");

    await expect(controller.select(secondItemId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: secondItemId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(listId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondItemId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(listLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === listId),
    ).toBe(true);
    expect(adapterLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addItem).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
    expect(cycleMarkerStatus).not.toHaveBeenCalled();
    expect(proseFocusState).toEqual(originalProseFocusState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function simpleItem(
  id: EmbeddedNodeId,
  ordinal: number,
  status: "neutral" | "inProgress" | "complete",
): ProseMirrorNode {
  return numberedListItem(id, makeId("pa", ordinal), status, `Private item prose ${ordinal}`);
}

function numberedListTitle(
  id: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  text: string,
): ProseMirrorNode {
  return schema.node(NUMBERED_LIST_TITLE_NODE, { id }, [
    schema.node("paragraph", { id: paragraphId }, text ? [schema.text(text)] : []),
  ]);
}

function numberedListItem(
  id: EmbeddedNodeId,
  paragraphId: EmbeddedNodeId,
  status: "neutral" | "inProgress" | "complete",
  text: string,
): ProseMirrorNode {
  return schema.node(NUMBERED_LIST_ITEM_NODE, { id, status }, [
    schema.node("paragraph", { id: paragraphId }, text ? [schema.text(text)] : []),
  ]);
}

function numberedListNode(
  id: EmbeddedNodeId,
  title: ProseMirrorNode,
  items: readonly ProseMirrorNode[],
  data: Readonly<Record<string, unknown>> = {
    type: "numbered_list",
    showTitle: true,
    showIcon: false,
    icon: null,
  },
): ProseMirrorNode {
  return schema.node(NUMBERED_LIST_NODE, { id, data }, [title, ...items]);
}

function documentNode(list: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [list]),
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
  listId: EmbeddedNodeId,
  title: ProseMirrorNode,
  items: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(numberedListNode(listId, title, items));
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
        nodeType === NUMBERED_LIST_NODE
          ? {
              nodeType,
              title: numberedListBlockDefinition.title,
              isAssessment: false,
              ...(numberedListBlockDefinition.documentSemantics
                ? { documentSemantics: numberedListBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Numbered List semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
