export type LayerNodePath = readonly number[];

export function layerNodePathToJsonPath(path: LayerNodePath): readonly (string | number)[] {
  return path.flatMap((index) => ["content", index]);
}

export type LayerIdentityDiagnostic =
  | {
      readonly reason: "node-id-missing";
      readonly nodeType: "layer" | "paragraph";
      readonly path: LayerNodePath;
    }
  | {
      readonly reason: "node-id-invalid";
      readonly nodeType: "layer" | "paragraph";
      readonly path: LayerNodePath;
      readonly actualValue: unknown;
    }
  | {
      readonly reason: "node-id-duplicated";
      readonly id: string;
      readonly firstNodeType: "layer" | "paragraph";
      readonly firstPath: LayerNodePath;
      readonly duplicateNodeType: "layer" | "paragraph";
      readonly duplicatePath: LayerNodePath;
    };

interface SectionDiagnosticFacts {
  readonly ownerId: string | null;
  readonly ownerPath: LayerNodePath;
  readonly layoutId: string | null;
  readonly layoutVariant: string | null;
}

export type LayerContextDiagnostic =
  | {
      readonly reason: "layer-parent-missing";
      readonly layerId: string | null;
      readonly layerPath: LayerNodePath;
    }
  | {
      readonly reason: "layer-parent-not-composition-slot";
      readonly layerId: string | null;
      readonly layerPath: LayerNodePath;
      readonly parentId: string | null;
      readonly parentPath: LayerNodePath;
      readonly parentType: string;
    }
  | {
      readonly reason: "layout-definition-unavailable";
      readonly ownerId: string | null;
      readonly ownerPath: LayerNodePath;
      readonly layoutId: string | null;
      readonly layoutVariant: string | null;
    }
  | (SectionDiagnosticFacts & {
      readonly reason: "section-structure-invalid";
      readonly expectedChildTypes: readonly string[];
      readonly actualChildTypes: readonly string[];
    })
  | (SectionDiagnosticFacts & {
      readonly reason: "section-direct-composition-invalid";
      readonly actualChildTypes: readonly string[];
    })
  | (SectionDiagnosticFacts & {
      readonly reason: "section-slot-child-missing";
      readonly declaredNodeType: string;
    })
  | (SectionDiagnosticFacts & {
      readonly reason: "section-slot-child-wrong-type";
      readonly declaredNodeType: string;
      readonly actualDirectChildTypes: readonly string[];
    })
  | (SectionDiagnosticFacts & {
      readonly reason: "section-slot-child-nested";
      readonly declaredNodeType: string;
      readonly nestedPaths: readonly LayerNodePath[];
    })
  | (SectionDiagnosticFacts & {
      readonly reason: "section-slot-child-duplicated";
      readonly declaredNodeType: string;
      readonly directChildIndexes: readonly number[];
    })
  | {
      readonly reason: "composition-slot-requires-layer";
      readonly ownerId: string | null;
      readonly ownerType: "region" | "cell" | "section";
      readonly slotId: string | null;
      readonly slotType: string;
      readonly slotPath: LayerNodePath;
    }
  | {
      readonly reason: "composition-slot-child-not-layer";
      readonly ownerId: string | null;
      readonly ownerType: "region" | "cell" | "section";
      readonly slotId: string | null;
      readonly slotType: string;
      readonly contentPath: LayerNodePath;
      readonly contentType: string;
    }
  | {
      readonly reason: "layer-content-incompatible";
      readonly ownerId: string | null;
      readonly layerId: string | null;
      readonly contentPath: LayerNodePath;
      readonly contentType: string;
      readonly rule:
        | "direct-structural-content"
        | "feature-private-content"
        | "grid-not-allowed-in-cell"
        | "fill-occupant-must-be-exclusive";
    };

export function layerContextDiagnosticPath(diagnostic: LayerContextDiagnostic): LayerNodePath {
  if ("contentPath" in diagnostic) return diagnostic.contentPath;
  if ("layerPath" in diagnostic) return diagnostic.layerPath;
  if ("slotPath" in diagnostic) return diagnostic.slotPath;
  return diagnostic.ownerPath;
}
