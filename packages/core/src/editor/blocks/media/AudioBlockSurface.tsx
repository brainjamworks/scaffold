import type { AudioBlockAttrs } from "@scaffold/contracts";

import { AudioPlayer } from "./AudioPlayer";
import type { AudioRuntimeController } from "./audio-runtime-controller";
import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import "./AudioBlock.css";

interface AudioBlockSurfaceProps {
  data: AudioBlockAttrs | null;
  controller?: AudioRuntimeController;
  errorMessage: string | null;
  onAuthorityMountedChange?: (mounted: boolean) => void;
  onPlaybackEnded?: () => void;
  onPlaybackStarted?: () => void;
  resolvedUrl: string | null;
}

export function AudioBlockSurface({
  controller,
  data,
  errorMessage,
  onAuthorityMountedChange,
  onPlaybackEnded,
  onPlaybackStarted,
  resolvedUrl,
}: AudioBlockSurfaceProps) {
  return (
    <div className="sc-course-audio-block__stage" contentEditable={false}>
      {!data ? (
        <p className="sc-course-audio-block__placeholder" role="status">
          {mediaMissingMessage("audio")}
        </p>
      ) : errorMessage ? (
        <p className="sc-course-audio-block__error" data-course-state="error" role="alert">
          {errorMessage}
        </p>
      ) : resolvedUrl ? (
        <AudioPlayer
          src={resolvedUrl}
          {...(controller ? { controller } : {})}
          {...(data.title ? { title: data.title } : {})}
          {...(onAuthorityMountedChange ? { onAuthorityMountedChange } : {})}
          {...(onPlaybackEnded ? { onEnded: onPlaybackEnded } : {})}
          {...(onPlaybackStarted ? { onStarted: onPlaybackStarted } : {})}
        />
      ) : (
        <p className="sc-course-audio-block__loading" role="status">
          {mediaLoadingMessage("audio")}
        </p>
      )}
    </div>
  );
}
