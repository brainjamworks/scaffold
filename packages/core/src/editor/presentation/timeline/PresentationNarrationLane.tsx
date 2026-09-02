import type { MediaSource } from "@scaffold/contracts";
import { useEffect, useState } from "react";

import type { MediaPort } from "@/host/ports/media";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";

export interface PresentationNarrationLaneProps {
  readonly source: MediaSource;
  readonly pixelsPerSecond: number;
  readonly createAudioElement?: () => HTMLAudioElement;
  readonly onDurationResolved?: (durationMs: number) => void;
}

type NarrationMetadataState =
  | { readonly status: "loading"; readonly label: string }
  | { readonly status: "ready"; readonly label: string; readonly durationMs: number }
  | {
      readonly status: "unavailable";
      readonly label: string;
      readonly error: PresentationNarrationMetadataError;
    };

export interface PresentationNarrationMetadataError {
  readonly reason: "narration-metadata-unavailable";
  readonly source: MediaSource;
  readonly cause: unknown;
}

const createNarrationAudioElement = () => new Audio();

export function PresentationNarrationLane({
  source,
  pixelsPerSecond,
  createAudioElement = createNarrationAudioElement,
  onDurationResolved,
}: PresentationNarrationLaneProps) {
  const mediaPort = useMediaPort();
  const [metadata, setMetadata] = useState<NarrationMetadataState>(() => ({
    status: "loading",
    label: fallbackLabel(source),
  }));

  useEffect(() => {
    let active = true;
    let audio: HTMLAudioElement | undefined;
    let removeAudioListeners = () => undefined;

    void (async () => {
      let label: string;
      try {
        label = await resolveNarrationLabel(source, mediaPort);
      } catch (cause) {
        if (!active) return;
        setMetadata({
          status: "unavailable",
          label: fallbackLabel(source),
          error: { reason: "narration-metadata-unavailable", source, cause },
        });
        return;
      }
      if (!active) return;
      setMetadata({ status: "loading", label });

      let url: string;
      try {
        url = await resolveNarrationUrl(source, mediaPort);
      } catch (cause) {
        if (!active) return;
        setMetadata({
          status: "unavailable",
          label,
          error: { reason: "narration-metadata-unavailable", source, cause },
        });
        return;
      }
      if (!active) return;

      audio = createAudioElement();
      const handleMetadata = () => {
        if (!active || !audio) return;
        const durationMs = Math.round(audio.duration * 1_000);
        if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
          setMetadata({
            status: "unavailable",
            label,
            error: {
              reason: "narration-metadata-unavailable",
              source,
              cause: new Error("Narration duration is not finite."),
            },
          });
          return;
        }
        setMetadata({ status: "ready", label, durationMs });
        onDurationResolved?.(durationMs);
      };
      const handleError = (event: Event) => {
        if (!active) return;
        setMetadata({
          status: "unavailable",
          label,
          error: { reason: "narration-metadata-unavailable", source, cause: event },
        });
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
      active = false;
      removeAudioListeners();
      if (audio) {
        audio.removeAttribute("src");
        audio.load();
      }
    };
  }, [createAudioElement, mediaPort, onDurationResolved, source]);

  const durationText =
    metadata.status === "ready" ? formatNarrationDuration(metadata.durationMs) : "Loading duration";
  const accessibleDuration =
    metadata.status === "unavailable" ? "metadata unavailable" : durationText.toLowerCase();

  return (
    <div
      className="sc-presentation-timeline-action-lane"
      role="group"
      aria-label={`Narration: ${metadata.label}, ${accessibleDuration}`}
    >
      <div
        className="sc-presentation-timeline-action"
        data-action-kind="narration"
        style={{
          left: 0,
          width:
            metadata.status === "ready" ? (metadata.durationMs / 1_000) * pixelsPerSecond : "100%",
          cursor: "default",
        }}
      >
        {metadata.label} · {durationText}
      </div>
      {metadata.status === "unavailable" ? (
        <span className="sc-presentation-timeline-authoring-error" role="status">
          Narration metadata unavailable
        </span>
      ) : null}
    </div>
  );
}

async function resolveNarrationLabel(source: MediaSource, mediaPort: MediaPort | null) {
  if (source.mode === "external") return labelFromUrl(source.src);
  if (!mediaPort?.list) return "Narration audio";
  const items = await mediaPort.list({ mediaType: "audio" });
  return items.find(({ id }) => id === source.mediaId)?.fileName ?? "Narration audio";
}

async function resolveNarrationUrl(source: MediaSource, mediaPort: MediaPort | null) {
  if (source.mode === "external") return source.src;
  if (!mediaPort) throw new Error("No media service is configured for managed narration.");
  return mediaPort.resolve(source.mediaId);
}

function fallbackLabel(source: MediaSource): string {
  return source.mode === "external" ? labelFromUrl(source.src) : "Narration audio";
}

function labelFromUrl(url: string): string {
  const name = new URL(url).pathname.split("/").filter(Boolean).at(-1);
  return name ? decodeURIComponent(name) : "Narration audio";
}

function formatNarrationDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))} seconds`;
}
