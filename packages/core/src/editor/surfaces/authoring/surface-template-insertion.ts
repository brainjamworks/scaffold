import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";

import { CourseModeSchema } from "@/schemas/course-document";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";

export interface InsertSurfaceTemplateAfterSurfaceInput {
  afterSurfaceId: string;
  variantId: string;
}

export function insertSurfaceTemplateAfterSurface(
  editor: Editor,
  surfaceVariants: SurfaceVariantRegistry,
  input: InsertSurfaceTemplateAfterSurfaceInput,
): boolean {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") return false;

  const mode = CourseModeSchema.safeParse(courseDocument.attrs["mode"]);
  const afterSurfaceId = EmbeddedNodeIdSchema.safeParse(input.afterSurfaceId);
  if (!mode.success || !afterSurfaceId.success) return false;

  const definition = surfaceVariants.get(input.variantId);
  if (!definition || !definition.modes.some((definitionMode) => definitionMode === mode.data)) {
    return false;
  }

  const existingIds = collectValidNodeIds(editor.state.doc);
  const surfaceId = createUnusedNodeId(existingIds);
  const preparedSurface = prepareSurfaceTemplateIdentity(
    definition.createSurface({ surfaceId }),
    editor.state.schema,
    existingIds,
  );
  if (!preparedSurface) return false;

  const nextSurface = editor.state.schema.nodeFromJSON(preparedSurface);

  return editor
    .chain()
    .focus()
    .applyCourseStructureCommand({
      type: "surface.insert",
      surface: nextSurface,
      destination: { afterSurfaceId: afterSurfaceId.data },
    })
    .scrollIntoView()
    .run();
}

function collectValidNodeIds(doc: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    const parsed = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
    if (parsed.success) ids.add(parsed.data);
    return true;
  });
  return ids;
}

function prepareSurfaceTemplateIdentity(
  surface: JSONContent,
  schema: Schema,
  existingIds: ReadonlySet<string>,
): JSONContent | null {
  const explicitIds = new Set<string>();
  if (!reserveExplicitTemplateIds(surface, schema, existingIds, explicitIds)) return null;

  return assignMissingTemplateIds(surface, schema, new Set([...existingIds, ...explicitIds]));
}

function reserveExplicitTemplateIds(
  node: JSONContent,
  schema: Schema,
  existingIds: ReadonlySet<string>,
  explicitIds: Set<string>,
): boolean {
  const nodeType = typeof node.type === "string" ? schema.nodes[node.type] : undefined;
  if (!nodeType) return false;

  if (nodeDeclaresId(nodeType.name, nodeType.isText, nodeType.spec.attrs)) {
    const id = node.attrs?.["id"];
    if (id !== null && id !== undefined) {
      const parsed = EmbeddedNodeIdSchema.safeParse(id);
      if (!parsed.success || existingIds.has(parsed.data) || explicitIds.has(parsed.data)) {
        return false;
      }
      explicitIds.add(parsed.data);
    }
  }

  return (node.content ?? []).every((child) =>
    reserveExplicitTemplateIds(child, schema, existingIds, explicitIds),
  );
}

function assignMissingTemplateIds(
  node: JSONContent,
  schema: Schema,
  allocatedIds: Set<string>,
): JSONContent {
  const nodeType = typeof node.type === "string" ? schema.nodes[node.type] : undefined;
  const content = node.content?.map((child) =>
    assignMissingTemplateIds(child, schema, allocatedIds),
  );
  if (!nodeType || !nodeDeclaresId(nodeType.name, nodeType.isText, nodeType.spec.attrs)) {
    return { ...node, ...(content ? { content } : {}) };
  }

  const explicitId = EmbeddedNodeIdSchema.safeParse(node.attrs?.["id"]);
  const id = explicitId.success ? explicitId.data : createUnusedNodeId(allocatedIds);
  allocatedIds.add(id);
  return {
    ...node,
    attrs: { ...node.attrs, id },
    ...(content ? { content } : {}),
  };
}

function nodeDeclaresId(
  nodeName: string,
  isText: boolean,
  attrs: Readonly<Record<string, unknown>> | undefined,
): boolean {
  return nodeName !== "doc" && !isText && Object.hasOwn(attrs ?? {}, "id");
}

function createUnusedNodeId(allocatedIds: ReadonlySet<string>): EmbeddedNodeId {
  let id = createEmbeddedNodeId();
  while (allocatedIds.has(id)) id = createEmbeddedNodeId();
  return id;
}
