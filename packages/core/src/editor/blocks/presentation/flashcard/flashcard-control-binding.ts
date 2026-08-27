import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
  type ControlValue,
} from "@/document/control-binding";
import { useScopedLearnerActivityApi } from "@/runtime/learner-activity/LearnerActivityRuntimeProvider";

import type { FlashcardDeckController } from "./FlashcardComponents";
import { FLASHCARD_CARD_NODE, FLASHCARD_NODE } from "./content";
import { subscribeToFlashcardLearnerCommits } from "./flashcard-learner-commits";
import {
  readFlashcardPresentedCardId,
  setFlashcardPresentedCardId,
} from "./flashcard-runtime-presentation";
import {
  readCardSummaries,
  readFlashcardData,
  readFlashcardShuffle,
  reconcileFlashcardCardOrder,
  resolveFlashcardDeckState,
} from "./flashcard-shared";

interface FlashcardControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly blockId: string;
  readonly node: ProseMirrorNode;
}

export function useFlashcardRuntimeControlBinding(input: FlashcardControlBindingInput): void {
  const activityStore = useScopedLearnerActivityApi();
  if (!activityStore) {
    throw new Error("Flashcard Control Binding requires a valid runtime artifact identity.");
  }

  useFlashcardControlBinding({
    ...input,
    readState(targetId, key) {
      const deckNode = requireCurrentFlashcardTarget(input, targetId);
      const record = activityStore.getState().activities[input.blockId];
      if (targetId === input.blockId) return record?.completed ?? false;

      const cards = reconcileFlashcardCardOrder(
        readCardSummaries(deckNode),
        readFlashcardData(record?.data).order ?? [],
        readFlashcardShuffle(deckNode),
        input.blockId,
      );
      const persistedDeck = readFlashcardData(record?.data);
      const presentedCardId = readFlashcardPresentedCardId(input.editor, input.blockId);
      const deck = cards.some((card) => card.id === presentedCardId)
        ? { ...persistedDeck, currentCardId: presentedCardId }
        : persistedDeck;
      if (key === "selected") {
        return resolveFlashcardDeckState(cards, deck).currentCardId === targetId;
      }
      if (key === "flipped") return Boolean(deck.flipped[targetId]);
      return portableMastery(deck.mastery[targetId]);
    },
    showCard(targetId) {
      requireCurrentFlashcardTarget(input, targetId, true);
      setFlashcardPresentedCardId(input.editor, input.blockId, targetId);
    },
  });
}

export function useFlashcardAuthoringControlBinding(
  input: FlashcardControlBindingInput & {
    readonly controller: FlashcardDeckController;
  },
): void {
  const { controller } = input;
  useFlashcardControlBinding({
    ...input,
    readState(targetId, key) {
      requireCurrentFlashcardTarget(input, targetId);
      if (targetId === input.blockId) return false;
      if (key === "selected") return controller.currentCardId === targetId;
      if (key === "flipped") return Boolean(controller.deck.flipped[targetId]);
      return portableMastery(controller.deck.mastery[targetId]);
    },
    showCard(targetId) {
      requireCurrentFlashcardTarget(input, targetId, true);
      controller.setCurrentCard(targetId);
    },
  });
}

function useFlashcardControlBinding(
  input: FlashcardControlBindingInput & {
    readonly readState: (targetId: string, key: string) => ControlValue;
    readonly showCard: (targetId: string) => void;
  },
): void {
  const { blockId, editor } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const listenersRef = useRef(new Set<ControlEventListener>());
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(blockId);
    if (!parsedOwnerId.success) return;
    const ownerId = parsedOwnerId.data;
    const listeners = listenersRef.current;
    const unsubscribeCommits = subscribeToFlashcardLearnerCommits(editor, blockId, (commit) => {
      const current = behaviorRef.current;
      const targetId =
        commit.type === "completed" ? ownerId : EmbeddedNodeIdSchema.parse(commit.targetId);
      requireCurrentFlashcardTarget(current, targetId, commit.type !== "completed");
      for (const listener of [...listeners]) {
        listener(Object.freeze({ targetId, type: commit.type }));
      }
    });
    const unregister = registry.register({
      ownerId,
      eventSource: {
        subscribe(listener) {
          listeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            listeners.delete(listener);
          };
        },
      },
      stateReader: {
        read({ targetId, key }) {
          return behaviorRef.current.readState(targetId, key);
        },
      },
      commandExecutor: {
        async execute({ targetId, signal }) {
          requireCurrentFlashcardTarget(behaviorRef.current, targetId, true);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          behaviorRef.current.showCard(targetId);
          return Result.ok();
        },
      },
    });

    return () => {
      try {
        unregister();
      } finally {
        unsubscribeCommits();
        listeners.clear();
      }
    };
  }, [blockId, editor, registry]);
}

function requireCurrentFlashcardTarget(
  behavior: FlashcardControlBindingInput,
  targetId: string,
  requireCard = false,
): ProseMirrorNode {
  const ownerId = behavior.blockId;
  if (behavior.node.type.name !== FLASHCARD_NODE || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Flashcard Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Flashcard Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Flashcard Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== FLASHCARD_NODE || current.attrs["id"] !== ownerId) {
    throw new Error(`Flashcard Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (!requireCard && targetId === ownerId) return current;

  let isCurrentCard = false;
  current.forEach((child) => {
    if (child.type.name === FLASHCARD_CARD_NODE && child.attrs["id"] === targetId) {
      isCurrentCard = true;
    }
  });
  if (!isCurrentCard) {
    throw new Error(`Flashcard card "${targetId}" is not a current child of owner "${ownerId}".`);
  }
  return current;
}

function portableMastery(value: string | undefined): "unrated" | "not-yet" | "got-it" {
  if (value === "gotIt") return "got-it";
  if (value === "notYet") return "not-yet";
  return "unrated";
}
