import { TrashIcon as Trash } from "@phosphor-icons/react";
import {
  EmbeddedNodeIdSchema,
  type MediaSource,
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
  type PresentationAuthoringCommandError,
} from "@/editor/presentation/model";
import { presentPresentationAuthoringCommandError } from "@/editor/presentation/timeline/PresentationActionEditor";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconXs } from "@/ui/tokens/icon-sizes";

import {
  attachPresentationSurfaceNarration,
  type PresentationNarrationDurationError,
} from "./presentation-narration-attachment";
import { presentPresentationNarrationMetadataError } from "./presentation-narration-metadata";

export interface PresentationNarrationControlsProps {
  readonly editor: Editor;
  readonly surfaceId: string;
  readonly narration: SurfacePresentationNarrationV1 | null;
}

/**
 * Attach, replace or remove the narration audio of one Slideshow Surface.
 *
 * Attachment and the follow-up Surface-duration expansion belong to the
 * narration authoring owner; this component only presents their outcomes.
 */
export function PresentationNarrationControls({
  editor,
  surfaceId,
  narration,
}: PresentationNarrationControlsProps) {
  const mediaPort = useMediaPort();
  const mountedRef = useRef(false);
  const cancelPendingRef = useRef<(() => void) | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<PresentationNarrationDurationError | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // The pending resolution keeps running against the document; only its
      // presentation here stops with the component.
      cancelPendingRef.current = null;
    };
  }, []);

  const removeNarration = () => {
    const result = setPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
      narration: null,
    });
    setError(result.isErr() ? result.error : null);
  };

  const handleResolved = (result: FilePickerResult) => {
    const source = narrationSourceFromPickerResult(result);
    if (!source) throw new Error("The audio picker returned no media source.");
    const attached = attachPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
      source,
      mediaPort,
      onDurationSettled: (settled) => {
        if (!mountedRef.current) return;
        setError(settled.isErr() ? settled.error : null);
      },
    });
    setError(attached.isErr() ? attached.error : null);
    if (attached.isOk()) cancelPendingRef.current = attached.value;
    return attached.isOk();
  };

  const pickerTitle = narration ? "Replace narration" : "Add narration";

  return (
    <div className="sc-presentation-narration-controls">
      <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
        {pickerTitle}
      </Button>
      {narration ? (
        <IconButton size="sm" aria-label="Remove narration" onClick={removeNarration}>
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
      {error ? (
        <span className="sc-presentation-timeline-authoring-error" role="alert">
          {presentNarrationDurationError(error)}
        </span>
      ) : null}
    </div>
  );
}

function presentNarrationDurationError(error: PresentationNarrationDurationError): string {
  if (
    error.reason === "narration-source-unavailable" ||
    error.reason === "narration-duration-unavailable"
  ) {
    return presentPresentationNarrationMetadataError(error);
  }
  return presentPresentationAuthoringCommandError(error as PresentationAuthoringCommandError);
}

function narrationSourceFromPickerResult(result: FilePickerResult): MediaSource | null {
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
