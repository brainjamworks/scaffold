import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export interface StableNodeIdentity {
  id: string;
  nodeType: string;
}

export type StableNodeByIdResolution =
  | { status: "ready"; node: ProseMirrorNode; pos: number }
  | { status: "missing" }
  | { status: "duplicate" };

export type StableNodeResolution =
  | { status: "ready"; node: ProseMirrorNode; pos: number }
  | { status: "missing" }
  | { status: "invalid"; reason: "duplicate_id" | "wrong_node_type" };

export type ResolvedStableNode = Extract<StableNodeResolution, { status: "ready" }>;

export function resolveStableNodeById(
  doc: ProseMirrorNode,
  id: string,
): StableNodeByIdResolution {
  const matches: { node: ProseMirrorNode; pos: number }[] = [];

  doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;

    if (matches.length < 2) matches.push({ node, pos });
    return true;
  });

  const [match, duplicate] = matches;
  if (!match) return { status: "missing" };
  if (duplicate) return { status: "duplicate" };

  return { status: "ready", ...match };
}

export function resolveStableNode(
  doc: ProseMirrorNode,
  identity: StableNodeIdentity,
): StableNodeResolution {
  const result = resolveStableNodeById(doc, identity.id);
  if (result.status === "missing") return result;
  if (result.status === "duplicate") {
    return { status: "invalid", reason: "duplicate_id" };
  }
  if (result.node.type.name !== identity.nodeType) {
    return { status: "invalid", reason: "wrong_node_type" };
  }

  return result;
}
