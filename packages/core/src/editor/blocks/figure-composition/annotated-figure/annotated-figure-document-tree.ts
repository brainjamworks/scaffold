import type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentTreeChildrenBuilder,
  DocumentTreeItemDescriber,
} from "@/document/model/document-tree";
import { PRESENTATION_VISUAL_ACTION_IDS } from "@/document/model/document-tree/definition";
import { normalizeSemanticLabel } from "@/document/model/document-tree/semantic-labels";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";

const describeAnnotatedFigure: DocumentTreeItemDescriber = ({ owner }) => {
  const model = resolveAnnotatedFigureModel({ node: owner, pos: 0 });
  return Object.freeze({
    label: normalizeSemanticLabel(model?.data.alt, "Annotated figure"),
  });
};

const projectAnnotatedFigureChildren: DocumentTreeChildrenBuilder = ({ owner, ownerId }) => {
  const model = resolveAnnotatedFigureModel({ node: owner, pos: 0 });
  if (!model) return Object.freeze([]);

  const candidates: ExposedDocumentChild[] = [];
  for (const annotation of model.annotations) {
    const labelSource = annotation.title.trim() || annotation.captionNode.textContent;
    candidates.push(
      Object.freeze({
        relativePos: annotation.relativePos,
        treeRole: "exposed-child" as const,
        presentation: Object.freeze({ actionIds: PRESENTATION_VISUAL_ACTION_IDS }),
        label: normalizeSemanticLabel(labelSource, `Annotation ${annotation.number}`),
        authoringAnchorId: ownerId,
        activation: Object.freeze([
          Object.freeze({
            ownerId,
            childId: EmbeddedNodeIdSchema.parse(annotation.id),
            ownerKind: "block" as const,
          }),
        ]),
      }),
    );
  }
  return Object.freeze(candidates);
};

export const annotatedFigureDocumentTree: DocumentTreeDefinition = Object.freeze({
  describe: describeAnnotatedFigure,
  projectChildren: projectAnnotatedFigureChildren,
});
