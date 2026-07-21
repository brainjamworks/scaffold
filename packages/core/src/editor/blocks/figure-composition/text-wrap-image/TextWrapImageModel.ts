import { useEffect, useState } from "react";
import { TextWrapImageDataSchema, type TextWrapImageData } from "@scaffold/contracts";

import { mediaUnavailableMessage } from "@/editor/media/accessibility/media-accessibility";
import { emptyTextWrapImageData } from "./content";

export interface TextWrapImageMediaPort {
  resolve: (mediaId: string) => Promise<string>;
}

export interface TextWrapImageResolvedSource {
  mediaId: string;
  url: string;
}

export interface ResolvedTextWrapImageSource {
  errorMessage: string | null;
  resolvedUrl: string | null;
}

export function parseTextWrapImageData(raw: unknown): TextWrapImageData {
  const parsed = TextWrapImageDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyTextWrapImageData();
}

export function normalizeTextWrapImageData(next: Partial<TextWrapImageData>): TextWrapImageData {
  return TextWrapImageDataSchema.parse(next);
}

export function resolveTextWrapImageUrl({
  data,
  resolved,
}: {
  data: TextWrapImageData;
  resolved: TextWrapImageResolvedSource | null;
}): string | null {
  if (data.source?.mode === "external") return data.source.src;
  const managedMediaId = data.source?.mode === "managed" ? data.source.mediaId : null;
  return resolved?.mediaId === managedMediaId ? resolved.url : null;
}

export function useResolvedTextWrapImageSource(
  data: TextWrapImageData,
  mediaPort: TextWrapImageMediaPort | null,
): ResolvedTextWrapImageSource {
  const [resolved, setResolved] = useState<TextWrapImageResolvedSource | null>(null);
  const [error, setError] = useState<{
    mediaId: string;
    message: string;
  } | null>(null);
  const managedMediaId = data.source?.mode === "managed" ? data.source.mediaId : null;

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
        if (!cancelled) setResolved(null);
        if (!cancelled) {
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

  const resolvedUrl = resolveTextWrapImageUrl({ data, resolved });
  const errorMessage =
    data.source?.mode === "managed" && error?.mediaId === data.source.mediaId
      ? error.message
      : null;

  return { errorMessage, resolvedUrl };
}
