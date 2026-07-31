import type { Editor } from "@tiptap/core";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

interface ToggleAccordionInput {
  allowMultiple: boolean;
  defaultOpenIds: readonly string[];
}

export interface LayoutInteractionStoreState {
  activePageByLayoutId: Record<string, string>;
  activeTabByLayoutId: Record<string, string>;
  openAccordionSectionsByLayoutId: Record<string, readonly string[]>;
  setAccordionSectionOpen: (
    layoutId: string,
    sectionId: string,
    input: ToggleAccordionInput,
  ) => void;
  setActiveTab: (layoutId: string, sectionId: string) => void;
  setActivePage: (layoutId: string, sectionId: string) => void;
  toggleAccordionSection: (
    layoutId: string,
    sectionId: string,
    input: ToggleAccordionInput,
  ) => void;
}

type LayoutInteractionStore = StoreApi<LayoutInteractionStoreState>;

const storesByEditor = new WeakMap<Editor, LayoutInteractionStore>();

function createLayoutInteractionStore(): LayoutInteractionStore {
  return createStore<LayoutInteractionStoreState>((set, get) => ({
    activePageByLayoutId: {},
    activeTabByLayoutId: {},
    openAccordionSectionsByLayoutId: {},
    setActivePage: (layoutId, sectionId) => {
      set((state) => ({
        activePageByLayoutId: {
          ...state.activePageByLayoutId,
          [layoutId]: sectionId,
        },
      }));
    },
    setActiveTab: (layoutId, sectionId) => {
      set((state) => ({
        activeTabByLayoutId: {
          ...state.activeTabByLayoutId,
          [layoutId]: sectionId,
        },
      }));
    },
    setAccordionSectionOpen: (layoutId, sectionId, input) => {
      const current = get().openAccordionSectionsByLayoutId[layoutId] ?? input.defaultOpenIds;
      const next = input.allowMultiple
        ? current.includes(sectionId)
          ? current
          : [...current, sectionId]
        : [sectionId];

      set((state) => ({
        openAccordionSectionsByLayoutId: {
          ...state.openAccordionSectionsByLayoutId,
          [layoutId]: next,
        },
      }));
    },
    toggleAccordionSection: (layoutId, sectionId, input) => {
      const current = get().openAccordionSectionsByLayoutId[layoutId] ?? input.defaultOpenIds;
      const isOpen = current.includes(sectionId);
      const next = input.allowMultiple
        ? isOpen
          ? current.filter((id) => id !== sectionId)
          : [...current, sectionId]
        : isOpen
          ? []
          : [sectionId];

      set((state) => ({
        openAccordionSectionsByLayoutId: {
          ...state.openAccordionSectionsByLayoutId,
          [layoutId]: next,
        },
      }));
    },
  }));
}

function layoutInteractionStoreForEditor(editor: Editor): LayoutInteractionStore {
  const existingStore = storesByEditor.get(editor);
  if (existingStore) return existingStore;

  const store = createLayoutInteractionStore();
  storesByEditor.set(editor, store);
  return store;
}

export function useLayoutInteractionStore<Selected>(
  editor: Editor,
  selector: (state: LayoutInteractionStoreState) => Selected,
): Selected {
  return useStore(layoutInteractionStoreForEditor(editor), selector);
}
