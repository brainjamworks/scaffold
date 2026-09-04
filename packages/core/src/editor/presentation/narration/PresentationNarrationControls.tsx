import { TrashIcon as Trash } from "@phosphor-icons/react";
import {
  EmbeddedNodeIdSchema,
  PresentationConfigurationV1Schema,
  type SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import {
  FilePickerModal,
  type FilePickerResult,
} from "@/editor/media/authoring/picker/LazyFilePickerModal";
import {
  setPresentationSurfaceNarration,
  setPresentationSurfaceDuration,
  type PresentationAuthoringCommandError,
} from "@/editor/presentation/model";
import { presentPresentationAuthoringCommandError } from "@/editor/presentation/timeline/PresentationActionEditor";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconXs } from "@/ui/tokens/icon-sizes";

import {
  presentPresentationNarrationMetadataError,
  resolvePresentationNarrationMetadata,
  type PresentationNarrationMetadataError,
} from "./presentation-narration-metadata";

export interface PresentationNarrationControlsProps {
  readonly editor: Editor;
  readonly surfaceId: string;
  readonly narration: SurfacePresentationNarrationV1 | null;
}

/**
 * Attach, replace or remove the narration audio of one Slideshow Surface.
 *
 * Lives in the Timeline toolbar: narration is the audio clock of the
 * Surface's presentation, so it is authored beside the actions it drives.
 */
export function PresentationNarrationControls({
  editor,
  surfaceId,
  narration,
}: PresentationNarrationControlsProps) {
  const mediaPort = useMediaPort();
  const mountedRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commandError, setCommandError] = useState<PresentationAuthoringCommandError | null>(null);
  const [metadataError, setMetadataError] = useState<PresentationNarrationMetadataError | null>(
    null,
  );
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyNarration = (next: SurfacePresentationNarrationV1 | null) => {
    const result = setPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
      narration: next,
    });
    setCommandError(result.isErr() ? result.error : null);
    setMetadataError(null);
    return result.isOk();
  };

  const handleResolved = (result: FilePickerResult) => {
    const source = narrationSourceFromPickerResult(result);
    if (!source) throw new Error("The audio picker returned no media source.");
    if (!applyNarration({ source })) return false;
    const parsedSurfaceId = EmbeddedNodeIdSchema.parse(surfaceId);
    resolvePresentationNarrationMetadata({
      source,
      mediaPort,
      createAudioElement: () => new Audio(),
      onResult: (metadataResult) => {
        if (metadataResult.isErr()) {
          if (mountedRef.current) setMetadataError(metadataResult.error);
          return;
        }
        const current = readSurfaceTimeline(editor, parsedSurfaceId);
        if (!current || !sameNarrationSource(current.narration?.source, source)) return;
        if (metadataResult.value.durationMs <= current.durationMs) return;
        const durationResult = setPresentationSurfaceDuration({
          editor,
          surfaceId: parsedSurfaceId,
          durationMs: metadataResult.value.durationMs,
        });
        if (mountedRef.current) {
          setCommandError(durationResult.isErr() ? durationResult.error : null);
        }
      },
    });
    return true;
  };

  const pickerTitle = narration ? "Replace narration" : "Add narration";

  return (
    <div className="sc-presentation-narration-controls">
      <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
        {pickerTitle}
      </Button>
      {narration ? (
        <IconButton size="sm" aria-label="Remove narration" onClick={() => applyNarration(null)}>
          <Trash size={iconXs} aria-hidden />
        </IconButton>
      ) : null}
      <FilePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="media"
        allowedMediaTypes={["audio"]}
        defaultMediaType="audio"
        title={pickerTitle}
        metadataFields={[]}
        onResolved={handleResolved}
      />
      {commandError ? (
        <span className="sc-presentation-timeline-authoring-error" role="alert">
          {presentPresentationAuthoringCommandError(commandError)}
        </span>
      ) : null}
      {metadataError ? (
        <span className="sc-presentation-timeline-authoring-error" role="alert">
          {presentPresentationNarrationMetadataError(metadataError)}
        </span>
      ) : null}
    </div>
  );
}

function readSurfaceTimeline(
  editor: Editor,
  surfaceId: string,
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

function sameNarrationSource(
  current: SurfacePresentationNarrationV1["source"] | undefined,
  expected: SurfacePresentationNarrationV1["source"],
): boolean {
  if (!current || current.mode !== expected.mode) return false;
  if (current.mode === "managed") {
    return expected.mode === "managed" && current.mediaId === expected.mediaId;
  }
  return expected.mode === "external" && current.src === expected.src;
}

function narrationSourceFromPickerResult(
  result: FilePickerResult,
): SurfacePresentationNarrationV1["source"] | null {
  if (result.source === "upload" && result.upload) {
    return { mode: "managed", mediaId: result.upload.id };
  }
  if (result.source === "browse" && result.browse) {
    return { mode: "managed", mediaId: result.browse.id };
  }
  if (result.source === "url" && result.url) {
    return { mode: "external", src: result.url };
  }
  return null;
}
