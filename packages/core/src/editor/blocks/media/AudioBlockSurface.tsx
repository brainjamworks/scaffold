import type { AudioBlockAttrs } from "@scaffold/contracts";

import { AudioPlayer } from "./AudioPlayer";
import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import "./AudioBlock.css";

interface AudioBlockSurfaceProps {
  data: AudioBlockAttrs | null;
  errorMessage: string | null;
  onPlaybackEnded?: () => void;
  onPlaybackStarted?: () => void;
  resolvedUrl: string | null;
}

export function AudioBlockSurface({
  data,
  errorMessage,
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
          {...(data.title ? { title: data.title } : {})}
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
