import type { InteractionTargetRef } from "../../model/interaction-owner-state";

export const InteractionOwnerCommandKind = {
  ActivateContextOwner: "activateContextOwner",
  ActivateStructuralTarget: "activateStructuralTarget",
  BeginGesture: "beginGesture",
  DismissInteraction: "dismissInteraction",
  EndGesture: "endGesture",
  EnterEditableContent: "enterEditableContent",
  OpenMenu: "openMenu",
  OpenSettings: "openSettings",
  SelectObjectTarget: "selectObjectTarget",
  ToggleMenu: "toggleMenu",
} as const;

export type InteractionOwnerCommandKind =
  (typeof InteractionOwnerCommandKind)[keyof typeof InteractionOwnerCommandKind];

export interface TargetedInteractionOwnerCommandMeta {
  kind:
    | typeof InteractionOwnerCommandKind.ActivateContextOwner
    | typeof InteractionOwnerCommandKind.ActivateStructuralTarget
    | typeof InteractionOwnerCommandKind.BeginGesture
    | typeof InteractionOwnerCommandKind.OpenMenu
    | typeof InteractionOwnerCommandKind.OpenSettings
    | typeof InteractionOwnerCommandKind.SelectObjectTarget
    | typeof InteractionOwnerCommandKind.ToggleMenu;
  target: InteractionTargetRef;
}

export interface EnterEditableContentInteractionOwnerCommandMeta {
  contextOwner?: InteractionTargetRef | null;
  kind: typeof InteractionOwnerCommandKind.EnterEditableContent;
}

export interface UntargetedInteractionOwnerCommandMeta {
  kind:
    | typeof InteractionOwnerCommandKind.DismissInteraction
    | typeof InteractionOwnerCommandKind.EndGesture;
}

export type InteractionOwnerCommandMeta =
  | EnterEditableContentInteractionOwnerCommandMeta
  | TargetedInteractionOwnerCommandMeta
  | UntargetedInteractionOwnerCommandMeta;

const TARGETED_COMMAND_KINDS = new Set<string>([
  InteractionOwnerCommandKind.ActivateContextOwner,
  InteractionOwnerCommandKind.ActivateStructuralTarget,
  InteractionOwnerCommandKind.BeginGesture,
  InteractionOwnerCommandKind.OpenMenu,
  InteractionOwnerCommandKind.OpenSettings,
  InteractionOwnerCommandKind.SelectObjectTarget,
  InteractionOwnerCommandKind.ToggleMenu,
]);

const UNTARGETED_COMMAND_KINDS = new Set<string>([
  InteractionOwnerCommandKind.DismissInteraction,
  InteractionOwnerCommandKind.EndGesture,
]);

export function isTargetedInteractionOwnerCommandMeta(
  meta: InteractionOwnerCommandMeta,
): meta is TargetedInteractionOwnerCommandMeta {
  return TARGETED_COMMAND_KINDS.has(meta.kind);
}

export function isInteractionOwnerCommandMeta(
  value: unknown,
): value is InteractionOwnerCommandMeta {
  if (typeof value !== "object" || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== "string") return false;

  if (kind === InteractionOwnerCommandKind.EnterEditableContent) {
    const contextOwner = (value as { contextOwner?: unknown }).contextOwner;
    return contextOwner == null || isTargetRefShaped(contextOwner);
  }

  if (UNTARGETED_COMMAND_KINDS.has(kind)) return true;
  if (!TARGETED_COMMAND_KINDS.has(kind)) return false;

  return isTargetRefShaped((value as { target?: unknown }).target);
}

function isTargetRefShaped(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kind?: unknown }).kind === "string"
  );
}
