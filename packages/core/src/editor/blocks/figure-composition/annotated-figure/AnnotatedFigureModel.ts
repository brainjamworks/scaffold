import { useEffect, useState } from "react";

import type { AnnotatedFigureData } from "@scaffold/contracts";

import { mediaUnavailableMessage } from "@/editor/media/accessibility/media-accessibility";

export interface AnnotatedFigureMediaPort {
  resolve: (mediaId: string) => Promise<string>;
}

export interface AnnotatedFigureResolvedSource {
  mediaId: string;
  url: string;
}

export interface ResolvedAnnotatedFigureSource {
  errorMessage: string | null;
  resolvedUrl: string | null;
}

export function resolveAnnotatedFigureUrl({
  data,
  resolved,
}: {
  data: AnnotatedFigureData;
  resolved: AnnotatedFigureResolvedSource | null;
}): string | null {
  if (data.source?.mode === "external") return data.source.src;
  const managedMediaId = data.source?.mode === "managed" ? data.source.mediaId : null;
  return resolved?.mediaId === managedMediaId ? resolved.url : null;
}

export function useResolvedAnnotatedFigureSource(
  data: AnnotatedFigureData,
  mediaPort: AnnotatedFigureMediaPort | null,
): ResolvedAnnotatedFigureSource {
  const [resolved, setResolved] = useState<AnnotatedFigureResolvedSource | null>(null);
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
    void (async () => {
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

  const resolvedUrl = resolveAnnotatedFigureUrl({ data, resolved });
  const errorMessage =
    data.source?.mode === "managed" && error?.mediaId === data.source.mediaId
      ? error.message
      : null;

  return { errorMessage, resolvedUrl };
}
