import {
  createScaffoldAuthoringComposition,
  type ScaffoldAuthoringComposition,
} from "@/composition/authoring/scaffold-authoring-composition";
import {
  resolveScaffoldCapabilities,
  type ResolvedScaffoldCapabilities,
} from "@/composition/model/resolved-scaffold-capabilities";
import {
  createScaffoldRuntimeComposition,
  type ScaffoldRuntimeComposition,
} from "@/composition/runtime/scaffold-runtime-composition";
import { builtInLayoutAuthoringViews } from "@/editor/arrangements/layout/authoring/built-in-layout-views";
import type { LayoutViewRegistration } from "@/editor/arrangements/layout/authoring/layout-view-definition";
import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { LayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import { builtInLayoutRuntimeViews } from "@/editor/arrangements/layout/runtime/built-in-layout-views";
import type { LayoutRuntimeViewRegistration } from "@/editor/arrangements/layout/runtime/layout-view-definition";
import { builtInBlockAuthoringBindings } from "@/editor/blocks/authoring-block-extensions";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "@/editor/blocks/runtime-block-extensions";

import {
  createBlockCapabilitiesFromBindings,
  validateBlockCapability,
  validateUniqueBlockExtensionNames,
  type BlockCapability,
} from "./block-capability";

export type { BlockCapability } from "./block-capability";

export interface LayoutCapability {
  readonly definition: LayoutDefinition;
  readonly authoringView: LayoutViewRegistration;
  readonly runtimeView: LayoutRuntimeViewRegistration;
}

export interface ScaffoldExtensionPackInput {
  readonly id: string;
  readonly blocks?: readonly BlockCapability[];
  readonly layouts?: readonly LayoutCapability[];
}

export interface ScaffoldExtensionPack {
  readonly id: string;
  readonly blocks: readonly BlockCapability[];
  readonly layouts: readonly LayoutCapability[];
}

export interface CreateScaffoldApplicationOptions {
  readonly packs?: readonly ScaffoldExtensionPack[];
}

export interface ScaffoldApplication {
  readonly capabilities: ResolvedScaffoldCapabilities;
  readonly authoring: ScaffoldAuthoringComposition;
  readonly runtime: ScaffoldRuntimeComposition;
}

export function defineScaffoldExtensionPack(
  input: ScaffoldExtensionPackInput,
): ScaffoldExtensionPack {
  validatePackId(input.id);

  return Object.freeze({
    id: input.id,
    blocks: Object.freeze((input.blocks ?? []).map(freezeBlockCapabilityShell)),
    layouts: Object.freeze((input.layouts ?? []).map(freezeLayoutCapabilityShell)),
  });
}

export function createScaffoldApplication(
  options: CreateScaffoldApplicationOptions = {},
): ScaffoldApplication {
  const blockCapabilities: BlockCapability[] = [...createBuiltInBlockCapabilities()];
  const layoutCapabilities: LayoutCapability[] = [...createBuiltInLayoutCapabilities()];
  const packIds = new Set<string>();

  for (const pack of options.packs ?? []) {
    validatePackId(pack.id);
    if (packIds.has(pack.id)) {
      throw new Error(`Duplicate Scaffold extension pack ID "${pack.id}".`);
    }

    packIds.add(pack.id);
    blockCapabilities.push(...pack.blocks);
    layoutCapabilities.push(...pack.layouts);
  }

  for (const capability of blockCapabilities) {
    validateBlockCapability(capability);
  }
  for (const capability of layoutCapabilities) {
    validateLayoutCapability(capability);
  }

  const capabilities = resolveScaffoldCapabilities({
    blockDefinitions: blockCapabilities.map((capability) => capability.definition),
    layoutDefinitions: layoutCapabilities.map((capability) => capability.definition),
  });
  validateUniqueBlockExtensionNames(blockCapabilities, "authoring");
  validateUniqueBlockExtensionNames(blockCapabilities, "runtime");
  const authoring = createScaffoldAuthoringComposition(
    capabilities,
    blockCapabilities.map((capability) => capability.authoringExtension),
    layoutCapabilities.map((capability) => capability.authoringView),
  );
  const runtime = createScaffoldRuntimeComposition(
    capabilities,
    blockCapabilities.map((capability) => capability.runtimeExtension),
    layoutCapabilities.map((capability) => capability.runtimeView),
  );

  return Object.freeze({ capabilities, authoring, runtime });
}

function createBuiltInBlockCapabilities(): readonly BlockCapability[] {
  return createBlockCapabilitiesFromBindings({
    owner: "Core",
    definitions: builtInBlockDefinitions,
    authoringBindings: builtInBlockAuthoringBindings,
    runtimeBindings: builtInBlockRuntimeBindings,
  });
}

function createBuiltInLayoutCapabilities(): readonly LayoutCapability[] {
  return Object.freeze(
    builtInLayoutDefinitions.map((definition) =>
      Object.freeze({
        definition,
        authoringView: requireBuiltInAuthoringView(definition.id),
        runtimeView: requireBuiltInRuntimeView(definition.id),
      }),
    ),
  );
}

function freezeBlockCapabilityShell(capability: BlockCapability): BlockCapability {
  return Object.freeze({ ...capability });
}

function freezeLayoutCapabilityShell(capability: LayoutCapability): LayoutCapability {
  return Object.freeze({ ...capability });
}

function requireBuiltInAuthoringView(id: string): LayoutViewRegistration {
  const view = builtInLayoutAuthoringViews.find((candidate) => candidate.id === id);
  if (!view) {
    throw new Error(`Core Layout capability "${id}" is missing its authoring view registration.`);
  }
  return view;
}

function requireBuiltInRuntimeView(id: string): LayoutRuntimeViewRegistration {
  const view = builtInLayoutRuntimeViews.find((candidate) => candidate.id === id);
  if (!view) {
    throw new Error(`Core Layout capability "${id}" is missing its runtime view registration.`);
  }
  return view;
}

function validateLayoutCapability(capability: LayoutCapability): void {
  if (!capability.definition) {
    throw new Error("Layout capability is missing its definition.");
  }

  const id = capability.definition.id;
  if (!capability.authoringView) {
    throw new Error(`Layout capability "${id}" is missing its authoring view registration.`);
  }
  if (capability.authoringView.id !== id) {
    throw new Error(
      `Layout capability "${id}" authoring view ID "${capability.authoringView.id}" must match its definition ID.`,
    );
  }
  if (!capability.runtimeView) {
    throw new Error(`Layout capability "${id}" is missing its runtime view registration.`);
  }
  if (capability.runtimeView.id !== id) {
    throw new Error(
      `Layout capability "${id}" runtime view ID "${capability.runtimeView.id}" must match its definition ID.`,
    );
  }

  if (typeof capability.definition.createContent !== "function") {
    throw new Error(`Layout capability "${id}" definition.createContent must be callable.`);
  }
  if (typeof capability.authoringView.layout !== "function") {
    throw new Error(`Layout capability "${id}" authoringView.layout must be callable.`);
  }
  if (
    capability.definition.section !== undefined &&
    typeof capability.definition.section?.create !== "function"
  ) {
    throw new Error(`Layout capability "${id}" definition.section.create must be callable.`);
  }
  if (
    capability.authoringView.section !== undefined &&
    typeof capability.authoringView.section !== "function"
  ) {
    throw new Error(`Layout capability "${id}" authoringView.section must be callable.`);
  }
  if (
    capability.authoringView.sectionFrame !== undefined &&
    typeof capability.authoringView.sectionFrame !== "function"
  ) {
    throw new Error(`Layout capability "${id}" authoringView.sectionFrame must be callable.`);
  }
  if (
    capability.runtimeView.component !== undefined &&
    typeof capability.runtimeView.component !== "function"
  ) {
    throw new Error(`Layout capability "${id}" runtimeView.component must be callable.`);
  }
  if (
    capability.runtimeView.sectionComponent !== undefined &&
    typeof capability.runtimeView.sectionComponent !== "function"
  ) {
    throw new Error(`Layout capability "${id}" runtimeView.sectionComponent must be callable.`);
  }
  if (
    capability.runtimeView.sectionFrame !== undefined &&
    typeof capability.runtimeView.sectionFrame !== "function"
  ) {
    throw new Error(`Layout capability "${id}" runtimeView.sectionFrame must be callable.`);
  }
}

function validatePackId(id: string): void {
  if (id.trim().length === 0) {
    throw new Error("Scaffold extension pack ID must not be blank.");
  }
}
