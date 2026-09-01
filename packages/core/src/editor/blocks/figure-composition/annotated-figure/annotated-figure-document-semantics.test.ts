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
import { MAX_SEMANTIC_LABEL_LENGTH } from "@/document/model/semantic-document/semantic-labels";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { annotatedFigureDefinition } from "./annotated-figure-definition";
import {
  ANNOTATED_FIGURE_ANNOTATION_NODE,
  ANNOTATED_FIGURE_CANVAS_NODE,
  ANNOTATED_FIGURE_LEGEND_NODE,
  ANNOTATED_FIGURE_NODE,
  emptyAnnotatedFigureData,
} from "./content";

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
    [ANNOTATED_FIGURE_NODE]: {
      group: "block",
      content: "block+",
      attrs: { id: { default: null }, data: { default: null } },
    },
    [ANNOTATED_FIGURE_CANVAS_NODE]: {
      group: "block",
      content: "paragraph*",
      attrs: { id: { default: null } },
    },
    [ANNOTATED_FIGURE_LEGEND_NODE]: {
      group: "block",
      content: `${ANNOTATED_FIGURE_ANNOTATION_NODE}*`,
      attrs: { id: { default: null } },
    },
    [ANNOTATED_FIGURE_ANNOTATION_NODE]: {
      content: "paragraph",
      attrs: {
        id: { default: null },
        title: { default: "" },
        x: { default: 50 },
        y: { default: 50 },
      },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Annotated Figure document semantics", () => {
  it("publishes real annotation nodes with stable locations and presentation-neutral labels", () => {
    const figureId = makeId("fi", 1);
    const annotations = [
      annotation(makeId("an", 1), "  Repeated\n title ", "First caption"),
      annotation(makeId("an", 2), "Repeated title", "Second caption"),
      annotation(makeId("an", 3), "", "  Caption\n fallback "),
      annotation(makeId("an", 4), "", ""),
      annotation(makeId("an", 5), "  Normalized\n title ", "Private caption"),
      annotation(makeId("an", 6), "L".repeat(MAX_SEMANTIC_LABEL_LENGTH + 20), ""),
    ];
    const figure = figureNode(figureId, annotations);
    const doc = documentNode(figure);
    const snapshot = project(doc, 4);
    const annotationIds = annotations.map(({ attrs }) => attrs["id"] as EmbeddedNodeId);

    expect(snapshot.itemById.get(figureId)?.label).toBe("Architecture diagram");
    expect(snapshot.itemById.get(figureId)?.children.map(({ id }) => id)).toEqual(annotationIds);
    expect(annotationIds.map((id) => snapshot.itemById.get(id)?.label)).toEqual([
      "Repeated title 1",
      "Repeated title 2",
      "Caption fallback",
      "Annotation 4",
      "Normalized title",
      `${"L".repeat(MAX_SEMANTIC_LABEL_LENGTH - 1)}…`,
    ]);
    for (const [index, annotationId] of annotationIds.entries()) {
      expect(snapshot.itemById.get(annotationId)).toMatchObject({
        id: annotationId,
        kind: "published-child",
        nodeType: ANNOTATED_FIGURE_ANNOTATION_NODE,
        presentation: {
          actionIds: ["reveal", "hide", "move", "emphasize"],
          disabledReason: null,
        },
      });
      expect(snapshot.parentById.get(annotationId)).toBe(figureId);
      const location = snapshot.locationById.get(annotationId);
      const current = requireNodeById(doc, annotationId);
      expect(location).toMatchObject({
        id: annotationId,
        nodeType: ANNOTATED_FIGURE_ANNOTATION_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "node", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: figureId,
        activationPath: [{ ownerId: figureId, childId: annotationId, ownerKind: "block" }],
      });
      if (index > 0) {
        expect(location!.from).toBeGreaterThan(
          snapshot.locationById.get(annotationIds[index - 1]!)!.from,
        );
      }
      expect(Object.isFrozen(location)).toBe(true);
    }
    for (const privateId of [
      makeId("cv", 1),
      makeId("le", 1),
      ...annotations.map((node) => node.child(0).attrs["id"] as EmbeddedNodeId),
    ]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
      expect(snapshot.itemById.get(figureId)?.children.some(({ id }) => id === privateId)).toBe(
        false,
      );
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects edited annotation labels and current locations without changing identity", () => {
    const figureId = makeId("fi", 5);
    const firstId = makeId("an", 10);
    const secondId = makeId("an", 11);
    const initialDoc = documentNode(
      figureNode(figureId, [
        annotation(firstId, "Initial title", "Short"),
        annotation(secondId, "", "Initial caption"),
      ]),
    );
    const editedDoc = documentNode(
      figureNode(figureId, [
        annotation(firstId, "Edited title", "A much longer private caption"),
        annotation(secondId, "", "Edited caption"),
      ]),
    );

    const initial = project(initialDoc, 8);
    const edited = project(editedDoc, 9);

    expect(initial.revision).toBe(8);
    expect(edited.revision).toBe(9);
    expect(initial.itemById.get(figureId)?.children.map(({ id }) => id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(edited.itemById.get(figureId)?.children.map(({ id }) => id)).toEqual([
      firstId,
      secondId,
    ]);
    expect([initial.itemById.get(firstId)?.label, initial.itemById.get(secondId)?.label]).toEqual([
      "Initial title",
      "Initial caption",
    ]);
    expect([edited.itemById.get(firstId)?.label, edited.itemById.get(secondId)?.label]).toEqual([
      "Edited title",
      "Edited caption",
    ]);

    for (const annotationId of [firstId, secondId]) {
      const initialNode = requireNodeById(initialDoc, annotationId);
      const editedNode = requireNodeById(editedDoc, annotationId);
      expect(initial.locationById.get(annotationId)).toMatchObject({
        id: annotationId,
        from: initialNode.pos,
        to: initialNode.pos + initialNode.node.nodeSize,
        authoringAnchorId: figureId,
        activationPath: [{ ownerId: figureId, childId: annotationId, ownerKind: "block" }],
      });
      expect(edited.locationById.get(annotationId)).toMatchObject({
        id: annotationId,
        from: editedNode.pos,
        to: editedNode.pos + editedNode.node.nodeSize,
        authoringAnchorId: figureId,
        activationPath: [{ ownerId: figureId, childId: annotationId, ownerKind: "block" }],
      });
      expect(edited.itemById.get(annotationId)?.presentation.actionIds).toEqual([
        "reveal",
        "hide",
        "move",
        "emphasize",
      ]);
      expect(edited.locationById.get(annotationId)).not.toEqual(
        initial.locationById.get(annotationId),
      );
    }
  });

  it("reaches the exact annotation through its Figure activation binding", async () => {
    const figureId = makeId("fi", 4);
    const annotationId = makeId("an", 9);
    const doc = documentNode(figureNode(figureId, [annotation(annotationId, "Detail", "Caption")]));
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
    const activate = vi.fn(async () => ({
      kind: "revealed" as const,
      ownerId: figureId,
      childId: annotationId,
    }));
    controller.semanticTargetInteractions.registry.register({ ownerId: figureId, activate });
    const initialFigureLocation = controller.getSnapshot().semantics.locationById.get(figureId)!;
    navigationEditor.dispatch(
      state.tr.insert(initialFigureLocation.from, paragraph(makeId("pa", 10), "Before figure")),
    );
    const currentFigureLocation = controller.getSnapshot().semantics.locationById.get(figureId)!;
    const activationLookup = vi.spyOn(controller.semanticTargetInteractions.registry, "resolve");

    await expect(controller.select(annotationId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: annotationId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(figureId);
    expect(state.selection.from).toBe(currentFigureLocation.from);
    expect(currentFigureLocation.from).toBeGreaterThan(initialFigureLocation.from);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: annotationId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(currentFigureLocation, "smooth");
    expect(activationLookup).toHaveBeenCalledWith(figureId);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("tracks annotation reorder and removal in legend order", () => {
    const figureId = makeId("fi", 2);
    const first = annotation(makeId("an", 5), "First", "");
    const second = annotation(makeId("an", 6), "Second", "");
    const third = annotation(makeId("an", 7), "Third", "");

    const initial = project(documentNode(figureNode(figureId, [first, second, third])), 5);
    const changed = project(documentNode(figureNode(figureId, [third, first])), 6);

    expect(initial.itemById.get(figureId)?.children.map(({ id }) => id)).toEqual([
      makeId("an", 5),
      makeId("an", 6),
      makeId("an", 7),
    ]);
    expect(changed.itemById.get(figureId)?.children.map(({ id }) => id)).toEqual([
      makeId("an", 7),
      makeId("an", 5),
    ]);
    expect(changed.itemById.has(makeId("an", 6))).toBe(false);
  });

  it("keeps malformed canvas and legend structure private", () => {
    const figureId = makeId("fi", 3);
    const malformed = schema.node(
      ANNOTATED_FIGURE_NODE,
      { id: figureId, data: emptyAnnotatedFigureData({ alt: "Safe fallback" }) },
      [
        schema.node(ANNOTATED_FIGURE_CANVAS_NODE, { id: makeId("cv", 3) }, [
          paragraph(makeId("pa", 8), "Private canvas content"),
        ]),
        schema.node(ANNOTATED_FIGURE_LEGEND_NODE, { id: makeId("le", 3) }, [
          annotation(makeId("an", 8), "Private title", "Private caption"),
        ]),
      ],
    );

    const snapshot = project(documentNode(malformed), 7);

    expect(snapshot.itemById.get(figureId)?.label).toBe("Annotated figure");
    expect(snapshot.itemById.get(figureId)?.children).toEqual([]);
    for (const privateId of [makeId("cv", 3), makeId("le", 3), makeId("an", 8), makeId("pa", 8)]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    expect(JSON.stringify(snapshot)).not.toContain("Private");
  });
});

function annotation(annotationId: EmbeddedNodeId, title: string, caption: string): ProseMirrorNode {
  return schema.node(ANNOTATED_FIGURE_ANNOTATION_NODE, { id: annotationId, title, x: 25, y: 75 }, [
    paragraph(makeId("pa", Number(annotationId.slice(-2))), caption),
  ]);
}

function figureNode(
  figureId: EmbeddedNodeId,
  annotations: readonly ProseMirrorNode[],
): ProseMirrorNode {
  return schema.node(
    ANNOTATED_FIGURE_NODE,
    { id: figureId, data: emptyAnnotatedFigureData({ alt: "Architecture diagram" }) },
    [
      schema.node(ANNOTATED_FIGURE_CANVAS_NODE, { id: makeId("cv", 1) }),
      schema.node(ANNOTATED_FIGURE_LEGEND_NODE, { id: makeId("le", 1) }, annotations),
    ],
  );
}

function documentNode(figure: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [figure]),
      ]),
    ]),
  ]);
}

function paragraph(nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node("paragraph", { id: nodeId }, text ? [schema.text(text)] : []);
}

function project(doc: ProseMirrorNode, revision: number) {
  return projectSemanticDocument({
    doc,
    courseStructure: requireCourseStructure(doc),
    definitions: definitions(),
    revision,
  });
}

function definitions(): SemanticDefinitionLookup {
  return Object.freeze({
    blocks: Object.freeze({
      get: (nodeType: string) =>
        nodeType === ANNOTATED_FIGURE_NODE
          ? {
              nodeType,
              title: annotatedFigureDefinition.title,
              isAssessment: false,
              ...(annotatedFigureDefinition.documentSemantics
                ? { documentSemantics: annotatedFigureDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Annotated Figure semantics fixture.");
  return courseStructure;
}

function requireNodeById(
  doc: ProseMirrorNode,
  nodeId: EmbeddedNodeId,
): { node: ProseMirrorNode; pos: number } {
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== nodeId) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Expected node ${nodeId} in Annotated Figure fixture.`);
  return found;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
