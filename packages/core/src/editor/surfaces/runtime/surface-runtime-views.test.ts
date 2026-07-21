import { describe, expect, it } from "vite-plus/test";

import { builtInSurfaceVariantRegistry } from "../model/built-in-surface-variant-definitions";
import { isRegisteredSlideCompositionSurfaceDefinition } from "../model/slide-composition-definition";
import {
  createSurfaceRuntimeViewMap,
  type SurfaceRuntimeViewBinding,
} from "./surface-runtime-view-registry";
import {
  builtInSurfaceRuntimeViewBindings,
  builtInSurfaceRuntimeViewMap,
} from "./surface-runtime-views";
import { SlideCompositionSurfaceRuntimeView } from "./variants/slide-composition";

describe("surface runtime view map", () => {
  it("covers the exact built-in 18-variant set", () => {
    expect(
      builtInSurfaceVariantRegistry.definitions.filter((definition) =>
        builtInSurfaceRuntimeViewMap.get(definition.id),
      ),
    ).toHaveLength(18);
    expect(builtInSurfaceRuntimeViewBindings.map(({ variantId }) => variantId)).toEqual(
      builtInSurfaceVariantRegistry.definitions.map(({ id }) => id),
    );
  });

  it("rejects duplicate, missing, and extra bindings", () => {
    const bindings = builtInSurfaceRuntimeViewBindings;
    const first = bindings[0];
    expect(first).toBeDefined();
    if (!first) return;

    expect(() =>
      createSurfaceRuntimeViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: [...bindings, first],
      }),
    ).toThrow(/already bound/i);
    expect(() =>
      createSurfaceRuntimeViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: bindings.slice(1),
      }),
    ).toThrow(/has no runtime view binding/i);
    expect(() =>
      createSurfaceRuntimeViewMap({
        registry: builtInSurfaceVariantRegistry,
        bindings: [...bindings, { ...first, variantId: "extra-surface" }],
      }),
    ).toThrow(/is not registered/i);
  });

  it("owns immutable normalized binding snapshots", () => {
    const binding = builtInSurfaceRuntimeViewBindings[0];
    const definition = builtInSurfaceVariantRegistry.definitions[0];
    expect(binding).toBeDefined();
    expect(definition).toBeDefined();
    if (!binding || !definition) return;

    const input: SurfaceRuntimeViewBinding[] = [{ ...binding }];
    const map = createSurfaceRuntimeViewMap({
      registry: {
        definitions: [definition],
        get: (variantId: string) => (variantId === definition.id ? definition : undefined),
      },
      bindings: input,
    });
    const registered = map.get(binding.variantId);

    input.splice(0);
    expect(registered).toBeDefined();
    expect(registered).not.toBe(binding);
    expect(Object.isFrozen(registered)).toBe(true);
  });

  it("materializes one concrete generic binding per slide composition definition", () => {
    const genericDefinitions = builtInSurfaceVariantRegistry.definitions.filter(
      isRegisteredSlideCompositionSurfaceDefinition,
    );

    expect(genericDefinitions).toHaveLength(13);
    for (const definition of genericDefinitions) {
      expect(builtInSurfaceRuntimeViewMap.get(definition.id)?.component).toBe(
        SlideCompositionSurfaceRuntimeView,
      );
    }
  });

  it("keeps runtime registrations free of authoring configuration", () => {
    for (const binding of builtInSurfaceRuntimeViewBindings) {
      expect(binding).not.toHaveProperty("configuration");
      expect(binding).not.toHaveProperty("quickMenu");
      expect(binding).not.toHaveProperty("settingsSheet");
    }
  });
});
