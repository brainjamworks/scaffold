import { useCallback, useEffect, useReducer } from "react";

const MISSING_NODE_VIEW_UI_KEY = "__scaffold_missing_node_view_ui_key__";

export interface NodeViewUiKeyInput {
  owner: string;
  surface: string;
  id: unknown;
}

export function nodeViewUiKey({ owner, surface, id }: NodeViewUiKeyInput): string | null {
  if (typeof id !== "string" || id.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(`Scaffold NodeView UI state "${owner}:${surface}" requires a stable node id.`);
    }
    return null;
  }

  return `${owner}:${surface}:${id}`;
}

/**
 * `usePickerOpen` — module-scoped open/close state for picker
 * dialogs mounted inside Tiptap NodeViews.
 *
 * Why this exists: Tiptap destroys and recreates a React NodeView
 * whenever the underlying ProseMirror node identity changes — which
 * happens when the user clicks the block (the click selects the
 * node and triggers a transaction). A plain `useState(false)` resets
 * to `false` on every remount, so `setOpen(true)` triggered by the
 * click never reaches the dialog: the new instance has stale state.
 *
 * The workaround is to lift the open flag above the React tree.
 * State lives in a module-scoped Map keyed by the block's stable id;
 * subscribers re-render on flip. Because the map outlives every
 * mount, `setOpen(true)` survives the click → remount sequence.
 *
 * Use for any picker/dialog opened from a click *inside* a NodeView
 * (image pickers, PDF chooser, file browser, etc.). Don't use for
 * dialogs opened from outside the NodeView (toolbars, bubble menus)
 * — those don't hit the remount path.
 */

const stateById = new Map<string, boolean>();
const listenersById = new Map<string, Set<() => void>>();
const cleanupTimersById = new Map<string, ReturnType<typeof setTimeout>>();

function notify(id: string, except?: () => void) {
  listenersById.get(id)?.forEach((listener) => {
    if (listener !== except) {
      listener();
    }
  });
}

export function usePickerOpen(id: string | null): readonly [boolean, (next: boolean) => void] {
  const [, force] = useReducer((c: number) => c + 1, 0);
  const key = id ?? MISSING_NODE_VIEW_UI_KEY;

  useEffect(() => {
    if (id === null) return undefined;

    const cleanupTimer = cleanupTimersById.get(key);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimersById.delete(key);
    }

    let listeners = listenersById.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersById.set(key, listeners);
    }
    listeners.add(force);
    return () => {
      listeners?.delete(force);
      if (listeners && listeners.size === 0) {
        listenersById.delete(key);
        cleanupTimersById.set(
          key,
          setTimeout(() => {
            cleanupTimersById.delete(key);
            if (!listenersById.has(key)) {
              stateById.delete(key);
            }
          }, 250),
        );
      }
    };
  }, [id, key]);

  const open = id === null ? false : (stateById.get(key) ?? false);
  const setOpen = useCallback(
    (next: boolean) => {
      if (id === null) return;

      if (next) {
        stateById.set(key, true);
      } else {
        stateById.delete(key);
      }
      force();
      notify(key, force);
    },
    [id, key],
  );

  return [open, setOpen] as const;
}
