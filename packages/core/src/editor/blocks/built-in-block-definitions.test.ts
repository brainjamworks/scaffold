import { describe, expect, it } from "vite-plus/test";

import { createBlockInsertActions } from "@/editor/insertion/block-insert-action";
import { isInsertActionId } from "@/lib/code-defined-identifiers";

import { builtInBlockAuthoringBindings } from "./authoring-block-extensions";
import { builtInBlockDefinitions, builtInBlockRegistry } from "./built-in-block-definitions";
import { builtInBlockRuntimeBindings } from "./runtime-block-extensions";

const EXPECTED_STABLE_CHILD_NODE_TYPES: Readonly<Record<string, readonly string[]>> = {
  code_block: [],
  callout: [],
  comparison: ["comparison_row"],
  flashcard: ["flashcard_card"],
  categorise: ["categorise_bin", "categorise_item"],
  dropdown: ["dropdown_choice"],
  fill_blanks: ["fill_blank"],
  image_hotspot: [],
  matching: ["matching_pair"],
  mcq: ["selectable_choice"],
  multiselect: ["selectable_choice"],
  quiz: [],
  sequencing: ["sequencing_item"],
  annotated_figure: ["annotated_figure_annotation"],
  gallery: ["gallery_item"],
  text_wrap_image: [],
  audio_block: [],
  chart_block: [],
  image_block: [],
  embed: [],
  pdf_embed: [],
  resource_link: [],
  checklist: ["checklist_item"],
  glossary: ["glossary_entry"],
  key_value_list: ["key_value_row"],
  numbered_list: ["numbered_list_item"],
  table: [],
  chapter_epigraph: [],
  marginalia: [],
  pull_quote: [],
  roadmap: ["roadmap_milestone"],
  sidebar: [],
  stat_highlight: [],
  timeline: ["timeline_item"],
};

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

  it("declares the complete independently addressable child-node classification", () => {
    expect(Object.keys(EXPECTED_STABLE_CHILD_NODE_TYPES)).toEqual(
      builtInBlockDefinitions.map(({ nodeType }) => nodeType),
    );

    for (const definition of builtInBlockDefinitions) {
      expect(definition.identity?.stableChildNodeTypes ?? [], definition.nodeType).toEqual(
        EXPECTED_STABLE_CHILD_NODE_TYPES[definition.nodeType],
      );
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
