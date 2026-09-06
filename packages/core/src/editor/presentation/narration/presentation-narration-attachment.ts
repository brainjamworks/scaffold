import {
  PresentationConfigurationV1Schema,
  type EmbeddedNodeId,
  type MediaSource,
  type SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";

import {
  setPresentationSurfaceDuration,
  setPresentationSurfaceNarration,
  type PresentationAuthoringCommandError,
  type PresentationAuthoringCommandResult,
} from "@/editor/presentation/model";
import type { MediaPort } from "@/host/ports/media";

import {
  resolvePresentationNarrationMetadata,
  type PresentationNarrationMetadataError,
} from "./presentation-narration-metadata";

/** How the attached narration's duration settled against the authored Surface duration. */
export type PresentationNarrationDurationOutcome =
  | {
      /** The Surface was shorter than the narration and now matches it. */
      readonly kind: "surface-expanded";
      readonly surfaceId: EmbeddedNodeId;
      readonly previousDurationMs: number;
      readonly durationMs: number;
    }
  | {
      /** The authored Surface already covered the narration; its silent tail is retained. */
      readonly kind: "surface-retained";
      readonly surfaceId: EmbeddedNodeId;
      readonly durationMs: number;
      readonly narrationDurationMs: number;
    }
  | {
      /** The narration was replaced or removed before its duration resolved. */
      readonly kind: "narration-superseded";
      readonly surfaceId: EmbeddedNodeId;
      readonly source: MediaSource;
    };

export type PresentationNarrationDurationError =
  | PresentationNarrationMetadataError
  | PresentationAuthoringCommandError;

export type PresentationNarrationDurationResult = ResultType<
  PresentationNarrationDurationOutcome,
  PresentationNarrationDurationError
>;

export interface AttachPresentationSurfaceNarrationInput {
  readonly editor: Editor;
  readonly surfaceId: EmbeddedNodeId;
  readonly source: MediaSource;
  readonly mediaPort: MediaPort | null;
  readonly createAudioElement?: () => HTMLAudioElement;
  /** Receives exactly one settlement once the narration duration is known or unavailable. */
  readonly onDurationSettled?: (result: PresentationNarrationDurationResult) => void;
}

const createNarrationAudioElement = () => new Audio();

/**
 * Attach or replace one Surface narration and then expand the Surface to cover it.
 *
 * The attachment itself is one checked document transaction. Duration resolution
 * continues afterwards without depending on any mounted Timeline or component:
 * once native metadata reports a longer narration, the Surface duration is
 * extended in a second checked transaction. A shorter narration never shrinks an
 * authored silent tail, and a narration replaced meanwhile is left alone.
 *
 * Returns the attachment outcome plus a cancel function for the pending resolution.
 */
export function attachPresentationSurfaceNarration({
  editor,
  surfaceId,
  source,
  mediaPort,
  createAudioElement = createNarrationAudioElement,
  onDurationSettled,
}: AttachPresentationSurfaceNarrationInput): PresentationAuthoringCommandResult<() => void> {
  const attached = setPresentationSurfaceNarration({ editor, surfaceId, narration: { source } });
  if (attached.isErr()) return Result.err(attached.error);

  const cancel = resolvePresentationNarrationMetadata({
    source,
    mediaPort,
    createAudioElement,
    onResult: (metadata) => {
      onDurationSettled?.(settleNarrationDuration(editor, surfaceId, source, metadata));
    },
  });
  return Result.ok(cancel);
}

function settleNarrationDuration(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
  source: MediaSource,
  metadata: ResultType<{ readonly durationMs: number }, PresentationNarrationMetadataError>,
): PresentationNarrationDurationResult {
  if (metadata.isErr()) return Result.err(metadata.error);
  if (editor.isDestroyed) return Result.err(Object.freeze({ reason: "editor-destroyed" }));

  const current = readSurfaceTimeline(editor, surfaceId);
  if (!current || !sameNarrationSource(current.narration?.source, source)) {
    return Result.ok(Object.freeze({ kind: "narration-superseded", surfaceId, source }));
  }
  const narrationDurationMs = metadata.value.durationMs;
  if (narrationDurationMs <= current.durationMs) {
    return Result.ok(
      Object.freeze({
        kind: "surface-retained",
        surfaceId,
        durationMs: current.durationMs,
        narrationDurationMs,
      }),
    );
  }
  const expanded = setPresentationSurfaceDuration({
    editor,
    surfaceId,
    durationMs: narrationDurationMs,
  });
  if (expanded.isErr()) return Result.err(expanded.error);
  return Result.ok(
    Object.freeze({
      kind: "surface-expanded",
      surfaceId,
      previousDurationMs: current.durationMs,
      durationMs: narrationDurationMs,
    }),
  );
}

function readSurfaceTimeline(
  editor: Editor,
  surfaceId: EmbeddedNodeId,
): { readonly narration: SurfacePresentationNarrationV1 | null; readonly durationMs: number } | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const value = courseDocument.attrs["presentation"];
  if (value === null || value === undefined) return null;
  const configuration = PresentationConfigurationV1Schema.parse(value);
  const timeline = configuration.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!timeline) return null;
  return { narration: timeline.narration ?? null, durationMs: timeline.durationMs };
}

function sameNarrationSource(current: MediaSource | undefined, expected: MediaSource): boolean {
  if (!current || current.mode !== expected.mode) return false;
  if (current.mode === "managed") {
    return expected.mode === "managed" && current.mediaId === expected.mediaId;
  }
  return expected.mode === "external" && current.src === expected.src;
}
