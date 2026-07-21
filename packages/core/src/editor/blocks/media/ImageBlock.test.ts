// @vitest-environment happy-dom

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";

import "./image-block-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "image_block",
  catalogId: "image",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});
