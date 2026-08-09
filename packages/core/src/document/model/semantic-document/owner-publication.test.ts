import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";

import { projectCourseStructure } from "../course-structure/course-structure-projection";
import type { PublishedSemanticChild } from "./definition";
import type { SemanticBlockDefinition, SemanticDefinitionLookup } from "./definition-lookup";
import { projectSemanticDocument } from "./project-semantic-document";

const IDS = {
  course: id("course000001"),
  surface: id("surface00001"),
  owner: id("ownerblock01"),
  container: id("container001"),
  paragraph: id("paragraph001"),
  nestedBlock: id("nestedblock1"),
  nestedParagraph: id("nestedpara01"),
  malformed: "bad" as EmbeddedNodeId,
  duplicate: id("duplicate001"),
  invalidActivation: id("invalidact01"),
  invalidAnchor: id("invalidanc01"),
  throwingOwner: id("throwblock01"),
} as const;

const schema = new Schema({
  nodes: {
    doc: { content: "courseDocument" },
    text: { group: "inline" },
    courseDocument: {
      content: "surface+",
      attrs: { id: { default: null }, mode: { default: "page" } },
    },
    surface: {
      content: "block+",
      attrs: { id: { default: null }, variant: { default: null } },
    },
    owner_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    nested_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    throwing_block: {
      group: "block",
      content: "block*",
      attrs: { id: { default: null } },
    },
    published_container: {
      group: "block",
      content: "block*",
      selectable: false,
      attrs: { id: { default: null } },
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { id: { default: null } },
    },
  },
});

describe("owner-bounded semantic publication", () => {
  it("describes an owner and preserves approved candidate nesting and activation", () => {
    const describeOwner = vi.fn(() => ({ label: "Card: Welcome", summary: "Safe summary" }));
    const projectChildren = vi.fn(({ owner }: { readonly owner: ProseMirrorNode }) =>
      Object.freeze([
        {
          relativePos: relativePosOf(owner, IDS.container),
          semanticRole: "published-child" as const,
          label: "Front",
        },
        {
          relativePos: relativePosOf(owner, IDS.paragraph),
          semanticRole: "rich-text" as const,
          label: "Welcome",
          activation: [{ ownerId: IDS.owner, childId: IDS.container, ownerKind: "block" as const }],
        },
        { relativePos: relativePosOf(owner, IDS.nestedBlock) },
      ]),
    );
    const doc = documentNode([
      node("owner_block", IDS.owner, [
        node("published_container", IDS.container, [paragraph(IDS.paragraph, "Welcome")]),
        node("nested_block", IDS.nestedBlock),
      ]),
    ]);

    const snapshot = project(doc, {
      blocks: [
        [
          "owner_block",
          {
            nodeType: "owner_block",
            title: "Card",
            isAssessment: false,
            documentSemantics: { describe: describeOwner, projectChildren },
          },
        ],
        ["nested_block", { nodeType: "nested_block", title: "Nested card", isAssessment: false }],
      ],
    });

    expect(snapshot.itemById.get(IDS.owner)).toMatchObject({
      label: "Card: Welcome",
      summary: "Safe summary",
    });
    expect(snapshot.itemById.get(IDS.owner)?.children.map(({ id }) => id)).toEqual([
      IDS.container,
      IDS.nestedBlock,
    ]);
    expect(snapshot.itemById.get(IDS.container)?.children.map(({ id }) => id)).toEqual([
      IDS.paragraph,
    ]);
    expect(snapshot.itemById.get(IDS.paragraph)?.kind).toBe("rich-text");
    expect(snapshot.itemById.get(IDS.nestedBlock)).toMatchObject({
      kind: "block",
      label: "Nested card",
    });
    expect(snapshot.locationById.get(IDS.paragraph)?.activationPath).toEqual([
      { ownerId: IDS.owner, childId: IDS.container, ownerKind: "block" },
    ]);
    expect(describeOwner).toHaveBeenCalledOnce();
    expect(projectChildren).toHaveBeenCalledOnce();
    expect(projectChildren.mock.calls[0]?.[0]).toMatchObject({
      ownerId: IDS.owner,
      definitionId: "owner_block",
      helpers: {},
    });
  });

  it("contains malformed candidates, invalid activation and duplicate publication", () => {
    const doc = documentNode([
      node("owner_block", IDS.owner, [
        paragraph(IDS.duplicate, "Public once"),
        node("nested_block", IDS.nestedBlock, [
          paragraph(IDS.nestedParagraph, "Private nested prose"),
        ]),
        paragraph(IDS.malformed, "Malformed identity"),
        paragraph(IDS.invalidActivation, "Invalid activation"),
        paragraph(IDS.invalidAnchor, "Invalid anchor"),
      ]),
    ]);
    const projectChildren = ({ owner }: { readonly owner: ProseMirrorNode }) =>
      [
        richText(owner, IDS.duplicate, "Public once"),
        richText(owner, IDS.duplicate, "Duplicate"),
        { relativePos: owner.content.size + 1, semanticRole: "published-child" as const },
        richText(owner, IDS.malformed, "Malformed"),
        richText(owner, IDS.nestedParagraph, "Must remain private"),
        {
          ...richText(owner, IDS.invalidActivation, "Bad activation"),
          activation: [
            {
              ownerId: id("unrelated001"),
              childId: IDS.invalidActivation,
              ownerKind: "block" as const,
            },
          ],
        },
        {
          relativePos: relativePosOf(owner, IDS.invalidAnchor),
          semanticRole: "published-child" as const,
          label: "Bad anchor",
          authoringAnchorId: IDS.container,
        },
      ] satisfies readonly PublishedSemanticChild[];

    const snapshot = project(doc, {
      blocks: [
        [
          "owner_block",
          {
            nodeType: "owner_block",
            title: "Card",
            isAssessment: false,
            documentSemantics: { projectChildren },
          },
        ],
        ["nested_block", { nodeType: "nested_block", title: "Nested card", isAssessment: false }],
      ],
    });

    expect(snapshot.itemById.has(IDS.duplicate)).toBe(true);
    expect(snapshot.itemById.has(IDS.malformed)).toBe(false);
    expect(snapshot.itemById.has(IDS.nestedBlock)).toBe(false);
    expect(snapshot.itemById.has(IDS.nestedParagraph)).toBe(false);
    expect(snapshot.itemById.has(IDS.invalidActivation)).toBe(false);
    expect(snapshot.itemById.has(IDS.invalidAnchor)).toBe(false);
    expect(snapshot.diagnostics.map(({ code }) => code)).toEqual([
      "duplicate-published-candidate",
      "invalid-published-candidate",
      "invalid-published-candidate",
      "invalid-published-candidate",
      "invalid-activation-relationship",
      "invalid-published-candidate",
    ]);
    expect(snapshot.diagnostics).not.toContainEqual(
      expect.objectContaining({ candidateNodeType: "Private nested prose" }),
    );
  });

  it("contains callback exceptions and keeps the owner navigable without fallback traversal", () => {
    const doc = documentNode([
      node("throwing_block", IDS.throwingOwner, [paragraph(IDS.paragraph, "Private answer")]),
    ]);
    const snapshot = project(doc, {
      blocks: [
        [
          "throwing_block",
          {
            nodeType: "throwing_block",
            title: "Throwing card",
            isAssessment: false,
            documentSemantics: {
              describe: () => {
                throw new Error("private answer payload");
              },
              projectChildren: () => {
                throw new Error("private feedback payload");
              },
            },
          },
        ],
      ],
    });

    expect(snapshot.itemById.get(IDS.throwingOwner)?.label).toBe("Throwing card");
    expect(snapshot.itemById.has(IDS.paragraph)).toBe(false);
    expect(snapshot.diagnostics).toEqual([
      {
        code: "definition-callback-failed",
        ownerId: IDS.throwingOwner,
        candidateId: null,
        ownerNodeType: "throwing_block",
        candidateNodeType: null,
      },
      {
        code: "definition-callback-failed",
        ownerId: IDS.throwingOwner,
        candidateId: null,
        ownerNodeType: "throwing_block",
        candidateNodeType: null,
      },
    ]);
    expect(JSON.stringify(snapshot.diagnostics)).not.toContain("private answer payload");
    expect(JSON.stringify(snapshot.diagnostics)).not.toContain("private feedback payload");
  });
});

function project(
  doc: ProseMirrorNode,
  input: {
    readonly blocks: readonly (readonly [string, SemanticBlockDefinition])[];
  },
) {
  const blocks = new Map(input.blocks);
  const definitions: SemanticDefinitionLookup = Object.freeze({
    blocks: Object.freeze({ get: (nodeType: string) => blocks.get(nodeType) }),
    layouts: Object.freeze({ get: () => undefined }),
    surfaces: Object.freeze({
      get: (variant: string) =>
        variant === "page-default" ? { id: "page-default", title: "Page" } : undefined,
    }),
  });
  const courseStructure = projectCourseStructure(doc.toJSON());
  if (!courseStructure) throw new Error("Invalid test Course Structure.");
  return projectSemanticDocument({ doc, courseStructure, definitions, revision: 21 });
}

function documentNode(children: readonly ProseMirrorNode[]) {
  const surface = schema.node("surface", { id: IDS.surface, variant: "page-default" }, children);
  return schema.node("doc", null, [
    schema.node("courseDocument", { id: IDS.course, mode: "page" }, [surface]),
  ]);
}

function node(
  type: string,
  nodeId: EmbeddedNodeId,
  content: readonly ProseMirrorNode[] = [],
): ProseMirrorNode {
  return schema.node(type, { id: nodeId }, content);
}

function paragraph(nodeId: EmbeddedNodeId, text: string): ProseMirrorNode {
  return schema.node("paragraph", { id: nodeId }, [schema.text(text)]);
}

function richText(
  owner: ProseMirrorNode,
  candidateId: EmbeddedNodeId,
  label: string,
): PublishedSemanticChild {
  return {
    relativePos: relativePosOf(owner, candidateId),
    semanticRole: "rich-text",
    label,
  };
}

function relativePosOf(owner: ProseMirrorNode, candidateId: EmbeddedNodeId): number {
  let result = -1;
  owner.descendants((node, pos) => {
    if (node.attrs["id"] === candidateId) {
      result = pos;
      return false;
    }
    return result === -1;
  });
  return result;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
