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
  layoutId: "accordion",
  expectsLayoutConfiguration: true,
  expectsSectionConfiguration: true,
});

it("declares terminal scrolling for bounded accordion sections", () => {
  expect(builtInLayoutRegistry.getById("accordion")).toMatchObject({
    boundedPlacement: "fill",
    boundedSectionBehavior: "terminal-scroll",
  });
});
