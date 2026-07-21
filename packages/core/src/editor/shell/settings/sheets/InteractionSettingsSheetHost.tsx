import type { Editor } from "@tiptap/react";
import { useEffect } from "react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import {
  useInteractionCommands,
  useInteractionStore,
  useInteractionSnapshot,
} from "@/editor/interactions/targets/facade/interaction-provider";

import { ConfigurationSettingsSheet } from "./ConfigurationSettingsSheet";
import { resolveInteractionSettingsSheetDescriptor } from "./interaction-settings-sheet-target";

export type {
  InteractionNodeSettingsSheetDefinition,
  InteractionSettingsSheetDescriptor,
} from "./interaction-settings-sheet-target";

interface InteractionSettingsSheetHostProps {
  blockDefinitions: BlockDefinitionLookup;
  editor: Editor;
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver;
}

/**
 * Renders the configuration settings sheet for the settings owner. The
 * sheet is visible only while the `settingsSheet` chrome slot publishes a
 * resolvable target; closing it dismisses the interaction state.
 */
export function InteractionSettingsSheetHost({
  blockDefinitions,
  editor,
  surfaceAuthoringChrome,
}: InteractionSettingsSheetHostProps) {
  const snapshot = useInteractionSnapshot();
  const commands = useInteractionCommands();
  const store = useInteractionStore();

  const slot = snapshot.chromeSlots.settingsSheet;
  const settingsTarget = slot.visible ? slot.target : null;
  const descriptor = settingsTarget
    ? resolveInteractionSettingsSheetDescriptor(
        editor,
        settingsTarget,
        blockDefinitions,
        surfaceAuthoringChrome,
      )
    : null;

  useEffect(() => {
    if (!settingsTarget || descriptor) return;
    commands.dismissInteraction();
  }, [commands, descriptor, settingsTarget]);

  if (!descriptor) return null;

  return (
    <ConfigurationSettingsSheet
      key={descriptor.targetKey}
      editor={editor}
      entry={descriptor.entry}
      nodeType={descriptor.nodeType}
      open
      pos={descriptor.pos}
      targetId={descriptor.targetId}
      onOpenChange={(open) => {
        if (open || editor.isDestroyed) return;

        const currentSlot = store.getState().snapshot.chromeSlots.settingsSheet;
        const currentTarget = currentSlot.visible ? currentSlot.target : null;
        const currentDescriptor = currentTarget
          ? resolveInteractionSettingsSheetDescriptor(
              editor,
              currentTarget,
              blockDefinitions,
              surfaceAuthoringChrome,
            )
          : null;
        if (currentDescriptor?.targetKey === descriptor.targetKey) {
          commands.dismissInteraction();
        }
      }}
      {...(descriptor.title ? { title: descriptor.title } : {})}
    />
  );
}
