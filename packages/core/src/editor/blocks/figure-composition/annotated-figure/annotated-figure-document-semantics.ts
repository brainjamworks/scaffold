import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjector,
  SemanticItemDescriber,
} from "@/document/model/semantic-document";
import { normalizeSemanticLabel } from "@/document/model/semantic-document/semantic-labels";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";

const describeAnnotatedFigure: SemanticItemDescriber = ({ owner }) => {
  const model = resolveAnnotatedFigureModel({ node: owner, pos: 0 });
  return Object.freeze({
    label: normalizeSemanticLabel(model?.data.alt, "Annotated figure"),
  });
};

const projectAnnotatedFigureChildren: SemanticChildProjector = ({ owner, ownerId }) => {
  const model = resolveAnnotatedFigureModel({ node: owner, pos: 0 });
  if (!model) return Object.freeze([]);

  const candidates: PublishedSemanticChild[] = [];
  for (const annotation of model.annotations) {
    const labelSource = annotation.title.trim() || annotation.captionNode.textContent;
    candidates.push(
      Object.freeze({
        relativePos: annotation.relativePos,
        semanticRole: "published-child" as const,
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

export const annotatedFigureDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  describe: describeAnnotatedFigure,
  projectChildren: projectAnnotatedFigureChildren,
});
