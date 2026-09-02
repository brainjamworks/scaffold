// @vitest-environment happy-dom

import {
  EmbeddedNodeIdSchema,
  type MediaSource,
  type PresentationConfigurationV1,
} from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import type { MediaPort } from "@/host/ports/media";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";

import { PresentationNarrationLane } from "./PresentationNarrationLane";
import { PresentationTimeline } from "./PresentationTimeline";
import { PresentationTimelineController } from "./presentation-timeline-controller";
import type { PresentationTimelineProjection } from "./presentation-timeline-projection";
import { resolvePresentationNarrationMetadata } from "../narration/presentation-narration-metadata";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");

describe("PresentationNarrationLane", () => {
  it("resolves a managed narration label and duration through the host media seam", async () => {
    const audio = new MetadataAudio(8);
    const onDurationResolved = vi.fn();
    const media = mediaPort();

    render(
      <ScaffoldServicesProvider ports={{ media }}>
        <PresentationNarrationLane
          source={managedSource()}
          pixelsPerSecond={50}
          createAudioElement={() => audio as unknown as HTMLAudioElement}
          onDurationResolved={onDurationResolved}
        />
      </ScaffoldServicesProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: "Narration: introduction.mp3, 8 seconds" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("introduction.mp3 · 8 seconds")).toHaveStyle({ width: "400px" });
    expect(onDurationResolved).toHaveBeenCalledWith(8_000);
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

  it("expands the authored Surface duration for longer narration without changing actions", async () => {
    const audio = new MetadataAudio(8);
    const originalAudio = globalThis.Audio;
    globalThis.Audio = function Audio() {
      return audio as unknown as HTMLAudioElement;
    } as unknown as typeof Audio;
    const editor = presentationEditor();
    const controller = new PresentationTimelineController({
      semanticSelection: {
        getSnapshot: () => ({ selectedId: null }),
        subscribe: () => () => undefined,
        select: async (id) => ({ kind: "reached", id }),
      },
      initialViewport: { durationMs: 5_000, viewportWidthPx: 500 },
      zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
    });

    try {
      render(
        <ScaffoldServicesProvider ports={{ media: mediaPort() }}>
          <PresentationTimeline controller={controller} projection={projection()} editor={editor} />
        </ScaffoldServicesProvider>,
      );

      await screen.findByRole("group", { name: "Narration: voice-over.mp3, 8 seconds" });
      await waitFor(() => {
        expect(readPresentation(editor).surfaces[0]).toEqual({
          surfaceId: SURFACE_ID,
          durationMs: 8_000,
          narration: {
            source: { mode: "external", src: "https://example.test/voice-over.mp3" },
          },
          actions: [],
        });
      });
    } finally {
      controller.destroy();
      editor.destroy();
      globalThis.Audio = originalAudio;
    }
  });

  it("preserves an authored silent tail when narration is shorter", async () => {
    const audio = new MetadataAudio(3);
    const originalAudio = globalThis.Audio;
    globalThis.Audio = function Audio() {
      return audio as unknown as HTMLAudioElement;
    } as unknown as typeof Audio;
    const editor = presentationEditor();
    const controller = new PresentationTimelineController({
      semanticSelection: {
        getSnapshot: () => ({ selectedId: null }),
        subscribe: () => () => undefined,
        select: async (id) => ({ kind: "reached", id }),
      },
      initialViewport: { durationMs: 5_000, viewportWidthPx: 500 },
      zoomBounds: { minPixelsPerSecond: 10, maxPixelsPerSecond: 200 },
    });

    try {
      render(
        <ScaffoldServicesProvider ports={{ media: mediaPort() }}>
          <PresentationTimeline controller={controller} projection={projection()} editor={editor} />
        </ScaffoldServicesProvider>,
      );

      await screen.findByRole("group", { name: "Narration: voice-over.mp3, 3 seconds" });
      expect(readPresentation(editor).surfaces[0]?.durationMs).toBe(5_000);
    } finally {
      controller.destroy();
      editor.destroy();
      globalThis.Audio = originalAudio;
    }
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

function projection(): PresentationTimelineProjection {
  return {
    surfaceId: SURFACE_ID,
    configurationState: "present",
    durationMs: 5_000,
    narration: {
      source: { mode: "external", src: "https://example.test/voice-over.mp3" },
    },
    transition: null,
    orderedActionIds: [],
    rows: [
      {
        targetId: SURFACE_ID,
        parentTargetId: null,
        depth: 0,
        semanticKind: "surface",
        label: "Surface",
        summary: null,
        capabilities: {
          visualActionIds: [],
          reconstructableCommandTypes: [],
          disabledReason: null,
        },
        actions: [],
      },
    ],
    diagnostics: [],
  };
}

function presentationEditor(): Editor {
  return new Editor({
    extensions: createCourseDocumentAuthoringExtensions({
      editable: true,
      composition: createCoreScaffoldAuthoringComposition(),
    }),
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          attrs: {
            id: "course000001",
            mode: "slideshow",
            surfaceSize: "16x9",
            overflowMode: "fit",
            presentation: {
              schemaVersion: 1,
              autoAdvance: false,
              allowPrevious: true,
              surfaces: [
                {
                  surfaceId: SURFACE_ID,
                  durationMs: 5_000,
                  narration: {
                    source: {
                      mode: "external",
                      src: "https://example.test/voice-over.mp3",
                    },
                  },
                  actions: [],
                },
              ],
            },
          },
          content: [
            { type: "courseSection", attrs: { id: "section00001", title: "Presentation" } },
            slideCoverSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID }),
          ],
        },
      ],
    },
  });
}

function readPresentation(editor: Editor): PresentationConfigurationV1 {
  const presentation = editor.getJSON().content?.[0]?.attrs?.["presentation"];
  if (!presentation) throw new Error("Expected Presentation configuration.");
  return presentation as PresentationConfigurationV1;
}
