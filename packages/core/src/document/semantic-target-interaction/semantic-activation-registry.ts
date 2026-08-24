import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  MountedSemanticActivationBinding,
  SemanticActivationBindingResolution,
  SemanticActivationRegistry,
} from "./semantic-target-interaction";

export function createSemanticActivationRegistry(): SemanticActivationRegistry {
  const bindings = new Map<EmbeddedNodeId, MountedSemanticActivationBinding>();
  let disposed = false;

  return {
    register(binding) {
      if (disposed) {
        throw new Error("Cannot register a semantic activation binding after registry disposal");
      }
      if (bindings.has(binding.ownerId)) {
        throw new Error(`Duplicate semantic activation binding for owner "${binding.ownerId}"`);
      }

      bindings.set(binding.ownerId, binding);
      return () => {
        if (bindings.get(binding.ownerId) === binding) {
          bindings.delete(binding.ownerId);
        }
      };
    },

    resolve(ownerId): SemanticActivationBindingResolution {
      const binding = bindings.get(ownerId);
      return binding
        ? Object.freeze({ kind: "resolved", binding })
        : Object.freeze({ kind: "unavailable", ownerId, reason: "owner-unmounted" });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      bindings.clear();
    },
  };
}
