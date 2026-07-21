import type { ReactNode } from "react";

import { imagePositionToCss } from "@/editor/media/model/image-position";
import type { SurfaceImageSlotRole } from "@/editor/surfaces/model/slide-composition-definition";
import type { SurfaceOwnedImage } from "@/editor/surfaces/model/surface-owned-image";
import { DEFAULT_IMAGE_POSITION } from "@/schemas/course-document";

import "./surface-owned-image-slot.css";

interface SurfaceOwnedImageSlotProps {
  emptyAction?: ReactNode;
  image?: SurfaceOwnedImage;
  replaceAction?: ReactNode;
  role: SurfaceImageSlotRole;
}

export function SurfaceOwnedImageSlot({
  emptyAction,
  image,
  replaceAction,
  role,
}: SurfaceOwnedImageSlotProps) {
  const imageUrl = image?.imageUrl;
  const status = image === undefined ? "missing" : imageUrl ? "populated" : "empty";

  return (
    <div
      className="sc-surface-owned-image-slot sc-media-replace-host"
      contentEditable={false}
      data-image-role={role}
      data-image-status={status}
      data-image-position={image?.imagePosition ?? DEFAULT_IMAGE_POSITION}
      data-testid="surface-owned-image-slot"
    >
      {imageUrl ? (
        <img
          className="sc-surface-owned-image-slot__media"
          src={imageUrl}
          alt={image.imageAlt ?? ""}
          style={{ objectPosition: imagePositionToCss(image.imagePosition) }}
        />
      ) : image !== undefined && emptyAction ? (
        emptyAction
      ) : (
        <div className="sc-surface-owned-image-slot__missing" aria-hidden="true" />
      )}

      {imageUrl ? replaceAction : null}
    </div>
  );
}
