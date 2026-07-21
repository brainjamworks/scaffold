// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { emptyStatHighlightData } from "./content";
import "./stat-highlight-definition";

it("constructs serialized defaults in the Stat Highlight feature", () => {
  expect(emptyStatHighlightData()).toEqual({
    type: "stat_highlight",
    align: "left",
  });
  expect(emptyStatHighlightData({ align: "center" })).toEqual({
    type: "stat_highlight",
    align: "center",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "stat_highlight",
  catalogId: "stat-highlight",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
