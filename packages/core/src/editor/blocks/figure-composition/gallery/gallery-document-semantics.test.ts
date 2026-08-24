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

import { GALLERY_ITEM_NODE, GALLERY_NODE } from "./content";
import { galleryDefinition } from "./gallery-definition";

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
    [GALLERY_NODE]: {
      group: "block",
      content: `${GALLERY_ITEM_NODE}*`,
      attrs: { id: { default: null }, data: { default: null } },
    },
    [GALLERY_ITEM_NODE]: {
      attrs: { id: { default: null }, data: { default: null } },
    },
  },
});

describe("Gallery document semantics", () => {
  it("publishes direct items with stable locations and privacy-safe ordinal labels", () => {
    const galleryId = makeId("ga", 1);
    const firstItemId = makeId("gi", 1);
    const secondItemId = makeId("gi", 2);
    const privateCaptionId = makeId("pc", 1);
    const privateMediaId = makeId("mi", 1);
    const privateValues = [
      "https://private.example.test/external-image.jpg?token=external-secret",
      privateMediaId,
      "Private external alt text",
      "Private managed alt text",
      "Private external caption prose",
      "Private managed caption prose",
      "https://resolved.example.test/private.jpg",
      "Private resolved media error",
    ] as const;
    const first = galleryItem(firstItemId, {
      image: {
        mode: "external",
        src: privateValues[0],
        alt: privateValues[2],
      },
      caption: richText(privateValues[4], privateCaptionId),
      resolvedUrl: privateValues[6],
      loading: true,
      error: privateValues[7],
      lightboxOpen: true,
    });
    const second = galleryItem(secondItemId, {
      image: {
        mode: "managed",
        mediaId: privateValues[1],
        alt: privateValues[3],
      },
      caption: richText(privateValues[5]),
    });
    const gallery = galleryNode(galleryId, [first, second]);
    const doc = documentNode(gallery);
    const snapshot = project(doc, 4);

    expect(galleryDefinition.documentSemantics?.projectChildren).toBeTypeOf("function");
    expect(snapshot.itemById.get(galleryId)).toMatchObject({
      kind: "block",
      label: "Gallery",
      children: [{ id: firstItemId }, { id: secondItemId }],
    });
    for (const [index, itemId] of [firstItemId, secondItemId].entries()) {
      expect(snapshot.itemById.get(itemId)).toMatchObject({
        id: itemId,
        kind: "published-child",
        nodeType: GALLERY_ITEM_NODE,
        label: `Gallery item ${index + 1}`,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
      });
      expect(snapshot.parentById.get(itemId)).toBe(galleryId);
      const current = requireNodeById(doc, itemId);
      expect(snapshot.locationById.get(itemId)).toMatchObject({
        id: itemId,
        nodeType: GALLERY_ITEM_NODE,
        from: current.pos,
        to: current.pos + current.node.nodeSize,
        selectionTarget: { kind: "node", pos: current.pos },
        surfaceId: makeId("su", 1),
        authoringAnchorId: galleryId,
        activationPath: [{ ownerId: galleryId, childId: itemId, ownerKind: "block" }],
      });
    }
    for (const privateId of [privateCaptionId, privateMediaId]) {
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
      indexedIds: [...snapshot.itemById.keys()],
    });
    for (const privateValue of privateValues) {
      expect(publicBoundary).not.toContain(privateValue);
    }
    expect(snapshot.diagnostics).toEqual([]);
  });

  it("reprojects additions, removals and reorder by persisted item identity", () => {
    const galleryId = makeId("ga", 2);
    const first = galleryItem(makeId("gi", 3), privateData("First private caption"));
    const second = galleryItem(makeId("gi", 4), privateData("Second private caption"));
    const third = galleryItem(makeId("gi", 5), privateData("Third private caption"));

    const initial = projectItems(galleryId, [first, second], 5);
    const added = projectItems(galleryId, [first, second, third], 6);
    const changed = projectItems(galleryId, [third, first], 7);

    expect(childIds(initial.snapshot, galleryId)).toEqual([makeId("gi", 3), makeId("gi", 4)]);
    expect(childIds(added.snapshot, galleryId)).toEqual([
      makeId("gi", 3),
      makeId("gi", 4),
      makeId("gi", 5),
    ]);
    expect(childIds(changed.snapshot, galleryId)).toEqual([makeId("gi", 5), makeId("gi", 3)]);
    expect(changed.snapshot.itemById.has(makeId("gi", 4))).toBe(false);
    expect(changed.snapshot.parentById.has(makeId("gi", 4))).toBe(false);
    expect(changed.snapshot.locationById.has(makeId("gi", 4))).toBe(false);
    expect(changed.snapshot.itemById.get(makeId("gi", 5))?.label).toBe("Gallery item 1");
    expect(changed.snapshot.itemById.get(makeId("gi", 3))?.label).toBe("Gallery item 2");
    for (const itemId of [makeId("gi", 5), makeId("gi", 3)]) {
      expect(changed.snapshot.itemById.get(itemId)?.id).toBe(itemId);
      expect(changed.snapshot.locationById.get(itemId)?.from).toBe(
        requireNodeById(changed.doc, itemId).pos,
      );
    }
    expect(changed.snapshot.diagnostics).toEqual([]);
  });

  it("reveals the requested Gallery item without opening its lightbox", async () => {
    const galleryId = makeId("ga", 3);
    const firstItemId = makeId("gi", 6);
    const secondItemId = makeId("gi", 7);
    const doc = documentNode(
      galleryNode(galleryId, [
        galleryItem(firstItemId, privateData("First private caption")),
        galleryItem(secondItemId, privateData("Second private caption")),
      ]),
    );
    const originalDocument = doc.toJSON();
    const featureState = { activeCarouselItemId: firstItemId, lightboxOpen: false };
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
    const galleryLocation = controller.getSnapshot().semantics.locationById.get(galleryId)!;
    const adapterLookup = vi.spyOn(controller.containerAdapters, "get");
    controller.containerAdapters.register({
      ownerId: galleryId,
      reveal: (childId) => {
        featureState.activeCarouselItemId = childId;
        return "revealed";
      },
    });

    await expect(controller.select(secondItemId, { origin: "document-outline" })).resolves.toEqual({
      kind: "reached",
      id: secondItemId,
    });

    expect(state.selection).toBeInstanceOf(NodeSelection);
    expect((state.selection as NodeSelection).node.attrs["id"]).toBe(galleryId);
    expect(controller.getSnapshot()).toMatchObject({
      selectedId: secondItemId,
      selectionOrigin: "document-outline",
    });
    expect(bringIntoView).toHaveBeenCalledWith(galleryLocation, "smooth");
    expect(createActivationTransaction).toHaveBeenCalledTimes(2);
    expect(
      createActivationTransaction.mock.calls.every(([location]) => location.id === galleryId),
    ).toBe(true);
    expect(adapterLookup).toHaveBeenCalledWith(galleryId);
    expect(featureState).toEqual({ activeCarouselItemId: secondItemId, lightboxOpen: false });
    expect(state.doc.toJSON()).toEqual(originalDocument);
  });
});

function privateData(caption: string): Record<string, unknown> {
  return {
    image: {
      mode: "external",
      src: `https://private.example.test/${encodeURIComponent(caption)}.jpg`,
      alt: `${caption} alt`,
    },
    caption: richText(caption),
  };
}

function richText(text: string, paragraphId?: EmbeddedNodeId): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        ...(paragraphId ? { attrs: { id: paragraphId } } : {}),
        content: [{ type: "text", text }],
      },
    ],
  };
}

function galleryItem(id: EmbeddedNodeId, data: Record<string, unknown>): ProseMirrorNode {
  return schema.node(GALLERY_ITEM_NODE, { id, data });
}

function galleryNode(id: EmbeddedNodeId, items: readonly ProseMirrorNode[]): ProseMirrorNode {
  return schema.node(GALLERY_NODE, { id, data: { layout: "carousel" } }, items);
}

function documentNode(gallery: ProseMirrorNode): ProseMirrorNode {
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: makeId("co", 1), mode: "page" }, [
      schema.node("surface", { id: makeId("su", 1), variant: "page-default" }, [
        schema.node("region", { id: makeId("re", 1), role: "main" }, [gallery]),
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
  galleryId: EmbeddedNodeId,
  items: readonly ProseMirrorNode[],
  revision: number,
) {
  const doc = documentNode(galleryNode(galleryId, items));
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
        nodeType === GALLERY_NODE
          ? {
              nodeType,
              title: galleryDefinition.title,
              isAssessment: false,
              ...(galleryDefinition.documentSemantics
                ? { documentSemantics: galleryDefinition.documentSemantics }
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
  if (!courseStructure) throw new Error("Invalid Gallery semantics fixture.");
  return courseStructure;
}

function makeId(prefix: string, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `${prefix}${String(ordinal).padStart(12 - prefix.length, "0")}`,
  );
}
