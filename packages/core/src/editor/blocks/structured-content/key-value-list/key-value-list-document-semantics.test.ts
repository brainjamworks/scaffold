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
  KEY_VALUE_LIST_NODE,
  KEY_VALUE_ROW_KEY_NODE,
  KEY_VALUE_ROW_NODE,
  KEY_VALUE_ROW_VALUE_NODE,
} from "./content";
import { keyValueListBlockDefinition } from "./key-value-list-definition";

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
    [KEY_VALUE_LIST_NODE]: {
      group: "block",
      content: `${KEY_VALUE_ROW_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [KEY_VALUE_ROW_NODE]: {
      content: `${KEY_VALUE_ROW_KEY_NODE} ${KEY_VALUE_ROW_VALUE_NODE}`,
      attrs: { id: { default: null } },
      selectable: false,
    },
    [KEY_VALUE_ROW_KEY_NODE]: {
      content: "paragraph",
      attrs: { id: { default: null } },
    },
    [KEY_VALUE_ROW_VALUE_NODE]: {
      content: "paragraph",
      attrs: { id: { default: null } },
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Key-value list document semantics", () => {
  it("publishes direct rows with stable locations and privacy-safe ordinal labels", () => {
    const listId = makeId("kv", 1);
    const firstRowId = makeId("kr", 1);
    const secondRowId = makeId("kr", 2);
    const firstKeyId = makeId("kk", 1);
    const firstValueId = makeId("vv", 1);
    const secondKeyId = makeId("kk", 2);
    const secondValueId = makeId("vv", 2);
    const firstKeyParagraphId = makeId("pa", 1);
    const firstValueParagraphId = makeId("pa", 2);
    const secondKeyParagraphId = makeId("pa", 3);
    const secondValueParagraphId = makeId("pa", 4);
    const privateConfiguration = { layout: "grid", keyWidth: "wide" };
    const privateProse = [
      "Private first key prose",
      "Private first value prose",
      "Private second key prose",
      "Private second value prose",
    ];
    const list = keyValueListNode(
      listId,
      [
        keyValueRow(firstRowId, {
          keyId: firstKeyId,
          valueId: firstValueId,
          keyParagraphId: firstKeyParagraphId,
          valueParagraphId: firstValueParagraphId,
          key: privateProse[0]!,
          value: privateProse[1]!,
        }),
        keyValueRow(secondRowId, {
          keyId: secondKeyId,
          valueId: secondValueId,
          keyParagraphId: secondKeyParagraphId,
          valueParagraphId: secondValueParagraphId,
          key: privateProse[2]!,
          value: privateProse[3]!,
        }),
      ],
      privateConfiguration,
    );
    const doc = documentNode(list);
    const snapshot = project(doc, 4);

    expect(keyValueListBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(listId)).toMatchObject({
      kind: "block",
      label: "Key-value list",
      children: [{ id: firstRowId }, { id: secondRowId }],
    });
    for (const [index, rowId] of [firstRowId, secondRowId].entries()) {
      expect(snapshot.itemById.get(rowId)).toMatchObject({
        id: rowId,
        kind: "published-child",
        nodeType: KEY_VALUE_ROW_NODE,
        label: `Key-value row ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(rowId)).toBe(listId);
      const current = requireNodeById(doc, rowId);
      expect(snapshot.locationById.get(rowId)).toMatchObject({
        id: rowId,
        nodeType: KEY_VALUE_ROW_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: listId,
        activationPath: [],
      });
    }

    const privateIds = [
      firstKeyId,
      firstValueId,
      secondKeyId,
      secondValueId,
      firstKeyParagraphId,
      firstValueParagraphId,
      secondKeyParagraphId,
      secondValueParagraphId,
    ];
    for (const privateId of privateIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publicDescriptions = [...snapshot.itemById.values()].flatMap(({ label, summary }) =>
      summary === null ? [label] : [label, summary],
    );
    expect(publicDescriptions).not.toContain(
      keyValueListBlockDefinition.placeholders?.[KEY_VALUE_ROW_KEY_NODE],
    );
    expect(publicDescriptions).not.toContain(
      keyValueListBlockDefinition.placeholders?.[KEY_VALUE_ROW_VALUE_NODE],
    );
    const publicBoundary = JSON.stringify({
      descriptions: publicDescriptions,
      nodeTypes: [...snapshot.itemById.values()].map(({ nodeType }) => nodeType),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      ...privateIds,
      ...privateProse,
      KEY_VALUE_ROW_KEY_NODE,
      KEY_VALUE_ROW_VALUE_NODE,
      "paragraph",
      privateConfiguration.layout,
      privateConfiguration.keyWidth,
      `sc-key-value-key-${firstRowId}`,
      `sc-key-value-key-${secondRowId}`,
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted row identity", () => {
    const listId = makeId("kv", 2);
    const first = simpleRow(makeId("kr", 3), 3);
    const second = simpleRow(makeId("kr", 4), 4);
    const third = simpleRow(makeId("kr", 5), 5);

    const initial = projectRows(listId, [first, second], 5);
    const added = projectRows(listId, [first, second, third], 6);
    const changed = projectRows(listId, [third, first], 7);

    expect(childIds(initial.snapshot, listId)).toEqual([makeId("kr", 3), makeId("kr", 4)]);
    expect(childIds(added.snapshot, listId)).toEqual([
      makeId("kr", 3),
      makeId("kr", 4),
      makeId("kr", 5),
    ]);
    expect(childIds(changed.snapshot, listId)).toEqual([makeId("kr", 5), makeId("kr", 3)]);
    expect(changed.snapshot.itemById.has(makeId("kr", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("kr", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("kr", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("kr", 5))?.label).toBe("Key-value row 1");
    expect(changed.snapshot.itemById.get(makeId("kr", 3))?.label).toBe("Key-value row 2");
    for (const rowId of [makeId("kr", 5), makeId("kr", 3)]) {
      expect(changed.snapshot.itemById.get(rowId)?.id).toBe(rowId);
      expect(changed.snapshot.locationById.get(rowId)?.from).toBe(
        requireNodeById(changed.doc, rowId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("reaches the exact row through its Key-value list anchor without focusing fields or invoking controls", async () => {
    const listId = makeId("kv", 3);
    const firstRowId = makeId("kr", 6);
    const secondRowId = makeId("kr", 7);
    const focusedFieldId = makeId("kk", 25);
    const doc = documentNode(
      keyValueListNode(listId, [simpleRow(firstRowId, 6), simpleRow(secondRowId, 7)]),
    );
    const originalDocument = doc.toJSON();
    const fieldFocusState = { focusedFieldId };
    const originalFieldFocusState = structuredClone(fieldFocusState);
    const addRow = vi.fn();
    const deleteRow = vi.fn();
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
    const activationLookup = vi
      .spyOn(controller.semanticTargetInteractions.registry, "resolve")
      .mockImplementation(() => {
        throw new Error("Anchor-only navigation must not resolve an activation binding");
      });

    await expect(controller.select(secondRowId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: secondRowId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(listId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondRowId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(listLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === listId),
    ).toBe(true);
    expect(activationLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addRow).not.toHaveBeenCalled();
    expect(deleteRow).not.toHaveBeenCalled();
    expect(fieldFocusState).toEqual(originalFieldFocusState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

interface KeyValueRowFields {
  readonly keyId: EmbeddedNodeId;
  readonly valueId: EmbeddedNodeId;
  readonly keyParagraphId: EmbeddedNodeId;
  readonly valueParagraphId: EmbeddedNodeId;
  readonly key: string;
  readonly value: string;
}

function simpleRow(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return keyValueRow(id, {
    keyId: makeId("kk", ordinal),
    valueId: makeId("vv", ordinal),
    keyParagraphId: makeId("pa", ordinal * 2 - 1),
    valueParagraphId: makeId("pa", ordinal * 2),
    key: `Private key prose ${ordinal}`,
    value: `Private value prose ${ordinal}`,
  });
}

function keyValueRow(id: EmbeddedNodeId, fields: KeyValueRowFields): ProseMirrorNode {
  return schema.node(KEY_VALUE_ROW_NODE, { id }, [
    schema.node(KEY_VALUE_ROW_KEY_NODE, { id: fields.keyId }, [
      schema.node(
        "paragraph",
        { id: fields.keyParagraphId },
        fields.key ? [schema.text(fields.key)] : [],
      ),
    ]),
    schema.node(KEY_VALUE_ROW_VALUE_NODE, { id: fields.valueId }, [
      schema.node(
        "paragraph",
        { id: fields.valueParagraphId },
        fields.value ? [schema.text(fields.value)] : [],
      ),
    ]),
  ]);
}

function keyValueListNode(
  id: EmbeddedNodeId,
  rows: readonly ProseMirrorNode[],
  data: Readonly<Record<string, unknown>> = { layout: "stacked", keyWidth: "auto" },
): ProseMirrorNode {
  return schema.node(KEY_VALUE_LIST_NODE, { id, data }, rows);
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

function projectRows(listId: EmbeddedNodeId, rows: readonly ProseMirrorNode[], revision: number) {
  const doc = documentNode(keyValueListNode(listId, rows));
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
        nodeType === KEY_VALUE_LIST_NODE
          ? {
              nodeType,
              title: keyValueListBlockDefinition.title,
              isAssessment: false,
              ...(keyValueListBlockDefinition.documentSemantics
                ? { documentSemantics: keyValueListBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Key-value list semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
