// @vitest-environment happy-dom

import { type MediaSource } from "@scaffold/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MediaPort } from "@/host/ports/media";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import { PresentationNarrationLane } from "./PresentationNarrationLane";
import { resolvePresentationNarrationMetadata } from "../narration/presentation-narration-metadata";

describe("PresentationNarrationLane", () => {
  it("resolves a managed narration label and duration through the host media seam", async () => {
    const audio = new MetadataAudio(8);
    const media = mediaPort();

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <PresentationNarrationLane
          source={managedSource()}
          pixelsPerSecond={50}
          createAudioElement={() => audio as unknown as HTMLAudioElement}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Narration: introduction.mp3, 8 seconds" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("introduction.mp3 · 8 seconds")).toHaveStyle({ width: "400px" });
    expect(media.resolve).toHaveBeenCalledWith("narration-1");
    expect(media.list).toHaveBeenCalledWith({ mediaType: "audio" });
  });

  it("renders a simple duration lane when the host supplies no waveform metadata", async () => {
    const audio = new MetadataAudio(3.5);

    const { container } = render(
      <ScaffoldServicesProvider ports={{ media: mediaPort() }}>
        <PresentationNarrationLane
          source={{ mode: "external", src: "https://example.test/voice-over.mp3" }}
          pixelsPerSecond={40}
          createAudioElement={() => audio as unknown as HTMLAudioElement}
        />
      </ScaffoldServicesProvider>,
    );

    await screen.findByText("voice-over.mp3 · 3.5 seconds");
    expect(container.querySelector("[data-waveform]")).toBeNull();
  });

  it("falls back to a generic managed label while still resolving duration", async () => {
    const audio = new MetadataAudio(8);
    const media = mediaPort();
    const cause = new Error("Library unavailable");
    media.list = vi.fn(async () => Promise.reject(cause));

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <PresentationNarrationLane
          source={managedSource()}
          pixelsPerSecond={50}
          createAudioElement={() => audio as unknown as HTMLAudioElement}
        />
      </ScaffoldServicesProvider>,
    );

    expect(await screen.findByText("Narration audio · 8 seconds")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Narration: Narration audio, 8 seconds" }),
    ).toBeInTheDocument();
    expect(media.resolve).toHaveBeenCalledWith("narration-1");
  });

  it("labels genuinely unavailable duration instead of remaining in loading state", async () => {
    const media = mediaPort();
    media.resolve = vi.fn(async () => Promise.reject(new Error("Source unavailable")));

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <PresentationNarrationLane source={managedSource()} pixelsPerSecond={50} />
      </ScaffoldServicesProvider>,
    );

    expect(await screen.findByText("Narration metadata unavailable")).toBeInTheDocument();
    expect(screen.getByText("Narration audio · Duration unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Loading duration/)).toBeNull();
  });

  it("preserves the managed source-resolution failure cause", async () => {
    const source = managedSource();
    const cause = new Error("Source unavailable");
    const media = mediaPort();
    media.resolve = vi.fn(async () => Promise.reject(cause));

    const result = await resolveMetadataResult({ source, media });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("Expected narration source resolution to fail.");
    expect(result.error).toEqual({ reason: "narration-source-unavailable", source, cause });
  });

  it("preserves the native duration failure cause", async () => {
    const source: MediaSource = {
      mode: "external",
      src: "https://example.test/voice-over.mp3",
    };
    const cause = new Event("error");

    const result = await resolveMetadataResult({
      source,
      media: null,
      createAudioElement: () => new MetadataErrorAudio(cause) as unknown as HTMLAudioElement,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("Expected narration duration resolution to fail.");
    expect(result.error).toEqual({ reason: "narration-duration-unavailable", source, cause });
  });
});

class MetadataAudio extends EventTarget {
  currentTime = 0;
  duration: number;
  paused = true;
  preload = "";
  src = "";

  constructor(duration: number) {
    super();
    this.duration = duration;
  }

  load(): void {
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  }

  pause(): void {}

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

class MetadataErrorAudio extends EventTarget {
  paused = true;
  preload = "";
  src = "";

  constructor(private readonly cause: Event) {
    super();
  }

  load(): void {
    queueMicrotask(() => this.dispatchEvent(this.cause));
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

function resolveMetadataResult({
  source,
  media,
  createAudioElement = () => new MetadataAudio(1) as unknown as HTMLAudioElement,
}: {
  source: MediaSource;
  media: MediaPort | null;
  createAudioElement?: () => HTMLAudioElement;
}) {
  return new Promise<
    Parameters<Parameters<typeof resolvePresentationNarrationMetadata>[0]["onResult"]>[0]
  >((resolve) => {
    resolvePresentationNarrationMetadata({
      source,
      mediaPort: media,
      createAudioElement,
      onResult: resolve,
    });
  });
}

function managedSource(): MediaSource {
  return { mode: "managed", mediaId: "narration-1" };
}

function mediaPort(): MediaPort {
  return {
    resolve: vi.fn(async () => "https://cdn.example.test/introduction.mp3"),
    upload: vi.fn(async () => {
      throw new Error("Upload is not used by this test.");
    }),
    list: vi.fn<NonNullable<MediaPort["list"]>>(async () => [
      {
        id: "narration-1",
        url: "https://cdn.example.test/introduction.mp3",
        mediaType: "audio" as const,
        fileName: "introduction.mp3",
        mimeType: "audio/mpeg",
        size: 42,
      },
    ]),
  };
}

