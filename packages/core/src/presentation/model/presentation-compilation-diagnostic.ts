import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationVisualCapabilityId,
} from "@scaffold/contracts";

import type { CompiledPresentationPlaybackProgram } from "./compiled-presentation-program";

/**
 * One expected authoring drift found while compiling a single Timeline action.
 *
 * A diagnostic never discards unrelated actions: the compiler omits only the
 * addressed action(s) from the program and keeps every independent valid action.
 * Every variant is plain immutable data addressed by Surface and action identity
 * so the Timeline can present it beside the authored source record.
 */
export type PresentationCompilationDiagnostic =
  | {
      readonly reason: "navigation-destination-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly destinationSurfaceId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-not-current";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "target-moved-to-another-surface";
      readonly surfaceId: EmbeddedNodeId;
      readonly currentSurfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "visual-capability-unavailable";
      readonly surfaceId: EmbeddedNodeId;
      readonly actionId: EmbeddedDataId;
      readonly targetId: EmbeddedNodeId;
      readonly capability: PresentationVisualCapabilityId;
    }
  | {
      /** The later action is omitted; the earlier one keeps compiling. */
      readonly reason: "same-target-timed-overlap";
      readonly surfaceId: EmbeddedNodeId;
      readonly targetId: EmbeddedNodeId;
      readonly earlierActionId: EmbeddedDataId;
      readonly laterActionId: EmbeddedDataId;
    };

export type PresentationCompilationDiagnosticReason = PresentationCompilationDiagnostic["reason"];

/**
 * Program compiled from every valid action plus the source-ordered diagnostics
 * for the actions that were omitted. `program` is `null` only when Presentation
 * is not configured at all.
 */
export interface PresentationCompilationReport {
  readonly program: CompiledPresentationPlaybackProgram | null;
  readonly diagnostics: readonly PresentationCompilationDiagnostic[];
}

/** Returns the authored action(s) a diagnostic omitted from the compiled program. */
export function omittedActionIds(
  diagnostic: PresentationCompilationDiagnostic,
): readonly EmbeddedDataId[] {
  switch (diagnostic.reason) {
    case "navigation-destination-not-current":
    case "target-not-current":
    case "target-moved-to-another-surface":
    case "visual-capability-unavailable":
      return Object.freeze([diagnostic.actionId]);
    case "same-target-timed-overlap":
      return Object.freeze([diagnostic.laterActionId]);
  }
}
