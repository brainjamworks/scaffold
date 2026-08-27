// @vitest-environment happy-dom

import { expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { describeBlockContract } from "@/editor/testing";
import type { BlockDefinition } from "@/editor/blocks/block-definition";

import { pdfEmbedBlockDefinition } from "./pdf-embed-definition";

describeBlockContract({
  blockDefinitions: builtInBlockRegistry,
  nodeType: "pdf_embed",
  actionId: "pdf-embed",
  expectsConfiguration: true,
  expectsFrame: true,
  expectsAuthoringFrame: true,
});

it("declares bounded fill placement", () => {
  expect(pdfEmbedBlockDefinition.boundedPlacement).toBe("fill");
});

it("declares only the approved root page-navigation capabilities", () => {
  expect((pdfEmbedBlockDefinition as BlockDefinition).control).toEqual({
    owner: {
      events: [{ type: "page-changed", label: "Page changed" }],
      states: [
        {
          key: "page-number",
          label: "Page number",
          valueType: {
            kind: "runtime-bounded-number",
            min: 1,
            unitLabel: "page",
            step: 1,
          },
        },
        {
          key: "last-page",
          label: "Last page",
          valueType: { kind: "boolean" },
        },
      ],
      commands: [
        {
          type: "go-to-page",
          label: "Go to page",
          input: {
            kind: "runtime-bounded-number",
            min: 1,
            unitLabel: "page",
            step: 1,
          },
        },
      ],
    },
  });
});
