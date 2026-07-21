import { GearSixIcon as Gear } from "@phosphor-icons/react";
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
  StructuralChromeTargetDescriptor,
  SurfaceChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type {
  StructuralInteractionBubbleRenderer,
  StructuralInteractionBubbleRendererBinding,
} from "@/editor/interactions/interaction-bubble";

import { DeleteSurface, DuplicateSurface } from "./actions";

import type {
  SurfaceAuthoringChrome,
  SurfaceAuthoringChromeResolver,
} from "../surface-authoring-view-registry";

export interface SurfaceMenuSnapshot {
  defaultActions?: {
    deleteLabel: string;
    duplicateLabel: string;
  };
  authoringChrome?: SurfaceAuthoringChrome;
  surfaceId?: string;
  surfacePos: number;
}

interface SurfaceMenuBubbleContentProps {
  descriptor: SurfaceChromeTargetDescriptor;
  editor: Editor;
  snapshot: SurfaceMenuSnapshot | null;
}

export function SurfaceMenuBubbleContent({
  descriptor,
  editor,
  snapshot,
}: SurfaceMenuBubbleContentProps) {
  const commands = useInteractionCommands();
  const settingsOwnerTarget = useInteractionSnapshot().owners.settingsOwner.target;
  if (!snapshot) return null;

  const quickMenu = snapshot.authoringChrome?.quickMenu;
  const settingsSheet = resolveSurfaceSettingsSheet(snapshot);
  const hasDefaultActions = Boolean(snapshot.defaultActions);
  const hasQuickMenu = Boolean(quickMenu?.controls.length);
  const settingsSheetOpen = Boolean(
    settingsOwnerTarget && sameInteractionTarget(settingsOwnerTarget, descriptor.target),
  );

  return (
    <>
      {snapshot.defaultActions ? (
        <>
          <DuplicateSurface
            editor={editor}
            pos={snapshot.surfacePos}
            label={snapshot.defaultActions.duplicateLabel}
          />
          <DeleteSurface
            editor={editor}
            pos={snapshot.surfacePos}
            label={snapshot.defaultActions.deleteLabel}
          />
        </>
      ) : null}
      {hasDefaultActions && hasQuickMenu ? <MenuSeparator /> : null}
      {hasQuickMenu && quickMenu ? (
        <ConfigurationMenuControls
          editor={editor}
          nodeType="surface"
          pos={snapshot.surfacePos}
          targetId={snapshot.surfaceId ?? null}
          attr={quickMenu.attr}
          {...(quickMenu.schema ? { schema: quickMenu.schema } : {})}
          controls={quickMenu.controls}
        />
      ) : null}
      {(hasDefaultActions || hasQuickMenu) && settingsSheet ? <MenuSeparator /> : null}
      {settingsSheet ? (
        <MenuIconButton
          active={settingsSheetOpen}
          icon={Gear}
          label="Open surface settings"
          onClick={() => {
            commands.openSettings(descriptor.target);
          }}
        />
      ) : null}
    </>
  );
}

function resolveSurfaceSettingsSheet(
  snapshot: SurfaceMenuSnapshot,
): SurfaceAuthoringChrome["settingsSheet"] {
  return snapshot.authoringChrome?.settingsSheet;
}

export function resolveSurfaceMenuSnapshot(
  editor: Editor,
  descriptor: StructuralChromeTargetDescriptor | null | undefined,
  authoringChromeResolver: SurfaceAuthoringChromeResolver,
): SurfaceMenuSnapshot | null {
  if (descriptor?.kind !== InteractionTargetKind.Surface) return null;

  const courseMode = readCourseMode(editor);
  const defaultActions = surfaceDefaultActionsForMode(courseMode);
  const authoringChrome = descriptor.variant
    ? authoringChromeResolver.resolve(descriptor.variant)
    : undefined;

  return {
    ...(defaultActions ? { defaultActions } : {}),
    ...(authoringChrome ? { authoringChrome } : {}),
    ...(descriptor.id ? { surfaceId: descriptor.id } : {}),
    surfacePos: descriptor.pos,
  };
}

export function surfaceMenuSnapshotHasControls(
  snapshot: SurfaceMenuSnapshot | null,
): snapshot is SurfaceMenuSnapshot {
  return Boolean(
    snapshot &&
    (snapshot.defaultActions ||
      snapshot.authoringChrome?.quickMenu?.controls.length ||
      snapshot.authoringChrome?.settingsSheet),
  );
}

function readCourseMode(editor: Editor): string | null {
  const courseDocument = editor.state.doc.firstChild;
  if (!courseDocument || courseDocument.type.name !== "courseDocument") {
    return null;
  }

  const mode = courseDocument.attrs["mode"];
  return typeof mode === "string" ? mode : null;
}

function surfaceDefaultActionsForMode(
  mode: string | null,
): SurfaceMenuSnapshot["defaultActions"] | undefined {
  if (mode === "page") return undefined;
  if (mode === "slideshow") {
    return {
      deleteLabel: "Delete slide",
      duplicateLabel: "Duplicate slide",
    };
  }

  return {
    deleteLabel: "Delete surface",
    duplicateLabel: "Duplicate surface",
  };
}

export function createSurfaceStructuralInteractionBubbleRendererBinding(
  authoringChromeResolver: SurfaceAuthoringChromeResolver,
): StructuralInteractionBubbleRendererBinding {
  const renderer: StructuralInteractionBubbleRenderer = ({ descriptor, editor }) => {
    if (descriptor.kind !== InteractionTargetKind.Surface) return null;
    const snapshot = resolveSurfaceMenuSnapshot(editor, descriptor, authoringChromeResolver);
    if (!surfaceMenuSnapshotHasControls(snapshot)) return null;
    return <SurfaceMenuBubbleContent descriptor={descriptor} editor={editor} snapshot={snapshot} />;
  };

  return Object.freeze({
    kind: InteractionTargetKind.Surface,
    renderer,
  });
}
