import { describe, expect, it } from "vite-plus/test";

import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { isInsertActionId } from "@/lib/code-defined-identifiers";

import { builtInBlockAuthoringBindings } from "./authoring-block-extensions";
import {
  builtInBlockCapabilityRegistrations,
  builtInBlockDefinitions,
  builtInBlockRegistry,
} from "./built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "./runtime-block-extensions";

describe("built-in block definitions", () => {
  it("gives every built-in definition an explicit non-empty capability title", () => {
    for (const definition of builtInBlockDefinitions) {
      expect(Object.hasOwn(definition, "title")).toBe(true);
      expect(definition.title.trim().length).toBeGreaterThan(0);
    }
  });

  it("constructs the registry from 36 explicit unique node types", () => {
    const nodeTypes = builtInBlockDefinitions.map((definition) => definition.nodeType);

    expect(builtInBlockDefinitions).toHaveLength(36);
    expect(new Set(nodeTypes)).toHaveLength(36);
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

  it("keeps every mounted action kebab-case and distinct from snake_case Block identities", () => {
    const actions = createBlockInsertActions(builtInBlockDefinitions);

    expect(builtInBlockRegistry.getByNodeType("fill_blanks")?.insert?.id).toBe("fill-blanks");
    expect(builtInBlockRegistry.getByNodeType("image_hotspot")?.insert?.id).toBe("image-hotspot");
    expect(actions.every((action) => isInsertActionId(action.id))).toBe(true);
    expect(actions.filter(({ nodeType }) => nodeType === "chart_block")).toHaveLength(10);
    expect(
      actions
        .filter(({ nodeType }) => nodeType === "chart_block")
        .every(({ id }) => id !== "chart_block"),
    ).toBe(true);
  });

  it("keeps every built-in definition top-level-id-free with an explicit insert action id", () => {
    const insertIds = builtInBlockDefinitions.map((definition) => definition.insert?.id);

    for (const definition of builtInBlockDefinitions) {
      expect(definition).not.toHaveProperty("id");
      expect(definition.insert?.id).toBeTypeOf("string");
    }
    expect(new Set(insertIds)).toHaveLength(36);
  });

  it("keeps authoring and runtime lanes in exact parent-node parity with the definition list", () => {
    const definitionNodeTypes = builtInBlockDefinitions.map((definition) => definition.nodeType);

    expect(builtInBlockAuthoringBindings).toHaveLength(36);
    expect(builtInBlockRuntimeBindings).toHaveLength(36);
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

  it("registers one canonical Drag and Drop definition, graph and identity rewrite", () => {
    const definitions = builtInBlockDefinitions.filter(({ nodeType }) => nodeType === "drag_drop");
    const capabilities = builtInBlockCapabilityRegistrations.filter(
      ({ definition }) => definition.nodeType === "drag_drop",
    );
    const inserted = definitions[0]?.insert?.content();

    expect(definitions).toHaveLength(1);
    expect(capabilities).toHaveLength(1);
    expect(capabilities[0]?.identityRewrites).toHaveLength(1);
    expect(definitions[0]?.insert?.id).toBe("drag-drop");
    expect(definitions[0]?.capabilities?.assessment?.interactionKind).toBe("spatial-placement");
    expect(inserted?.["content"]).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "drag_drop_canvas" })]),
    );
    expect(() =>
      definitions[0]?.capabilities?.assessment?.projection.projectInteraction(
        inserted as never,
        inserted?.["attrs"] && typeof inserted["attrs"] === "object"
          ? (inserted["attrs"] as Record<string, unknown>)["settings"]
          : {},
      ),
    ).toThrow("not learner-ready");
  });
});
