import type { ControlDefinition } from "@/document/control-binding/control-definition";

import type { DocumentSemanticsDefinition } from "./definition";

export interface SemanticBlockDefinition {
  readonly nodeType: string;
  readonly title: string;
  readonly isAssessment: boolean;
  readonly documentSemantics?: DocumentSemanticsDefinition;
  readonly control?: ControlDefinition;
}

export interface SemanticLayoutSectionDefinition {
  readonly label: string;
  readonly documentSemantics?: DocumentSemanticsDefinition;
}

export interface SemanticLayoutDefinition {
  readonly id: string;
  readonly title: string;
  readonly documentSemantics?: DocumentSemanticsDefinition;
  readonly control?: ControlDefinition;
  readonly section?: SemanticLayoutSectionDefinition;
}

export interface SemanticSurfaceDefinition {
  readonly id: string;
  readonly title: string;
  readonly documentSemantics?: DocumentSemanticsDefinition;
  readonly control?: ControlDefinition;
}

export interface SemanticDefinitionLookup {
  readonly blocks: {
    get(nodeType: string): SemanticBlockDefinition | undefined;
  };
  readonly layouts: {
    get(variant: string): SemanticLayoutDefinition | undefined;
  };
  readonly surfaces: {
    get(variant: string): SemanticSurfaceDefinition | undefined;
  };
}
