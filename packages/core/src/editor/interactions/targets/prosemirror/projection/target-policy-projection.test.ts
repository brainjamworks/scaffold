import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vite-plus/test";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { ScaffoldBlockContext } from "@/editor/selection/block-context";

import {
  InteractionEmbeddedChildSelection,
  InteractionTargetKind,
} from "../../model/interaction-owner-state";
import { projectBlockTargetRef, projectStructuralTargetRef } from "./target-ref-projection";
import {
  projectBlockTargetPolicy,
  projectStructuralTargetPolicy,
} from "./target-policy-projection";

function blockContext(
  input: {
    definition?: Partial<BlockDefinition>;
    id?: string;
    nodeType?: string;
    pos?: number;
  } = {},
): ScaffoldBlockContext {
  const nodeType = input.nodeType ?? "projection_test_block";
  const definition: BlockDefinition = {
    ...input.definition,
    nodeType,
  };
  return {
    definition,
    node: {
      attrs: { id: input.id },
      type: { name: nodeType },
    } as unknown as ProseMirrorNode,
    nodeType,
    pos: input.pos ?? 7,
  };
}

function structuralNode(id?: string): ProseMirrorNode {
  return {
    attrs: { id },
  } as unknown as ProseMirrorNode;
}

describe("target ref projection", () => {
  it("projects registered block context to a block ref with stable id and position", () => {
    expect(projectBlockTargetRef(blockContext({ id: "block-a", pos: 11 }))).toEqual({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: 11,
    });
  });

  it("projects structural nodes to refs with stable id and position fallback", () => {
    expect(
      projectStructuralTargetRef({
        kind: InteractionTargetKind.Grid,
        node: structuralNode("grid-a"),
        pos: 13,
      }),
    ).toEqual({
      id: "grid-a",
      kind: InteractionTargetKind.Grid,
      pos: 13,
    });
    expect(
      projectStructuralTargetRef({
        kind: InteractionTargetKind.Surface,
        node: structuralNode(""),
        pos: 2,
      }),
    ).toEqual({
      kind: InteractionTargetKind.Surface,
      pos: 2,
    });
  });
});

describe("target policy projection", () => {
  it("projects resizable managed-parent block capabilities from registry facts", () => {
    const context = blockContext({
      definition: {
        frame: { resizable: true },
        interaction: { embeddedChildSelection: "delegate-to-parent" },
        settingsSheet: { nodeType: "projection_test_block" } as never,
      },
      id: "block-resizable",
      pos: 5,
    });

    expect(projectBlockTargetPolicy(context)).toEqual({
      embeddedChildSelection: InteractionEmbeddedChildSelection.DelegateToParent,
      isStructuralContainer: false,
      keyboardObjectActions: true,
      objectSelectable: true,
      supportsArrangementMenu: false,
      supportsBlockBubble: true,
      supportsFieldControls: false,
      supportsMovement: true,
      supportsOutline: true,
      supportsResize: true,
      supportsSettings: true,
      target: {
        id: "block-resizable",
        kind: InteractionTargetKind.Block,
        pos: 5,
      },
    });
  });

  it("projects plain block policies without resize, settings, or child delegation", () => {
    expect(projectBlockTargetPolicy(blockContext({ id: "block-plain" }))).toMatchObject({
      embeddedChildSelection: InteractionEmbeddedChildSelection.Independent,
      keyboardObjectActions: true,
      objectSelectable: true,
      supportsBlockBubble: true,
      supportsMovement: true,
      supportsOutline: true,
      supportsResize: false,
      supportsSettings: false,
    });
  });

  it.each([
    [InteractionTargetKind.Surface, false, true],
    [InteractionTargetKind.Region, false, true],
    [InteractionTargetKind.Layout, true, true],
    [InteractionTargetKind.Section, true, false],
    [InteractionTargetKind.Grid, false, true],
    [InteractionTargetKind.Cell, false, true],
  ] as const)(
    "projects structural %s policies as non-keyboard structural containers",
    (kind, supportsMovement, supportsOutline) => {
      expect(
        projectStructuralTargetPolicy({
          kind,
          node: structuralNode(`${kind}-a`),
          pos: 19,
        }),
      ).toEqual({
        embeddedChildSelection: InteractionEmbeddedChildSelection.Independent,
        isStructuralContainer: true,
        keyboardObjectActions: false,
        objectSelectable: false,
        supportsArrangementMenu: true,
        supportsBlockBubble: false,
        supportsFieldControls: false,
        supportsMovement,
        supportsOutline,
        supportsResize: false,
        supportsSettings: false,
        target: {
          id: `${kind}-a`,
          kind,
          pos: 19,
        },
      });
    },
  );

  it("projects structural settings support when registry facts provide it", () => {
    expect(
      projectStructuralTargetPolicy({
        kind: InteractionTargetKind.Section,
        node: structuralNode("section-settings"),
        pos: 31,
        supportsSettings: true,
      }),
    ).toMatchObject({
      supportsArrangementMenu: true,
      supportsMovement: true,
      supportsOutline: false,
      supportsResize: false,
      supportsSettings: true,
    });
  });
});
