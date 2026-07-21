import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { resolveInteractionOwnerSnapshot } from "../../engine/interaction-owner-engine";
import type { InteractionOwnerSnapshot } from "../../model/interaction-owner-state";
import { projectInteractionEngineInput } from "../projection/interaction-engine-input-projection";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  interactionOwnerPluginKey,
} from "../state/interaction-owner-plugin-state";
import type { InteractionStore } from "../../facade/interaction-store";

export interface PublishInteractionOwnerSnapshotOptions {
  authoringChromeSessionActive?: boolean;
  blockDefinitions: BlockDefinitionLookup;
}

/**
 * Computes the owner snapshot for the current editor state — v2 plugin
 * state feeding the Phase 2 projection and the Phase 1 owner engine —
 * and publishes it to the injected facade store when one is present.
 */
export function publishInteractionOwnerSnapshot(
  state: EditorState,
  facade: InteractionStore | null | undefined,
  options: PublishInteractionOwnerSnapshotOptions,
): InteractionOwnerSnapshot {
  const pluginState =
    interactionOwnerPluginKey.getState(state) ?? EMPTY_INTERACTION_OWNER_PLUGIN_STATE;

  const input = projectInteractionEngineInput(state, {
    activationIntent: pluginState.activationIntent,
    authoringChromeSessionActive: options.authoringChromeSessionActive ?? true,
    blockDefinitions: options.blockDefinitions,
    contextOwner: pluginState.contextOwner,
    explicitOwner: pluginState.explicitOwner,
    gestureOwner: pluginState.gestureOwner,
    menuOwner: pluginState.menuOwner,
    settingsOwner: pluginState.settingsOwner,
  });

  const snapshot = resolveInteractionOwnerSnapshot(input);
  facade?.getState().publishSnapshot(snapshot);
  return snapshot;
}
