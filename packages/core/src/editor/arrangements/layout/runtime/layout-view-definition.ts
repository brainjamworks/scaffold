import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";

export interface LayoutRuntimeViewProps extends NodeViewProps {
  runtimeView: RegisteredLayoutRuntimeView | null;
  isEmpty: boolean;
}

export interface SectionRuntimeViewProps extends NodeViewProps {
  layoutRuntimeView: RegisteredLayoutRuntimeView | null;
  layoutNode: ProseMirrorNode | null;
  isEmpty: boolean;
}

export interface SectionRuntimeFrameOptions {
  className?: string;
}

export interface LayoutRuntimeViewRegistration {
  readonly id: string;
  readonly component?: ComponentType<LayoutRuntimeViewProps>;
  readonly sectionComponent?: ComponentType<SectionRuntimeViewProps>;
  readonly sectionFrame?: (props: SectionRuntimeViewProps) => SectionRuntimeFrameOptions;
}

export interface RegisteredLayoutRuntimeView extends LayoutRuntimeViewRegistration {
  readonly nodeType: "layout";
}
