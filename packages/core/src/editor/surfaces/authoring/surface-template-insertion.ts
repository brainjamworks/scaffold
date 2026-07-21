import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { CourseModeSchema, type CourseMode } from "@/schemas/course-document";
import { createStableId } from "@/document/model/identity/stable-ids";
import { setTextSelectionNearInTransaction } from "@/editor/selection/selection-transactions";

import type { SurfaceVariantRegistry } from "../model/surface-variant-registry";

interface SurfaceRecord {
  node: ProseMirrorNode;
  pos: number;
}

interface CourseDocumentRecord {
  mode: CourseMode;
  surfaces: SurfaceRecord[];
}

export interface InsertSurfaceTemplateAfterSurfaceInput {
  afterSurfaceId: string;
  variantId: string;
}

export function insertSurfaceTemplateAfterSurface(
  editor: Editor,
  surfaceVariants: SurfaceVariantRegistry,
  input: InsertSurfaceTemplateAfterSurfaceInput,
): boolean {
  const courseDocument = getCourseDocument(editor);
  if (!courseDocument) return false;

  const definition = surfaceVariants.get(input.variantId);
  if (
    !definition ||
    !definition.modes.some((definitionMode) => definitionMode === courseDocument.mode)
  ) {
    return false;
  }

  const previousSurface = courseDocument.surfaces.find(
    (surface) => surface.node.attrs["id"] === input.afterSurfaceId,
  );
  if (!previousSurface) return false;

  const insertPos = previousSurface.pos + previousSurface.node.nodeSize;
  const nextSurface = editor.state.schema.nodeFromJSON(
    definition.createSurface({ surfaceId: createStableId() }),
  );
  const tr = editor.state.tr.insert(insertPos, nextSurface);
  const selectionPos = Math.min(insertPos + 2, tr.doc.content.size);

  setTextSelectionNearInTransaction(tr, selectionPos, 1);

  if (!tr.docChanged) return false;

  try {
    tr.doc.check();
  } catch {
    return false;
  }

  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

function getCourseDocument(editor: Editor): CourseDocumentRecord | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const parsedMode = CourseModeSchema.safeParse(courseDocument.attrs["mode"]);
  if (!parsedMode.success) return null;

  const surfaces: SurfaceRecord[] = [];
  let childPos = 1;

  for (let index = 0; index < courseDocument.childCount; index += 1) {
    const child = courseDocument.child(index);
    if (child.type.name === "surface") {
      surfaces.push({ node: child, pos: childPos });
    }
    childPos += child.nodeSize;
  }

  return {
    mode: parsedMode.data,
    surfaces,
  };
}
