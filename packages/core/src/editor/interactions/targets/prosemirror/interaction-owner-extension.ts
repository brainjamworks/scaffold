import { Extension } from "@tiptap/core";
import { Plugin, type EditorState } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  isUnconsumedOverlayDismissKey,
  shouldDismissEphemeralInteractionTarget,
} from "@/editor/interactions/dom/interaction-dismissal";
import {
  isAuthoringChromeSessionActive,
  isAuthoringChromeTarget,
} from "@/editor/interactions/dom/authoring-chrome";
import { resolveAuthoringInteractionRoot } from "@/editor/interactions/dom/authoring-root";
import { subscribeOverlayHostOwner } from "@/editor/interactions/dom/overlay-ownership";
import {
  CourseSelectionMode,
  resolveCourseSelectionFacts,
} from "@/editor/selection/selection-facts";

import { applyInteractionActivationIntent } from "./activation/interaction-activation-dispatch";
import {
  InteractionDomActivationIntentKind,
  resolveInteractionActivationIntentFromMouseDown,
} from "./activation/interaction-activation-intent";
import { resolveInteractionContextOwnerFromMouseDown } from "./activation/interaction-context-owner";
import { createInteractionOwnerCommandPorts } from "./facade/interaction-facade-command-ports";
import {
  createScaffoldInteractionOwnerStorage,
  type ScaffoldInteractionOwnerStorage,
} from "./facade/interaction-facade-storage";
import { publishInteractionOwnerSnapshot } from "./facade/interaction-owner-snapshot-publisher";
import type { InteractionStore } from "../facade/interaction-store";
import { InteractionOwnerCommandKind } from "./state/interaction-owner-command-model";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  applyInteractionOwnerCommandMeta,
  interactionOwnerPluginKey,
  normalizeInteractionOwnerCommandMetaForTransaction,
  normalizeInteractionOwnerPluginState,
  readInteractionOwnerCommandMeta,
  setInteractionOwnerCommandMeta,
  type InteractionOwnerPluginState,
} from "./state/interaction-owner-plugin-state";

/**
 * interaction ownership extension: installs the owner plugin state, facade command
 * ports, snapshot publishing, and DOM activation. Editor-local mousedown is
 * classified into an activation intent and applied through interaction command meta;
 * document-level pointers outside the editor dismiss ephemeral owners while
 * preserving authoring chrome.
 */
export function createScaffoldInteractionOwnerExtension(blockDefinitions: BlockDefinitionLookup) {
  return Extension.create<Record<string, never>, ScaffoldInteractionOwnerStorage>({
    name: "scaffoldInteractionOwner",

    addStorage() {
      return createScaffoldInteractionOwnerStorage();
    },

    addProseMirrorPlugins() {
      return [createScaffoldInteractionOwnerPlugin(this.storage.facadeStore, blockDefinitions)];
    },
  });
}

export function createScaffoldInteractionOwnerPlugin(
  facade: InteractionStore,
  blockDefinitions: BlockDefinitionLookup,
): Plugin<InteractionOwnerPluginState> {
  let authoringChromeSessionActive = true;

  return new Plugin<InteractionOwnerPluginState>({
    key: interactionOwnerPluginKey,

    state: {
      init: () => EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
      apply(tr, value) {
        const rawMeta = readInteractionOwnerCommandMeta(tr);
        const meta = rawMeta
          ? normalizeInteractionOwnerCommandMetaForTransaction(rawMeta, tr, blockDefinitions)
          : null;
        const next = meta ? applyInteractionOwnerCommandMeta(value, meta) : value;
        if (!tr.docChanged) return next;
        return normalizeInteractionOwnerPluginState(next, tr, blockDefinitions);
      },
    },

    props: {
      handleDOMEvents: {
        keydown(view, event) {
          return dismissEphemeralInteractionOwnerOnKeyDown(view, event);
        },
      },
    },

    view(view: EditorView) {
      const ownerDocument = view.dom.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      let ownerRoot: Element | null = null;
      let unsubscribeOverlayHostOwner: (() => void) | null = null;
      const overlayHostsWithKeydown = new Set<HTMLElement>();
      let focusSyncTimer: number | null = null;
      let destroyed = false;
      const publishSnapshot = (state: EditorState) =>
        publishInteractionOwnerSnapshot(state, facade, {
          authoringChromeSessionActive,
          blockDefinitions,
        });
      const setAuthoringChromeSessionActive = (active: boolean, state: EditorState) => {
        if (authoringChromeSessionActive === active) return;
        authoringChromeSessionActive = active;
        publishSnapshot(state);
      };
      const dismissOnOwnerKeyDown = (event: Event) => {
        const KeyboardEventConstructor = ownerDocument.defaultView?.KeyboardEvent;
        if (
          KeyboardEventConstructor === undefined ||
          !(event instanceof KeyboardEventConstructor)
        ) {
          return;
        }
        dismissEphemeralInteractionOwnerOnKeyDown(view, event);
      };
      const removeOverlayHostKeydownListeners = () => {
        for (const host of overlayHostsWithKeydown) {
          host.removeEventListener("keydown", dismissOnOwnerKeyDown);
        }
        overlayHostsWithKeydown.clear();
      };
      const syncOwnerRoot = (state: EditorState): Element => {
        const nextOwnerRoot = resolveAuthoringInteractionRoot(view.dom);
        if (ownerRoot === nextOwnerRoot) return nextOwnerRoot;

        ownerRoot?.removeEventListener("keydown", dismissOnOwnerKeyDown);
        unsubscribeOverlayHostOwner?.();
        unsubscribeOverlayHostOwner = null;
        removeOverlayHostKeydownListeners();
        ownerRoot = nextOwnerRoot;
        ownerRoot.addEventListener("keydown", dismissOnOwnerKeyDown);
        unsubscribeOverlayHostOwner = subscribeOverlayHostOwner(ownerRoot, (host, registered) => {
          if (registered) {
            host.addEventListener("keydown", dismissOnOwnerKeyDown);
            overlayHostsWithKeydown.add(host);
            return;
          }
          host.removeEventListener("keydown", dismissOnOwnerKeyDown);
          overlayHostsWithKeydown.delete(host);
        });
        setAuthoringChromeSessionActive(isAuthoringChromeSessionActive(ownerRoot), state);
        return ownerRoot;
      };

      authoringChromeSessionActive = isAuthoringChromeSessionActive(
        resolveAuthoringInteractionRoot(view.dom),
      );
      facade
        .getState()
        .replaceCommandPorts(createInteractionOwnerCommandPorts(view, blockDefinitions));
      syncOwnerRoot(view.state);
      publishSnapshot(view.state);

      // Registered on view.dom directly (capture) instead of PM
      // handleDOMEvents: Tiptap's default NodeView stopEvent swallows
      // mousedown on non-selectable structural NodeView chrome before PM
      // routes it to plugin handlers, and structural whitespace activation
      // must still classify those clicks.
      const classifyEditorMouseDown = (event: MouseEvent) => {
        if (destroyed) return;
        syncOwnerRoot(view.state);
        if (isAuthoringChromeTarget(event.target)) return;
        const intent = resolveInteractionActivationIntentFromMouseDown(
          view,
          event,
          blockDefinitions,
        );
        setAuthoringChromeSessionActive(
          intent.kind !== InteractionDomActivationIntentKind.OutsideEditor,
          view.state,
        );
        const contextOwner = resolveInteractionContextOwnerFromMouseDown(
          view,
          event,
          blockDefinitions,
        );
        applyInteractionActivationIntent(view, intent, event, {
          contextOwner,
        });
      };
      view.dom.addEventListener("mousedown", classifyEditorMouseDown, true);
      const syncAuthoringChromeSessionFromFocus = () => {
        if (focusSyncTimer !== null) {
          ownerWindow?.clearTimeout(focusSyncTimer);
          focusSyncTimer = null;
        }
        if (destroyed) return;
        const currentOwnerRoot = syncOwnerRoot(view.state);
        setAuthoringChromeSessionActive(
          isAuthoringChromeSessionActive(currentOwnerRoot),
          view.state,
        );
      };
      const syncAuthoringChromeSessionAfterFocusOut = () => {
        if (!ownerWindow || focusSyncTimer !== null) return;
        focusSyncTimer = ownerWindow.setTimeout(syncAuthoringChromeSessionFromFocus, 0);
      };
      const dismissOnOutsidePointer = (event: Event) => {
        const target = event.target;
        const currentOwnerRoot = syncOwnerRoot(view.state);
        if (!shouldDismissEphemeralInteractionTarget(currentOwnerRoot, target)) {
          setAuthoringChromeSessionActive(true, view.state);
          return;
        }

        setAuthoringChromeSessionActive(false, view.state);
        if (!shouldClearInteractionOnOutsidePointer(view.state)) return;

        applyInteractionActivationIntent(view, {
          kind: InteractionDomActivationIntentKind.OutsideEditor,
        });
      };
      ownerDocument.addEventListener("mousedown", dismissOnOutsidePointer, true);
      ownerDocument.addEventListener("pointerdown", dismissOnOutsidePointer, true);
      ownerDocument.addEventListener("focusin", syncAuthoringChromeSessionFromFocus, true);
      ownerDocument.addEventListener("focusout", syncAuthoringChromeSessionAfterFocusOut, true);

      return {
        update(currentView: EditorView, prevState) {
          syncOwnerRoot(currentView.state);
          const ownerStateChanged =
            interactionOwnerPluginKey.getState(prevState) !==
            interactionOwnerPluginKey.getState(currentView.state);
          const documentChanged = prevState.doc !== currentView.state.doc;
          const selectionChanged = !prevState.selection.eq(currentView.state.selection);

          if (ownerStateChanged || documentChanged || selectionChanged) {
            publishSnapshot(currentView.state);
          }
        },
        destroy() {
          destroyed = true;
          if (focusSyncTimer !== null) {
            ownerWindow?.clearTimeout(focusSyncTimer);
            focusSyncTimer = null;
          }
          view.dom.removeEventListener("mousedown", classifyEditorMouseDown, true);
          ownerRoot?.removeEventListener("keydown", dismissOnOwnerKeyDown);
          unsubscribeOverlayHostOwner?.();
          unsubscribeOverlayHostOwner = null;
          removeOverlayHostKeydownListeners();
          ownerRoot = null;
          ownerDocument.removeEventListener("mousedown", dismissOnOutsidePointer, true);
          ownerDocument.removeEventListener("pointerdown", dismissOnOutsidePointer, true);
          ownerDocument.removeEventListener("focusin", syncAuthoringChromeSessionFromFocus, true);
          ownerDocument.removeEventListener(
            "focusout",
            syncAuthoringChromeSessionAfterFocusOut,
            true,
          );
          facade.getState().replaceCommandPorts({});
        },
      };
    },
  });
}

function hasEphemeralInteractionOwner(state: EditorState): boolean {
  const ownerState = interactionOwnerPluginKey.getState(state);
  if (!ownerState) return false;
  return Boolean(
    ownerState.explicitOwner ??
    ownerState.menuOwner ??
    ownerState.settingsOwner ??
    ownerState.gestureOwner,
  );
}

function dismissEphemeralInteractionOwnerOnKeyDown(
  view: EditorView,
  event: KeyboardEvent,
): boolean {
  if (!isUnconsumedOverlayDismissKey(event)) return false;
  if (!hasEphemeralInteractionOwner(view.state)) return false;

  event.preventDefault();
  view.dispatch(
    setInteractionOwnerCommandMeta(view.state.tr, {
      kind: InteractionOwnerCommandKind.DismissInteraction,
    }),
  );
  if (view.dom.isConnected) {
    view.dom.focus({ preventScroll: true });
  }
  return true;
}

function shouldClearInteractionOnOutsidePointer(state: EditorState): boolean {
  if (hasEphemeralInteractionOwner(state)) return true;

  const ownerState = interactionOwnerPluginKey.getState(state);
  if (ownerState?.activationIntent) return true;

  return (
    resolveCourseSelectionFacts(state.selection).selectionMode === CourseSelectionMode.NodeSelection
  );
}
