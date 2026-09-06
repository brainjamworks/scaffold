import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

import type { DocumentTreeDefinitionLookup } from "@/document/model/document-tree/definition-lookup";
import type {
  DocumentTreeSnapshot,
  DocumentTreeItem,
} from "@/document/model/document-tree/document-tree-snapshot";
import type {
  ControlCapabilitySetDefinition,
  ControlCommandDefinition,
  ControlCommandType,
  ControlDefinition,
} from "./control-definition";

export interface ResolvedControlTarget {
  readonly targetId: EmbeddedNodeId;
  readonly ownerId: EmbeddedNodeId;
  readonly capabilities: ControlCapabilitySetDefinition;
}

export type ControlTargetResolutionError =
  | {
      readonly reason: "target-not-public";
      readonly targetId: EmbeddedNodeId;
    }
  | {
      readonly reason: "no-declared-capabilities";
      readonly targetId: EmbeddedNodeId;
    };

export type ControlTargetResolutionResult = ResultType<
  ResolvedControlTarget,
  ControlTargetResolutionError
>;

export interface ResolvedControlCommand {
  readonly targetId: EmbeddedNodeId;
  readonly ownerId: EmbeddedNodeId;
  readonly command: ControlCommandDefinition;
}

export type ControlCommandResolutionError =
  | ControlTargetResolutionError
  | {
      readonly reason: "command-not-declared";
      readonly targetId: EmbeddedNodeId;
      readonly type: ControlCommandType;
    };

export type ControlCommandResolutionResult = ResultType<
  ResolvedControlCommand,
  ControlCommandResolutionError
>;

export interface ControlCapabilityCatalogue {
  resolve(targetId: EmbeddedNodeId): ControlTargetResolutionResult;
  resolveCommand(
    targetId: EmbeddedNodeId,
    type: ControlCommandType,
  ): ControlCommandResolutionResult;
  requireOwnerControlDefinition(ownerId: EmbeddedNodeId): ControlDefinition;
  requireOwnedTargetCapabilities(
    ownerId: EmbeddedNodeId,
    targetId: EmbeddedNodeId,
  ): ControlCapabilitySetDefinition;
}

export interface CreateControlCapabilityCatalogueInput {
  readonly snapshot: DocumentTreeSnapshot;
  readonly definitions: DocumentTreeDefinitionLookup;
}

export function createControlCapabilityCatalogue({
  snapshot,
  definitions,
}: CreateControlCapabilityCatalogueInput): ControlCapabilityCatalogue {
  const targetById = new Map<EmbeddedNodeId, ResolvedControlTarget>();
  const controlByOwnerId = new Map<EmbeddedNodeId, ControlDefinition>();

  for (const item of snapshot.itemById.values()) {
    if (!isSemanticOwner(item)) continue;
    const control = resolveOwnerControlDefinition(item, definitions);
    if (!control) continue;

    controlByOwnerId.set(item.id, control);
    if (control.owner) claimTarget(targetById, item, item.id, control.owner);
    for (const child of item.children) {
      visitOwnedSemanticChild(child, item.id, control, targetById);
    }
  }

  const resolve = (targetId: EmbeddedNodeId): ControlTargetResolutionResult => {
    if (!snapshot.itemById.has(targetId)) {
      return Result.err(Object.freeze({ reason: "target-not-public", targetId }));
    }

    const target = targetById.get(targetId);
    if (!target) {
      return Result.err(Object.freeze({ reason: "no-declared-capabilities", targetId }));
    }
    return Result.ok(target);
  };

  function requireOwnerControlDefinition(ownerId: EmbeddedNodeId): ControlDefinition {
    const owner = snapshot.itemById.get(ownerId);
    if (!owner) throw new Error(`Control owner "${ownerId}" is not public.`);
    if (!isSemanticOwner(owner)) {
      throw new Error(`Control owner "${ownerId}" is not a current semantic owner.`);
    }

    const control = controlByOwnerId.get(ownerId);
    if (!control) throw new Error(`Control owner "${ownerId}" has no Control Definition.`);
    return control;
  }

  function requireOwnedTargetCapabilities(
    ownerId: EmbeddedNodeId,
    targetId: EmbeddedNodeId,
  ): ControlCapabilitySetDefinition {
    requireOwnerControlDefinition(ownerId);
    const target = targetById.get(targetId);
    if (!target || target.ownerId !== ownerId) {
      throw new Error(`Control target "${targetId}" does not belong to owner "${ownerId}".`);
    }
    return target.capabilities;
  }

  return Object.freeze({
    resolve,
    resolveCommand(targetId: EmbeddedNodeId, type: ControlCommandType) {
      const target = resolve(targetId);
      if (target.isErr()) return Result.err(target.error);

      const command = target.value.capabilities.commands?.find(
        (candidate) => candidate.type === type,
      );
      if (!command) {
        return Result.err(Object.freeze({ reason: "command-not-declared", targetId, type }));
      }

      return Result.ok(
        Object.freeze({
          targetId,
          ownerId: target.value.ownerId,
          command,
        }),
      );
    },
    requireOwnerControlDefinition,
    requireOwnedTargetCapabilities,
  });
}

type SemanticOwnerItem = DocumentTreeItem & {
  readonly kind: "surface" | "layout" | "block";
};

function isSemanticOwner(item: DocumentTreeItem): item is SemanticOwnerItem {
  return item.kind === "surface" || item.kind === "layout" || item.kind === "block";
}

function resolveOwnerControlDefinition(
  owner: SemanticOwnerItem,
  definitions: DocumentTreeDefinitionLookup,
): ControlDefinition | undefined {
  if (owner.definitionId === null) return undefined;

  if (owner.kind === "surface") {
    const definition = definitions.surfaces.get(owner.definitionId);
    if (!definition) {
      throw new Error(
        `Semantic owner "${owner.id}" references missing Surface definition "${owner.definitionId}".`,
      );
    }
    assertDefinitionIdentity(owner, definition.id);
    return definition.control;
  }

  if (owner.kind === "layout") {
    const definition = definitions.layouts.get(owner.definitionId);
    if (!definition) {
      throw new Error(
        `Semantic owner "${owner.id}" references missing Layout definition "${owner.definitionId}".`,
      );
    }
    assertDefinitionIdentity(owner, definition.id);
    return definition.control;
  }

  if (owner.definitionId !== owner.nodeType) {
    throw new Error(
      `Semantic Block owner "${owner.id}" has definition identity "${owner.definitionId}" but node type "${owner.nodeType}".`,
    );
  }
  const definition = definitions.blocks.get(owner.nodeType);
  if (!definition) {
    throw new Error(
      `Semantic owner "${owner.id}" references missing Block definition "${owner.nodeType}".`,
    );
  }
  assertDefinitionIdentity(owner, definition.nodeType);
  return definition.control;
}

function assertDefinitionIdentity(owner: SemanticOwnerItem, definitionId: string): void {
  if (definitionId !== owner.definitionId) {
    throw new Error(
      `Semantic owner "${owner.id}" resolved definition "${definitionId}" instead of "${owner.definitionId}".`,
    );
  }
}

function visitOwnedSemanticChild(
  item: DocumentTreeItem,
  ownerId: EmbeddedNodeId,
  control: ControlDefinition,
  targetById: Map<EmbeddedNodeId, ResolvedControlTarget>,
): void {
  if (isSemanticOwner(item)) return;

  const capabilities = control.semanticChildren?.[item.nodeType];
  if (capabilities) claimTarget(targetById, item, ownerId, capabilities);

  for (const child of item.children) {
    visitOwnedSemanticChild(child, ownerId, control, targetById);
  }
}

function claimTarget(
  targetById: Map<EmbeddedNodeId, ResolvedControlTarget>,
  item: DocumentTreeItem,
  ownerId: EmbeddedNodeId,
  capabilities: ControlCapabilitySetDefinition,
): void {
  const existing = targetById.get(item.id);
  if (existing) {
    throw new Error(
      `Control target "${item.id}" is claimed by both "${existing.ownerId}" and "${ownerId}".`,
    );
  }

  targetById.set(
    item.id,
    Object.freeze({
      targetId: item.id,
      ownerId,
      capabilities,
    }),
  );
}
