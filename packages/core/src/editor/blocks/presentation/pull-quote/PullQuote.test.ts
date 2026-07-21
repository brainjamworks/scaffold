// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { emptyPullQuoteData } from "./content";
import "./pull-quote-definition";

it("constructs serialized defaults in the Pull Quote feature", () => {
  expect(emptyPullQuoteData()).toEqual({
    type: "pull_quote",
    align: "left",
  });
  expect(emptyPullQuoteData({ align: "center" })).toEqual({
    type: "pull_quote",
    align: "center",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "pull_quote",
  catalogId: "pull-quote",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
