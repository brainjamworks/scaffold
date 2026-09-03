import { SpeakerHighIcon as Speaker, TrashIcon as Trash } from "@phosphor-icons/react";
import {
  EmbeddedNodeIdSchema,
  PresentationConfigurationV1Schema,
  type SurfacePresentationNarrationV1,
} from "@scaffold/contracts";
import type { Editor } from "@tiptap/react";
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
import {
  presentPresentationNarrationMetadataError,
  resolvePresentationNarrationMetadata,
  type PresentationNarrationMetadataError,
} from "@/editor/presentation/narration/presentation-narration-metadata";
import { presentPresentationAuthoringCommandError } from "@/editor/presentation/timeline/PresentationActionEditor";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { MenuIconButton } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";

interface SurfaceNarrationMenuSectionProps {
  editor: Editor;
  presentation: {
    readonly narration: SurfacePresentationNarrationV1 | null;
    readonly durationMs: number;
  };
  surfaceId: string;
}

export function SurfaceNarrationMenuSection({
  editor,
  presentation,
  surfaceId,
}: SurfaceNarrationMenuSectionProps) {
  const mediaPort = useMediaPort();
  const mountedRef = useRef(false);
  const [narrationPickerOpen, setNarrationPickerOpen] = useState(false);
  const [narrationError, setNarrationError] = useState<PresentationAuthoringCommandError | null>(
    null,
  );
  const [narrationMetadataError, setNarrationMetadataError] =
    useState<PresentationNarrationMetadataError | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyNarration = (narration: SurfacePresentationNarrationV1 | null) => {
    const result = setPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse(surfaceId),
      narration,
    });
    setNarrationError(result.isErr() ? result.error : null);
    setNarrationMetadataError(null);
    return result.isOk();
  };

  const handleNarrationResolved = (result: FilePickerResult) => {
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
          if (mountedRef.current) setNarrationMetadataError(metadataResult.error);
          return;
        }
        const current = resolveSurfacePresentation(editor, parsedSurfaceId, readCourseMode(editor));
        if (!current || !sameNarrationSource(current.narration?.source, source)) return;
        if (metadataResult.value.durationMs <= current.durationMs) return;
        const durationResult = setPresentationSurfaceDuration({
          editor,
          surfaceId: parsedSurfaceId,
          durationMs: metadataResult.value.durationMs,
        });
        if (mountedRef.current) {
          setNarrationError(durationResult.isErr() ? durationResult.error : null);
        }
      },
    });
    return true;
  };

  return (
    <>
      <MenuIconButton
        icon={Speaker}
        label={presentation.narration ? "Replace narration" : "Add narration"}
        onClick={() => setNarrationPickerOpen(true)}
      />
      {presentation.narration ? (
        <MenuIconButton
          destructive
          icon={Trash}
          label="Remove narration"
          onClick={() => applyNarration(null)}
        />
      ) : null}
      <FilePickerModal
        open={narrationPickerOpen}
        onOpenChange={setNarrationPickerOpen}
        kind="media"
        allowedMediaTypes={["audio"]}
        defaultMediaType="audio"
        title={presentation.narration ? "Replace narration" : "Add narration"}
        metadataFields={[]}
        onResolved={handleNarrationResolved}
      />
      {narrationError ? (
        <span role="alert">{presentPresentationAuthoringCommandError(narrationError)}</span>
      ) : null}
      {narrationMetadataError ? (
        <span role="alert">
          {presentPresentationNarrationMetadataError(narrationMetadataError)}
        </span>
      ) : null}
    </>
  );
}

export function resolveSurfacePresentation(
  editor: Editor,
  surfaceId: string | null | undefined,
  courseMode: string | null,
):
  | {
      readonly narration: SurfacePresentationNarrationV1 | null;
      readonly durationMs: number;
    }
  | undefined {
  if (courseMode !== "slideshow" || !surfaceId) return undefined;
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument) throw new Error("The Course Document is missing.");
  const value = courseDocument.attrs["presentation"];
  if (value === null || value === undefined) return { narration: null, durationMs: 0 };
  const configuration = PresentationConfigurationV1Schema.parse(value);
  const timeline = configuration.surfaces.find((candidate) => candidate.surfaceId === surfaceId);
  if (!timeline) {
    throw new Error(`Presentation configuration has no Timeline for Surface "${surfaceId}".`);
  }
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

export function readCourseMode(editor: Editor): string | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return typeof mode === "string" ? mode : null;
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
