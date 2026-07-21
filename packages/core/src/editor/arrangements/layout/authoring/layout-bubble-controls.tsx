import { CopyIcon as Copy, GearSixIcon as Gear, TrashIcon as Trash } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import { ConfigurationMenuControls } from "@/editor/shell/bubbles/interaction/menu-controls/ConfigurationMenuControls";
import {
  MenuIconButton,
  MenuSeparator,
} from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  InteractionTargetKind,
  sameInteractionTarget,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import {
  useInteractionCommands,
  useInteractionSnapshot,
} from "@/editor/interactions/targets/facade/interaction-provider";
import type {
  LayoutChromeTargetDescriptor,
  SectionChromeTargetDescriptor,
  StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type { StructuralInteractionBubbleRendererBinding } from "@/editor/interactions/interaction-bubble";

import {
  deleteLayoutAt,
  deleteLayoutSectionAt,
  duplicateLayoutAt,
  duplicateLayoutSectionAt,
} from "../model/layout-commands";
import type { RegisteredLayoutDefinition } from "../model/layout-definition";

export type LayoutMenuSnapshot =
  | {
      kind: "layout";
      layoutId?: string;
      layoutDefinition?: RegisteredLayoutDefinition;
      layoutPos: number;
    }
  | {
      kind: "section";
      layoutDefinition?: RegisteredLayoutDefinition;
      sectionId?: string;
      sectionDefinition?: RegisteredLayoutDefinition["section"];
      sectionPos: number;
    };

export type LayoutMenuChromeDescriptor =
  | LayoutChromeTargetDescriptor
  | SectionChromeTargetDescriptor;

interface LayoutMenuBubbleContentProps {
  descriptor: LayoutMenuChromeDescriptor;
  editor: Editor;
  snapshot: LayoutMenuSnapshot | null;
}

export function LayoutMenuBubbleContent({
  descriptor,
  editor,
  snapshot,
}: LayoutMenuBubbleContentProps) {
  const commands = useInteractionCommands();
  const settingsOwnerTarget = useInteractionSnapshot().owners.settingsOwner.target;
  if (!snapshot) return null;

  const quickMenu =
    snapshot.kind === "layout"
      ? snapshot.layoutDefinition?.quickMenu
      : snapshot.sectionDefinition?.quickMenu;
  const settingsSheet =
    snapshot.kind === "layout"
      ? snapshot.layoutDefinition?.settingsSheet
      : snapshot.sectionDefinition?.settingsSheet;
  const nodeType = snapshot.kind === "layout" ? "layout" : "section";
  const targetId =
    snapshot.kind === "layout" ? (snapshot.layoutId ?? null) : (snapshot.sectionId ?? null);
  const pos = snapshot.kind === "layout" ? snapshot.layoutPos : snapshot.sectionPos;
  const duplicateLabel = snapshot.kind === "layout" ? "Duplicate layout" : "Duplicate section";
  const deleteLabel = snapshot.kind === "layout" ? "Delete layout" : "Delete section";
  const duplicateTarget = () => {
    if (snapshot.kind === "layout") {
      duplicateLayoutAt(editor, snapshot.layoutPos);
      return;
    }

    duplicateLayoutSectionAt(editor, snapshot.sectionPos);
  };
  const deleteTarget = () => {
    const deleted =
      snapshot.kind === "layout"
        ? deleteLayoutAt(editor, snapshot.layoutPos)
        : deleteLayoutSectionAt(editor, snapshot.sectionPos);

    if (deleted) commands.dismissInteraction();
  };
  const hasDefinitionControls = Boolean(quickMenu?.controls.length) || Boolean(settingsSheet);
  const settingsSheetOpen = Boolean(
    settingsOwnerTarget && sameInteractionTarget(settingsOwnerTarget, descriptor.target),
  );
  return (
    <>
      <MenuIconButton icon={Copy} label={duplicateLabel} onClick={duplicateTarget} />
      <MenuIconButton destructive icon={Trash} label={deleteLabel} onClick={deleteTarget} />
      {hasDefinitionControls ? <MenuSeparator /> : null}
      {quickMenu?.controls.length ? (
        <ConfigurationMenuControls
          editor={editor}
          nodeType={nodeType}
          pos={pos}
          targetId={targetId}
          attr={quickMenu.attr}
          {...(quickMenu.schema ? { schema: quickMenu.schema } : {})}
          controls={quickMenu.controls}
        />
      ) : null}
      {quickMenu?.controls.length && settingsSheet ? <MenuSeparator /> : null}
      {settingsSheet ? (
        <MenuIconButton
          active={settingsSheetOpen}
          icon={Gear}
          label={snapshot.kind === "layout" ? "Open layout settings" : "Open section settings"}
          onClick={() => {
            commands.openSettings(descriptor.target);
          }}
        />
      ) : null}
    </>
  );
}

export function resolveLayoutMenuSnapshot(
  descriptor: StructuralChromeTargetDescriptor | null | undefined,
): LayoutMenuSnapshot | null {
  if (descriptor?.kind === InteractionTargetKind.Layout) {
    return {
      kind: "layout",
      ...(descriptor.id ? { layoutId: descriptor.id } : {}),
      ...(descriptor.layoutDefinition ? { layoutDefinition: descriptor.layoutDefinition } : {}),
      layoutPos: descriptor.pos,
    };
  }

  if (descriptor?.kind === InteractionTargetKind.Section) {
    return {
      kind: "section",
      ...(descriptor.layoutDefinition ? { layoutDefinition: descriptor.layoutDefinition } : {}),
      ...(descriptor.id ? { sectionId: descriptor.id } : {}),
      ...(descriptor.sectionDefinition ? { sectionDefinition: descriptor.sectionDefinition } : {}),
      sectionPos: descriptor.pos,
    };
  }

  return null;
}

function layoutMenuRenderer({
  descriptor,
  editor,
}: {
  descriptor: StructuralChromeTargetDescriptor;
  editor: Editor;
}) {
  if (
    descriptor.kind !== InteractionTargetKind.Layout &&
    descriptor.kind !== InteractionTargetKind.Section
  ) {
    return null;
  }
  const snapshot = resolveLayoutMenuSnapshot(descriptor);
  if (!snapshot) return null;
  return <LayoutMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />;
}

export const layoutStructuralInteractionBubbleRendererBindings = Object.freeze([
  Object.freeze({ kind: InteractionTargetKind.Layout, renderer: layoutMenuRenderer }),
  Object.freeze({ kind: InteractionTargetKind.Section, renderer: layoutMenuRenderer }),
] satisfies readonly StructuralInteractionBubbleRendererBinding[]);
