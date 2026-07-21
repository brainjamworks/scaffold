// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { describeBlockContract } from "@/editor/testing";

import { emptyCodeBlockData } from "./content";
import "./code-block-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "code_block",
  catalogId: "code-block",
  extensions: [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)],
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

describe("code block data", () => {
  it("constructs serialized defaults in the Code Block feature", () => {
    expect(emptyCodeBlockData()).toEqual({
      type: "code_block",
      language: "plaintext",
      showCopyButton: true,
    });
    expect(emptyCodeBlockData({ language: "python", showCopyButton: false })).toEqual({
      type: "code_block",
      language: "python",
      showCopyButton: false,
    });
  });
});
