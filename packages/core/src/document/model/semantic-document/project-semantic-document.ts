import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProjectedCourseStructure } from "../course-structure/course-structure-projection";
import { projectCoreStructuralItems } from "./core-structural-projection";
import type { SemanticDefinitionLookup } from "./definition-lookup";
import type { SemanticDocumentProjectionResult } from "./semantic-document-snapshot";
import { createSemanticProjectionNodeIndex } from "./projection-node-index";
import { createSemanticSnapshotBuilder } from "./snapshot-builder";

export interface ProjectSemanticDocumentInput {
  readonly doc: ProseMirrorNode;
  readonly courseStructure: ProjectedCourseStructure;
  readonly definitions: SemanticDefinitionLookup;
  readonly revision: number;
}

export function projectSemanticDocument({
  doc,
  courseStructure,
  definitions,
  revision,
}: ProjectSemanticDocumentInput): SemanticDocumentProjectionResult {
  const builder = createSemanticSnapshotBuilder({ revision, mode: courseStructure.mode });
  const nodeIndex = createSemanticProjectionNodeIndex(doc, definitions);
  projectCoreStructuralItems({ doc, courseStructure, definitions, nodeIndex, builder });
  return builder.build();
}
