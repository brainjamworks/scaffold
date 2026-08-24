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

import { PROCESS_FLOW_NODE, PROCESS_FLOW_STEP_NODE } from "./content";
import { processFlowBlockDefinition } from "./process-flow-definition";

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
    [PROCESS_FLOW_NODE]: {
      group: "block",
      content: `${PROCESS_FLOW_STEP_NODE}+`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [PROCESS_FLOW_STEP_NODE]: {
      content: "paragraph paragraph?",
      attrs: { id: { default: null } },
      selectable: false,
    },
    paragraph: {
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("Process Flow document semantics", () => {
  it("publishes steps while keeping prose, presentation settings and overflow concepts private", () => {
    const processFlowId = makeId("pf", 1);
    const firstStepId = makeId("ps", 1);
    const secondStepId = makeId("ps", 2);
    const firstTitleId = makeId("pa", 1);
    const firstDescriptionId = makeId("pa", 2);
    const secondTitleId = makeId("pa", 3);
    const secondDescriptionId = makeId("pa", 4);
    const firstTitle = "Private discovery title";
    const firstDescription = "Private discovery description";
    const secondTitle = "Private delivery title";
    const secondDescription = "Private delivery description";
    const processFlow = processFlowNode(
      processFlowId,
      [
        processFlowStep(firstStepId, firstTitleId, firstTitle, {
          descriptionId: firstDescriptionId,
          description: firstDescription,
        }),
        processFlowStep(secondStepId, secondTitleId, secondTitle, {
          descriptionId: secondDescriptionId,
          description: secondDescription,
        }),
      ],
      { orientation: "horizontal", showNumbers: false, showConnectors: true },
    );
    const doc = documentNode(processFlow);
    const snapshot = project(doc, 4);

    expect(processFlowBlockDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(processFlowId)).toMatchObject({
      kind: "block",
      label: "Process flow",
      children: [{ id: firstStepId }, { id: secondStepId }],
    });
    for (const [index, stepId] of [firstStepId, secondStepId].entries()) {
      expect(snapshot.itemById.get(stepId)).toMatchObject({
        id: stepId,
        kind: "published-child",
        nodeType: PROCESS_FLOW_STEP_NODE,
        label: `Process flow step ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(stepId)).toBe(processFlowId);
      const current = requireNodeById(doc, stepId);
      expect(snapshot.locationById.get(stepId)).toMatchObject({
        id: stepId,
        nodeType: PROCESS_FLOW_STEP_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "near", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: processFlowId,
        activationPath: [],
      });
    }

    for (const privateId of [
      firstTitleId,
      firstDescriptionId,
      secondTitleId,
      secondDescriptionId,
    ]) {
      expect(snapshot.itemById.has(privateId)).toBe(false);
      expect(snapshot.parentById.has(privateId)).toBe(false);
      expect(snapshot.locationById.has(privateId)).toBe(false);
    }
    const publishedChildDescriptions = [firstStepId, secondStepId].flatMap((stepId) => {
      const step = snapshot.itemById.get(stepId);
      if (!step) throw new Error(`Expected published Process Flow step ${stepId}.`);
      return step.summary === null ? [step.label] : [step.label, step.summary];
    });
    const publicBoundary = JSON.stringify({
      descriptions: publishedChildDescriptions,
      nodeTypes: [...snapshot.itemById.values()].map(({ nodeType }) => nodeType),
      diagnostics: snapshot.diagnostics,
      itemIds: [...snapshot.itemById.keys()],
      parentIds: [...snapshot.parentById.entries()],
      locationIds: [...snapshot.locationById.keys()],
    });
    for (const privateValue of [
      firstTitleId,
      firstDescriptionId,
      secondTitleId,
      secondDescriptionId,
      firstTitle,
      firstDescription,
      secondTitle,
      secondDescription,
      "paragraph",
      '"orientation":"horizontal"',
      '"showNumbers":false',
      '"showConnectors":true',
      "data-process-flow-scrollable",
      "process-flow-scrollport",
      "process-flow-rail",
      "Add step",
      "Delete process flow step",
      "move-process-flow-step",
    ]) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted step identity", () => {
    const processFlowId = makeId("pf", 2);
    const first = simpleStep(makeId("ps", 3), 5);
    const second = simpleStep(makeId("ps", 4), 6);
    const third = simpleStep(makeId("ps", 5), 7);

    const initial = projectSteps(processFlowId, [first, second], 5);
    const added = projectSteps(processFlowId, [first, second, third], 6);
    const changed = projectSteps(processFlowId, [third, first], 7);

    expect(childIds(initial.snapshot, processFlowId)).toEqual([
      makeId("ps", 3),
      makeId("ps", 4),
    ]);
    expect(childIds(added.snapshot, processFlowId)).toEqual([
      makeId("ps", 3),
      makeId("ps", 4),
      makeId("ps", 5),
    ]);
    expect(childIds(changed.snapshot, processFlowId)).toEqual([
      makeId("ps", 5),
      makeId("ps", 3),
    ]);
    expect(changed.snapshot.itemById.has(makeId("ps", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("ps", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("ps", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("ps", 5))?.label).toBe(
      "Process flow step 1",
    );
    expect(changed.snapshot.itemById.get(makeId("ps", 3))?.label).toBe(
      "Process flow step 2",
    );
    for (const stepId of [makeId("ps", 5), makeId("ps", 3)]) {
      expect(changed.snapshot.itemById.get(stepId)?.id).toBe(stepId);
      expect(changed.snapshot.parentById.get(stepId)).toBe(processFlowId);
      expect(changed.snapshot.locationById.get(stepId)?.from).toBe(
        requireNodeById(changed.doc, stepId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("selects the Process Flow owner without scrolling its rail, invoking controls or reordering", async () => {
    const processFlowId = makeId("pf", 3);
    const firstStepId = makeId("ps", 6);
    const secondStepId = makeId("ps", 7);
    const doc = documentNode(
      processFlowNode(processFlowId, [simpleStep(firstStepId, 8), simpleStep(secondStepId, 9)], {
        orientation: "horizontal",
        showNumbers: true,
        showConnectors: true,
      }),
    );
    const originalDocument = doc.toJSON();
    const reorderState = { stepIds: [firstStepId, secondStepId] };
    const originalReorderState = structuredClone(reorderState);
    const scrollInternalRail = vi.fn();
    const addStep = vi.fn();
    const deleteStep = vi.fn();
    const moveStep = vi.fn();
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
    const processFlowLocation = controller
      .getSnapshot()
      .semantics.locationById.get(processFlowId)!;
    const adapterLookup = vi.spyOn(controller.containerAdapters, "get");

    await expect(controller.select(secondStepId, { origin: "document-outline" })).resolves.toEqual(
      { kind: "reached", id: secondStepId },
    );

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(processFlowId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondStepId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(processFlowLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(
        ([location]) => location.id === processFlowId,
      ),
    ).toBe(true);
    expect(adapterLookup).not.toHaveBeenCalled();
    expect(scrollInternalRail).not.toHaveBeenCalled();
    expect(focusEditor).not.toHaveBeenCalled();
    expect(addStep).not.toHaveBeenCalled();
    expect(deleteStep).not.toHaveBeenCalled();
    expect(moveStep).not.toHaveBeenCalled();
    expect(reorderState).toEqual(originalReorderState);
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function simpleStep(stepId: EmbeddedNodeId, ordinal: number): ProseMirrorNode {
  return processFlowStep(
    stepId,
    makeId("pa", ordinal * 2),
    `Private step title ${ordinal}`,
    {
      descriptionId: makeId("pa", ordinal * 2 + 1),
      description: `Private step description ${ordinal}`,
    },
  );
}

function processFlowStep(
  id: EmbeddedNodeId,
  titleId: EmbeddedNodeId,
  title: string,
  description?: Readonly<{ descriptionId: EmbeddedNodeId; description: string }>,
): ProseMirrorNode {
  return schema.node(PROCESS_FLOW_STEP_NODE, { id }, [
    schema.node("paragraph", { id: titleId }, title ? [schema.text(title)] : []),
    ...(description
      ? [
          schema.node(
            "paragraph",
            { id: description.descriptionId },
            description.description ? [schema.text(description.description)] : [],
          ),
        ]
      : []),
  ]);
}

function processFlowNode(
  id: EmbeddedNodeId,
  steps: readonly ProseMirrorNode[],
  data: Readonly<{
    orientation: "horizontal" | "vertical";
    showNumbers: boolean;
    showConnectors: boolean;
  }> = { orientation: "vertical", showNumbers: true, showConnectors: true },
): ProseMirrorNode {
  return schema.node(PROCESS_FLOW_NODE, { id, data }, steps);
}

function documentNode(processFlow: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [processFlow]),
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

function projectSteps(
  processFlowId: EmbeddedNodeId,
  steps: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(processFlowNode(processFlowId, steps));
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
        nodeType === PROCESS_FLOW_NODE
          ? {
              nodeType,
              title: processFlowBlockDefinition.title,
              isAssessment: false,
              ...(processFlowBlockDefinition.documentSemantics
                ? { documentSemantics: processFlowBlockDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Process Flow semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
