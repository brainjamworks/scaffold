// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { emptyMarginaliaData } from "./content";
import "./marginalia-definition";

it("constructs serialized defaults in the Marginalia feature", () => {
  expect(emptyMarginaliaData()).toEqual({
    type: "marginalia",
    position: "right",
  });
  expect(emptyMarginaliaData({ position: "left" })).toEqual({
    type: "marginalia",
    position: "left",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "marginalia",
  catalogId: "marginalia",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
