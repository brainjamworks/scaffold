import type { Node as PMNode } from "@tiptap/pm/model";

export type AssessmentSurfaceScopeError = "missing-surface-id";

export type AssessmentSurfaceScopeResult =
  | { ok: true; surfaceId: string }
  | { ok: false; reason: AssessmentSurfaceScopeError };

function requiredId(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

/** Resolve the surface that owns an assessment block position. */
export function resolveAssessmentSurfaceScope({
  doc,
  blockPos,
}: {
  doc: PMNode;
  blockPos: number | null | undefined;
}): AssessmentSurfaceScopeResult {
  if (
    blockPos === null ||
    blockPos === undefined ||
    !Number.isInteger(blockPos) ||
    blockPos < 0 ||
    blockPos > doc.content.size
  ) {
    return { ok: false, reason: "missing-surface-id" };
  }

  try {
    const $pos = doc.resolve(blockPos);
    for (let depth = $pos.depth; depth >= 0; depth -= 1) {
      const node = $pos.node(depth);
      if (node.type.name !== "surface") continue;

      const surfaceId = requiredId(node.attrs["id"]);
      return surfaceId ? { ok: true, surfaceId } : { ok: false, reason: "missing-surface-id" };
    }
  } catch {
    return { ok: false, reason: "missing-surface-id" };
  }

  return { ok: false, reason: "missing-surface-id" };
}
