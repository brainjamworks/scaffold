import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface StableNodeIdentity {
  id: string;
  nodeType: string;
}

export type StableNodeResolution =
  | { status: "ready"; node: ProseMirrorNode; pos: number }
  | { status: "missing" }
  | { status: "invalid"; reason: "duplicate_id" | "wrong_node_type" };

export type ResolvedStableNode = Extract<StableNodeResolution, { status: "ready" }>;

export function resolveStableNode(
  doc: ProseMirrorNode,
  identity: StableNodeIdentity,
): StableNodeResolution {
  const matches: { node: ProseMirrorNode; pos: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== identity.id) return true;

    if (matches.length < 2) matches.push({ node, pos });
    return true;
  });

  const [match, duplicate] = matches;
  if (!match) return { status: "missing" };
  if (duplicate) return { status: "invalid", reason: "duplicate_id" };
  if (match.node.type.name !== identity.nodeType) {
    return { status: "invalid", reason: "wrong_node_type" };
  }

  return { status: "ready", ...match };
}
