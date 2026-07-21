// @vitest-environment happy-dom

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import "./pdf-embed-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "pdf_embed",
  catalogId: "pdf-embed",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
