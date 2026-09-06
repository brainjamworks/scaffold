import type { ScaffoldDocumentContent } from "@scaffold/contracts";
import type { Schema } from "@tiptap/pm/model";

import {
  createControlCapabilityCatalogue,
  type ControlCapabilityCatalogue,
} from "@/document/control-binding";
import { projectAuthoringCourseStructure } from "@/document/authoring/course-structure/project-authoring-course-structure";
import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import {
  buildDocumentTree,
  type DocumentTreeDefinitionLookup,
  type DocumentTreeSnapshot,
} from "@/document/model/document-tree";

export interface CompilationSnapshot {
  readonly revision: number;
  readonly courseStructure: ProjectedCourseStructure;
  readonly documentTree: DocumentTreeSnapshot;
  readonly controlCapabilities: ControlCapabilityCatalogue;
}

export function buildCompilationSnapshot(
  document: ScaffoldDocumentContent,
  revision: number,
  schema: Schema,
  definitions: DocumentTreeDefinitionLookup,
): CompilationSnapshot {
  const node = schema.nodeFromJSON(document);
  const courseStructure = projectAuthoringCourseStructure(node);
  if (!courseStructure) {
    throw new Error("Cannot build a compilation snapshot from invalid Course Structure.");
  }
  const documentTree = buildDocumentTree({
    doc: node,
    courseStructure,
    definitions,
    revision,
  });
  const controlCapabilities = createControlCapabilityCatalogue({
    snapshot: documentTree,
    definitions,
  });
  return Object.freeze({ revision, courseStructure, documentTree, controlCapabilities });
}
