// @vitest-environment happy-dom

import {
  EmbeddedDataIdSchema,
  EmbeddedNodeIdSchema,
  type MediaSource,
  type PresentationConfigurationV1,
  type TimelineActionV1,
} from "@scaffold/contracts";
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { slideCoverSurfaceDefinition } from "@/editor/surfaces/model/templates/slide-cover";
import type { MediaPort } from "@/host/ports/media";

import {
  attachPresentationSurfaceNarration,
  type PresentationNarrationDurationResult,
} from "./presentation-narration-attachment";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const EXTERNAL: MediaSource = { mode: "external", src: "https://example.test/intro.mp3" };
const MANAGED: MediaSource = { mode: "managed", mediaId: "narration-2" };

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("attachPresentationSurfaceNarration", () => {
  it("creates Presentation and expands a zero-length Surface without any Timeline mounted", async () => {
    const editor = createPresentationEditor(null);
    let changedTransactions = 0;
    editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) changedTransactions += 1;
    });

    const { settled, result } = attach(editor, EXTERNAL, null, 4);

    expect(result.isOk()).toBe(true);
    expect(readSurfaceTimeline(editor)).toEqual({
      surfaceId: SURFACE_ID,
      durationMs: 0,
      narration: { source: EXTERNAL },
      actions: [],
    });
    expect(await settled).toEqual({
      value: {
        kind: "surface-expanded",
        surfaceId: SURFACE_ID,
        previousDurationMs: 0,
        durationMs: 4_000,
      },
    });
    expect(readSurfaceTimeline(editor)?.["durationMs"]).toBe(4_000);
    expect(changedTransactions).toBe(2);
  });

  it("retains a longer authored silent tail and its actions when narration is shorter", async () => {
    const action = manualWait();
    const editor = createPresentationEditor(
      configurationWith({ durationMs: 8_000, actions: [action] }),
    );

    const { settled } = attach(editor, EXTERNAL, null, 3);

    expect(await settled).toEqual({
      value: {
        kind: "surface-retained",
        surfaceId: SURFACE_ID,
        durationMs: 8_000,
        narrationDurationMs: 3_000,
      },
    });
    expect(readSurfaceTimeline(editor)).toEqual({
      surfaceId: SURFACE_ID,
      durationMs: 8_000,
      narration: { source: EXTERNAL },
      actions: [action],
    });
  });

  it("resolves a managed source and duration even when listing library labels fails", async () => {
    const media = narrationMediaPort();
    media.list = vi.fn(async () => Promise.reject(new Error("Library unavailable")));
    const editor = createPresentationEditor(null);

    const { settled } = attach(editor, MANAGED, media, 6);

    expect(await settled).toMatchObject({ value: { kind: "surface-expanded", durationMs: 6_000 } });
    expect(media.resolve).toHaveBeenCalledWith("narration-2");
    expect(readSurfaceTimeline(editor)?.["durationMs"]).toBe(6_000);
  });

  it("keeps narration attached and reports the typed cause when the source cannot be resolved", async () => {
    const media = narrationMediaPort();
    const cause = new Error("Managed source unavailable");
    media.resolve = vi.fn(async () => Promise.reject(cause));
    const editor = createPresentationEditor(null);

    const { settled } = attach(editor, MANAGED, media, 6);

    expect(await settled).toEqual({
      error: { reason: "narration-source-unavailable", source: MANAGED, cause },
    });
    expect(readSurfaceTimeline(editor)).toEqual({
      surfaceId: SURFACE_ID,
      durationMs: 0,
      narration: { source: MANAGED },
      actions: [],
    });
  });

  it("leaves a narration that was replaced before its duration resolved untouched", async () => {
    const editor = createPresentationEditor(null);
    const slow = new MetadataAudio(9, false);
    const { settled } = attach(editor, EXTERNAL, null, 9, () => slow);

    const replacement = attach(editor, MANAGED, narrationMediaPort(), 2);
    expect(await replacement.settled).toMatchObject({ value: { kind: "surface-expanded" } });
    slow.emitMetadata();

    expect(await settled).toEqual({
      value: { kind: "narration-superseded", surfaceId: SURFACE_ID, source: EXTERNAL },
    });
    expect(readSurfaceTimeline(editor)).toEqual({
      surfaceId: SURFACE_ID,
      durationMs: 2_000,
      narration: { source: MANAGED },
      actions: [],
    });
  });

  it("returns the checked command refusal without starting duration resolution", () => {
    const editor = createPresentationEditor(null);
    const onDurationSettled = vi.fn();
    const createAudioElement = vi.fn(() => new MetadataAudio(1) as unknown as HTMLAudioElement);

    const result = attachPresentationSurfaceNarration({
      editor,
      surfaceId: EmbeddedNodeIdSchema.parse("surface99999"),
      source: EXTERNAL,
      mediaPort: null,
      createAudioElement,
      onDurationSettled,
    });

    expect(result).toMatchObject({ error: { reason: "surface-not-current" } });
    expect(createAudioElement).not.toHaveBeenCalled();
    expect(onDurationSettled).not.toHaveBeenCalled();
  });

  it("cancels a pending resolution without touching the document", async () => {
    const editor = createPresentationEditor(null);
    const slow = new MetadataAudio(9, false);
    const onDurationSettled = vi.fn();
    const result = attachPresentationSurfaceNarration({
      editor,
      surfaceId: SURFACE_ID,
      source: EXTERNAL,
      mediaPort: null,
      createAudioElement: () => slow as unknown as HTMLAudioElement,
      onDurationSettled,
    });
    if (result.isErr()) throw new Error("Expected narration attachment to succeed.");

    result.value();
    slow.emitMetadata();
    await Promise.resolve();

    expect(onDurationSettled).not.toHaveBeenCalled();
    expect(readSurfaceTimeline(editor)?.["durationMs"]).toBe(0);
  });
});

function attach(
  editor: Editor,
  source: MediaSource,
  mediaPort: MediaPort | null,
  durationSeconds: number,
  createAudioElement: () => MetadataAudio = () => new MetadataAudio(durationSeconds),
) {
  let resolveSettled: (result: PresentationNarrationDurationResult) => void = () => undefined;
  const settled = new Promise<PresentationNarrationDurationResult>((resolve) => {
    resolveSettled = resolve;
  });
  const result = attachPresentationSurfaceNarration({
    editor,
    surfaceId: SURFACE_ID,
    source,
    mediaPort,
    createAudioElement: () => createAudioElement() as unknown as HTMLAudioElement,
    onDurationSettled: resolveSettled,
  });
  if (result.isErr()) throw new Error(`Narration attachment failed: ${result.error.reason}`);
  return { result, settled };
}

function manualWait(): TimelineActionV1 {
  return {
    kind: "manual-wait",
    id: EmbeddedDataIdSchema.parse("wait00000001"),
    isEnabled: true,
    atMs: 2_000,
  };
}

function configurationWith(surface: {
  readonly durationMs: number;
  readonly actions: TimelineActionV1[];
}): PresentationConfigurationV1 {
  return {
    schemaVersion: 1,
    autoAdvance: false,
    allowPrevious: true,
    surfaces: [{ surfaceId: SURFACE_ID, ...surface }],
  };
}

function createPresentationEditor(presentation: PresentationConfigurationV1 | null): Editor {
  const editor = new Editor({
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
            { type: "courseSection", attrs: { id: "section00001", title: "Presentation" } },
            slideCoverSurfaceDefinition.createSurface({ surfaceId: SURFACE_ID }),
          ],
        },
      ],
    },
  });
  editors.push(editor);
  return editor;
}

function readSurfaceTimeline(editor: Editor) {
  const presentation = editor.getJSON().content?.[0]?.attrs?.["presentation"] as
    | { surfaces?: Array<Record<string, unknown>> }
    | null
    | undefined;
  return presentation?.surfaces?.find((surface) => surface["surfaceId"] === SURFACE_ID);
}

class MetadataAudio extends EventTarget {
  duration: number;
  paused = true;
  preload = "";
  src = "";

  constructor(
    duration: number,
    private readonly automatic = true,
  ) {
    super();
    this.duration = duration;
  }

  load(): void {
    if (this.automatic && this.src) this.emitMetadata();
  }

  emitMetadata(): void {
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
