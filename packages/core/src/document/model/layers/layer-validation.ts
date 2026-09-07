import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import {
  CELL_NODE_TYPE,
  GRID_NODE_TYPE,
  LAYER_NODE_TYPE,
  LAYOUT_NODE_TYPE,
  REGION_NODE_TYPE,
  SECTION_NODE_TYPE,
} from "@/document/model/nodes/structural-node-types";
import { isFillOccupantNode } from "@/editor/bounded-containers/model/bounded-container-placement";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

const DIRECTLY_PROHIBITED_LAYER_CHILDREN = new Set([
  LAYER_NODE_TYPE,
  REGION_NODE_TYPE,
  CELL_NODE_TYPE,
  SECTION_NODE_TYPE,
  "surface",
  "courseDocument",
]);

export type LayerNodePath = readonly number[];

export type LayerIdentityDiagnostic =
  | {
      readonly reason: "node-id-missing";
      readonly nodeType: typeof LAYER_NODE_TYPE | "paragraph";
      readonly path: LayerNodePath;
    }
  | {
      readonly reason: "node-id-invalid";
      readonly nodeType: typeof LAYER_NODE_TYPE | "paragraph";
      readonly path: LayerNodePath;
      readonly actualValue: unknown;
    }
  | {
      readonly reason: "node-id-duplicated";
      readonly id: string;
      readonly firstNodeType: typeof LAYER_NODE_TYPE | "paragraph";
      readonly firstPath: LayerNodePath;
      readonly duplicateNodeType: typeof LAYER_NODE_TYPE | "paragraph";
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

interface NodeLocation {
  readonly node: ProseMirrorNode;
  readonly path: readonly number[];
  readonly parent: ProseMirrorNode | null;
}

interface CompositionSlotLocation {
  readonly owner: ProseMirrorNode;
  readonly ownerType: "region" | "cell" | "section";
  readonly slot: ProseMirrorNode;
  readonly slotPath: readonly number[];
}

export interface ValidateLayerContextInput {
  readonly document: ProseMirrorNode;
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
}

export function validateLayerIdentities(
  document: ProseMirrorNode,
): readonly LayerIdentityDiagnostic[] {
  const diagnostics: LayerIdentityDiagnostic[] = [];
  const identities = new Map<
    string,
    { readonly nodeType: typeof LAYER_NODE_TYPE | "paragraph"; readonly path: LayerNodePath }
  >();

  visitNodes(document, ({ node, path, parent }) => {
    if (
      node.type.name !== LAYER_NODE_TYPE &&
      !(node.type.name === "paragraph" && parent?.type.name === LAYER_NODE_TYPE)
    ) {
      return;
    }

    const nodeType = node.type.name as typeof LAYER_NODE_TYPE | "paragraph";
    const id = node.attrs["id"];
    if (id === null || id === undefined || id === "") {
      diagnostics.push(
        Object.freeze({ reason: "node-id-missing", nodeType, path: freezePath(path) }),
      );
      return;
    }

    const parsed = EmbeddedNodeIdSchema.safeParse(id);
    if (!parsed.success) {
      diagnostics.push(
        Object.freeze({
          reason: "node-id-invalid",
          nodeType,
          path: freezePath(path),
          actualValue: id,
        }),
      );
      return;
    }

    const first = identities.get(parsed.data);
    if (first) {
      diagnostics.push(
        Object.freeze({
          reason: "node-id-duplicated",
          id: parsed.data,
          firstNodeType: first.nodeType,
          firstPath: first.path,
          duplicateNodeType: nodeType,
          duplicatePath: freezePath(path),
        }),
      );
      return;
    }
    identities.set(parsed.data, { nodeType, path: freezePath(path) });
  });

  return Object.freeze(diagnostics);
}

export function validateLayerContext({
  document,
  blockDefinitions,
  layoutDefinitions,
}: ValidateLayerContextInput): readonly LayerContextDiagnostic[] {
  const diagnostics: LayerContextDiagnostic[] = [];
  const ownedLayerPaths = new Set<string>();
  const layerLocations: NodeLocation[] = [];

  visitNodes(document, (location) => {
    const { node } = location;
    if (node.type.name === LAYER_NODE_TYPE) layerLocations.push(location);

    if (node.type.name === REGION_NODE_TYPE || node.type.name === CELL_NODE_TYPE) {
      validateCompositionSlot(
        {
          owner: node,
          ownerType: node.type.name,
          slot: node,
          slotPath: location.path,
        },
        blockDefinitions,
        layoutDefinitions,
        ownedLayerPaths,
        diagnostics,
      );
      return;
    }

    if (node.type.name !== SECTION_NODE_TYPE) return;
    validateSection(location, blockDefinitions, layoutDefinitions, ownedLayerPaths, diagnostics);
  });

  for (const location of layerLocations) {
    if (ownedLayerPaths.has(pathKey(location.path))) continue;
    if (!location.parent) {
      diagnostics.push(
        Object.freeze({
          reason: "layer-parent-missing",
          layerId: readId(location.node),
          layerPath: freezePath(location.path),
        }),
      );
      continue;
    }
    diagnostics.push(
      Object.freeze({
        reason: "layer-parent-not-composition-slot",
        layerId: readId(location.node),
        layerPath: freezePath(location.path),
        parentId: readId(location.parent),
        parentPath: freezePath(location.path.slice(0, -1)),
        parentType: location.parent.type.name,
      }),
    );
  }

  return Object.freeze(diagnostics);
}

function validateSection(
  location: NodeLocation,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  ownedLayerPaths: Set<string>,
  diagnostics: LayerContextDiagnostic[],
): void {
  const section = location.node;
  const layout = location.parent;
  if (layout?.type.name !== "layout") {
    diagnostics.push(
      Object.freeze({
        reason: "layout-definition-unavailable",
        ownerId: readId(section),
        ownerPath: freezePath(location.path),
        layoutId: null,
        layoutVariant: null,
      }),
    );
    return;
  }

  const definition = layoutDefinitions.getForNode(layout);
  const layoutVariant = readString(layout.attrs["variant"]);
  if (!definition?.section) {
    diagnostics.push(
      Object.freeze({
        reason: "layout-definition-unavailable",
        ownerId: readId(section),
        ownerPath: freezePath(location.path),
        layoutId: readId(layout),
        layoutVariant,
      }),
    );
    return;
  }

  const facts = sectionFacts(section, location.path, layout, layoutVariant);
  const actualChildTypes = directChildTypes(section);
  const structure = definition.section.structure;
  if (structure && !sameStrings(actualChildTypes, structure.nodeTypes)) {
    diagnostics.push(
      Object.freeze({
        ...facts,
        reason: "section-structure-invalid",
        expectedChildTypes: Object.freeze([...structure.nodeTypes]),
        actualChildTypes: Object.freeze([...actualChildTypes]),
      }),
    );
  }

  const declaration = definition.section.compositionSlot;
  if (declaration.kind === "direct") {
    if (!everyChildIsLayer(section)) {
      diagnostics.push(
        Object.freeze({
          ...facts,
          reason: "section-direct-composition-invalid",
          actualChildTypes: Object.freeze([...actualChildTypes]),
        }),
      );
      return;
    }
    validateCompositionSlot(
      {
        owner: section,
        ownerType: SECTION_NODE_TYPE,
        slot: section,
        slotPath: location.path,
      },
      blockDefinitions,
      layoutDefinitions,
      ownedLayerPaths,
      diagnostics,
    );
    return;
  }

  const matches = directChildMatches(section, declaration.nodeType);
  if (matches.length === 0) {
    const nestedPaths = findDescendantPaths(section, declaration.nodeType);
    if (nestedPaths.length > 0) {
      diagnostics.push(
        Object.freeze({
          ...facts,
          reason: "section-slot-child-nested",
          declaredNodeType: declaration.nodeType,
          nestedPaths: Object.freeze(
            nestedPaths.map((path) => freezePath([...location.path, ...path])),
          ),
        }),
      );
      return;
    }
    diagnostics.push(
      actualChildTypes.length === 0
        ? Object.freeze({
            ...facts,
            reason: "section-slot-child-missing",
            declaredNodeType: declaration.nodeType,
          })
        : Object.freeze({
            ...facts,
            reason: "section-slot-child-wrong-type",
            declaredNodeType: declaration.nodeType,
            actualDirectChildTypes: Object.freeze([...actualChildTypes]),
          }),
    );
    return;
  }
  if (matches.length > 1) {
    diagnostics.push(
      Object.freeze({
        ...facts,
        reason: "section-slot-child-duplicated",
        declaredNodeType: declaration.nodeType,
        directChildIndexes: Object.freeze(matches.map(({ index }) => index)),
      }),
    );
    return;
  }

  const match = matches[0]!;
  validateCompositionSlot(
    {
      owner: section,
      ownerType: SECTION_NODE_TYPE,
      slot: match.node,
      slotPath: [...location.path, match.index],
    },
    blockDefinitions,
    layoutDefinitions,
    ownedLayerPaths,
    diagnostics,
  );
}

function validateCompositionSlot(
  location: CompositionSlotLocation,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  ownedLayerPaths: Set<string>,
  diagnostics: LayerContextDiagnostic[],
): void {
  const { owner, ownerType, slot, slotPath } = location;
  if (slot.childCount === 0) {
    diagnostics.push(
      Object.freeze({
        reason: "composition-slot-requires-layer",
        ownerId: readId(owner),
        ownerType,
        slotId: readId(slot),
        slotType: slot.type.name,
        slotPath: freezePath(slotPath),
      }),
    );
    return;
  }

  slot.forEach((child, _offset, index) => {
    const childPath = [...slotPath, index];
    if (child.type.name !== LAYER_NODE_TYPE) {
      diagnostics.push(
        Object.freeze({
          reason: "composition-slot-child-not-layer",
          ownerId: readId(owner),
          ownerType,
          slotId: readId(slot),
          slotType: slot.type.name,
          contentPath: freezePath(childPath),
          contentType: child.type.name,
        }),
      );
      return;
    }
    ownedLayerPaths.add(pathKey(childPath));
    validateLayerContent(
      child,
      childPath,
      owner,
      ownerType,
      blockDefinitions,
      layoutDefinitions,
      diagnostics,
    );
  });
}

function validateLayerContent(
  layer: ProseMirrorNode,
  layerPath: readonly number[],
  owner: ProseMirrorNode,
  ownerType: CompositionSlotLocation["ownerType"],
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  diagnostics: LayerContextDiagnostic[],
): void {
  const fillOccupants: { readonly node: ProseMirrorNode; readonly path: readonly number[] }[] = [];

  layer.forEach((child, _offset, index) => {
    const contentPath = [...layerPath, index];
    if (DIRECTLY_PROHIBITED_LAYER_CHILDREN.has(child.type.name)) {
      pushIncompatible("direct-structural-content", child, contentPath);
    } else if (!isEligibleLayerContent(child, blockDefinitions, layoutDefinitions)) {
      pushIncompatible("feature-private-content", child, contentPath);
    }

    if (ownerType === CELL_NODE_TYPE && child.type.name === "grid") {
      pushIncompatible("grid-not-allowed-in-cell", child, contentPath);
    }
    if (isFillOccupantNode(child, blockDefinitions, layoutDefinitions)) {
      fillOccupants.push({ node: child, path: contentPath });
    }
  });

  if (fillOccupants.length > 0 && layer.childCount > 1) {
    for (const occupant of fillOccupants) {
      pushIncompatible("fill-occupant-must-be-exclusive", occupant.node, occupant.path);
    }
  }

  function pushIncompatible(
    rule: Extract<LayerContextDiagnostic, { reason: "layer-content-incompatible" }>["rule"],
    child: ProseMirrorNode,
    contentPath: readonly number[],
  ): void {
    diagnostics.push(
      Object.freeze({
        reason: "layer-content-incompatible",
        ownerId: readId(owner),
        layerId: readId(layer),
        contentPath: freezePath(contentPath),
        contentType: child.type.name,
        rule,
      }),
    );
  }
}

function sectionFacts(
  section: ProseMirrorNode,
  path: readonly number[],
  layout: ProseMirrorNode,
  layoutVariant: string | null,
): SectionDiagnosticFacts {
  return {
    ownerId: readId(section),
    ownerPath: freezePath(path),
    layoutId: readId(layout),
    layoutVariant,
  };
}

function isEligibleLayerContent(
  node: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): boolean {
  if (node.type.name === "paragraph") return true;
  if (node.type.isInGroup(TEXT_CONTENT)) return true;
  if (blockDefinitions.getByNodeType(node.type.name)) return true;
  if (node.type.name === GRID_NODE_TYPE) return true;
  return node.type.name === LAYOUT_NODE_TYPE && layoutDefinitions.getForNode(node) !== undefined;
}

function everyChildIsLayer(node: ProseMirrorNode): boolean {
  if (node.childCount === 0) return true;
  for (let index = 0; index < node.childCount; index += 1) {
    if (node.child(index).type.name !== LAYER_NODE_TYPE) return false;
  }
  return true;
}

function directChildMatches(
  node: ProseMirrorNode,
  nodeType: string,
): readonly { readonly node: ProseMirrorNode; readonly index: number }[] {
  const matches: { node: ProseMirrorNode; index: number }[] = [];
  node.forEach((child, _offset, index) => {
    if (child.type.name === nodeType) matches.push({ node: child, index });
  });
  return matches;
}

function findDescendantPaths(node: ProseMirrorNode, nodeType: string): readonly number[][] {
  const paths: number[][] = [];
  const visit = (parent: ProseMirrorNode, path: readonly number[]) => {
    parent.forEach((child, _offset, index) => {
      const childPath = [...path, index];
      if (path.length > 0 && child.type.name === nodeType) paths.push(childPath);
      visit(child, childPath);
    });
  };
  visit(node, []);
  return paths;
}

function directChildTypes(node: ProseMirrorNode): readonly string[] {
  const types: string[] = [];
  node.forEach((child) => types.push(child.type.name));
  return types;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function visitNodes(root: ProseMirrorNode, visitor: (location: NodeLocation) => void): void {
  const visit = (
    node: ProseMirrorNode,
    path: readonly number[],
    parent: ProseMirrorNode | null,
  ) => {
    visitor({ node, path, parent });
    node.forEach((child, _offset, index) => visit(child, [...path, index], node));
  };
  visit(root, [], null);
}

function readId(node: ProseMirrorNode): string | null {
  return readString(node.attrs["id"]);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function freezePath(path: readonly number[]): LayerNodePath {
  return Object.freeze([...path]);
}

function pathKey(path: readonly number[]): string {
  return path.join(".");
}
