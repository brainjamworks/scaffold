import type { SurfaceAuthoringViewBinding } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import type { SurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import type { SurfaceRuntimeViewBinding } from "@/editor/surfaces/runtime/surface-runtime-view-registry";

export interface SurfaceCapability {
  readonly definition: SurfaceVariantDefinition;
  readonly authoringView: SurfaceAuthoringViewBinding;
  readonly runtimeView: SurfaceRuntimeViewBinding;
}

export function createSurfaceCapabilitiesFromBindings(input: {
  readonly owner: string;
  readonly definitions: readonly SurfaceVariantDefinition[];
  readonly authoringBindings: readonly SurfaceAuthoringViewBinding[];
  readonly runtimeBindings: readonly SurfaceRuntimeViewBinding[];
}): readonly SurfaceCapability[] {
  const authoringByVariantId = indexBindings(input.owner, "authoring", input.authoringBindings);
  const runtimeByVariantId = indexBindings(input.owner, "runtime", input.runtimeBindings);
  const definitionIds = new Set(input.definitions.map(({ id }) => id));
  const capabilities = input.definitions.map((definition) => {
    const authoringView = authoringByVariantId.get(definition.id);
    if (!authoringView) {
      throw new Error(
        `${input.owner} Surface definition "${definition.id}" is missing its authoring view binding.`,
      );
    }

    const runtimeView = runtimeByVariantId.get(definition.id);
    if (!runtimeView) {
      throw new Error(
        `${input.owner} Surface definition "${definition.id}" is missing its runtime view binding.`,
      );
    }

    return Object.freeze({ definition, authoringView, runtimeView });
  });

  rejectExtraBindings(input.owner, "authoring", input.authoringBindings, definitionIds);
  rejectExtraBindings(input.owner, "runtime", input.runtimeBindings, definitionIds);

  return Object.freeze(capabilities);
}

export function validateSurfaceCapability(capability: SurfaceCapability): void {
  if (!capability.definition) {
    throw new Error("Surface capability is missing its definition.");
  }

  const id = capability.definition.id;
  if (!capability.authoringView) {
    throw new Error(`Surface capability "${id}" is missing its authoring view binding.`);
  }
  if (capability.authoringView.variantId !== id) {
    throw new Error(
      `Surface capability "${id}" authoring view variant ID "${capability.authoringView.variantId}" must match its definition ID.`,
    );
  }
  if (!capability.runtimeView) {
    throw new Error(`Surface capability "${id}" is missing its runtime view binding.`);
  }
  if (capability.runtimeView.variantId !== id) {
    throw new Error(
      `Surface capability "${id}" runtime view variant ID "${capability.runtimeView.variantId}" must match its definition ID.`,
    );
  }
}

function indexBindings<Binding extends { readonly variantId: string }>(
  owner: string,
  lane: "authoring" | "runtime",
  bindings: readonly Binding[],
): Map<string, Binding> {
  const bindingsByVariantId = new Map<string, Binding>();
  for (const binding of bindings) {
    if (bindingsByVariantId.has(binding.variantId)) {
      throw new Error(
        `${owner} ${lane} Surface binding variant ID "${binding.variantId}" is duplicated.`,
      );
    }
    bindingsByVariantId.set(binding.variantId, binding);
  }
  return bindingsByVariantId;
}

function rejectExtraBindings<Binding extends { readonly variantId: string }>(
  owner: string,
  lane: "authoring" | "runtime",
  bindings: readonly Binding[],
  definitionIds: ReadonlySet<string>,
): void {
  for (const binding of bindings) {
    if (!definitionIds.has(binding.variantId)) {
      throw new Error(
        `${owner} ${lane} Surface binding "${binding.variantId}" has no matching definition.`,
      );
    }
  }
}
