import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";

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

  const nextSurface = editor.state.schema.nodeFromJSON(
    definition.createSurface({ surfaceId: createEmbeddedNodeId() }),
  );

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
