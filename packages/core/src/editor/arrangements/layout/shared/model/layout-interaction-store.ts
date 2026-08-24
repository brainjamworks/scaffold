import type { Editor } from "@tiptap/core";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

interface ToggleAccordionInput {
  allowMultiple: boolean;
  defaultOpenIds: readonly string[];
  origin?: LayoutSectionChangeOrigin;
}

interface LayoutSectionChangeInput {
  origin?: LayoutSectionChangeOrigin;
}

export type LayoutSectionChangeOrigin = "direct" | "semantic-activation";

export interface LayoutSectionChange {
  readonly origin: LayoutSectionChangeOrigin;
  readonly sectionId: string;
}

export interface LayoutInteractionStoreState {
  activePageByLayoutId: Record<string, string>;
  activeTabByLayoutId: Record<string, string>;
  lastSectionChangeByLayoutId: Record<string, LayoutSectionChange>;
  openAccordionSectionsByLayoutId: Record<string, readonly string[]>;
  setAccordionSectionOpen: (
    layoutId: string,
    sectionId: string,
    input: ToggleAccordionInput,
  ) => void;
  setActiveTab: (layoutId: string, sectionId: string, input?: LayoutSectionChangeInput) => void;
  setActivePage: (layoutId: string, sectionId: string, input?: LayoutSectionChangeInput) => void;
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
    lastSectionChangeByLayoutId: {},
    openAccordionSectionsByLayoutId: {},
    setActivePage: (layoutId, sectionId, input) => {
      set((state) => ({
        activePageByLayoutId: {
          ...state.activePageByLayoutId,
          [layoutId]: sectionId,
        },
        lastSectionChangeByLayoutId: {
          ...state.lastSectionChangeByLayoutId,
          [layoutId]: { origin: input?.origin ?? "direct", sectionId },
        },
      }));
    },
    setActiveTab: (layoutId, sectionId, input) => {
      set((state) => ({
        activeTabByLayoutId: {
          ...state.activeTabByLayoutId,
          [layoutId]: sectionId,
        },
        lastSectionChangeByLayoutId: {
          ...state.lastSectionChangeByLayoutId,
          [layoutId]: { origin: input?.origin ?? "direct", sectionId },
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
        lastSectionChangeByLayoutId: {
          ...state.lastSectionChangeByLayoutId,
          [layoutId]: { origin: input.origin ?? "direct", sectionId },
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
        lastSectionChangeByLayoutId: {
          ...state.lastSectionChangeByLayoutId,
          [layoutId]: { origin: input.origin ?? "direct", sectionId },
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

export function getLayoutInteractionStoreState(editor: Editor): LayoutInteractionStoreState {
  return layoutInteractionStoreForEditor(editor).getState();
}

export function useLayoutInteractionStore<Selected>(
  editor: Editor,
  selector: (state: LayoutInteractionStoreState) => Selected,
): Selected {
  return useStore(layoutInteractionStoreForEditor(editor), selector);
}
