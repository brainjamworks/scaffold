// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { emptyChapterEpigraphData } from "./content";
import "./chapter-epigraph-definition";

it("constructs serialized defaults in the Chapter Epigraph feature", () => {
  expect(emptyChapterEpigraphData()).toEqual({
    type: "chapter_epigraph",
    align: "center",
  });
  expect(emptyChapterEpigraphData({ align: "left" })).toEqual({
    type: "chapter_epigraph",
    align: "left",
  });
});

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "chapter_epigraph",
  catalogId: "chapter-epigraph",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
