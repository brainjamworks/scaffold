import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { Plugin, Selection } from "@tiptap/pm/state";

import { allowsSurfaceRootInsertion } from "../model/policies/surface-root-insertion-policy";
import type { SurfaceVariantLookup } from "../model/surface-variant-registry";

export function createSurfaceRootSelectionPolicy({
  surfaceVariants,
}: {
  surfaceVariants: SurfaceVariantLookup;
}) {
  return Extension.create({
    name: "surfaceRootSelectionPolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          appendTransaction(_transactions, _oldState, newState) {
            const { selection } = newState;
            if (!(selection instanceof GapCursor)) return null;

            const { $from } = selection;
            if ($from.parent.type.name !== "surface") return null;
            if (allowsSurfaceRootInsertion($from.parent, surfaceVariants)) return null;

            return newState.tr.setSelection(Selection.near($from, -1));
          },
        }),
      ];
    },
  });
}
