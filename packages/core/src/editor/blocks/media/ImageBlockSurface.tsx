import type { ReactNode } from "react";

import type { ImageBlockAttrs } from "@scaffold/contracts";

import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import { cn } from "@/lib/cn";
import "./ImageBlock.css";

interface ImageBlockSurfaceProps {
  children?: ReactNode;
  data: ImageBlockAttrs | null;
  errorMessage: string | null;
  resolvedUrl: string | null;
  emptyAction?: ReactNode;
  replaceAction?: ReactNode;
}

export function ImageBlockSurface({
  children,
  data,
  emptyAction,
  errorMessage,
  replaceAction,
  resolvedUrl,
}: ImageBlockSurfaceProps) {
  const state = !data ? "missing" : errorMessage ? "error" : resolvedUrl ? "ready" : "loading";

  return (
    <>
      <div
        className={cn("sc-course-image-block__stage", replaceAction && "sc-app-media-replace-host")}
        contentEditable={false}
        data-image-state={state}
      >
        {!data ? (
          (emptyAction ?? (
            <p className="sc-course-image-block__loading" role="status">
              {mediaMissingMessage("image")}
            </p>
          ))
        ) : errorMessage ? (
          <p className="sc-course-image-block__error" role="alert">
            {errorMessage}
          </p>
        ) : resolvedUrl ? (
          <img src={resolvedUrl} alt={data.alt ?? ""} className="sc-course-image-block__media" />
        ) : (
          <p className="sc-course-image-block__loading" role="status">
            {mediaLoadingMessage("image")}
          </p>
        )}
        {replaceAction}
      </div>
      {children}
    </>
  );
}
