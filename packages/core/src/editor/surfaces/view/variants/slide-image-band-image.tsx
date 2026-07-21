import type { ReactNode } from "react";

import { imagePositionToCss } from "@/editor/media/model/image-position";
import type { SlideImageBandImage } from "@/editor/surfaces/model/templates/slide-image-band";

interface SlideImageBandImageSlotProps {
  emptyAction?: ReactNode;
  image: SlideImageBandImage;
  replaceAction?: ReactNode;
}

export function SlideImageBandImageSlot({
  emptyAction,
  image,
  replaceAction,
}: SlideImageBandImageSlotProps) {
  const imageUrl = image.imageUrl ?? "";
  const imageAlt = image.imageAlt ?? "";

  return (
    <div
      className="sc-slide-image-band-image sc-media-replace-host"
      contentEditable={false}
      data-slot="slide-image-band-image"
      data-empty={imageUrl ? undefined : "true"}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={imageAlt}
          className="sc-slide-image-band-image__media"
          style={{ objectPosition: imagePositionToCss(image.imagePosition) }}
        />
      ) : emptyAction ? (
        emptyAction
      ) : (
        <div className="sc-slide-image-band-image__missing" aria-hidden="true" />
      )}

      {imageUrl ? replaceAction : null}
    </div>
  );
}
