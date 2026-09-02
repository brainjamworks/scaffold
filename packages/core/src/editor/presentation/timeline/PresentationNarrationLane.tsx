import type { MediaSource } from "@scaffold/contracts";
import { useEffect, useState } from "react";

import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import {
  fallbackNarrationLabel,
  resolvePresentationNarrationMetadata,
  type PresentationNarrationMetadataError,
} from "@/editor/presentation/narration/presentation-narration-metadata";

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
    label: fallbackNarrationLabel(source),
  }));

  useEffect(() => {
    let active = true;
    setMetadata({ status: "loading", label: fallbackNarrationLabel(source) });
    const dispose = resolvePresentationNarrationMetadata({
      source,
      mediaPort,
      createAudioElement,
      onResult: (result) => {
        if (!active) return;
        if (result.isErr()) {
          setMetadata({
            status: "unavailable",
            label: fallbackNarrationLabel(source),
            error: result.error,
          });
          return;
        }
        setMetadata({ status: "ready", ...result.value });
        onDurationResolved?.(result.value.durationMs);
      },
    });

    return () => {
      active = false;
      dispose();
    };
  }, [createAudioElement, mediaPort, onDurationResolved, source]);

  const durationText =
    metadata.status === "ready"
      ? formatNarrationDuration(metadata.durationMs)
      : metadata.status === "unavailable"
        ? "Duration unavailable"
        : "Loading duration";
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

function formatNarrationDuration(durationMs: number): string {
  const seconds = durationMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))} seconds`;
}
