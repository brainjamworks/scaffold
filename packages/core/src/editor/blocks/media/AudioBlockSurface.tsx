import { NodeViewWrapper } from "@tiptap/react";
import type { HTMLAttributes, MouseEventHandler, ReactNode } from "react";

import type { AudioBlockAttrs } from "@scaffold/contracts";

import { AudioPlayer } from "./AudioPlayer";
import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import "./AudioBlock.css";

interface AudioBlockSurfaceProps {
  children?: ReactNode;
  data: AudioBlockAttrs | null;
  emptyAction?: ReactNode;
  errorMessage: string | null;
  frameAttributes?: HTMLAttributes<HTMLElement>;
  onMouseDownCapture?: MouseEventHandler<HTMLElement>;
  replaceAction?: ReactNode;
  resolvedUrl: string | null;
  withWrapper?: boolean;
}

export function AudioBlockSurface({
  children,
  data,
  emptyAction,
  errorMessage,
  frameAttributes,
  onMouseDownCapture,
  replaceAction,
  resolvedUrl,
  withWrapper = true,
}: AudioBlockSurfaceProps) {
  const content = (
    <>
      <div
        className="sc-audio-block__stage"
        contentEditable={false}
        onMouseDownCapture={withWrapper ? undefined : onMouseDownCapture}
      >
        {!data ? (
          (emptyAction ?? (
            <p className="sc-audio-block__placeholder" role="status">
              {mediaMissingMessage("audio")}
            </p>
          ))
        ) : errorMessage ? (
          <p className="sc-audio-block__error" role="alert">
            {errorMessage}
          </p>
        ) : resolvedUrl ? (
          <AudioPlayer src={resolvedUrl} {...(data.title ? { title: data.title } : {})} />
        ) : (
          <p className="sc-audio-block__loading" role="status">
            {mediaLoadingMessage("audio")}
          </p>
        )}
        {replaceAction}
      </div>
      {children}
    </>
  );

  if (!withWrapper) return content;

  return (
    <NodeViewWrapper
      data-node="audio_block"
      {...frameAttributes}
      onMouseDownCapture={onMouseDownCapture}
      className="sc-audio-block"
    >
      {content}
    </NodeViewWrapper>
  );
}
