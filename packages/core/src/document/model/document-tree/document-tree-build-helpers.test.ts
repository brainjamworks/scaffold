import { Schema, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it, vi } from "vite-plus/test";

import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { DocumentTreeChildrenBuilder } from "./definition";
import type { DocumentTreeDefinitionLookup } from "./definition-lookup";
import { createDocumentTreeBuildHelpers } from "./document-tree-build-helpers";

const schema = new Schema({
  nodes: {
    doc: { content: "owner" },
    text: { group: "inline" },
    owner: { content: "block*" },
    member: { group: "block", content: "block*", attrs: { id: { default: null } } },
    wrapper: { group: "block", content: "block*" },
    paragraph: { group: "block", content: "inline*" },
  },
});

const definitions: DocumentTreeDefinitionLookup = Object.freeze({
  blocks: Object.freeze({ get: () => undefined }),
  layouts: Object.freeze({ get: () => undefined }),
  surfaces: Object.freeze({ get: () => undefined }),
});

describe("semantic projection helpers", () => {
  it("guarantees direct-member projection to feature projectors", () => {
    const projectChildren: DocumentTreeChildrenBuilder = ({ helpers }) =>
      helpers.projectDirectOwnedMembers({
        nodeType: "member",
        describe: ({ ordinal }) => ({ label: `Member ${ordinal + 1}` }),
      });
    const owner = schema.node("owner", null, [member("member00001")]);

    expect(
      projectChildren({
        owner,
        ownerId: "owner0000001" as EmbeddedNodeId,
        definitionId: "owner",
        helpers: createDocumentTreeBuildHelpers(owner, definitions),
      }),
    ).toEqual([
      {
        relativePos: 0,
        treeRole: "exposed-child",
        label: "Member 1",
      },
    ]);
  });

  it("projects matching direct members in document order with descriptions and matching ordinals", () => {
    const before = paragraph("Before");
    const first = member("member00001", [paragraph("First child")]);
    const wrapper = schema.node("wrapper", null, [member("nested00001")]);
    const second = member("member00002");
    const owner = schema.node("owner", null, [before, first, wrapper, second]);
    const activation = Object.freeze([
      Object.freeze({
        ownerId: "owner0000001" as EmbeddedNodeId,
        childId: "member00001" as EmbeddedNodeId,
        ownerKind: "block" as const,
      }),
    ]);
    const describe = vi.fn(({ node, ordinal }: { node: ProseMirrorNode; ordinal: number }) => ({
      label: `Member ${ordinal + 1}`,
      summary: node.attrs["id"] as string,
      authoringAnchorId: "owner0000001" as EmbeddedNodeId,
      activation,
      presentation: { actionIds: ["must-not-leak"] as const },
      relativePos: 999,
      treeRole: "rich-text",
    }));

    const candidates = createDocumentTreeBuildHelpers(owner, definitions).projectDirectOwnedMembers(
      { nodeType: "member", describe },
    );

    expect(candidates).toEqual([
      {
        relativePos: before.nodeSize,
        treeRole: "exposed-child",
        label: "Member 1",
        summary: "member00001",
        authoringAnchorId: "owner0000001",
        activation,
      },
      {
        relativePos: before.nodeSize + first.nodeSize + wrapper.nodeSize,
        treeRole: "exposed-child",
        label: "Member 2",
        summary: "member00002",
        authoringAnchorId: "owner0000001",
        activation,
      },
    ]);
    expect(describe.mock.calls.map(([input]) => input.ordinal)).toEqual([0, 1]);
    expect(describe.mock.calls.map(([input]) => input.node)).toEqual([first, second]);
    expect(Object.isFrozen(candidates)).toBe(true);
    expect(candidates.every(Object.isFrozen)).toBe(true);
  });

  it("does not descend into wrappers or matching members", () => {
    const wrappedMember = member("wrapped00001");
    const nestedMember = member("nested00001");
    const directMember = member("direct00001", [nestedMember]);
    const owner = schema.node("owner", null, [
      schema.node("wrapper", null, [wrappedMember]),
      paragraph("Ignored"),
      directMember,
    ]);
    const describe = vi.fn(({ ordinal }: { ordinal: number }) => ({ label: `${ordinal}` }));

    const candidates = createDocumentTreeBuildHelpers(owner, definitions).projectDirectOwnedMembers(
      { nodeType: "member", describe },
    );

    expect(candidates).toEqual([
      {
        relativePos: owner.child(0).nodeSize + owner.child(1).nodeSize,
        treeRole: "exposed-child",
        label: "0",
      },
    ]);
    expect(describe).toHaveBeenCalledOnce();
    expect(describe).toHaveBeenCalledWith({ node: directMember, ordinal: 0 });
  });
});

function member(nodeId: string, content: readonly ProseMirrorNode[] = []): ProseMirrorNode {
  return schema.node("member", { id: nodeId }, content);
}

function paragraph(text: string): ProseMirrorNode {
  return schema.node("paragraph", null, [schema.text(text)]);
}
