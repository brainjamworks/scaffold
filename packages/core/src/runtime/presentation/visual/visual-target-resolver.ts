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
      readonly reason: "target-unmounted" | "owner-view-inactive";
    };

export interface VisualTargetResolver {
  resolve(targetId: EmbeddedNodeId): VisualTargetResolution;
  clear(): void;
}

export function createVisualTargetResolver(surfaceRoot: HTMLElement): VisualTargetResolver {
  return Object.freeze({
    resolve(targetId: EmbeddedNodeId): VisualTargetResolution {
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
      const inactiveLayer = element.closest<HTMLElement>(
        '[data-node="layer"][data-layer-state="inactive"]',
      );
      if (inactiveLayer && surfaceRoot.contains(inactiveLayer)) {
        return unavailable(targetId, "owner-view-inactive");
      }
      return Object.freeze({ kind: "resolved", targetId, element });
    },
    clear() {},
  });
}

function unavailable(
  targetId: EmbeddedNodeId,
  reason: Extract<VisualTargetResolution, { kind: "unavailable" }>["reason"] = "target-unmounted",
): VisualTargetResolution {
  return Object.freeze({ kind: "unavailable", targetId, reason });
}
