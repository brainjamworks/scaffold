import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { EmbeddedNodeId } from "@scaffold/contracts";

/** Pure projection helpers supplied by Core while evaluating one owning definition. */
export interface SemanticProjectionHelpers {
  projectDirectOwnedMembers(
    input: ProjectDirectOwnedMembersInput,
  ): readonly PublishedSemanticChild[];
  projectStandardRichText(contentRoot?: ProseMirrorNode): readonly PublishedSemanticChild[];
  projectStructuralChildren(contentRoot?: ProseMirrorNode): readonly PublishedSemanticChild[];
}

export interface DirectOwnedMemberDescriptionInput {
  readonly node: ProseMirrorNode;
  readonly ordinal: number;
}

export interface DirectOwnedMemberDescription {
  readonly label?: string;
  readonly summary?: string;
  readonly authoringAnchorId?: EmbeddedNodeId;
  readonly activation?: readonly SemanticActivationRelationship[];
}

export interface ProjectDirectOwnedMembersInput {
  readonly nodeType: string;
  readonly describe: (
    input: DirectOwnedMemberDescriptionInput,
  ) => DirectOwnedMemberDescription;
}

export interface SemanticDefinitionOwnerInput {
  readonly owner: ProseMirrorNode;
  readonly ownerId: EmbeddedNodeId;
  readonly definitionId: string;
  readonly helpers: SemanticProjectionHelpers;
}

export interface SemanticItemDescription {
  /** Privacy-safe author-facing label for this owner instance. */
  readonly label?: string;
  /** Privacy-safe, bounded author-facing summary for this owner instance. */
  readonly summary?: string;
}

export type SemanticItemDescriber = (
  input: SemanticDefinitionOwnerInput,
) => SemanticItemDescription;

export interface SemanticPresentationDefinition {
  readonly actionIds: readonly string[];
  readonly disabledReason?: string;
}

export interface SemanticActivationRelationship {
  readonly ownerId: EmbeddedNodeId;
  readonly childId: EmbeddedNodeId;
  readonly ownerKind: "surface" | "layout" | "block";
}

export interface PublishedSemanticChild {
  /** Position relative to the start of the owning node's content. */
  readonly relativePos: number;
  /** Core classifies structural nodes and mounted Blocks when this is omitted. */
  readonly semanticRole?: "rich-text" | "published-child";
  readonly label?: string;
  readonly summary?: string;
  readonly presentation?: SemanticPresentationDefinition;
  /** Semantic owner whose current location supplies authoring selection and scroll. */
  readonly authoringAnchorId?: EmbeddedNodeId;
  readonly activation?: readonly SemanticActivationRelationship[];
}

export interface SemanticChildProjectionInput extends SemanticDefinitionOwnerInput {}

export type SemanticChildProjector = (
  input: SemanticChildProjectionInput,
) => readonly PublishedSemanticChild[];

export interface DocumentSemanticsDefinition {
  readonly describe?: SemanticItemDescriber;
  readonly presentation?: SemanticPresentationDefinition;
  readonly projectChildren?: SemanticChildProjector;
}
