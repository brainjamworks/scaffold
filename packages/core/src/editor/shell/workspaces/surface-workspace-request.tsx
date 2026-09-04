import type { EmbeddedNodeId } from "@scaffold/contracts";
import { useContext, useMemo } from "react";

import { ShellLayoutContext } from "@/editor/shell/layout/ShellLayoutProvider";

/** The Slideshow Surface workspaces that can be opened below the stage. */
export type SurfaceWorkspaceKind = "timeline" | "interactions";

/**
 * A request to show one Surface workspace for one Surface.
 *
 * `nonce` changes on every request so repeated requests for the same
 * workspace and Surface still re-open a closed panel or re-focus an open one.
 */
export interface SurfaceWorkspaceRequest {
  readonly workspace: SurfaceWorkspaceKind;
  readonly surfaceId: EmbeddedNodeId;
  readonly nonce: number;
}

/** Port through which Surface chrome asks the App to open a workspace. */
export interface SurfaceWorkspaceRequestPort {
  open(workspace: SurfaceWorkspaceKind, surfaceId: EmbeddedNodeId): void;
}

/**
 * Returns the workspace request port backed by the shell layout store, or
 * null outside a ShellLayoutProvider (no workspace controls render then).
 * Store actions are stable, so the port only changes with the provider.
 */
export function useSurfaceWorkspaceRequest(): SurfaceWorkspaceRequestPort | null {
  const store = useContext(ShellLayoutContext);
  return useMemo<SurfaceWorkspaceRequestPort | null>(
    () => (store ? { open: store.getState().openBottomPanel } : null),
    [store],
  );
}
