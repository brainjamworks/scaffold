import type { NodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";

import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import type { NodeSettingsSheetDefinition } from "@/editor/configuration/settings-sheet";

import type { RegisteredSurfaceVariantDefinition } from "../model/surface-variant-definition";

export interface SurfaceAuthoringViewProps extends NodeViewProps {
  authoringView: RegisteredSurfaceAuthoringView;
  definition: RegisteredSurfaceVariantDefinition;
  isEmpty: boolean;
  variant: string;
}

export interface RegisteredSurfaceAuthoringView {
  readonly variantId: string;
  readonly component: ComponentType<SurfaceAuthoringViewProps>;
  readonly nodeType: "surface";
  readonly quickMenu?: QuickMenuDefinition;
  readonly settingsSheet?: NodeSettingsSheetDefinition;
}

export interface SurfaceRuntimeViewBinding {
  readonly variantId: string;
  readonly component: ComponentType<SurfaceRuntimeViewProps>;
}

export interface SurfaceRuntimeViewProps extends NodeViewProps {
  readonly definition: RegisteredSurfaceVariantDefinition;
  readonly runtimeView: RegisteredSurfaceRuntimeView;
  readonly isEmpty: boolean;
  readonly variant: string;
}

export interface RegisteredSurfaceRuntimeView extends SurfaceRuntimeViewBinding {
  readonly nodeType: "surface";
}
