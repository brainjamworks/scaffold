import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { projectCourseStructure } from "@/document/model/course-structure/course-structure-projection";
import { projectSemanticDocument } from "@/document/model/semantic-document/project-semantic-document";
import { emptyGalleryItemData } from "@/editor/blocks/figure-composition/gallery/content";

export type SemanticLifecycleMember = "first" | "second" | "added";
export type SemanticLifecycleOwnerPosition = "before-sibling" | "after-sibling";

export interface ApprovedSemanticMemberFamilyCase {
  readonly key: string;
  readonly label: string;
  readonly labelPrefix: string;
  readonly ownerNodeType: string;
  readonly memberNodeType: string;
  readonly ownerId: EmbeddedNodeId;
  readonly memberIds: Readonly<Record<SemanticLifecycleMember, EmbeddedNodeId>>;
  readonly unrelatedSiblingId: EmbeddedNodeId;
  createOwner(members?: readonly SemanticLifecycleMember[]): ProseMirrorNode;
  createDocument(input?: {
    readonly members?: readonly SemanticLifecycleMember[];
    readonly ownerPosition?: SemanticLifecycleOwnerPosition;
  }): ProseMirrorNode;
}

interface FamilySpec {
  readonly key: string;
  readonly label: string;
  readonly labelPrefix: string;
  readonly ownerNodeType: string;
  readonly memberNodeType: string;
  readonly memberContainerNodeType?: string;
  readonly createMemberWhenEmpty?: () => JSONContent;
}

const FAMILY_SPECS: readonly FamilySpec[] = Object.freeze([
  {
    key: "annotated-figure-annotations",
    label: "Annotated Figure annotations",
    labelPrefix: "Annotation",
    ownerNodeType: "annotated_figure",
    memberNodeType: "annotated_figure_annotation",
    memberContainerNodeType: "annotated_figure_legend",
    createMemberWhenEmpty: () => ({
      type: "annotated_figure_annotation",
      attrs: { title: "", x: 25, y: 75 },
      content: [{ type: "paragraph" }],
    }),
  },
  {
    key: "flashcard-cards",
    label: "Flashcard cards",
    labelPrefix: "Card",
    ownerNodeType: "flashcard",
    memberNodeType: "flashcard_card",
  },
  {
    key: "gallery-items",
    label: "Gallery items",
    labelPrefix: "Gallery item",
    ownerNodeType: "gallery",
    memberNodeType: "gallery_item",
    createMemberWhenEmpty: () => ({
      type: "gallery_item",
      attrs: { data: emptyGalleryItemData() },
    }),
  },
  {
    key: "checklist-items",
    label: "Checklist items",
    labelPrefix: "Checklist item",
    ownerNodeType: "checklist",
    memberNodeType: "checklist_item",
  },
  {
    key: "comparison-rows",
    label: "Comparison rows",
    labelPrefix: "Comparison row",
    ownerNodeType: "comparison",
    memberNodeType: "comparison_row",
  },
  {
    key: "glossary-entries",
    label: "Glossary entries",
    labelPrefix: "Glossary entry",
    ownerNodeType: "glossary",
    memberNodeType: "glossary_entry",
  },
  {
    key: "key-value-rows",
    label: "Key-value rows",
    labelPrefix: "Key-value row",
    ownerNodeType: "key_value_list",
    memberNodeType: "key_value_row",
  },
  {
    key: "numbered-list-items",
    label: "Numbered List items",
    labelPrefix: "Numbered list item",
    ownerNodeType: "numbered_list",
    memberNodeType: "numbered_list_item",
  },
  {
    key: "table-rows",
    label: "Table rows",
    labelPrefix: "Table row",
    ownerNodeType: "table",
    memberNodeType: "tableRow",
  },
  {
    key: "process-flow-steps",
    label: "Process Flow steps",
    labelPrefix: "Process flow step",
    ownerNodeType: "process_flow",
    memberNodeType: "process_flow_step",
  },
  {
    key: "roadmap-milestones",
    label: "Roadmap milestones",
    labelPrefix: "Roadmap milestone",
    ownerNodeType: "roadmap",
    memberNodeType: "roadmap_milestone",
  },
  {
    key: "timeline-entries",
    label: "Timeline entries",
    labelPrefix: "Timeline entry",
    ownerNodeType: "timeline",
    memberNodeType: "timeline_item",
  },
]);
const DEFAULT_MEMBERS = ["first", "second"] as const;

export const SEMANTIC_LIFECYCLE_APPLICATION = createScaffoldApplication();
export const SEMANTIC_LIFECYCLE_AUTHORING_ENVIRONMENT =
  createCourseDocumentAuthoringEnvironment({
    composition: SEMANTIC_LIFECYCLE_APPLICATION.authoring,
    editable: true,
  });
export const SEMANTIC_LIFECYCLE_AUTHORING_STATE =
  getCourseDocumentAuthoringEnvironmentState(SEMANTIC_LIFECYCLE_AUTHORING_ENVIRONMENT);

export const APPROVED_SEMANTIC_MEMBER_FAMILY_CASES: readonly ApprovedSemanticMemberFamilyCase[] =
  Object.freeze(FAMILY_SPECS.map(createFamilyCase));

export function createSemanticLifecycleDocument(
  content: readonly ProseMirrorNode[],
): ProseMirrorNode {
  const { schema } = SEMANTIC_LIFECYCLE_AUTHORING_STATE;
  return schema.node("doc", null, [
    schema.node(
      "courseDocument",
      { id: fixtureId(0, 1), mode: "page" },
      [
        schema.node(
          "surface",
          { id: fixtureId(0, 2), variant: "page-default", settings: {} },
          [
            schema.node(
              "region",
              { id: fixtureId(0, 3), role: "main" },
              content,
            ),
          ],
        ),
      ],
    ),
  ]);
}

export function createCompleteSemanticLifecycleDocument(
  membersByFamily: Readonly<Partial<Record<string, readonly SemanticLifecycleMember[]>>> = {},
): ProseMirrorNode {
  return createSemanticLifecycleDocument(
    APPROVED_SEMANTIC_MEMBER_FAMILY_CASES.map((family) =>
      family.createOwner(membersByFamily[family.key]),
    ),
  );
}

export function projectSemanticLifecycleDocument(doc: ProseMirrorNode, revision: number) {
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid semantic publication lifecycle fixture.");
  return projectSemanticDocument({
    doc,
    courseStructure,
    definitions: SEMANTIC_LIFECYCLE_APPLICATION.authoring.documentSemantics,
    revision,
  });
}

export function requireLifecycleNodeById(
  doc: ProseMirrorNode,
  id: EmbeddedNodeId,
): { readonly node: ProseMirrorNode; readonly pos: number } {
  let found: { readonly node: ProseMirrorNode; readonly pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = { node, pos };
    return false;
  });
  if (!found) throw new Error(`Expected lifecycle fixture node ${id}.`);
  return found;
}

function createFamilyCase(spec: FamilySpec, familyIndex: number): ApprovedSemanticMemberFamilyCase {
  const ordinal = familyIndex + 1;
  const definition = SEMANTIC_LIFECYCLE_APPLICATION.capabilities.blocks.registry.getByNodeType(
    spec.ownerNodeType,
  );
  const inserted = definition?.insert?.content() as JSONContent | undefined;
  if (!definition || !inserted || inserted.type !== spec.ownerNodeType) {
    throw new Error(`Missing mounted insertion content for ${spec.label}.`);
  }

  const rawMember = findFirstNode(inserted, spec.memberNodeType) ?? spec.createMemberWhenEmpty?.();
  if (!rawMember) throw new Error(`Missing valid member seed for ${spec.label}.`);

  const ownerId = fixtureId(ordinal, 1);
  const memberIds = Object.freeze({
    first: fixtureId(ordinal, 101),
    second: fixtureId(ordinal, 201),
    added: fixtureId(ordinal, 301),
  });
  const unrelatedSiblingId = fixtureId(ordinal, 901);
  const ownerTemplate = deepClone(inserted);
  replaceMembers(ownerTemplate, spec, []);
  assignPersistedIds(ownerTemplate, ordinal, 2, ownerId);

  const memberTemplates: Readonly<Record<SemanticLifecycleMember, JSONContent>> = Object.freeze({
    first: createMemberTemplate(rawMember, ordinal, 102, memberIds.first),
    second: createMemberTemplate(rawMember, ordinal, 202, memberIds.second),
    added: createMemberTemplate(rawMember, ordinal, 302, memberIds.added),
  });

  const createOwner = (
    members: readonly SemanticLifecycleMember[] = DEFAULT_MEMBERS,
  ): ProseMirrorNode => {
    const json = deepClone(ownerTemplate);
    replaceMembers(
      json,
      spec,
      members.map((member) => deepClone(memberTemplates[member])),
    );
    return SEMANTIC_LIFECYCLE_AUTHORING_STATE.schema.nodeFromJSON(json);
  };
  const createDocument: ApprovedSemanticMemberFamilyCase["createDocument"] = (input = {}) => {
    const members = input.members ?? DEFAULT_MEMBERS;
    const ownerPosition = input.ownerPosition ?? "before-sibling";
    const owner = createOwner(members);
    const sibling = paragraphNode(unrelatedSiblingId, `Unrelated sibling for ${spec.label}`);
    return createSemanticLifecycleDocument(
      ownerPosition === "before-sibling" ? [owner, sibling] : [sibling, owner],
    );
  };

  return Object.freeze({
    ...spec,
    ownerId,
    memberIds,
    unrelatedSiblingId,
    createOwner,
    createDocument,
  });
}

function createMemberTemplate(
  seed: JSONContent,
  familyIndex: number,
  firstPrivateOrdinal: number,
  publicId: EmbeddedNodeId,
): JSONContent {
  const member = deepClone(seed);
  assignPersistedIds(member, familyIndex, firstPrivateOrdinal, publicId);
  return member;
}

function replaceMembers(
  owner: JSONContent,
  spec: FamilySpec,
  members: readonly JSONContent[],
): void {
  const container = findFirstNode(owner, spec.memberContainerNodeType ?? spec.ownerNodeType);
  if (!container) throw new Error(`Missing member container for ${spec.label}.`);
  const content = container.content ?? [];
  const firstMemberIndex = content.findIndex(({ type }) => type === spec.memberNodeType);
  const insertionIndex = firstMemberIndex < 0 ? content.length : firstMemberIndex;
  const retained = content.filter(({ type }) => type !== spec.memberNodeType);
  retained.splice(insertionIndex, 0, ...members);
  container.content = retained;
}

function findFirstNode(node: JSONContent, nodeType: string): JSONContent | undefined {
  if (node.type === nodeType) return node;
  for (const child of node.content ?? []) {
    const found = findFirstNode(child, nodeType);
    if (found) return found;
  }
  return undefined;
}

function assignPersistedIds(
  node: JSONContent,
  familyIndex: number,
  firstOrdinal: number,
  rootId: EmbeddedNodeId,
): number {
  let nextOrdinal = firstOrdinal;
  const visit = (current: JSONContent, isRoot: boolean): void => {
    if (current.type !== "doc" && current.type !== "text") {
      current.attrs = { ...current.attrs, id: isRoot ? rootId : fixtureId(familyIndex, nextOrdinal) };
      if (!isRoot) nextOrdinal += 1;
    }
    for (const child of current.content ?? []) visit(child, false);
  };
  visit(node, true);
  return nextOrdinal;
}

function paragraphNode(id: EmbeddedNodeId, text: string): ProseMirrorNode {
  const { schema } = SEMANTIC_LIFECYCLE_AUTHORING_STATE;
  return schema.node("paragraph", { id }, [schema.text(text)]);
}

function fixtureId(familyIndex: number, ordinal: number): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(
    `lc${String(familyIndex).padStart(2, "0")}${String(ordinal).padStart(8, "0")}`,
  );
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
