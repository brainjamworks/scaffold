// @vitest-environment happy-dom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type PresentationConfigurationV1,
  type SurfacePresentationNarrationV1,
  type TimelineActionV1,
} from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import type { FilePickerResult } from "@/editor/media/authoring/picker/file-picker-modal";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import type { MediaPort } from "@/host/ports/media";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";

import { PresentationNarrationControls } from "./PresentationNarrationControls";

const picker = vi.hoisted(() => ({
  result: null as FilePickerResult | null,
}));

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");

vi.mock("@/editor/media/authoring/picker/LazyFilePickerModal", () => ({
  FilePickerModal: ({
    open,
    onResolved,
  }: {
    open: boolean;
    onResolved: (result: FilePickerResult) => boolean | void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          if (!picker.result) throw new Error("The test file picker has no result.");
          onResolved(picker.result);
        }}
      >
        Choose narration file
      </button>
    ) : null,
}));

function renderControls(editor: Editor, media: MediaPort | null = null) {
  const view = render(
    <ScaffoldServicesProvider ports={{ media }}>
      <PresentationNarrationControls
        editor={editor}
        surfaceId={SURFACE_ID}
        narration={readNarration(editor)}
      />
    </ScaffoldServicesProvider>,
  );
  const rerender = () =>
    view.rerender(
      <ScaffoldServicesProvider ports={{ media }}>
        <PresentationNarrationControls
          editor={editor}
          surfaceId={SURFACE_ID}
          narration={readNarration(editor)}
        />
      </ScaffoldServicesProvider>,
    );
  return { ...view, rerender };
}

describe("PresentationNarrationControls", () => {
  it("attaches and replaces one Surface narration source through the checked command", async () => {
    const audioDurations = [4, 7];
    const originalAudio = globalThis.Audio;
    globalThis.Audio = function Audio() {
      const duration = audioDurations.shift();
      if (duration === undefined) throw new Error("Unexpected narration metadata request.");
      return new MetadataAudio(duration) as unknown as HTMLAudioElement;
    } as unknown as typeof Audio;
    const media = narrationMediaPort();
    const editor = createPresentationEditor();
    const rendered = renderControls(editor, media);

    picker.result = {
      source: "url",
      mediaType: "audio",
      url: "https://example.test/intro.mp3",
    };
    fireEvent.click(screen.getByRole("button", { name: "Add narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    await waitFor(() => {
      expect(readSurfaceTimeline(editor)).toEqual({
        surfaceId: SURFACE_ID,
        durationMs: 4_000,
        layerTracks: [],
        narration: {
          source: { mode: "external", src: "https://example.test/intro.mp3" },
        },
        actions: [],
      });
    });

    rendered.rerender();
    picker.result = {
      source: "browse",
      mediaType: "audio",
      browse: {
        id: "narration-2",
        url: "https://cdn.example.test/narration-2.mp3",
        mediaType: "audio",
        fileName: "narration-2.mp3",
        mimeType: "audio/mpeg",
        size: 42,
      },
    };
    fireEvent.click(screen.getByRole("button", { name: "Replace narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    await waitFor(() => {
      expect(readSurfaceTimeline(editor)).toEqual({
        surfaceId: SURFACE_ID,
        durationMs: 7_000,
        layerTracks: [],
        narration: { source: { mode: "managed", mediaId: "narration-2" } },
        actions: [],
      });
    });
    expect(media.resolve).toHaveBeenCalledWith("narration-2");
    editor.destroy();
    globalThis.Audio = originalAudio;
  });

  it("preserves actions and a longer authored silent tail when narration is replaced", async () => {
    const action = manualWait();
    const audio = new MetadataAudio(3);
    const originalAudio = globalThis.Audio;
    globalThis.Audio = function Audio() {
      return audio as unknown as HTMLAudioElement;
    } as unknown as typeof Audio;
    const editor = createPresentationEditor(
      configurationWith({
        durationMs: 8_000,
        narration: { source: { mode: "external", src: "https://example.test/original.mp3" } },
        actions: [action],
      }),
    );
    renderControls(editor);

    picker.result = {
      source: "url",
      mediaType: "audio",
      url: "https://example.test/replacement.mp3",
    };
    fireEvent.click(screen.getByRole("button", { name: "Replace narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    await waitFor(() => {
      expect(readSurfaceTimeline(editor)).toEqual({
        surfaceId: SURFACE_ID,
        durationMs: 8_000,
        layerTracks: [],
        narration: {
          source: { mode: "external", src: "https://example.test/replacement.mp3" },
        },
        actions: [action],
      });
    });
    editor.destroy();
    globalThis.Audio = originalAudio;
  });

  it("keeps narration attached and presents a friendly error when duration is unavailable", async () => {
    const media = narrationMediaPort();
    media.resolve = vi.fn(async () => Promise.reject(new Error("Managed source unavailable")));
    const editor = createPresentationEditor();
    renderControls(editor, media);

    picker.result = {
      source: "browse",
      mediaType: "audio",
      browse: {
        id: "narration-2",
        url: "https://cdn.example.test/narration-2.mp3",
        mediaType: "audio",
        fileName: "narration-2.mp3",
        mimeType: "audio/mpeg",
        size: 42,
      },
    };
    fireEvent.click(screen.getByRole("button", { name: "Add narration" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose narration file" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Narration was added, but its source could not be resolved to determine duration.",
    );
    expect(readSurfaceTimeline(editor)).toEqual({
      surfaceId: SURFACE_ID,
      durationMs: 0,
      layerTracks: [],
      narration: { source: { mode: "managed", mediaId: "narration-2" } },
      actions: [],
    });
    editor.destroy();
  });

  it("removes narration without changing authored actions or duration", async () => {
    const action = manualWait();
    const editor = createPresentationEditor(
      configurationWith({
        durationMs: 8_000,
        narration: { source: { mode: "external", src: "https://example.test/intro.mp3" } },
        actions: [action],
      }),
    );
    renderControls(editor);

    fireEvent.click(screen.getByRole("button", { name: "Remove narration" }));

    await waitFor(() => {
      expect(readSurfaceTimeline(editor)).toEqual({
        surfaceId: SURFACE_ID,
        durationMs: 8_000,
        layerTracks: [],
        actions: [action],
      });
    });
    editor.destroy();
  });

  it("offers no removal until a narration is attached", () => {
    const editor = createPresentationEditor();
    renderControls(editor);

    expect(screen.getByRole("button", { name: "Add narration" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove narration" })).toBeNull();
    editor.destroy();
  });
});

function manualWait(): TimelineActionV1 {
  return {
    kind: "manual-wait",
    id: EmbeddedDataIdSchema.parse("wait00000001"),
    isEnabled: true,
    atMs: 2_000,
    boundary: "before-actions",
  };
}

function configurationWith(surface: {
  readonly durationMs: number;
  readonly narration?: SurfacePresentationNarrationV1;
  readonly actions: TimelineActionV1[];
}): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId: SURFACE_ID, layerTracks: [], ...surface }],
  };
}

function createPresentationEditor(presentation: PresentationConfigurationV1 | null = null): Editor {
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
            presentation,
            surfaceSize: "16x9",
            overflowMode: "fit",
          },
          content: [
            {
              type: "courseSection",
              attrs: { id: "section00001", title: "Presentation" },
            },
            slideCoverSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID }),
          ],
        },
      ],
    },
  });
}

function readSurfaceTimeline(editor: Editor) {
  const presentation = editor.getJSON().content?.[0]?.attrs?.["presentation"] as
    | { surfaces?: Array<Record<string, unknown>> }
    | null
    | undefined;
  return presentation?.surfaces?.find((surface) => surface["surfaceId"] === SURFACE_ID);
}

function readNarration(editor: Editor): SurfacePresentationNarrationV1 | null {
  const timeline = readSurfaceTimeline(editor);
  return (timeline?.["narration"] as SurfacePresentationNarrationV1 | undefined) ?? null;
}

class MetadataAudio extends EventTarget {
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

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

function narrationMediaPort(): MediaPort {
  return {
    resolve: vi.fn(async () => "https://cdn.example.test/narration-2.mp3"),
    upload: vi.fn(async () => {
      throw new Error("Upload is not used by this test.");
    }),
    list: vi.fn(async () => []),
  };
}
