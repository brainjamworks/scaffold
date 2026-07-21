import { describe, expect, it } from "vite-plus/test";

import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { chartInsertActions } from "@/editor/blocks/media/chart/chart-definition";
import { CHART_TYPES } from "@/schemas/shared";
import { createBlockInsertActions } from "./block-insert-action";
import { createInsertCatalog } from "./insert-catalog";
import { INSERT_CATEGORY_ORDER } from "./insert-action";
import { builtInNonBlockInsertActions } from "./built-in-non-block-inserts";
import { builtInInsertCatalog } from "./built-in-insert-catalog";

describe("builtInInsertCatalog", () => {
  it("contains every primary block action and every explicit non-block action exactly once", () => {
    const primaryBlockActionIds = builtInBlockDefinitions.map(
      (definition) => definition.insert?.id,
    );
    const actionIds = builtInInsertCatalog.actions.map((action) => action.id);

    expect(builtInBlockDefinitions).toHaveLength(34);
    expect(primaryBlockActionIds.every((id) => typeof id === "string")).toBe(true);
    expect(actionIds).toHaveLength(new Set(actionIds).size);
    expect(actionIds).toEqual(expect.arrayContaining(primaryBlockActionIds));
    expect(actionIds).toEqual(
      expect.arrayContaining(builtInNonBlockInsertActions.map((action) => action.id)),
    );
  });

  it("contains the exact chart variants, grid action, and layout presets", () => {
    const chartVariants = builtInInsertCatalog.actions.filter(
      (action) => action.variantOf === "chart",
    );

    expect(chartInsertActions).toHaveLength(CHART_TYPES.length);
    expect(chartVariants.map((action) => action.id)).toEqual(
      CHART_TYPES.map((chartType) => `chart-${chartType}`),
    );
    expect(builtInInsertCatalog.getById(gridInsertAction.id)).toEqual(
      expect.objectContaining({ id: "grid", nodeType: "grid" }),
    );
    expect(builtInLayoutDefinitions.map((definition) => definition.id)).toEqual([
      "accordion",
      "paginated",
      "process-flow",
      "tabs",
    ]);
    expect(
      builtInLayoutDefinitions.map((definition) => builtInInsertCatalog.getById(definition.id)),
    ).toEqual(
      builtInLayoutDefinitions.map((definition) =>
        expect.objectContaining({ id: definition.id, nodeType: "layout" }),
      ),
    );

    const layoutActions = builtInNonBlockInsertActions.filter(
      (action) => action.nodeType === "layout",
    );
    expect(layoutActions.map((action) => action.id)).toEqual(
      builtInLayoutDefinitions.map((definition) => definition.id),
    );
    expect(layoutActions.map((action) => action.content()["attrs"])).toEqual(
      builtInLayoutDefinitions.map((definition) =>
        expect.objectContaining({ variant: definition.id }),
      ),
    );
    expect(new Set(layoutActions.map((action) => action.id))).toHaveLength(layoutActions.length);
  });

  it("preserves the authoring category order", () => {
    expect(INSERT_CATEGORY_ORDER).toEqual([
      "content",
      "display",
      "media",
      "data",
      "assessment",
      "activity",
      "embed",
      "layout",
    ]);
  });

  it("reconstructs deterministically from the explicit producer collections", () => {
    const before = builtInInsertCatalog.actions.map((action) => action.id);
    const reconstructed = createInsertCatalog([
      ...createBlockInsertActions(builtInBlockDefinitions),
      ...builtInNonBlockInsertActions,
    ]);

    expect(reconstructed.actions.map((action) => action.id)).toEqual(before);
    expect(builtInInsertCatalog.actions.map((action) => action.id)).toEqual(before);
    expect(Object.isFrozen(builtInInsertCatalog.actions)).toBe(true);
  });
});
