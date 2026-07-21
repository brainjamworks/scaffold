import type { ReactNode } from "react";

import { imagePositionToCss } from "@/editor/media/model/image-position";
import type { SlideImageCoverImage } from "@/editor/surfaces/model/templates/slide-image-cover";

interface SlideImageCoverImageSlotProps {
  emptyAction?: ReactNode;
  image: SlideImageCoverImage;
  replaceAction?: ReactNode;
}

export function SlideImageCoverImageSlot({
  emptyAction,
  image,
  replaceAction,
}: SlideImageCoverImageSlotProps) {
  const imageUrl = image.imageUrl ?? "";
  const imageAlt = image.imageAlt ?? "";

  return (
    <div
      className="sc-slide-image-cover-image sc-media-replace-host"
      contentEditable={false}
      data-slot="slide-image-cover-image"
      data-empty={imageUrl ? undefined : "true"}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt}
          className="sc-slide-image-cover-image__media"
          style={{ objectPosition: imagePositionToCss(image.imagePosition) }}
        />
      ) : emptyAction ? (
        emptyAction
      ) : (
        <div className="sc-slide-image-cover-image__missing" aria-hidden="true" />
      )}

      {imageUrl ? replaceAction : null}
    </div>
  );
}
