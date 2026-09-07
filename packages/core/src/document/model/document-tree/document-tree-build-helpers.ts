import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type {
  ProjectDirectOwnedMembersInput,
  ExposedDocumentChild,
  DocumentTreeBuildHelpers,
} from "./definition";
import type { DocumentTreeDefinitionLookup } from "./definition-lookup";
import { projectStandardRichText } from "./rich-text-document-tree-children";
import { LAYER_NODE_TYPE } from "../nodes/structural-node-types";

export function createDocumentTreeBuildHelpers(
  owner: ProseMirrorNode,
  definitions: DocumentTreeDefinitionLookup,
): DocumentTreeBuildHelpers {
  return Object.freeze({
    projectDirectOwnedMembers: (input: ProjectDirectOwnedMembersInput) =>
      projectDirectOwnedMembers(owner, input),
    projectStandardRichText: (contentRoot?: ProseMirrorNode) =>
      projectStandardRichText({ owner, ...(contentRoot ? { contentRoot } : {}) }),
    projectStructuralChildren: (contentRoot?: ProseMirrorNode) =>
      projectStructuralChildren(owner, definitions, contentRoot),
  });
}

// TODO(semantic-publication): When the next conventional direct-member family is added,
// consider replacing repetitive owner projectors with opt-in semantic metadata on member node
// types and generic projection. Retain custom projectors for derived or virtual members; DOM
// attributes should bind published addresses to mounted elements, not define public semantics.
function projectDirectOwnedMembers(
  owner: ProseMirrorNode,
  input: ProjectDirectOwnedMembersInput,
): readonly ExposedDocumentChild[] {
  const candidates: ExposedDocumentChild[] = [];
  let ordinal = 0;

  owner.forEach((node, relativePos) => {
    if (node.type.name !== input.nodeType) return;
    const { label, summary, authoringAnchorId, activation } = input.describe({ node, ordinal });
    candidates.push(
      Object.freeze({
        relativePos,
        treeRole: "exposed-child",
        ...(label === undefined ? {} : { label }),
        ...(summary === undefined ? {} : { summary }),
        ...(authoringAnchorId === undefined ? {} : { authoringAnchorId }),
        ...(activation === undefined ? {} : { activation }),
      }),
    );
    ordinal += 1;
  });

  return Object.freeze(candidates);
}

function projectStructuralChildren(
  owner: ProseMirrorNode,
  definitions: DocumentTreeDefinitionLookup,
  contentRoot = owner,
): readonly ExposedDocumentChild[] {
  const contentStart = resolveContentStart(owner, contentRoot);
  if (contentStart === null) return Object.freeze([]);
  const candidates: ExposedDocumentChild[] = [];

  const visit = (parent: ProseMirrorNode, parentContentStart: number): void => {
    let offset = 0;
    parent.forEach((node) => {
      const relativePos = parentContentStart + offset;
      if (isStructuralRoot(node, parent, definitions)) {
        candidates.push(Object.freeze({ relativePos }));
      } else if (!node.isText) {
        visit(node, relativePos + 1);
      }
      offset += node.nodeSize;
    });
  };

  visit(contentRoot, contentStart);
  return Object.freeze(candidates);
}

function isStructuralRoot(
  node: ProseMirrorNode,
  parent: ProseMirrorNode,
  definitions: DocumentTreeDefinitionLookup,
): boolean {
  if (definitions.blocks.get(node.type.name)) return true;
  if (node.type.name === "surface" || node.type.name === "layout" || node.type.name === "region") {
    return true;
  }
  if (node.type.name === "section") return parent.type.name === "layout";
  if (node.type.name === "grid") return true;
  if (node.type.name === LAYER_NODE_TYPE) return true;
  return node.type.name === "cell" && parent.type.name === "grid";
}

function resolveContentStart(owner: ProseMirrorNode, contentRoot: ProseMirrorNode): number | null {
  if (contentRoot === owner) return 0;
  let contentStart: number | null = null;
  owner.descendants((node, pos) => {
    if (node === contentRoot) {
      contentStart = pos + 1;
      return false;
    }
    return contentStart === null;
  });
  return contentStart;
}
