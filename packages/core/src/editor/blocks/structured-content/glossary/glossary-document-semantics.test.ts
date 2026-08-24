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
  GLOSSARY_DEFINITION_NODE,
  GLOSSARY_ENTRY_NODE,
  GLOSSARY_NODE,
  GLOSSARY_TERM_NODE,
} from "./content";
import { glossaryBlockDefinition } from "./glossary-definition";

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
    [GLOSSARY_NODE]: {
      group: "block",
      content: `${GLOSSARY_ENTRY_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [GLOSSARY_ENTRY_NODE]: {
      content: `${GLOSSARY_TERM_NODE} ${GLOSSARY_DEFINITION_NODE}`,
      attrs: { id: { default: null } },
      selectable: false,
    },
    [GLOSSARY_TERM_NODE]: {
      content: "paragraph",
      attrs: { id: { default: null } },
    },
    [GLOSSARY_DEFINITION_NODE]: {
      content: "paragraph+",
      attrs: { id: { default: null } },
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Glossary document semantics", () => {
  it("publishes direct entries with stable locations and privacy-safe ordinal labels", () => {
    const glossaryId = makeId("gl", 1);
    const firstEntryId = makeId("ge", 1);
    const secondEntryId = makeId("ge", 2);
    const firstTermId = makeId("gt", 1);
    const firstDefinitionId = makeId("gd", 1);
    const secondTermId = makeId("gt", 2);
    const secondDefinitionId = makeId("gd", 2);
    const firstTermParagraphId = makeId("pa", 1);
    const firstDefinitionParagraphId = makeId("pa", 2);
    const secondTermParagraphId = makeId("pa", 3);
    const secondDefinitionParagraphId = makeId("pa", 4);
    const privateProse = [
      "Private first glossary term",
      "Private first glossary definition",
      "Private second glossary term",
      "Private second glossary definition",
    ];
    const glossary = glossaryNode(glossaryId, [
      glossaryEntry(firstEntryId, {
        termId: firstTermId,
        definitionId: firstDefinitionId,
        termParagraphId: firstTermParagraphId,
        definitionParagraphId: firstDefinitionParagraphId,
        term: privateProse[0]!,
        definition: privateProse[1]!,
      }),
      glossaryEntry(secondEntryId, {
        termId: secondTermId,
        definitionId: secondDefinitionId,
        termParagraphId: secondTermParagraphId,
        definitionParagraphId: secondDefinitionParagraphId,
        term: privateProse[2]!,
        definition: privateProse[3]!,
      }),
    ]);
    const doc = documentNode(glossary);
    const snapshot = project(doc, 4);

    expect(glossaryBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(glossaryId)).toMatchObject({
      kind: "block",
      label: "Glossary",
      children: [{ id: firstEntryId }, { id: secondEntryId }],
    });
    for (const [index, entryId] of [firstEntryId, secondEntryId].entries()) {
      expect(snapshot.itemById.get(entryId)).toMatchObject({
        id: entryId,
        kind: "published-child",
        nodeType: GLOSSARY_ENTRY_NODE,
        label: `Glossary entry ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(entryId)).toBe(glossaryId);
      const current = requireNodeById(doc, entryId);
      expect(snapshot.locationById.get(entryId)).toMatchObject({
        id: entryId,
        nodeType: GLOSSARY_ENTRY_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: glossaryId,
        activationPath: [],
      });
    }

    const privateIds = [
      firstTermId,
      firstDefinitionId,
      secondTermId,
      secondDefinitionId,
      firstTermParagraphId,
      firstDefinitionParagraphId,
      secondTermParagraphId,
      secondDefinitionParagraphId,
    ];
    for (const privateId of privateIds) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publicBoundary = JSON.stringify({
      descriptions: [...snapshot.itemById.values()].map(({ label, summary }) => ({
        label,
        summary,
      })),
      nodeTypes: [...snapshot.itemById.values()].map(({ nodeType }) => nodeType),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      ...privateIds,
      ...privateProse,
      GLOSSARY_TERM_NODE,
      GLOSSARY_DEFINITION_NODE,
      "Term",
      "Definition",
      `sc-glossary-term-${firstEntryId}`,
      `sc-glossary-term-${secondEntryId}`,
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted entry identity", () => {
    const glossaryId = makeId("gl", 2);
    const first = simpleEntry(makeId("ge", 3), 3);
    const second = simpleEntry(makeId("ge", 4), 4);
    const third = simpleEntry(makeId("ge", 5), 5);

    const initial = projectEntries(glossaryId, [first, second], 5);
    const added = projectEntries(glossaryId, [first, second, third], 6);
    const changed = projectEntries(glossaryId, [third, first], 7);

    expect(childIds(initial.snapshot, glossaryId)).toEqual([makeId("ge", 3), makeId("ge", 4)]);
    expect(childIds(added.snapshot, glossaryId)).toEqual([
      makeId("ge", 3),
      makeId("ge", 4),
      makeId("ge", 5),
    ]);
    expect(childIds(changed.snapshot, glossaryId)).toEqual([makeId("ge", 5), makeId("ge", 3)]);
    expect(changed.snapshot.itemById.has(makeId("ge", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ge", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ge", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ge", 5))?.label).toBe("Glossary entry 1");
    expect(changed.snapshot.itemById.get(makeId("ge", 3))?.label).toBe("Glossary entry 2");
    for (const entryId of [makeId("ge", 5), makeId("ge", 3)]) {
      expect(changed.snapshot.itemById.get(entryId)?.id).toBe(entryId);
      expect(changed.snapshot.locationById.get(entryId)?.from).toBe(
        requireNodeById(changed.doc, entryId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("reaches the exact entry through its Glossary anchor without focusing fields or invoking controls", async () => {
    const glossaryId = makeId("gl", 3);
    const firstEntryId = makeId("ge", 6);
    const secondEntryId = makeId("ge", 7);
    const focusedFieldId = makeId("gt", 25);
    const doc = documentNode(
      glossaryNode(glossaryId, [simpleEntry(firstEntryId, 6), simpleEntry(secondEntryId, 7)]),
    );
    const originalDocument = doc.toJSON();
    const fieldFocusState = { focusedFieldId };
    const originalFieldFocusState = structuredClone(fieldFocusState);
    const addEntry = vi.fn();
    const deleteEntry = vi.fn();
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
    const glossaryLocation = controller.getSnapshot().semantics.locationById.get(glossaryId)!;
    const activationLookup = vi
      .spyOn(controller.semanticActivations, "resolve")
      .mockImplementation(() => {
        throw new Error("Anchor-only navigation must not resolve an activation binding");
      });

    await expect(controller.select(secondEntryId, { origin: "document-outline" })).resolves.toEqual(
      {
        kind: "reached",
        id: secondEntryId,
      },
    );

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(glossaryId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondEntryId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(glossaryLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === glossaryId),
    ).toBe(true);
    expect(activationLookup).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addEntry).not.toHaveBeenCalled();
    expect(deleteEntry).not.toHaveBeenCalled();
    expect(fieldFocusState).toEqual(originalFieldFocusState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

interface GlossaryEntryFields {
  readonly termId: EmbeddedNodeId;
  readonly definitionId: EmbeddedNodeId;
  readonly termParagraphId: EmbeddedNodeId;
  readonly definitionParagraphId: EmbeddedNodeId;
  readonly term: string;
  readonly definition: string;
}

function simpleEntry(id: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return glossaryEntry(id, {
    termId: makeId("gt", ordinal),
    definitionId: makeId("gd", ordinal),
    termParagraphId: makeId("pa", ordinal * 2 - 1),
    definitionParagraphId: makeId("pa", ordinal * 2),
    term: `Private glossary term ${ordinal}`,
    definition: `Private glossary definition ${ordinal}`,
  });
}

function glossaryEntry(id: EmbeddedNodeId, fields: GlossaryEntryFields): ProseMirrorNode {
  return schema.node(GLOSSARY_ENTRY_NODE, { id }, [
    schema.node(GLOSSARY_TERM_NODE, { id: fields.termId }, [
      schema.node(
        "paragraph",
        { id: fields.termParagraphId },
        fields.term ? [schema.text(fields.term)] : [],
      ),
    ]),
    schema.node(GLOSSARY_DEFINITION_NODE, { id: fields.definitionId }, [
      schema.node(
        "paragraph",
        { id: fields.definitionParagraphId },
        fields.definition ? [schema.text(fields.definition)] : [],
      ),
    ]),
  ]);
}

function glossaryNode(id: EmbeddedNodeId, entries: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node(GLOSSARY_NODE, { id, data: {} }, entries);
}

function documentNode(glossary: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [glossary]),
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
  glossaryId: EmbeddedNodeId,
  entries: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(glossaryNode(glossaryId, entries));
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
        nodeType === GLOSSARY_NODE
          ? {
              nodeType,
              title: glossaryBlockDefinition.title,
              isAssessment: false,
              ...(glossaryBlockDefinition.documentSemantics
                ? { documentSemantics: glossaryBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Glossary semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
