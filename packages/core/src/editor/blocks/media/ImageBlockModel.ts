import { useEffect, useState } from "react";

import { ImageBlockAttrsSchema, type ImageBlockAttrs } from "@scaffold/contracts";

import { mediaUnavailableMessage } from "@/editor/media/accessibility/media-accessibility";

export interface ImageMediaPort {
  resolve: (mediaId: string) => Promise<string>;
}

export interface ResolvedImageBlockSource {
  errorMessage: string | null;
  resolvedUrl: string | null;
}

export function parseImageBlockData(raw: unknown): ImageBlockAttrs | null {
  const parsed = ImageBlockAttrsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function useResolvedImageBlockSource(
  data: ImageBlockAttrs | null,
  mediaPort: ImageMediaPort | null,
): ResolvedImageBlockSource {
  const [resolved, setResolved] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const [error, setError] = useState<{
    mediaId: string;
    message: string;
  } | null>(null);

  const managedMediaId = data?.mode === "managed" ? data.mediaId : null;

  useEffect(() => {
    if (!managedMediaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolved(null);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        if (!mediaPort) {
          throw new Error("No media port configured.");
        }
        const url = await mediaPort.resolve(managedMediaId);
        if (!cancelled) {
          setResolved({ mediaId: managedMediaId, url });
          setError(null);
        }
      } catch (error_) {
        if (!cancelled) {
          setResolved(null);
          setError({
            mediaId: managedMediaId,
            message: error_ instanceof Error ? error_.message : mediaUnavailableMessage("image"),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [managedMediaId, mediaPort]);

  const resolvedUrl =
    data?.mode === "external"
      ? data.src
      : data && resolved?.mediaId === data.mediaId
        ? resolved.url
        : null;
  const errorMessage =
    data?.mode === "managed" && error?.mediaId === data.mediaId ? error.message : null;

  return { errorMessage, resolvedUrl };
}
