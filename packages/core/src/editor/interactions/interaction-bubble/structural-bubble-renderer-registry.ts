import type { Editor } from "@tiptap/react";
import type { ReactNode } from "react";

import type { StructuralChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { StructuralInteractionTargetKind } from "@/editor/interactions/targets/prosemirror/projection/target-ref-projection";

export interface StructuralInteractionBubbleRenderInput {
  descriptor: StructuralChromeTargetDescriptor;
  editor: Editor;
}

/**
 * Renders arrangement menu content for one structural kind. Returning null
 * means the descriptor has no controls and the menu must not show.
 */
export type StructuralInteractionBubbleRenderer = (
  input: StructuralInteractionBubbleRenderInput,
) => ReactNode | null;

export interface StructuralInteractionBubbleRendererBinding {
  readonly kind: StructuralInteractionTargetKind;
  readonly renderer: StructuralInteractionBubbleRenderer;
}

export interface StructuralInteractionBubbleRendererMap {
  get(kind: StructuralInteractionTargetKind): StructuralInteractionBubbleRenderer | undefined;
}

export function createStructuralInteractionBubbleRendererMap(
  bindings: readonly StructuralInteractionBubbleRendererBinding[],
): StructuralInteractionBubbleRendererMap {
  const renderers = new Map<StructuralInteractionTargetKind, StructuralInteractionBubbleRenderer>();

  for (const binding of bindings) {
    if (renderers.has(binding.kind)) {
      throw new Error(`Structural interaction bubble renderer "${binding.kind}" is already bound.`);
    }
    renderers.set(binding.kind, binding.renderer);
  }

  return Object.freeze({
    get: (kind: StructuralInteractionTargetKind) => renderers.get(kind),
  });
}
