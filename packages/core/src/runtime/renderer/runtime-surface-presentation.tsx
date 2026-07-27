import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { createContext, useContext, type ReactNode } from "react";

export type RuntimePresentedSurfaceId = string | null | undefined;

const RuntimePresentedSurfaceIdContext = createContext<RuntimePresentedSurfaceId>(undefined);

export function RuntimeSurfacePresentationProvider({
  children,
  surfaceId,
}: {
  children: ReactNode;
  surfaceId: RuntimePresentedSurfaceId;
}) {
  return (
    <RuntimePresentedSurfaceIdContext.Provider value={surfaceId}>
      {children}
    </RuntimePresentedSurfaceIdContext.Provider>
  );
}

export function useRuntimePresentedSurfaceId(): RuntimePresentedSurfaceId {
  return useContext(RuntimePresentedSurfaceIdContext);
}

export function resolveOwningRuntimeSurfaceId(
  doc: ProseMirrorNode,
  getPos: () => number | undefined,
): string | null {
  try {
    const pos = getPos();
    if (!Number.isInteger(pos) || pos === undefined || pos < 0 || pos > doc.content.size) {
      return null;
    }
    const resolved = doc.resolve(pos);
    for (let depth = resolved.depth; depth >= 0; depth -= 1) {
      const node = resolved.node(depth);
      if (node.type.name !== "surface") continue;
      const surfaceId = node.attrs["id"];
      return typeof surfaceId === "string" && surfaceId.trim().length > 0 ? surfaceId : null;
    }
  } catch {
    return null;
  }

  return null;
}
