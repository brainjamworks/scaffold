import { describe, expect, it, vi } from "vite-plus/test";

const createStableId = vi.hoisted(() => vi.fn(() => "catalog-test-id"));
vi.mock("@/document/model/identity/stable-ids", () => ({ createStableId }));

import { builtInLayoutDefinitions } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import { gridInsertAction } from "@/editor/arrangements/grid/model/grid-insert-action";
import { createLayoutInsertAction } from "@/editor/arrangements/layout/model/layout-definition";
import { builtInBlockDefinitions } from "@/editor/blocks/built-in-block-definitions";
import { CHART_TYPES } from "@/schemas/shared";
import { createBlockInsertActions } from "./block-insert-action";
import { coreStructuralInsertActions } from "./core-structural-insert-actions";
import { createInsertCatalog } from "./insert-catalog";
import { INSERT_CATEGORY_ORDER } from "./insert-action";
import { builtInInsertCatalog } from "./built-in-insert-catalog";

describe("builtInInsertCatalog", () => {
  it("keeps content factories dormant during definition, projection, and catalogue assembly", () => {
    expect(createStableId).not.toHaveBeenCalled();
  });

  it("contains every built-in action exactly once in approved source order", () => {
    const blockActions = createBlockInsertActions(builtInBlockDefinitions);
    const layoutActions = builtInLayoutDefinitions.map(createLayoutInsertAction);
    const actionIds = builtInInsertCatalog.actions.map((action) => action.id);

    expect(builtInBlockDefinitions).toHaveLength(34);
    expect(actionIds).toHaveLength(new Set(actionIds).size);
    expect(actionIds).toEqual([
      ...blockActions.map((action) => action.id),
      ...layoutActions.map((action) => action.id),
      ...coreStructuralInsertActions.map((action) => action.id),
    ]);
  });

  it("contains Chart once as a primary followed by one variant for every chart type", () => {
    const chartActions = builtInInsertCatalog.actions.filter(
      (action) => action.id === "chart" || action.variantOf === "chart",
    );

    expect(chartActions.map((action) => action.id)).toEqual([
      "chart",
      ...CHART_TYPES.map((chartType) => `chart-${chartType}`),
    ]);
    expect(chartActions.filter((action) => action.id === "chart")).toHaveLength(1);
    expect(chartActions.filter((action) => action.variantOf === "chart")).toHaveLength(
      CHART_TYPES.length,
    );
  });

  it("keeps Layout actions installed and Grid as the only fixed structural action", () => {
    expect(coreStructuralInsertActions).toEqual([gridInsertAction]);
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

    const layoutActions = builtInInsertCatalog.actions.filter(
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
      ...builtInLayoutDefinitions.map(createLayoutInsertAction),
      ...coreStructuralInsertActions,
    ]);

    expect(reconstructed.actions.map((action) => action.id)).toEqual(before);
    expect(builtInInsertCatalog.actions.map((action) => action.id)).toEqual(before);
    expect(Object.isFrozen(builtInInsertCatalog.actions)).toBe(true);
  });
});
