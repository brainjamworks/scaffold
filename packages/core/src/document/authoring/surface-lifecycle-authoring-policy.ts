import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import {
  validateCourseSurfaceLifecycle,
  type ValidatedCourseSurfaceProjection,
} from "@/document/model/validation";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

export function createSurfaceLifecycleAuthoringPolicy({
  registry,
}: {
  registry: SurfaceVariantLookup;
}) {
  return Extension.create({
    name: "surfaceLifecycleAuthoringPolicy",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          filterTransaction(transaction) {
            if (!transaction.docChanged) return true;
            const candidate = validateCourseSurfaceLifecycle({
              content: transaction.doc.toJSON(),
              registry,
            });
            if (!candidate.ok) return false;

            const previous = validateCourseSurfaceLifecycle({
              content: transaction.before.toJSON(),
              registry,
            });
            return !previous.ok || surfaceVariantsRemainStable(previous.value, candidate.value);
          },
        }),
      ];
    },
  });
}

export function surfaceVariantsRemainStable(
  previous: ValidatedCourseSurfaceProjection,
  candidate: ValidatedCourseSurfaceProjection,
): boolean {
  const previousVariants = new Map(
    previous.surfaces.map((surface) => [surface.instanceId, surface.variantId]),
  );
  return candidate.surfaces.every((surface) => {
    const previousVariant = previousVariants.get(surface.instanceId);
    return previousVariant === undefined || previousVariant === surface.variantId;
  });
}
