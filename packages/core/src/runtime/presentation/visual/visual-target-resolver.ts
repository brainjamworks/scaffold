import type { EmbeddedNodeId } from "@scaffold/contracts";

import { PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE } from "./presentation-visual-target-attributes";

export type VisualTargetResolution =
  | {
      readonly kind: "resolved";
      readonly targetId: EmbeddedNodeId;
      readonly element: HTMLElement;
    }
  | {
      readonly kind: "unavailable";
      readonly targetId: EmbeddedNodeId;
      readonly reason: "target-unmounted";
    };

export interface VisualTargetResolver {
  resolve(targetId: EmbeddedNodeId): VisualTargetResolution;
  clear(): void;
}

export function createVisualTargetResolver(surfaceRoot: HTMLElement): VisualTargetResolver {
  const cache = new Map<EmbeddedNodeId, HTMLElement>();

  return Object.freeze({
    resolve(targetId: EmbeddedNodeId): VisualTargetResolution {
      const cached = cache.get(targetId);
      if (cached && isCurrentAnchor(surfaceRoot, targetId, cached)) {
        return Object.freeze({ kind: "resolved", targetId, element: cached });
      }
      cache.delete(targetId);

      if (!surfaceRoot.isConnected) return unavailable(targetId);
      const selector = `[${PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE}="${CSS.escape(targetId)}"]`;
      const matches = surfaceRoot.querySelectorAll<HTMLElement>(selector);
      if (matches.length === 0) return unavailable(targetId);
      if (matches.length > 1) {
        throw new Error(
          `Presentation target "${targetId}" has duplicate visual anchors in the active Surface.`,
        );
      }

      const element = matches[0]!;
      cache.set(targetId, element);
      return Object.freeze({ kind: "resolved", targetId, element });
    },
    clear(): void {
      cache.clear();
    },
  });
}

function isCurrentAnchor(
  surfaceRoot: HTMLElement,
  targetId: EmbeddedNodeId,
  element: HTMLElement,
): boolean {
  return (
    surfaceRoot.isConnected &&
    element.isConnected &&
    surfaceRoot.contains(element) &&
    element.getAttribute(PRESENTATION_VISUAL_TARGET_ID_ATTRIBUTE) === targetId
  );
}

function unavailable(targetId: EmbeddedNodeId): VisualTargetResolution {
  return Object.freeze({ kind: "unavailable", targetId, reason: "target-unmounted" });
}
