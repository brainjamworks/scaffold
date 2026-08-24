import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { render as renderBrowserReact } from "vitest-browser-react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import { emptyGalleryData } from "@/editor/blocks/figure-composition/gallery/content";
import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "@/editor/blocks/presentation/flashcard/content";
import { emptyTimelineData } from "@/editor/blocks/presentation/timeline/content";
import type { LearnerActivityPort, LearningEventPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "@/runtime/learner-activity";
import { LearningEventRuntimeProvider } from "@/runtime/learning-events/LearningEventRuntimeProvider";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { CourseDocumentRuntimeRenderer } from "./CourseDocumentRuntimeRenderer";

const runtimeComposition = createCoreScaffoldRuntimeComposition();
const IDS = {
  surface: id("surface00001"),
  gallery: id("gallery00001"),
  firstGalleryItem: id("galleryitem1"),
  secondGalleryItem: id("galleryitem2"),
  flashcard: id("flashcard001"),
  firstFlashcardCard: id("flashcard101"),
  secondFlashcardCard: id("flashcard102"),
  timeline: id("timeline0001"),
  firstTimelineEntry: id("timelineitm1"),
  secondTimelineEntry: id("timelineitm2"),
} as const;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("mounted semantic target interaction runtime", () => {
  it("reaches stateful and scroll-owned targets without authoring or learner side effects", async () => {
    let editor: TiptapEditor | null = null;
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      updatedAt: "2026-08-24T20:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const click = vi.fn();
    const keydown = vi.fn();
    const pointerdown = vi.fn();
    const windowScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    document.addEventListener("click", click);
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", pointerdown);

    const rendered = await renderBrowserReact(
      <ScaffoldServicesProvider
        ports={{
          learnerActivity: { load: async () => null, save },
          learningEvents: {
            rootActivityId: "https://lms.example.test/courses/semantic-runtime",
            accept,
          },
        }}
      >
        <ScaffoldArtifactIdentityProvider artifactId="semantic-runtime-browser">
          <LearningEventRuntimeProvider>
            <LearnerActivityRuntimeProvider>
              <LearnerActivityReadinessGate>
                <button type="button">Presentation control</button>
                <CourseDocumentRuntimeRenderer
                  artifactId="semantic-runtime-browser"
                  composition={runtimeComposition}
                  initialContent={runtimeDocument()}
                  onReady={(readyEditor) => {
                    editor = readyEditor;
                  }}
                  productAccess={{ scaffoldPlusAuthorized: false }}
                  visibleSurfaceId={IDS.surface}
                />
              </LearnerActivityReadinessGate>
            </LearnerActivityRuntimeProvider>
          </LearningEventRuntimeProvider>
        </ScaffoldArtifactIdentityProvider>
      </ScaffoldServicesProvider>,
    );

    try {
      await expect.poll(() => editor).not.toBeNull();
      const mountedEditor = editor!;
      const environment = getSemanticTargetInteractionEnvironmentForEditor(mountedEditor);
      await expect
        .poll(() =>
          [IDS.gallery, IDS.flashcard, IDS.timeline].every(
            (ownerId) => environment.registry.resolve(ownerId).kind === "resolved",
          ),
        )
        .toBe(true);
      await expect.poll(() => save.mock.calls.length).toBeGreaterThan(0);

      const control = roleElement<HTMLButtonElement>("button", "Presentation control");
      control.focus();
      const authoredDocument = mountedEditor.getJSON();
      const selection = mountedEditor.state.selection.toJSON();
      const dispatch = vi.spyOn(mountedEditor.view, "dispatch");
      const targetTimelineEntry = timelineEntry(IDS.secondTimelineEntry);
      const timelineTrack = requiredElement<HTMLElement>(
        mountedEditor.view.dom,
        `[data-runtime-frame="block"][data-id="${IDS.timeline}"] .sc-course-timeline__track`,
      );
      const timelineScroll = installHorizontalRevealGeometry(timelineTrack, targetTimelineEntry);
      save.mockClear();
      accept.mockClear();
      click.mockClear();
      keydown.mockClear();
      pointerdown.mockClear();

      await expect(
        environment.coordinator.activate(IDS.secondGalleryItem, {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: IDS.secondGalleryItem });
      await expect.element(page.getByRole("img", { name: "Second runtime image" })).toBeVisible();
      expect(page.getByRole("dialog", { name: "Gallery viewer" }).elements()).toHaveLength(0);

      await expect(
        environment.coordinator.activate(IDS.secondFlashcardCard, {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: IDS.secondFlashcardCard });
      await expect
        .poll(() =>
          flashcardCard(IDS.secondFlashcardCard).classList.contains(
            "sc-course-flashcard-card--inactive",
          ),
        )
        .toBe(false);
      expect(flashcardCard(IDS.secondFlashcardCard)).toHaveAttribute(
        "data-flashcard-flipped",
        "false",
      );
      expect(flashcardCard(IDS.secondFlashcardCard)).toHaveAttribute(
        "data-flashcard-mastery",
        "unrated",
      );
      expect(save).toHaveBeenLastCalledWith({
        artifactId: "semantic-runtime-browser",
        blockId: IDS.flashcard,
        record: {
          activityKind: "flashcard",
          completed: false,
          data: {
            currentCardId: IDS.secondFlashcardCard,
            flipped: {},
            mastery: {},
            total: 2,
          },
        },
      });

      await expect(
        environment.coordinator.activate(IDS.secondTimelineEntry, {
          origin: "configured-presentation",
        }),
      ).resolves.toEqual({ kind: "reached", requestedId: IDS.secondTimelineEntry });

      expect(timelineScroll).toHaveBeenCalledWith({ behavior: "smooth", left: 260 });
      expect(mountedEditor.getJSON()).toEqual(authoredDocument);
      expect(mountedEditor.state.selection.toJSON()).toEqual(selection);
      expect(dispatch).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(control);
      expect(windowScroll).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      expect(keydown).not.toHaveBeenCalled();
      expect(pointerdown).not.toHaveBeenCalled();
      expect(accept).not.toHaveBeenCalled();
      expect(page.getByRole("dialog", { name: "Gallery viewer" }).elements()).toHaveLength(0);
    } finally {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
      await rendered.unmount();
    }
  });
});

function runtimeDocument(): JSONContent {
  const content = createScaffoldDocumentContent({
    initialCourseSectionTitle: "Semantic runtime",
    mode: "slideshow",
    surfaceId: IDS.surface,
  });
  const courseDocument = content.content?.[0];
  const surface = courseDocument?.content?.find((node) => node.type === "surface");
  if (!courseDocument || !surface) throw new Error("Expected runtime Surface fixture.");
  surface.content = [galleryContent(), flashcardContent(), timelineContent()];
  assignMissingIds(content);
  return content;
}

function galleryContent(): JSONContent {
  return {
    type: "gallery",
    attrs: {
      id: IDS.gallery,
      data: emptyGalleryData({ layout: "carousel" }),
    },
    content: [
      galleryItem(IDS.firstGalleryItem, "First runtime image"),
      galleryItem(IDS.secondGalleryItem, "Second runtime image"),
    ],
  };
}

function galleryItem(itemId: EmbeddedNodeId, alt: string): JSONContent {
  return {
    type: "gallery_item",
    attrs: {
      id: itemId,
      data: {
        image: { mode: "external", src: `https://example.com/${itemId}.jpg`, alt },
        caption: { type: "doc", content: [{ type: "paragraph" }] },
      },
    },
  };
}

function flashcardContent(): JSONContent {
  return {
    type: FLASHCARD_NODE,
    attrs: { id: IDS.flashcard, data: { type: "flashcard", shuffle: false } },
    content: [
      flashcardCardContent(IDS.firstFlashcardCard, "First"),
      flashcardCardContent(IDS.secondFlashcardCard, "Second"),
    ],
  };
}

function flashcardCardContent(cardId: EmbeddedNodeId, label: string): JSONContent {
  return {
    type: FLASHCARD_CARD_NODE,
    attrs: { id: cardId },
    content: [
      {
        type: FLASHCARD_CARD_FRONT_NODE,
        content: [paragraph(`${label} front`)],
      },
      {
        type: FLASHCARD_CARD_BACK_NODE,
        content: [paragraph(`${label} back`)],
      },
    ],
  };
}

function timelineContent(): JSONContent {
  return {
    type: "timeline",
    attrs: {
      id: IDS.timeline,
      data: emptyTimelineData({ presentation: "carousel" }),
    },
    content: [
      timelineItem(IDS.firstTimelineEntry, "First entry"),
      timelineItem(IDS.secondTimelineEntry, "Second entry"),
    ],
  };
}

function timelineItem(entryId: EmbeddedNodeId, label: string): JSONContent {
  return {
    type: "timeline_item",
    attrs: { id: entryId },
    content: [paragraph("2026"), paragraph(label), paragraph(`${label} body`)],
  };
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function assignMissingIds(node: JSONContent): void {
  if (node.type !== "doc" && node.type !== "text") {
    node.attrs = { ...node.attrs, id: node.attrs?.["id"] ?? createEmbeddedNodeId() };
  }
  for (const child of node.content ?? []) assignMissingIds(child);
}

function flashcardCard(cardId: EmbeddedNodeId): HTMLElement {
  return requiredElement(document, `[data-node="flashcard-card"][data-id="${cardId}"]`);
}

function timelineEntry(entryId: EmbeddedNodeId): HTMLElement {
  return requiredElement(document, `[data-timeline-entry-id="${entryId}"]`);
}

function installHorizontalRevealGeometry(track: HTMLElement, target: HTMLElement) {
  Object.defineProperty(track, "clientWidth", { configurable: true, value: 200 });
  track.getBoundingClientRect = () => DOMRect.fromRect({ height: 160, width: 200, x: 20, y: 20 });
  target.getBoundingClientRect = () =>
    DOMRect.fromRect({ height: 80, width: 80, x: 340 - track.scrollLeft, y: 50 });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    if (typeof options.left === "number") track.scrollLeft = options.left;
  });
  Object.defineProperty(track, "scrollTo", { configurable: true, value: scrollTo });
  return scrollTo;
}

function requiredElement<ElementType extends Element>(
  root: ParentNode,
  selector: string,
): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Expected element matching ${selector}`);
  return element;
}

function roleElement<ElementType extends HTMLElement>(role: string, label: string): ElementType {
  const element = Array.from(
    document.querySelectorAll<ElementType>(`[role="${role}"],${role}`),
  ).find(
    (candidate) =>
      candidate.textContent === label || candidate.getAttribute("aria-label") === label,
  );
  if (!element) throw new Error(`Expected ${role} named ${label}`);
  return element;
}

function id(value: string): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(value);
}
