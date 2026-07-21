import { NodeViewWrapper } from "@tiptap/react";
import type { HTMLAttributes, ReactNode } from "react";

import type { ImageBlockAttrs } from "@scaffold/contracts";

import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import "./ImageBlock.css";

interface ImageBlockSurfaceProps {
  children?: ReactNode;
  data: ImageBlockAttrs | null;
  errorMessage: string | null;
  frameAttributes?: HTMLAttributes<HTMLElement>;
  resolvedUrl: string | null;
  emptyAction?: ReactNode;
  replaceAction?: ReactNode;
  withWrapper?: boolean;
}

export function ImageBlockSurface({
  children,
  data,
  emptyAction,
  errorMessage,
  frameAttributes,
  replaceAction,
  resolvedUrl,
  withWrapper = true,
}: ImageBlockSurfaceProps) {
  const content = (
    <>
      <div className="sc-image-block__stage sc-media-replace-host" contentEditable={false}>
        {!data ? (
          (emptyAction ?? (
            <p className="sc-image-block__loading" role="status">
              {mediaMissingMessage("image")}
            </p>
          ))
        ) : errorMessage ? (
          <p className="sc-image-block__error" role="alert">
            {errorMessage}
          </p>
        ) : resolvedUrl ? (
          <img src={resolvedUrl} alt={data.alt ?? ""} className="sc-image-block__media" />
        ) : (
          <p className="sc-image-block__loading" role="status">
            {mediaLoadingMessage("image")}
          </p>
        )}
        {replaceAction}
      </div>
      {children}
    </>
  );

  if (!withWrapper) return content;

  return (
    <NodeViewWrapper data-node="image_block" {...frameAttributes} className="sc-image-block">
      {content}
    </NodeViewWrapper>
  );
}
