import { ImageIcon as ImagePlaceholder } from "@phosphor-icons/react";
import type { TextWrapImageData } from "@scaffold/contracts";
import type { ReactNode } from "react";

import {
  mediaLoadingMessage,
  mediaMissingMessage,
} from "@/editor/media/accessibility/media-accessibility";
import { cn } from "@/lib/cn";

export function TextWrapImageMediaSurface({
  data,
  emptyAction,
  errorMessage,
  fileUrl,
  replaceAction,
}: {
  data: TextWrapImageData;
  emptyAction?: ReactNode;
  errorMessage?: string | null;
  fileUrl: string | null;
  replaceAction?: ReactNode;
}) {
  const hasSource = data.source !== null;

  return (
    <div
      className={cn(
        "sc-course-text-wrap-image__media",
        fileUrl && replaceAction && "sc-app-media-replace-host",
      )}
      contentEditable={false}
    >
      {errorMessage ? (
        <div className="sc-course-text-wrap-image__empty" role="alert">
          <ImagePlaceholder size={18} weight="regular" aria-hidden />
          <span>{errorMessage}</span>
        </div>
      ) : fileUrl ? (
        <img
          src={fileUrl}
          alt={data.alt}
          className="sc-course-text-wrap-image__img"
          loading="lazy"
          decoding="async"
        />
      ) : hasSource ? (
        <div className="sc-course-text-wrap-image__empty" role="status">
          <ImagePlaceholder size={18} weight="regular" aria-hidden />
          <span>{mediaLoadingMessage("image")}</span>
        </div>
      ) : emptyAction ? (
        emptyAction
      ) : (
        <div className="sc-course-text-wrap-image__empty" role="status">
          <ImagePlaceholder size={18} weight="regular" aria-hidden />
          <span>{mediaMissingMessage("image")}</span>
        </div>
      )}
      {fileUrl ? replaceAction : null}
    </div>
  );
}
