import { createStore, type StoreApi } from "zustand/vanilla";

import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  SurfaceWorkspaceKind,
  SurfaceWorkspaceRequest,
} from "../workspaces/surface-workspace-request";

export type ShellLeftDock = "outline";
export type ShellRightDock = "agent";

export interface ShellLayoutState {
  readonly leftDock: ShellLeftDock | null;
  readonly rightDock: ShellRightDock | null;
  readonly bottomPanel: SurfaceWorkspaceRequest | null;
}

export interface ShellLayoutActions {
  setLeftDock(kind: ShellLeftDock | null): void;
  setRightDock(kind: ShellRightDock | null): void;
  toggleLeftDock(kind: ShellLeftDock): void;
  toggleRightDock(kind: ShellRightDock): void;
  openBottomPanel(workspace: SurfaceWorkspaceKind, surfaceId: EmbeddedNodeId): void;
  closeBottomPanel(): void;
  enterPreview(): void;
}

export type ShellLayoutStore = StoreApi<ShellLayoutState & ShellLayoutActions>;

export function createShellLayoutStore(
  initial: Partial<ShellLayoutState> = {},
): ShellLayoutStore {
  return createStore<ShellLayoutState & ShellLayoutActions>((set) => ({
    leftDock: initial.leftDock ?? null,
    rightDock: initial.rightDock ?? null,
    bottomPanel: initial.bottomPanel ?? null,
    setLeftDock: (kind) => set({ leftDock: kind }),
    setRightDock: (kind) => set({ rightDock: kind }),
    toggleLeftDock: (kind) =>
      set((state) => ({ leftDock: state.leftDock === kind ? null : kind })),
    toggleRightDock: (kind) =>
      set((state) => ({ rightDock: state.rightDock === kind ? null : kind })),
    openBottomPanel: (workspace, surfaceId) =>
      set((state) => ({
        bottomPanel: {
          workspace,
          surfaceId,
          nonce: (state.bottomPanel?.nonce ?? 0) + 1,
        },
      })),
    closeBottomPanel: () => set({ bottomPanel: null }),
    enterPreview: () => set({ leftDock: null, rightDock: null }),
  }));
}
