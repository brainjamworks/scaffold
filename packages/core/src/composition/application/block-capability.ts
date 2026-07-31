import { flattenExtensions, type AnyExtension } from "@tiptap/core";

import type { BlockAuthoringBinding } from "@/editor/blocks/authoring-block-extensions";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockRuntimeBinding } from "@/editor/blocks/runtime-block-extensions";

export interface BlockCapability {
  readonly definition: BlockDefinition;
  readonly authoringExtension: AnyExtension;
  readonly runtimeExtension: AnyExtension;
}

export function createBlockCapabilitiesFromBindings(input: {
  readonly owner: string;
  readonly definitions: readonly BlockDefinition[];
  readonly authoringBindings: readonly BlockAuthoringBinding[];
  readonly runtimeBindings: readonly BlockRuntimeBinding[];
}): readonly BlockCapability[] {
  const authoringByNodeType = indexBindings(input.owner, "authoring", input.authoringBindings);
  const runtimeByNodeType = indexBindings(input.owner, "runtime", input.runtimeBindings);
  const definitionNodeTypes = new Set(input.definitions.map(({ nodeType }) => nodeType));
  const capabilities = input.definitions.map((definition) => {
    const authoringExtension = authoringByNodeType.get(definition.nodeType);
    if (!authoringExtension) {
      throw new Error(
        `${input.owner} Block definition "${definition.nodeType}" is missing its authoring binding.`,
      );
    }

    const runtimeExtension = runtimeByNodeType.get(definition.nodeType);
    if (!runtimeExtension) {
      throw new Error(
        `${input.owner} Block definition "${definition.nodeType}" is missing its runtime binding.`,
      );
    }

    return Object.freeze({ definition, authoringExtension, runtimeExtension });
  });

  rejectExtraBindings(input.owner, "authoring", input.authoringBindings, definitionNodeTypes);
  rejectExtraBindings(input.owner, "runtime", input.runtimeBindings, definitionNodeTypes);

  return Object.freeze(capabilities);
}

export function validateBlockCapability(capability: BlockCapability): void {
  if (!capability.definition) {
    throw new Error("Block capability is missing its definition.");
  }

  const nodeType = capability.definition.nodeType;
  if (!capability.authoringExtension) {
    throw new Error(`Block capability "${nodeType}" is missing its authoring extension bundle.`);
  }
  if (!capability.runtimeExtension) {
    throw new Error(`Block capability "${nodeType}" is missing its runtime extension bundle.`);
  }

  validateBundleRoot(nodeType, "authoring", capability.authoringExtension);
  validateBundleRoot(nodeType, "runtime", capability.runtimeExtension);
}

export function validateUniqueBlockExtensionNames(
  capabilities: readonly BlockCapability[],
  lane: "authoring" | "runtime",
): void {
  const ownersByExtensionName = new Map<string, string>();

  for (const capability of capabilities) {
    const nodeType = capability.definition.nodeType;
    const bundle =
      lane === "authoring" ? capability.authoringExtension : capability.runtimeExtension;
    for (const extension of flattenExtensions([bundle])) {
      const firstOwner = ownersByExtensionName.get(extension.name);
      if (firstOwner) {
        const laneLabel = lane === "authoring" ? "Authoring" : "Runtime";
        throw new Error(
          `${laneLabel} Block extension name "${extension.name}" is duplicated by capabilities "${firstOwner}" and "${nodeType}".`,
        );
      }
      ownersByExtensionName.set(extension.name, nodeType);
    }
  }
}

function indexBindings(
  owner: string,
  lane: "authoring" | "runtime",
  bindings: readonly (BlockAuthoringBinding | BlockRuntimeBinding)[],
): Map<string, AnyExtension> {
  const extensionsByNodeType = new Map<string, AnyExtension>();
  for (const binding of bindings) {
    if (extensionsByNodeType.has(binding.nodeType)) {
      throw new Error(
        `${owner} ${lane} Block binding node type "${binding.nodeType}" is duplicated.`,
      );
    }
    extensionsByNodeType.set(binding.nodeType, binding.extension);
  }
  return extensionsByNodeType;
}

function rejectExtraBindings(
  owner: string,
  lane: "authoring" | "runtime",
  bindings: readonly (BlockAuthoringBinding | BlockRuntimeBinding)[],
  definitionNodeTypes: ReadonlySet<string>,
): void {
  for (const binding of bindings) {
    if (!definitionNodeTypes.has(binding.nodeType)) {
      throw new Error(
        `${owner} ${lane} Block binding "${binding.nodeType}" has no matching definition.`,
      );
    }
  }
}

function validateBundleRoot(
  nodeType: string,
  lane: "authoring" | "runtime",
  bundle: AnyExtension,
): void {
  const rootCount = flattenExtensions([bundle]).filter(
    (extension) => extension.type === "node" && extension.name === nodeType,
  ).length;

  if (rootCount !== 1) {
    throw new Error(
      `Block capability "${nodeType}" ${lane} extension bundle must contain exactly one root Node named "${nodeType}"; found ${rootCount}.`,
    );
  }
}
