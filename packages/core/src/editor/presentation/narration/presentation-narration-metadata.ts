import type { MediaSource } from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

import type { MediaPort } from "@/host/ports/media";

export interface PresentationNarrationMetadata {
  readonly label: string;
  readonly durationMs: number;
}

export type PresentationNarrationMetadataError =
  | {
      readonly reason: "narration-source-unavailable";
      readonly source: MediaSource;
      readonly cause: unknown;
    }
  | {
      readonly reason: "narration-duration-unavailable";
      readonly source: MediaSource;
      readonly cause: unknown;
    };

export function resolvePresentationNarrationMetadata({
  source,
  mediaPort,
  createAudioElement,
  onResult,
}: {
  readonly source: MediaSource;
  readonly mediaPort: MediaPort | null;
  readonly createAudioElement: () => HTMLAudioElement;
  readonly onResult: (
    result: ResultType<PresentationNarrationMetadata, PresentationNarrationMetadataError>,
  ) => void;
}): () => void {
  let active = true;
  let audio: HTMLAudioElement | undefined;
  let removeAudioListeners = () => undefined;

  const finish = (
    result: ResultType<PresentationNarrationMetadata, PresentationNarrationMetadataError>,
  ) => {
    if (!active) return;
    active = false;
    removeAudioListeners();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
    onResult(result);
  };

  void (async () => {
    const label = await resolveNarrationLabel(source, mediaPort);
    if (!active) return;

    let url: string;
    try {
      url = await resolveNarrationUrl(source, mediaPort);
    } catch (cause) {
      finish(
        Result.err(
          Object.freeze({ reason: "narration-source-unavailable", source, cause } as const),
        ),
      );
      return;
    }
    if (!active) return;

    audio = createAudioElement();
    const handleMetadata = () => {
      if (!audio) return;
      const durationMs = Math.round(audio.duration * 1_000);
      if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
        finish(
          Result.err(
            Object.freeze({
              reason: "narration-duration-unavailable",
              source,
              cause: new Error("Narration duration is not finite."),
            }),
          ),
        );
        return;
      }
      finish(Result.ok(Object.freeze({ label, durationMs })));
    };
    const handleError = (cause: Event) => {
      finish(
        Result.err(
          Object.freeze({ reason: "narration-duration-unavailable", source, cause } as const),
        ),
      );
    };
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("error", handleError);
    removeAudioListeners = () => {
      audio?.removeEventListener("loadedmetadata", handleMetadata);
      audio?.removeEventListener("error", handleError);
    };
    audio.preload = "metadata";
    audio.src = url;
    audio.load();
  })();

  return () => {
    if (!active) return;
    active = false;
    removeAudioListeners();
    if (audio) {
      audio.removeAttribute("src");
      audio.load();
    }
  };
}

export function presentPresentationNarrationMetadataError(
  error: PresentationNarrationMetadataError,
): string {
  switch (error.reason) {
    case "narration-source-unavailable":
      return "Narration was added, but its source could not be resolved to determine duration.";
    case "narration-duration-unavailable":
      return "Narration was added, but its duration is unavailable.";
  }
}

async function resolveNarrationLabel(source: MediaSource, mediaPort: MediaPort | null) {
  if (source.mode === "external") return labelFromUrl(source.src);
  if (!mediaPort?.list) return "Narration audio";
  try {
    const items = await mediaPort.list({ mediaType: "audio" });
    return items.find(({ id }) => id === source.mediaId)?.fileName ?? "Narration audio";
  } catch {
    return "Narration audio";
  }
}

async function resolveNarrationUrl(source: MediaSource, mediaPort: MediaPort | null) {
  if (source.mode === "external") return source.src;
  if (!mediaPort) throw new Error("No media service is configured for managed narration.");
  return mediaPort.resolve(source.mediaId);
}

export function fallbackNarrationLabel(source: MediaSource): string {
  return source.mode === "external" ? labelFromUrl(source.src) : "Narration audio";
}

function labelFromUrl(url: string): string {
  const name = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  return name ? decodeURIComponent(name) : "Narration audio";
}
