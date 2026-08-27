// @vitest-environment jsdom

import type { EmbeddedNodeId, LearnerActivitySnapshot } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import {
  createCourseDocumentAuthoringEnvironment,
  getCourseDocumentAuthoringEnvironmentState,
} from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import {
  getControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
} from "@/document/control-binding";
import { getSemanticTargetInteractionEnvironmentForEditor } from "@/document/semantic-target-interaction";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
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
import { flashcardBlockDefinition } from "./flashcard-definition";

const application = createScaffoldApplication();
const editors: Editor[] = [];
const OWNER_ID = "flashdeckCtl" as EmbeddedNodeId;
const FIRST_CARD_ID = "flashcardC01" as EmbeddedNodeId;
const SECOND_CARD_ID = "flashcardC02" as EmbeddedNodeId;

afterEach(() => {
  cleanup();
  for (const editor of editors.splice(0)) editor.destroy();
});

describe("Flashcard Control Binding", () => {
  it("declares only the approved owner and public-card capabilities", () => {
    expect((flashcardBlockDefinition as BlockDefinition).control).toEqual({
      owner: {
        events: [{ type: "completed", label: "Completed" }],
        states: [
          {
            key: "completed",
            label: "Completed",
            valueType: { kind: "boolean" },
          },
        ],
      },
      semanticChildren: {
        flashcard_card: {
          events: [
            { type: "selected", label: "Selected" },
            { type: "flipped", label: "Flipped" },
            { type: "rated", label: "Rated" },
          ],
          states: [
            {
              key: "selected",
              label: "Selected",
              valueType: { kind: "boolean" },
            },
            {
              key: "flipped",
              label: "Flipped",
              valueType: { kind: "boolean" },
            },
            {
              key: "mastery",
              label: "Mastery",
              valueType: {
                kind: "enum",
                options: [
                  { value: "unrated", label: "Unrated" },
                  { value: "not-yet", label: "Not yet" },
                  { value: "got-it", label: "Got it" },
                ],
              },
            },
          ],
          commands: [{ type: "show-card", label: "Show card" }],
        },
      },
    });
  });

  it("serves authoritative runtime state, silent show-card commands and ordered learner facts", async () => {
    const user = userEvent.setup();
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      updatedAt: "2026-08-27T12:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const editor = createRuntimeEditor({ save, accept });
    const rendered = renderRuntimeEditor(editor, { save, accept });
    const binding = await requireFlashcardBinding(editor);
    const events: ControlEvent[] = [];
    const stateAtEvent: unknown[] = [];
    const unsubscribe = binding.eventSource?.subscribe((event) => {
      events.push(event);
      stateAtEvent.push(
        event.type === "completed"
          ? binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })
          : event.type === "flipped"
            ? binding.stateReader?.read({ targetId: event.targetId, key: "flipped" })
            : event.type === "rated"
              ? binding.stateReader?.read({ targetId: event.targetId, key: "mastery" })
              : binding.stateReader?.read({ targetId: event.targetId, key: "selected" }),
      );
    });

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "flipped" })).toBe(false);
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "mastery" })).toBe("unrated");
    expect(events).toEqual([]);
    save.mockClear();
    accept.mockClear();

    const semanticEnvironment = getSemanticTargetInteractionEnvironmentForEditor(editor);
    await expect(
      semanticEnvironment.coordinator.activate(SECOND_CARD_ID, {
        origin: "configured-presentation",
      }),
    ).resolves.toEqual({ kind: "reached", requestedId: SECOND_CARD_ID });
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true),
    );
    expect(events).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    const showFirst = await binding.commandExecutor?.execute({
      targetId: FIRST_CARD_ID,
      type: "show-card",
      signal: new AbortController().signal,
    });
    expect(showFirst?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(false);
    const idempotentShowFirst = await binding.commandExecutor?.execute({
      targetId: FIRST_CARD_ID,
      type: "show-card",
      signal: new AbortController().signal,
    });
    expect(idempotentShowFirst?.isOk()).toBe(true);
    expect(events).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    const cancelled = new AbortController();
    cancelled.abort();
    const cancelledResult = await binding.commandExecutor?.execute({
      targetId: SECOND_CARD_ID,
      type: "show-card",
      signal: cancelled.signal,
    });
    expect(cancelledResult?.isErr()).toBe(true);
    if (!cancelledResult || cancelledResult.isOk()) {
      throw new Error("Expected the pre-aborted Flashcard command to be cancelled.");
    }
    expect(cancelledResult.error).toEqual({ reason: "cancelled" });
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true);

    const abortAfterCommit = new AbortController();
    const committedResult = binding.commandExecutor?.execute({
      targetId: SECOND_CARD_ID,
      type: "show-card",
      signal: abortAfterCommit.signal,
    });
    abortAfterCommit.abort();
    expect((await committedResult)?.isOk()).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true);
    expect(events).toEqual([]);
    expect(save).not.toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Previous card" }));
    await waitFor(() => expect(events).toEqual([{ targetId: FIRST_CARD_ID, type: "selected" }]));
    await user.click(screen.getByRole("button", { name: /^Flip card/ }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "flipped" })).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: /^Show front/ }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "flipped" })).toBe(false),
    );
    await user.click(screen.getByRole("button", { name: "Mark as got it (G)" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "mastery" })).toBe("got-it");
      expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true);
    });

    await binding.commandExecutor?.execute({
      targetId: FIRST_CARD_ID,
      type: "show-card",
      signal: new AbortController().signal,
    });
    await user.click(screen.getByRole("button", { name: "Mark as got it (G)" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Mark as got it (G)" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true),
    );

    expect(events).toEqual([
      { targetId: FIRST_CARD_ID, type: "selected" },
      { targetId: FIRST_CARD_ID, type: "flipped" },
      { targetId: FIRST_CARD_ID, type: "flipped" },
      { targetId: FIRST_CARD_ID, type: "rated" },
      { targetId: SECOND_CARD_ID, type: "selected" },
      { targetId: FIRST_CARD_ID, type: "rated" },
      { targetId: SECOND_CARD_ID, type: "selected" },
      { targetId: SECOND_CARD_ID, type: "rated" },
      { targetId: OWNER_ID, type: "completed" },
    ]);
    expect(stateAtEvent).toEqual([
      true,
      true,
      false,
      "got-it",
      true,
      "got-it",
      true,
      "got-it",
      true,
    ]);

    await user.click(screen.getByRole("button", { name: "Reset deck" }));
    await waitFor(() => {
      expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true);
    });
    expect(events.at(-1)).toEqual({ targetId: FIRST_CARD_ID, type: "selected" });
    expect(events.filter((event) => event.type === "completed")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Mark as not yet (N)" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "mastery" })).toBe(
        "not-yet",
      ),
    );
    expect(events.at(-2)).toEqual({ targetId: FIRST_CARD_ID, type: "rated" });
    expect(events.at(-1)).toEqual({ targetId: SECOND_CARD_ID, type: "selected" });

    expect(() =>
      binding.stateReader?.read({ targetId: "foreignCard1" as EmbeddedNodeId, key: "selected" }),
    ).toThrow(`Control target "foreignCard1" does not belong to owner "${OWNER_ID}".`);
    await expect(
      binding.commandExecutor?.execute({
        targetId: FIRST_CARD_ID,
        type: "unknown",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(`Control command "unknown" is not declared for target "${FIRST_CARD_ID}".`);

    rendered.unmount();
    await waitFor(() =>
      expect(getControlBindingRegistryForEditor(editor).get(OWNER_ID)).toBeUndefined(),
    );
    expect(() => binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toThrow(
      `Control Binding for owner "${OWNER_ID}" is no longer mounted.`,
    );
    unsubscribe?.();
  });

  it("reads hydrated completion without replaying events and survives card revisions", async () => {
    const snapshot: LearnerActivitySnapshot = {
      snapshotVersion: 1,
      artifactId: "flashcard-control",
      activities: {
        [OWNER_ID]: {
          activityKind: "flashcard",
          data: {
            currentCardId: SECOND_CARD_ID,
            flipped: { [SECOND_CARD_ID]: true },
            mastery: { [FIRST_CARD_ID]: "gotIt", [SECOND_CARD_ID]: "gotIt" },
            total: 2,
          },
          completed: true,
          updatedAt: "2026-08-27T11:00:00Z",
        },
      },
    };
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => ({
      ...record,
      updatedAt: "2026-08-27T12:00:00Z",
    }));
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const editor = createRuntimeEditor({ save, accept });
    const rendered = renderRuntimeEditor(editor, { save, accept, snapshot });
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireFlashcardBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "flipped" })).toBe(true);
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "mastery" })).toBe("got-it");
    expect(events).toEqual([]);

    const secondPosition = requireNodePosition(editor, SECOND_CARD_ID);
    const secondCard = editor.state.doc.nodeAt(secondPosition);
    if (!secondCard) throw new Error("Expected the second Flashcard card node.");
    const replacementId = "flashcardC03" as EmbeddedNodeId;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(secondPosition, undefined, { ...secondCard.attrs, id: replacementId })
        .setMeta("studentGuard", "allow"),
    );

    await waitFor(() => {
      expect(registry.get(OWNER_ID)).toBe(binding);
      expect(() =>
        binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" }),
      ).toThrow();
      expect(binding.stateReader?.read({ targetId: replacementId, key: "mastery" })).toBe(
        "unrated",
      );
    });
    expect(events).toEqual([]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
  });

  it("mounts one silent authoring binding over the local preview controller", async () => {
    const user = userEvent.setup();
    const editor = createAuthoringEditor();
    const rendered = render(
      createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />),
    );
    const registry = getControlBindingRegistryForEditor(editor);
    const binding = await requireFlashcardBinding(editor);
    const events: ControlEvent[] = [];
    binding.eventSource?.subscribe((event) => events.push(event));

    expect(() => registry.register(binding)).toThrow(
      `Duplicate Control Binding for owner "${OWNER_ID}".`,
    );
    expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true);
    const result = await binding.commandExecutor?.execute({
      targetId: SECOND_CARD_ID,
      type: "show-card",
      signal: new AbortController().signal,
    });
    expect(result?.isOk()).toBe(true);
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: SECOND_CARD_ID, key: "selected" })).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Previous card" }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "selected" })).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: /^Flip card/ }));
    await waitFor(() =>
      expect(binding.stateReader?.read({ targetId: FIRST_CARD_ID, key: "flipped" })).toBe(true),
    );
    expect(binding.stateReader?.read({ targetId: OWNER_ID, key: "completed" })).toBe(false);
    expect(events).toEqual([]);

    rendered.unmount();
    await waitFor(() => expect(registry.get(OWNER_ID)).toBeUndefined());
  });
});

async function requireFlashcardBinding(editor: Editor): Promise<ControlBinding> {
  const registry = getControlBindingRegistryForEditor(editor);
  await waitFor(() => expect(registry.get(OWNER_ID)).toBeDefined());
  const binding = registry.get(OWNER_ID);
  if (!binding) throw new Error("Expected mounted Flashcard Control Binding.");
  return binding;
}

function createRuntimeEditor({
  save: _save,
  accept: _accept,
}: {
  save: LearnerActivityPort["save"];
  accept: LearningEventPort["accept"];
}): Editor {
  const editor = new Editor({
    editable: false,
    extensions: createCourseDocumentRuntimeExtensions({ composition: application.runtime }),
    content: flashcardDocument(),
  });
  editors.push(editor);
  return editor;
}

function renderRuntimeEditor(
  editor: Editor,
  {
    save,
    accept,
    snapshot,
  }: {
    save: LearnerActivityPort["save"];
    accept: LearningEventPort["accept"];
    snapshot?: LearnerActivitySnapshot;
  },
) {
  return render(
    <ScaffoldServicesProvider
      ports={{
        learnerActivity: {
          load: vi.fn(async () => null),
          save,
        },
        learningEvents: {
          rootActivityId: "https://lms.example.test/courses/flashcard-control",
          accept,
        },
      }}
    >
      <ScaffoldArtifactIdentityProvider artifactId="flashcard-control">
        <LearningEventRuntimeProvider>
          <LearnerActivityRuntimeProvider initialSnapshot={snapshot}>
            <LearnerActivityReadinessGate>
              <EditorContent editor={editor} />
            </LearnerActivityReadinessGate>
          </LearnerActivityRuntimeProvider>
        </LearningEventRuntimeProvider>
      </ScaffoldArtifactIdentityProvider>
    </ScaffoldServicesProvider>,
  );
}

function createAuthoringEditor(): Editor {
  const environment = createCourseDocumentAuthoringEnvironment({
    composition: application.authoring,
    editable: true,
  });
  const editor = new Editor({
    editable: true,
    extensions: getCourseDocumentAuthoringEnvironmentState(environment).extensions,
    content: flashcardDocument(),
  });
  editors.push(editor);
  return editor;
}

function requireNodePosition(editor: Editor, id: EmbeddedNodeId): number {
  let position: number | undefined;
  editor.state.doc.descendants((node, nodePosition) => {
    if (node.attrs["id"] !== id) return true;
    position = nodePosition;
    return false;
  });
  if (position === undefined) throw new Error(`Expected document node "${id}".`);
  return position;
}

function flashcardDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { id: "courseFlashCt", mode: "page" },
        content: [
          {
            type: "surface",
            attrs: { id: "surfaceFlCtl", variant: "page-default" },
            content: [
              {
                type: FLASHCARD_NODE,
                attrs: {
                  id: OWNER_ID,
                  data: { type: "flashcard", shuffle: false },
                },
                content: [
                  flashcardCard(FIRST_CARD_ID, "First"),
                  flashcardCard(SECOND_CARD_ID, "Second"),
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function flashcardCard(id: EmbeddedNodeId, label: string): JSONContent {
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
