// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import { createCoreScaffoldRuntimeComposition } from "@/composition/runtime/scaffold-runtime-composition";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import type { LearnerActivityPort, LearningEventPort } from "@/host/ports";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import {
  LearnerActivityReadinessGate,
  LearnerActivityRuntimeProvider,
} from "@/runtime/learner-activity";
import { LearningEventRuntimeProvider } from "@/runtime/learning-events/LearningEventRuntimeProvider";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
} from "./content";

const runtimeComposition = createCoreScaffoldRuntimeComposition();

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("Flashcard semantic runtime", () => {
  it("changes only the current card when semantic activation reveals a hidden card", async () => {
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      updatedAt: "2026-08-24T12:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const editor = new Editor({
      editable: false,
      extensions: createCourseDocumentRuntimeExtensions({ composition: runtimeComposition }),
      content: runtimeFlashcardDocument(),
    });
    const initiatingControl = document.createElement("button");
    const click = vi.fn();
    const keydown = vi.fn();
    const pointerdown = vi.fn();

    try {
      document.body.append(initiatingControl);
      initiatingControl.focus();
      document.addEventListener("click", click);
      document.addEventListener("keydown", keydown);
      document.addEventListener("pointerdown", pointerdown);
      const rendered = render(
        <ScaffoldServicesProvider
          ports={{
            learnerActivity: {
              load: vi.fn(async () => null),
              save,
            },
            learningEvents: {
              rootActivityId: "https://lms.example.test/courses/flashcards",
              accept,
            },
          }}
        >
          <ScaffoldArtifactIdentityProvider artifactId="flashcard-semantic-runtime">
            <LearningEventRuntimeProvider>
              <LearnerActivityRuntimeProvider>
                <LearnerActivityReadinessGate>
                  <EditorContent editor={editor} />
                </LearnerActivityReadinessGate>
              </LearnerActivityRuntimeProvider>
            </LearningEventRuntimeProvider>
          </ScaffoldArtifactIdentityProvider>
        </ScaffoldServicesProvider>,
      );

      const ownerId = EmbeddedNodeIdSchema.parse("flashdeck001");
      const firstCardId = EmbeddedNodeIdSchema.parse("flashcard001");
      const targetId = EmbeddedNodeIdSchema.parse("flashcard002");
      const environment = getSemanticTargetInteractionEnvironmentForEditor(editor);
      await waitFor(() => {
        expect(environment.registry.resolve(ownerId).kind).toBe("resolved");
        expect(flashcardElement(editor, firstCardId)).not.toHaveClass(
          "sc-course-flashcard-card--inactive",
        );
        expect(flashcardElement(editor, targetId)).toHaveClass(
          "sc-course-flashcard-card--inactive",
        );
        expect(save).toHaveBeenCalled();
      });
      const authoredDocument = editor.getJSON();
      const selection = editor.state.selection.toJSON();
      save.mockClear();

      await expect(
        environment.coordinator.activate(targetId, { origin: "configured-presentation" }),
      ).resolves.toEqual({ kind: "reached", requestedId: targetId });

      await waitFor(() => {
        expect(flashcardElement(editor, firstCardId)).toHaveClass(
          "sc-course-flashcard-card--inactive",
        );
        expect(flashcardElement(editor, targetId)).not.toHaveClass(
          "sc-course-flashcard-card--inactive",
        );
      });
      expect(save).not.toHaveBeenCalled();
      expect(flashcardElement(editor, targetId)).toHaveAttribute("data-flashcard-flipped", "false");
      expect(flashcardElement(editor, targetId)).toHaveAttribute(
        "data-flashcard-mastery",
        "unrated",
      );
      expect(accept).not.toHaveBeenCalled();
      expect(editor.getJSON()).toEqual(authoredDocument);
      expect(editor.state.selection.toJSON()).toEqual(selection);
      expect(document.activeElement).toBe(initiatingControl);
      expect(click).not.toHaveBeenCalled();
      expect(keydown).not.toHaveBeenCalled();
      expect(pointerdown).not.toHaveBeenCalled();

      rendered.unmount();
      expect(environment.registry.resolve(ownerId)).toEqual({
        kind: "unavailable",
        ownerId,
        reason: "owner-unmounted",
      });
    } finally {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
      editor.destroy();
    }
  });
});

function runtimeFlashcardDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceFl001", variant: "page-default" },
            content: [
              {
                type: FLASHCARD_NODE,
                attrs: {
                  id: "flashdeck001",
                  data: { type: "flashcard", shuffle: false },
                },
                content: [
                  flashcardCard("flashcard001", "First"),
                  flashcardCard("flashcard002", "Second"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function flashcardCard(id: string, label: string): JSONContent {
  return {
    type: FLASHCARD_CARD_NODE,
    attrs: { id },
    content: [
      {
        type: FLASHCARD_CARD_FRONT_NODE,
        content: [{ type: "paragraph", content: [{ type: "text", text: `${label} front` }] }],
      },
      {
        type: FLASHCARD_CARD_BACK_NODE,
        content: [{ type: "paragraph", content: [{ type: "text", text: `${label} back` }] }],
      },
    ],
  };
}

function flashcardElement(editor: Editor, cardId: string): HTMLElement {
  const card = editor.view.dom.querySelector<HTMLElement>(
    `[data-node="flashcard-card"][data-id="${cardId}"]`,
  );
  if (!card) throw new Error(`Missing runtime Flashcard card "${cardId}"`);
  return card;
}
