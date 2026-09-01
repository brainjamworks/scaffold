import type { Editor } from "@tiptap/core";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

interface ToggleAccordionInput {
  allowMultiple: boolean;
  defaultOpenIds: readonly string[];
  origin?: LayoutSectionChangeOrigin;
}

interface CloseAccordionInput {
  defaultOpenIds: readonly string[];
  origin?: LayoutSectionChangeOrigin;
}

interface LayoutSectionChangeInput {
  origin?: LayoutSectionChangeOrigin;
}

export type LayoutSectionChangeOrigin =
  | "direct"
  | "learner"
  | "semantic-activation"
  | "control-command";

export interface LayoutSectionChange {
  readonly origin: LayoutSectionChangeOrigin;
  readonly sectionId: string;
}

export interface LayoutInteractionStoreState {
  activePageByLayoutId: Record<string, string>;
  activeTabByLayoutId: Record<string, string>;
  lastSectionChangeByLayoutId: Record<string, LayoutSectionChange>;
  openAccordionSectionsByLayoutId: Record<string, readonly string[]>;
  pendingProgrammaticAccordionOpenIdsByLayoutId: Record<string, readonly string[]>;
  consumePendingProgrammaticAccordionOpenIds: (layoutId: string) => void;
  setAccordionSectionClosed: (
    layoutId: string,
    sectionId: string,
    input: CloseAccordionInput,
  ) => void;
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
    pendingProgrammaticAccordionOpenIdsByLayoutId: {},
    consumePendingProgrammaticAccordionOpenIds: (layoutId) => {
      set((state) => {
        if (!(layoutId in state.pendingProgrammaticAccordionOpenIdsByLayoutId)) return state;
        const { [layoutId]: _consumed, ...remaining } =
          state.pendingProgrammaticAccordionOpenIdsByLayoutId;
        return { pendingProgrammaticAccordionOpenIdsByLayoutId: remaining };
      });
    },
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
        ...((input.origin === "semantic-activation" || input.origin === "control-command") &&
        !current.includes(sectionId)
          ? {
              pendingProgrammaticAccordionOpenIdsByLayoutId: {
                ...state.pendingProgrammaticAccordionOpenIdsByLayoutId,
                [layoutId]: [
                  ...(state.pendingProgrammaticAccordionOpenIdsByLayoutId[layoutId] ?? []),
                  sectionId,
                ],
              },
            }
          : {}),
      }));
    },
    setAccordionSectionClosed: (layoutId, sectionId, input) => {
      const current = get().openAccordionSectionsByLayoutId[layoutId] ?? input.defaultOpenIds;
      const next = current.includes(sectionId) ? current.filter((id) => id !== sectionId) : current;

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

export function replaceLayoutFeatureViewStateForOwners(
  editor: Editor,
  ownerIds: readonly string[],
): void {
  const owners = new Set(ownerIds);
  layoutInteractionStoreForEditor(editor).setState((state) => {
    const activePageByLayoutId = withoutOwnerEntries(state.activePageByLayoutId, owners);
    const activeTabByLayoutId = withoutOwnerEntries(state.activeTabByLayoutId, owners);
    const lastSectionChangeByLayoutId = withoutOwnerEntries(
      state.lastSectionChangeByLayoutId,
      owners,
    );
    const openAccordionSectionsByLayoutId = withoutOwnerEntries(
      state.openAccordionSectionsByLayoutId,
      owners,
    );
    const pendingProgrammaticAccordionOpenIdsByLayoutId = withoutOwnerEntries(
      state.pendingProgrammaticAccordionOpenIdsByLayoutId,
      owners,
    );
    if (
      activePageByLayoutId === state.activePageByLayoutId &&
      activeTabByLayoutId === state.activeTabByLayoutId &&
      lastSectionChangeByLayoutId === state.lastSectionChangeByLayoutId &&
      openAccordionSectionsByLayoutId === state.openAccordionSectionsByLayoutId &&
      pendingProgrammaticAccordionOpenIdsByLayoutId ===
        state.pendingProgrammaticAccordionOpenIdsByLayoutId
    ) {
      return state;
    }
    return {
      activePageByLayoutId,
      activeTabByLayoutId,
      lastSectionChangeByLayoutId,
      openAccordionSectionsByLayoutId,
      pendingProgrammaticAccordionOpenIdsByLayoutId,
    };
  });
}

export function subscribeToLayoutInteractionStore(
  editor: Editor,
  listener: (
    state: LayoutInteractionStoreState,
    previousState: LayoutInteractionStoreState,
  ) => void,
): () => void {
  return layoutInteractionStoreForEditor(editor).subscribe(listener);
}

export function useLayoutInteractionStore<Selected>(
  editor: Editor,
  selector: (state: LayoutInteractionStoreState) => Selected,
): Selected {
  return useStore(layoutInteractionStoreForEditor(editor), selector);
}

function withoutOwnerEntries<Value>(
  entries: Record<string, Value>,
  ownerIds: ReadonlySet<string>,
): Record<string, Value> {
  let next = entries;
  for (const ownerId of ownerIds) {
    if (!Object.hasOwn(next, ownerId)) continue;
    if (next === entries) next = { ...entries };
    delete next[ownerId];
  }
  return next;
}
