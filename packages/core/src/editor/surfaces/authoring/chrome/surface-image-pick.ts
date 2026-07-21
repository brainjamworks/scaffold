import type { FilePickerResult } from "@/editor/media/authoring/picker/LazyFilePickerModal";
import type { SlideImageBandImage } from "@/editor/surfaces/model/templates/slide-image-band";
import type { SlideImageCoverImage } from "@/editor/surfaces/model/templates/slide-image-cover";
import type { SurfaceOwnedImage } from "@/editor/surfaces/model/surface-owned-image";

export function resolveSlideImageCoverImagePick(
  result: FilePickerResult,
): SlideImageCoverImage | null {
  return resolveSurfaceImagePick(result);
}

export function resolveSlideImageBandImagePick(
  result: FilePickerResult,
): SlideImageBandImage | null {
  return resolveSurfaceImagePick(result);
}

export function resolveSurfaceImagePick(result: FilePickerResult): SurfaceOwnedImage | null {
  if (result.mediaType !== "image") return null;

  const imageUrl =
    result.source === "upload"
      ? result.upload?.url
      : result.source === "browse"
        ? result.browse?.url
        : result.url;
  if (!imageUrl) return null;

  return {
    imageUrl,
    ...(result.alt ? { imageAlt: result.alt } : {}),
  };
}
