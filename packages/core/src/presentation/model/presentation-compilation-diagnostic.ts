import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationVisualCapabilityId,
} from "@scaffold/contracts";

import type {
  CompiledPresentationPlaybackProgram,
  CompiledSurfacePresentationTimeline,
} from "./compiled-presentation-program";

/**
 * One expected authoring drift found while compiling a Surface timeline.
 *
 * Every variant is plain immutable data with the identities needed to present
 * and repair the authored source record.
 */
export type PresentationCompilationDiagnostic =
  | {
      readonly reason: "navigation-destination-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly destinationSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "referenced-target-missing";
      readonly surfaceId: EmbeddedNodeId;
      readonly source:
        | { readonly kind: "visual-effect"; readonly actionId: EmbeddedDataId }
        | { readonly kind: "trigger-command"; readonly actionId: EmbeddedDataId }
        | { readonly kind: "learner-wait"; readonly waitId: EmbeddedDataId };
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-moved-surface";
      readonly source:
        | { readonly kind: "visual-effect"; readonly actionId: EmbeddedDataId }
        | { readonly kind: "trigger-command"; readonly actionId: EmbeddedDataId }
        | { readonly kind: "learner-wait"; readonly waitId: EmbeddedDataId };
      readonly targetId: EmbeddedNodeId;
      readonly expectedSurfaceId: EmbeddedNodeId;
      readonly actualSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "visual-capability-unavailable";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly capability: PresentationVisualCapabilityId;
    }
  | {
      readonly reason: "trigger-command-unavailable";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
    }
  | {
      readonly reason: "trigger-command-input-invalid";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly type: string;
      readonly input:
        | { readonly kind: "absent" }
        | { readonly kind: "value"; readonly value: boolean | string | number };
    }
  | {
      readonly reason: "unavailable-required-capability";
      readonly surfaceId: EmbeddedNodeId;
      readonly waitId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly capability:
        | { readonly kind: "event"; readonly type: string }
        | { readonly kind: "state"; readonly key: string };
    }
  | {
      readonly reason: "required-state-value-invalid";
      readonly surfaceId: EmbeddedNodeId;
      readonly waitId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly key: string;
      readonly value: boolean | string | number;
    }
  | {
      readonly reason: "required-event-layer-unavailable";
      readonly surfaceId: EmbeddedNodeId;
      readonly waitId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly requiredLayerId: EmbeddedNodeId;
      readonly selectedLayerId: EmbeddedNodeId;
      readonly atMs: number;
      readonly boundary: "before-actions" | "after-actions";
    }
  | {
      /** The later action is omitted; the earlier one keeps compiling. */
      readonly reason: "same-target-timed-overlap";
      readonly surfaceId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly earlierActionId: EmbeddedDataId;
      readonly laterActionId: EmbeddedDataId;
    }
  | {
      readonly reason: "owner-track-missing";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "owner-track-duplicated";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly trackIndexes: readonly number[];
    }
  | {
      readonly reason: "track-owner-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "track-owner-not-layer-owner";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly actualKind: string;
    }
  | {
      readonly reason: "track-owner-moved-surface";
      readonly ownerId: EmbeddedNodeId;
      readonly expectedSurfaceId: EmbeddedNodeId;
      readonly actualSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "initial-layer-not-owned";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly layerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "switch-layer-not-owned";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly switchId: EmbeddedDataId;
      readonly layerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "conflicting-switches";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly atMs: number;
      readonly switchIds: readonly EmbeddedDataId[];
    }
  | {
      readonly reason: "redundant-layer-switch";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly switchId: EmbeddedDataId;
      readonly atMs: number;
      readonly layerId: EmbeddedNodeId;
    }
  | {
      readonly reason: "layer-switch-outside-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly ownerId: EmbeddedNodeId;
      readonly switchId: EmbeddedDataId;
      readonly atMs: number;
      readonly durationMs: number;
    };

export type PresentationCompilationDiagnosticReason = PresentationCompilationDiagnostic["reason"];

/**
 * `program` is withheld when any configured Surface is blocked. Independently
 * playable Surface programs remain available only through `surfaces`.
 */
export interface PresentationCompilationReport {
  readonly program: CompiledPresentationPlaybackProgram | null;
  readonly surfaces: readonly PresentationSurfaceCompilationOutcome[];
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
}

export interface PresentationPlaybackBlockedError {
  readonly reason: "surface-compilation-blocked";
  readonly surfaceIds: readonly EmbeddedNodeId[];
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
}

export type PresentationSurfaceCompilationOutcome =
  | {
      readonly status: "playable";
      readonly surfaceId: EmbeddedNodeId;
      readonly program: CompiledSurfacePresentationTimeline;
      readonly diagnostics: readonly PresentationCompilationDiagnostic[];
    }
  | {
      readonly status: "blocked";
      readonly surfaceId: EmbeddedNodeId;
      readonly diagnostics: readonly PresentationCompilationDiagnostic[];
    };

export function blocksPresentationSurface(diagnostic: PresentationCompilationDiagnostic): boolean {
  switch (diagnostic.reason) {
    case "visual-capability-unavailable":
    case "same-target-timed-overlap":
      return false;
    case "referenced-target-missing":
    case "target-moved-surface":
      return diagnostic.source.kind !== "visual-effect";
    default:
      return true;
  }
}

/** Returns the authored action(s) a diagnostic omitted from the compiled program. */
export function omittedActionIds(
  diagnostic: PresentationCompilationDiagnostic,
): readonly EmbeddedDataId[] {
  switch (diagnostic.reason) {
    case "navigation-destination-not-current":
    case "visual-capability-unavailable":
    case "trigger-command-unavailable":
    case "trigger-command-input-invalid":
      return Object.freeze([diagnostic.actionId]);
    case "referenced-target-missing":
    case "target-moved-surface":
      return Object.freeze([
        diagnostic.source.kind === "learner-wait"
          ? diagnostic.source.waitId
          : diagnostic.source.actionId,
      ]);
    case "unavailable-required-capability":
    case "required-state-value-invalid":
    case "required-event-layer-unavailable":
      return Object.freeze([diagnostic.waitId]);
    case "same-target-timed-overlap":
      return Object.freeze([diagnostic.laterActionId]);
    case "owner-track-missing":
    case "owner-track-duplicated":
    case "track-owner-not-current":
    case "track-owner-not-layer-owner":
    case "track-owner-moved-surface":
    case "initial-layer-not-owned":
    case "switch-layer-not-owned":
    case "conflicting-switches":
    case "redundant-layer-switch":
    case "layer-switch-outside-surface":
      return Object.freeze([]);
  }
}
