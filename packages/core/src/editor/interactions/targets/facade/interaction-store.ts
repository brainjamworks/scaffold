import { createStore, type StoreApi } from "zustand/vanilla";

import {
  createEmptyInteractionOwnerSnapshot,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "../model/interaction-owner-state";

export interface InteractionCommandPorts {
  activateStructuralTarget?: (target: InteractionTargetRef) => boolean;
  beginGesture?: (target: InteractionTargetRef) => boolean;
  dismissInteraction?: () => boolean;
  endGesture?: () => boolean;
  enterEditableContent?: () => boolean;
  openMenu?: (target: InteractionTargetRef) => boolean;
  openSettings?: (target: InteractionTargetRef) => boolean;
  selectObjectTarget?: (target: InteractionTargetRef) => boolean;
  toggleMenu?: (target: InteractionTargetRef) => boolean;
}

export interface InteractionCommands {
  activateStructuralTarget: (target: InteractionTargetRef) => boolean;
  beginGesture: (target: InteractionTargetRef) => boolean;
  dismissInteraction: () => boolean;
  endGesture: () => boolean;
  enterEditableContent: () => boolean;
  openMenu: (target: InteractionTargetRef) => boolean;
  openSettings: (target: InteractionTargetRef) => boolean;
  selectObjectTarget: (target: InteractionTargetRef) => boolean;
  toggleMenu: (target: InteractionTargetRef) => boolean;
}

export interface InteractionStoreState {
  commands: InteractionCommands;
  publishSnapshot: (snapshot: InteractionOwnerSnapshot) => void;
  replaceCommandPorts: (ports: InteractionCommandPorts) => void;
  snapshot: InteractionOwnerSnapshot;
}

export type InteractionStore = StoreApi<InteractionStoreState>;

export interface CreateInteractionStoreOptions {
  commandPorts?: InteractionCommandPorts;
  snapshot?: InteractionOwnerSnapshot;
}

export function createInteractionStore(
  options: CreateInteractionStoreOptions = {},
): InteractionStore {
  let commandPorts = options.commandPorts ?? {};

  return createStore<InteractionStoreState>((set) => ({
    commands: {
      activateStructuralTarget: (target) =>
        commandPorts.activateStructuralTarget?.(target) ?? false,
      beginGesture: (target) => commandPorts.beginGesture?.(target) ?? false,
      dismissInteraction: () => commandPorts.dismissInteraction?.() ?? false,
      endGesture: () => commandPorts.endGesture?.() ?? false,
      enterEditableContent: () => commandPorts.enterEditableContent?.() ?? false,
      openMenu: (target) => commandPorts.openMenu?.(target) ?? false,
      openSettings: (target) => commandPorts.openSettings?.(target) ?? false,
      selectObjectTarget: (target) => commandPorts.selectObjectTarget?.(target) ?? false,
      toggleMenu: (target) => commandPorts.toggleMenu?.(target) ?? false,
    },
    publishSnapshot: (snapshot) => set({ snapshot }),
    replaceCommandPorts: (ports) => {
      commandPorts = ports;
    },
    snapshot: options.snapshot ?? createEmptyInteractionOwnerSnapshot(),
  }));
}
