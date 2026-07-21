// @vitest-environment happy-dom

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeLayoutContract } from "@/editor/testing";

import { builtInLayoutRegistry } from "../model/built-in-layout-definitions";
import { builtInLayoutAuthoringViewRegistry } from "../authoring/built-in-layout-views";

describeLayoutContract({
  blockDefinitions: builtInBlockRegistry,
  layoutDefinitions: builtInLayoutRegistry,
  layoutAuthoringViews: builtInLayoutAuthoringViewRegistry,
  layoutId: "tabs",
  expectsLayoutConfiguration: true,
  expectsSectionConfiguration: true,
});
