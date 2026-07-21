import type { Editor } from "@tiptap/core";
import type { ComponentType } from "react";

import type { InteractionCommands } from "@/editor/interactions/targets/facade/interaction-store";
import type { InteractionTargetRef } from "@/editor/interactions/targets/model/interaction-owner-state";

import type {
  StructuralFloatingAlignment,
  StructuralFloatingPlacement,
} from "@/editor/interactions/floating/structural-floating-geometry";

export interface FloatingTargetState {
  anchorId: string | null;
  disabled?: boolean;
  key: string;
  pos: number;
  target: InteractionTargetRef;
}

export interface FloatingControl {
  alignment?: StructuralFloatingAlignment;
  blockOffset?: number;
  className: string;
  dataAttributes: Record<`data-${string}`, string | number | boolean>;
  icon?: ComponentType<{ size?: number }>;
  inlineOffset?: number;
  label: string;
  open: (input: {
    commands: InteractionCommands;
    editor: Editor;
    state: FloatingTargetState;
  }) => boolean;
  placement?: StructuralFloatingPlacement;
  resolveState: (editor: Editor) => FloatingTargetState | null;
}
