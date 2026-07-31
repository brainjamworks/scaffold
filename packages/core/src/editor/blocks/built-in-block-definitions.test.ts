import { describe, expect, it } from "vite-plus/test";

import { builtInBlockAuthoringBindings } from "./authoring-block-extensions";
import { builtInBlockDefinitions, builtInBlockRegistry } from "./built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "./runtime-block-extensions";

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

    expect(builtInBlockAuthoringBindings).toHaveLength(34);
    expect(builtInBlockRuntimeBindings).toHaveLength(34);
    expect(builtInBlockAuthoringBindings.map(({ nodeType }) => nodeType)).toEqual(
      definitionNodeTypes,
    );
    expect(builtInBlockRuntimeBindings.map(({ nodeType }) => nodeType)).toEqual(
      definitionNodeTypes,
    );
    expect(Object.isFrozen(builtInBlockAuthoringBindings)).toBe(true);
    expect(Object.isFrozen(builtInBlockRuntimeBindings)).toBe(true);
    expect(builtInBlockRegistry).not.toHaveProperty("authoringExtensions");
    expect(builtInBlockRegistry).not.toHaveProperty("runtimeExtensions");
  });
});
