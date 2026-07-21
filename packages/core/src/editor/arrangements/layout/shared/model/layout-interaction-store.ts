import { create } from "zustand";

interface ToggleAccordionInput {
  allowMultiple: boolean;
  defaultOpenIds: readonly string[];
}

interface LayoutInteractionStore {
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

export const useLayoutInteractionStore = create<LayoutInteractionStore>((set, get) => ({
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
