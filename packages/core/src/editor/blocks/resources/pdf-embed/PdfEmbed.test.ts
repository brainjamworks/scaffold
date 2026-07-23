// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "pdf_embed",
  catalogId: "pdf-embed",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("declares bounded fill placement", () => {
  expect(pdfEmbedBlockDefinition.boundedPlacement).toBe("fill");
});
