import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { EmbeddedNodeId, PresentationVisualCapabilityId } from "@scaffold/contracts";

export const PRESENTATION_VISUAL_ACTION_IDS = Object.freeze([
  "reveal",
  "hide",
  "emphasize",
] as const satisfies readonly PresentationVisualCapabilityId[]);

/** Pure projection helpers supplied by Core while evaluating one owning definition. */
export interface DocumentTreeBuildHelpers {
  projectDirectOwnedMembers(input: ProjectDirectOwnedMembersInput): readonly ExposedDocumentChild[];
  projectStandardRichText(contentRoot?: ProseMirrorNode): readonly ExposedDocumentChild[];
  projectStructuralChildren(contentRoot?: ProseMirrorNode): readonly ExposedDocumentChild[];
}

export interface DirectOwnedMemberDescriptionInput {
  readonly node: ProseMirrorNode;
  readonly ordinal: number;
}

export interface DirectOwnedMemberDescription {
  readonly label?: string;
  readonly summary?: string;
  readonly authoringAnchorId?: EmbeddedNodeId;
  readonly activation?: readonly DocumentItemActivation[];
}

export interface ProjectDirectOwnedMembersInput {
  readonly nodeType: string;
  readonly describe: (input: DirectOwnedMemberDescriptionInput) => DirectOwnedMemberDescription;
}

export interface DocumentTreeOwnerInput {
  readonly owner: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly definitionId: string;
  readonly helpers: DocumentTreeBuildHelpers;
}

export interface DocumentTreeItemDescription {
  /** Privacy-safe author-facing label for this owner instance. */
  readonly label?: string;
  /** Privacy-safe, bounded author-facing summary for this owner instance. */
  readonly summary?: string;
}

export type DocumentTreeItemDescriber = (
  input: DocumentTreeOwnerInput,
) => DocumentTreeItemDescription;

export interface DocumentItemPresentation {
  readonly actionIds: readonly PresentationVisualCapabilityId[];
  readonly reconstructableCommandTypes?: readonly string[];
  readonly disabledReason?: string;
}

export interface DocumentItemActivation {
  readonly ownerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
  readonly ownerKind: "surface" | "layout" | "region" | "cell" | "section" | "block";
}

export interface ExposedDocumentChild {
  /** Position relative to the start of the owning node's content. */
  readonly relativePos: number;
  /** Core classifies structural nodes and mounted Blocks when this is omitted. */
  readonly treeRole?: "rich-text" | "exposed-child";
  readonly label?: string;
  readonly summary?: string;
  readonly presentation?: DocumentItemPresentation;
  /** Semantic owner whose current location supplies authoring selection and scroll. */
  readonly authoringAnchorId?: EmbeddedNodeId;
  readonly activation?: readonly DocumentItemActivation[];
}

export interface DocumentTreeChildrenInput extends DocumentTreeOwnerInput {}

export type DocumentTreeChildrenBuilder = (
  input: DocumentTreeChildrenInput,
) => readonly ExposedDocumentChild[];

export interface DocumentTreeDefinition {
  readonly describe?: DocumentTreeItemDescriber;
  readonly presentation?: DocumentItemPresentation;
  readonly projectChildren?: DocumentTreeChildrenBuilder;
}
