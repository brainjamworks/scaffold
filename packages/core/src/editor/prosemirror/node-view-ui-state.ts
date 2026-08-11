import { useCallback, useEffect, useReducer } from "react";

const MISSING_NODE_VIEW_UI_KEY = "__scaffold_missing_node_view_ui_key__";

export interface NodeViewUiStateKeyInput {
  owner: string;
  surface: string;
  id: unknown;
}

export function nodeViewUiStateKey({ owner, surface, id }: NodeViewUiStateKeyInput): string | null {
  if (typeof id !== "string" || id.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(`Scaffold NodeView UI state "${owner}:${surface}" requires a stable node id.`);
    }
    return null;
  }

  return `${owner}:${surface}:${id}`;
}

/**
 * Module-scoped open/close state for surfaces mounted inside Tiptap NodeViews.
 *
 * Tiptap can destroy and recreate a React NodeView when the underlying
 * ProseMirror node identity changes. State kept in the component would reset
 * during that remount, so this hook keeps it briefly above the React tree and
 * keys it by the persisted owner identity and UI surface.
 *
 * Use only for UI opened from inside a NodeView whose open state must survive
 * an immediate remount. Toolbars and other UI outside a NodeView should keep
 * ordinary component-local state.
 */
const stateByKey = new Map<string, boolean>();
const listenersByKey = new Map<string, Set<() => void>>();
const cleanupTimersByKey = new Map<string, ReturnType<typeof setTimeout>>();

function notify(key: string, except?: () => void) {
  listenersByKey.get(key)?.forEach((listener) => {
    if (listener !== except) {
      listener();
    }
  });
}

export function useNodeViewOpenState(
  stateKey: string | null,
): readonly [boolean, (next: boolean) => void] {
  const [, force] = useReducer((count: number) => count + 1, 0);
  const key = stateKey ?? MISSING_NODE_VIEW_UI_KEY;

  useEffect(() => {
    if (stateKey === null) return undefined;

    const cleanupTimer = cleanupTimersByKey.get(key);
    if (cleanupTimer) {
      clearTimeout(cleanupTimer);
      cleanupTimersByKey.delete(key);
    }

    let listeners = listenersByKey.get(key);
    if (!listeners) {
      listeners = new Set();
      listenersByKey.set(key, listeners);
    }
    listeners.add(force);
    return () => {
      listeners?.delete(force);
      if (listeners && listeners.size === 0) {
        listenersByKey.delete(key);
        cleanupTimersByKey.set(
          key,
          setTimeout(() => {
            cleanupTimersByKey.delete(key);
            if (!listenersByKey.has(key)) {
              stateByKey.delete(key);
            }
          }, 250),
        );
      }
    };
  }, [key, stateKey]);

  const open = stateKey === null ? false : (stateByKey.get(key) ?? false);
  const setOpen = useCallback(
    (next: boolean) => {
      if (stateKey === null) return;

      if (next) {
        stateByKey.set(key, true);
      } else {
        stateByKey.delete(key);
      }
      force();
      notify(key, force);
    },
    [key, stateKey],
  );

  return [open, setOpen] as const;
}
