import type { Editor } from "@tiptap/core";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { FlashcardRuntimePresentation } from "./flashcard-runtime-controller";

interface FlashcardRuntimePresentationState {
  readonly presentedCardByBlockId: Record<string, string>;
  readonly setPresentedCard: (blockId: string, cardId: string | null) => void;
}

type FlashcardRuntimePresentationStore = StoreApi<FlashcardRuntimePresentationState>;

const storesByEditor = new WeakMap<Editor, FlashcardRuntimePresentationStore>();

export function useFlashcardRuntimePresentation(
  editor: Editor,
  blockId: string,
): FlashcardRuntimePresentation {
  const store = presentationStoreForEditor(editor);
  const currentCardId = useStore(store, (state) => state.presentedCardByBlockId[blockId] ?? null);
  const setPresentedCard = useStore(store, (state) => state.setPresentedCard);
  const setCurrentCardId = useCallback(
    (cardId: string | null) => setPresentedCard(blockId, cardId),
    [blockId, setPresentedCard],
  );

  return useMemo(() => ({ currentCardId, setCurrentCardId }), [currentCardId, setCurrentCardId]);
}

export function readFlashcardPresentedCardId(editor: Editor, blockId: string): string | null {
  return presentationStoreForEditor(editor).getState().presentedCardByBlockId[blockId] ?? null;
}

export function setFlashcardPresentedCardId(
  editor: Editor,
  blockId: string,
  cardId: string | null,
): void {
  presentationStoreForEditor(editor).getState().setPresentedCard(blockId, cardId);
}

function presentationStoreForEditor(editor: Editor): FlashcardRuntimePresentationStore {
  const existing = storesByEditor.get(editor);
  if (existing) return existing;

  const store = createStore<FlashcardRuntimePresentationState>((set) => ({
    presentedCardByBlockId: {},
    setPresentedCard: (blockId, cardId) => {
      set((state) => {
        if (cardId === null) {
          if (!(blockId in state.presentedCardByBlockId)) return state;
          const { [blockId]: _removed, ...remaining } = state.presentedCardByBlockId;
          return { presentedCardByBlockId: remaining };
        }
        if (state.presentedCardByBlockId[blockId] === cardId) return state;
        return {
          presentedCardByBlockId: {
            ...state.presentedCardByBlockId,
            [blockId]: cardId,
          },
        };
      });
    },
  }));
  storesByEditor.set(editor, store);
  return store;
}
