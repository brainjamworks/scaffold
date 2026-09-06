import type { ControlDefinition } from "@/document/control-binding/control-definition";

import type { DocumentTreeDefinition } from "./definition";

export interface DocumentTreeBlockDefinition {
  readonly nodeType: string;
  readonly title: string;
  readonly isAssessment: boolean;
  readonly documentTree?: DocumentTreeDefinition;
  readonly control?: ControlDefinition;
}

export interface DocumentTreeLayoutSectionDefinition {
  readonly label: string;
  readonly documentTree?: DocumentTreeDefinition;
}

export interface DocumentTreeLayoutDefinition {
  readonly id: string;
  readonly title: string;
  readonly documentTree?: DocumentTreeDefinition;
  readonly control?: ControlDefinition;
  readonly section?: DocumentTreeLayoutSectionDefinition;
}

export interface DocumentTreeSurfaceDefinition {
  readonly id: string;
  readonly title: string;
  readonly documentTree?: DocumentTreeDefinition;
  readonly control?: ControlDefinition;
}

export interface DocumentTreeDefinitionLookup {
  readonly blocks: {
    get(nodeType: string): DocumentTreeBlockDefinition | undefined;
  };
  readonly layouts: {
    get(variant: string): DocumentTreeLayoutDefinition | undefined;
  };
  readonly surfaces: {
    get(variant: string): DocumentTreeSurfaceDefinition | undefined;
  };
}
