import type { Editor } from "@tiptap/react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import {
  resolveStructuralChromeTargetDescriptor,
  type StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { NodeSettingsSheetDefinition } from "@/editor/configuration/settings-sheet";
import type { SurfaceAuthoringChromeResolver } from "@/editor/surfaces/authoring/surface-authoring-view-registry";

export type InteractionNodeSettingsSheetDefinition = Omit<NodeSettingsSheetDefinition, "attr"> & {
  attr: string;
};

/**
 * Shell-owned render input for `ConfigurationSettingsSheet`, resolved from a
 * target ref against the live document. `targetKey` is stable per settings
 * target so the sheet remounts when the owner changes.
 */
export interface InteractionSettingsSheetDescriptor {
  entry: InteractionNodeSettingsSheetDefinition;
  nodeType: string;
  pos: number;
  targetId: string;
  targetKey: string;
  title?: string;
}

export function resolveInteractionSettingsSheetDescriptor(
  editor: Editor,
  targetRef: InteractionTargetRef | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver,
): InteractionSettingsSheetDescriptor | null {
  if (!targetRef) return null;

  if (targetRef.kind === InteractionTargetKind.Block) {
    return resolveBlockSettingsSheetDescriptor(editor, targetRef, blockDefinitions);
  }

  const descriptor = resolveStructuralChromeTargetDescriptor(editor.state, targetRef);
  if (!descriptor) return null;

  return resolveStructuralSettingsSheetDescriptor(descriptor, surfaceAuthoringChrome);
}

function resolveBlockSettingsSheetDescriptor(
  editor: Editor,
  targetRef: InteractionTargetRef,
  blockDefinitions: BlockDefinitionLookup,
): InteractionSettingsSheetDescriptor | null {
  const descriptor = resolveBlockChromeTargetDescriptor(editor.state, targetRef, blockDefinitions);
  if (!descriptor?.blockId) return null;

  const entry = descriptor.definition.settingsSheet;
  if (!entry) return null;

  return {
    entry,
    nodeType: descriptor.nodeType,
    pos: descriptor.pos,
    targetId: descriptor.blockId,
    targetKey: `settings:${descriptor.targetKey}`,
  };
}

function resolveStructuralSettingsSheetDescriptor(
  descriptor: StructuralChromeTargetDescriptor,
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver,
): InteractionSettingsSheetDescriptor | null {
  if (!descriptor.id) return null;

  const settings = resolveStructuralSettingsFacts(descriptor, surfaceAuthoringChrome);
  if (!settings?.entry) return null;

  return {
    entry: settings.entry,
    nodeType: descriptor.nodeType,
    pos: descriptor.pos,
    targetId: descriptor.id,
    targetKey: `settings:${descriptor.targetKey}`,
    ...(settings.title ? { title: settings.title } : {}),
  };
}

function resolveStructuralSettingsFacts(
  descriptor: StructuralChromeTargetDescriptor,
  surfaceAuthoringChrome: SurfaceAuthoringChromeResolver,
): { entry: NodeSettingsSheetDefinition | undefined; title?: string } | null {
  switch (descriptor.kind) {
    case InteractionTargetKind.Layout:
      return {
        entry: descriptor.layoutDefinition?.settingsSheet,
        ...(descriptor.layoutDefinition?.title ? { title: descriptor.layoutDefinition.title } : {}),
      };

    case InteractionTargetKind.Section: {
      const title = descriptor.sectionDefinition?.label ?? descriptor.layoutDefinition?.title;
      return {
        entry: descriptor.sectionDefinition?.settingsSheet,
        ...(title ? { title } : {}),
      };
    }

    case InteractionTargetKind.Surface:
      return {
        entry: descriptor.variant
          ? surfaceAuthoringChrome.resolve(descriptor.variant)?.settingsSheet
          : undefined,
      };

    case InteractionTargetKind.Cell:
    case InteractionTargetKind.Grid:
    case InteractionTargetKind.Region:
      return null;
  }
}
