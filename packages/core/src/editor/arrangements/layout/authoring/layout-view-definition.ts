import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { RegisteredLayoutDefinition } from "../model/layout-definition";

export interface LayoutComponentProps extends NodeViewProps {
  blockDefinitions: BlockDefinitionLookup;
  definition: RegisteredLayoutDefinition | null;
  editable: boolean;
  isEmpty: boolean;
}

export interface SectionComponentProps extends NodeViewProps {
  blockDefinitions: BlockDefinitionLookup;
  layoutDefinition: RegisteredLayoutDefinition | null;
  layoutNode: ProseMirrorNode | null;
  editable: boolean;
  isEmpty: boolean;
}

export interface SectionFrameProps {
  className?: string;
}

export interface LayoutViewRegistration {
  readonly id: string;
  /**
   * Layout-owned body rendered inside the generic outer authoring frame.
   * The layout component owns its inner surface root and visual geometry.
   */
  readonly layout: ComponentType<LayoutComponentProps>;
  /**
   * Wrapper-free section body. The NodeView factory owns the outer authoring
   * frame and structural target attrs.
   */
  readonly section?: ComponentType<SectionComponentProps>;
  readonly sectionFrame?: (props: SectionComponentProps) => SectionFrameProps;
}

export interface RegisteredLayoutView extends LayoutViewRegistration {
  readonly nodeType: "layout";
}
