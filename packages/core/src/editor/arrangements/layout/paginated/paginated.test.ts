// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeLayoutContract } from "@/editor/testing";

import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import { builtInLayoutAuthoringViewRegistry } from "../authoring/built-in-layout-views";

describeLayoutContract({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  layoutAuthoringViews: builtInLayoutAuthoringViewRegistry,
  layoutId: "paginated",
  expectedDescendantClasses: ["sc-paginated-layout__nav"],
});

it("declares bounded fill with section handoff", () => {
  const definition = builtInLayoutRegistry.getById("paginated");
  expect(definition).toMatchObject({
    boundedPlacement: "fill",
  });
  expect(definition?.boundedSectionBehavior).toBeUndefined();
});
