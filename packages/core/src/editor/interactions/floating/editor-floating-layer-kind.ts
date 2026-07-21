export const EDITOR_FLOATING_LAYER_KIND = {
  Authoring: "authoring",
  Popover: "popover",
} as const;

export type EditorFloatingLayerKind =
  (typeof EDITOR_FLOATING_LAYER_KIND)[keyof typeof EDITOR_FLOATING_LAYER_KIND];

export const AUTHORING_EDITOR_FLOATING_LAYER_KIND = EDITOR_FLOATING_LAYER_KIND.Authoring;
export const EDITOR_FLOATING_POPOVER_LAYER_KIND = EDITOR_FLOATING_LAYER_KIND.Popover;
