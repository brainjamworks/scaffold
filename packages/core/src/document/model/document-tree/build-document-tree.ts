import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProjectedCourseStructure } from "../course-structure/course-structure-projection";
import { projectCoreStructuralItems } from "./core-structural-document-tree";
import type { DocumentTreeDefinitionLookup } from "./definition-lookup";
import type { DocumentTreeBuildResult } from "./document-tree-snapshot";
import { createDocumentTreeBuildNodeIndex } from "./document-tree-build-node-index";
import { createDocumentTreeSnapshotBuilder } from "./document-tree-snapshot-builder";

export interface BuildDocumentTreeInput {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: DocumentTreeDefinitionLookup;
  readonly revision: number;
}

export function buildDocumentTree({
  doc,
  courseStructure,
  definitions,
  revision,
}: BuildDocumentTreeInput): DocumentTreeBuildResult {
  const builder = createDocumentTreeSnapshotBuilder({ revision, mode: courseStructure.mode });
  const nodeIndex = createDocumentTreeBuildNodeIndex(doc, definitions);
  projectCoreStructuralItems({ doc, courseStructure, definitions, nodeIndex, builder });
  return builder.build();
}
