import type { AnyExtension } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createAuthoringBlockExtensions } from "./authoring-block-extensions";
import { builtInBlockDefinitions, builtInBlockRegistry } from "./built-in-block-definitions";
import { createRuntimeBlockExtensions } from "./runtime-block-extensions";

function getParentNodeTypes(
  extensions: readonly AnyExtension[],
  lane: "authoring" | "runtime",
): string[] {
  const bundleSuffix = `_${lane}_bundle`;
  return extensions.map((extension) =>
    extension.name.endsWith(bundleSuffix)
      ? extension.name.slice(0, -bundleSuffix.length)
      : extension.name,
  );
}

describe("built-in block definitions", () => {
  it("constructs the registry from 34 explicit unique node types", () => {
    const nodeTypes = builtInBlockDefinitions.map((definition) => definition.nodeType);

    expect(builtInBlockDefinitions).toHaveLength(34);
    expect(new Set(nodeTypes)).toHaveLength(34);
    expect(builtInBlockRegistry.definitions).toEqual(builtInBlockDefinitions);
    for (const definition of builtInBlockDefinitions) {
      expect(builtInBlockRegistry.getByNodeType(definition.nodeType)).toBe(definition);
    }
  });

  it("keeps insert action ids distinct from persisted media node types", () => {
    expect(builtInBlockRegistry.getByNodeType("chart_block")?.insert?.id).toBe("chart");
    expect(builtInBlockRegistry.getByNodeType("image_block")?.insert?.id).toBe("image");
    expect(builtInBlockRegistry.getByNodeType("audio_block")?.insert?.id).toBe("audio");
  });

  it("keeps every built-in definition top-level-id-free with an explicit insert action id", () => {
    const insertIds = builtInBlockDefinitions.map((definition) => definition.insert?.id);

    for (const definition of builtInBlockDefinitions) {
      expect(definition).not.toHaveProperty("id");
      expect(definition.insert?.id).toBeTypeOf("string");
    }
    expect(new Set(insertIds)).toHaveLength(34);
  });

  it("keeps authoring and runtime lanes in exact parent-node parity with the definition list", () => {
    const definitionNodeTypes = builtInBlockDefinitions.map((definition) => definition.nodeType);
    const authoringBlockExtensions = createAuthoringBlockExtensions(builtInBlockRegistry);
    const runtimeBlockExtensions = createRuntimeBlockExtensions(builtInBlockRegistry);

    expect(authoringBlockExtensions).toHaveLength(34);
    expect(runtimeBlockExtensions).toHaveLength(34);
    expect(getParentNodeTypes(authoringBlockExtensions, "authoring")).toEqual(definitionNodeTypes);
    expect(getParentNodeTypes(runtimeBlockExtensions, "runtime")).toEqual(definitionNodeTypes);
    expect(builtInBlockRegistry).not.toHaveProperty("authoringExtensions");
    expect(builtInBlockRegistry).not.toHaveProperty("runtimeExtensions");
  });
});
